import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import type { Config } from '../config/index.js';
import { isAllowlisted } from '../config/allowlist.js';
import { normalizeMessage } from './normalizer.js';
import * as groupsRepo from '../db/repositories/groups.repo.js';
import * as participantsRepo from '../db/repositories/participants.repo.js';
import * as messagesRepo from '../db/repositories/messages.repo.js';
import * as documentsRepo from '../db/repositories/documents.repo.js';
import * as jobsRepo from '../db/repositories/jobs.repo.js';
import { hmacJid } from '../security/hmac.js';
import { handleCommand } from '../commands/router.js';
import pino from 'pino';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const logger = pino({ name: 'message-handler' });

export async function handleMessage(
  sock: WASocket,
  msg: WAMessage,
  config: Config
): Promise<void> {
  // Ignore bot's own messages
  if (msg.key.fromMe) return;

  // Only process group messages
  const groupJid = msg.key.remoteJid;
  if (!groupJid?.endsWith('@g.us')) return;

  // Check allowlist
  if (!isAllowlisted(groupJid, config)) {
    logger.info(
      { groupJid, allowlist: config.waGroupAllowlist },
      'Ignoring group message (not in WA_GROUP_ALLOWLIST)'
    );
    return;
  }

  // Get or create group in DB
  let group = groupsRepo.findByJid(groupJid);
  if (!group) {
    group = groupsRepo.create(groupJid, '');
  }

  // Skip processing if group is not active (but allow .aktifkan command)
  const textPreview =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    '';
  const isActivation = textPreview.trim().toLowerCase().startsWith('.aktifkan');

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
      const db = (await import('../db/index.js')).getDb(config.dbPath);
      db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(groupMeta.subject, group.id);
      group = { ...group, name: groupMeta.subject };
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
    await handleCommand(sock, {
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

  // Handle documents (PDF): download media, persist file, enqueue analysis job
  if (normalized.type === 'document' && isPdf(normalized.documentInfo?.mimeType, normalized.documentInfo?.fileName)) {
    await handleIncomingPdf(sock, msg, {
      groupId: group.id,
      messageDbId: savedMsg.id,
      filename: normalized.documentInfo?.fileName || 'document.pdf',
      mimeType: normalized.documentInfo?.mimeType || 'application/pdf',
      fileLength: normalized.documentInfo?.fileLength || 0,
      config,
    });
  }

  logger.debug({
    groupId: group.id,
    msgId: normalized.messageId,
    type: normalized.type,
  }, 'Message stored');
}

function isPdf(mimeType?: string, fileName?: string): boolean {
  if (mimeType === 'application/pdf') return true;
  if (fileName?.toLowerCase().endsWith('.pdf')) return true;
  return false;
}

async function handleIncomingPdf(
  sock: WASocket,
  msg: WAMessage,
  opts: {
    groupId: number;
    messageDbId: number;
    filename: string;
    mimeType: string;
    fileLength: number;
    config: Config;
  }
): Promise<void> {
  try {
    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger: logger as any,
        reuploadRequest: sock.updateMediaMessage.bind(sock),
      }
    ) as Buffer;

    if (!buffer || buffer.length === 0) {
      logger.warn({ messageDbId: opts.messageDbId }, 'Empty PDF buffer downloaded');
      return;
    }

    const hash = createHash('sha256').update(buffer).digest('hex');
    const doc = documentsRepo.create({
      message_id: opts.messageDbId,
      group_id: opts.groupId,
      hash,
      filename: opts.filename,
      mime_type: opts.mimeType,
      file_size: opts.fileLength || buffer.length,
    });

    if (!doc) {
      logger.info({ hash }, 'Duplicate PDF skipped');
      return;
    }

    const dir = join(opts.config.tempDir, 'pdfs', String(opts.groupId));
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${doc.id}-${hash.slice(0, 12)}.pdf`);
    writeFileSync(filePath, buffer);

    // Store raw PDF path (worker opens this as the PDF file)
    documentsRepo.updateStatus(doc.id, 'pending', { extracted_text_path: filePath });

    jobsRepo.create({
      type: 'pdf_analyze',
      payload_ref: JSON.stringify({ documentId: doc.id }),
      idempotency_key: `job:pdf_analyze:${doc.id}`,
    });

    logger.info({ documentId: doc.id, filePath, bytes: buffer.length }, 'PDF stored and analysis job enqueued');
  } catch (err) {
    logger.error({ err, messageDbId: opts.messageDbId }, 'Failed to download/store PDF');
  }
}
