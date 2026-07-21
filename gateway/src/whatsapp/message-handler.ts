import type { WASocket, proto } from '@whiskeysockets/baileys';
import type { Config } from '../config/index.js';
import { isAllowlisted } from '../config/allowlist.js';
import { normalizeMessage } from './normalizer.js';
import * as groupsRepo from '../db/repositories/groups.repo.js';
import * as participantsRepo from '../db/repositories/participants.repo.js';
import * as messagesRepo from '../db/repositories/messages.repo.js';
import * as documentsRepo from '../db/repositories/documents.repo.js';
import { hmacJid } from '../security/hmac.js';
import { handleCommand } from '../commands/router.js';
import pino from 'pino';
import { createHash } from 'crypto';

const logger = pino({ name: 'message-handler' });

export async function handleMessage(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
  config: Config
): Promise<void> {
  // Ignore bot's own messages
  if (msg.key.fromMe) return;

  // Only process group messages
  const groupJid = msg.key.remoteJid;
  if (!groupJid?.endsWith('@g.us')) return;

  // Check allowlist
  if (!isAllowlisted(groupJid, config)) return;

  // Get or create group in DB
  let group = groupsRepo.findByJid(groupJid);
  if (!group) {
    group = groupsRepo.create(groupJid, '');
  }

  // Skip processing if group is not active (but allow .aktifkan command)
  const isCommand = msg.message?.conversation?.startsWith('.') ||
                    msg.message?.extendedTextMessage?.text?.startsWith('.');
  const isActivation = msg.message?.conversation?.startsWith('.aktifkan') ||
                       msg.message?.extendedTextMessage?.text?.startsWith('.aktifkan');

  if (group.status !== 'active' && !isActivation) return;

  // Get sender info
  const senderJid = msg.key.participant || msg.participant || msg.key.remoteJid || '';
  const senderHmac = hmacJid(senderJid, config.hmacSecret, config.hmacKeyVersion);

  // Get group metadata for admin check
  let senderRole = 'member';
  try {
    const groupMeta = await sock.groupMetadata(groupJid);
    const senderParticipant = groupMeta.participants.find(p => p.id === senderJid);
    if (senderParticipant?.admin === 'superadmin') senderRole = 'superadmin';
    else if (senderParticipant?.admin === 'admin') senderRole = 'admin';

    // Update group name if empty
    if (!group.name && groupMeta.subject) {
      const db = (await import('../db/index.js')).getDb('');
      db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(groupMeta.subject, group.id);
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch group metadata');
  }

  // Find or create participant
  const pushName = msg.pushName || '';
  const participant = participantsRepo.findOrCreate(group.id, senderHmac, config.hmacKeyVersion, pushName);
  if (participant.current_role !== senderRole) {
    participantsRepo.updateRole(participant.id, senderRole);
  }

  // Normalize message
  const normalized = normalizeMessage(msg);

  // Check for commands first
  if (normalized.content.startsWith('.')) {
    await handleCommand(sock, msg, {
      group,
      participant,
      senderRole,
      normalized,
      config,
    });
    return;
  }

  // Store message
  const savedMsg = messagesRepo.insert({
    message_id: normalized.messageId,
    group_id: group.id,
    participant_id: participant.id,
    timestamp: normalized.timestamp,
    type: normalized.type,
    content: normalized.content,
    reply_to: normalized.replyTo,
    mentions: normalized.mentions ? JSON.stringify(normalized.mentions) : null,
  });

  if (!savedMsg) return; // duplicate

  // Handle documents (PDF)
  if (normalized.type === 'document' && normalized.documentInfo?.mimeType === 'application/pdf') {
    const hash = createHash('sha256').update(normalized.documentInfo.data || '').digest('hex');
    documentsRepo.create({
      message_id: savedMsg.id,
      group_id: group.id,
      hash,
      filename: normalized.documentInfo.fileName || 'document.pdf',
      mime_type: normalized.documentInfo.mimeType,
      file_size: normalized.documentInfo.fileLength || 0,
    });
  }

  logger.debug({
    groupId: group.id,
    msgId: normalized.messageId,
    type: normalized.type,
  }, 'Message stored');
}
