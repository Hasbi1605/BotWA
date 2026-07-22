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
import { handleCommand, looksLikeCommand } from '../commands/router.js';
import { getPending } from '../commands/pending.js';
import {
  checkAdminStatus,
  findParticipant,
  roleFromParticipant,
} from '../auth/admin.js';
import { checkRateLimit } from '../auth/rate-limiter.js';
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
  if (msg.key.fromMe) return;

  const groupJid = msg.key.remoteJid;
  if (!groupJid?.endsWith('@g.us')) return;

  if (!isAllowlisted(groupJid, config)) {
    logger.info(
      { groupJid, allowlist: config.waGroupAllowlist },
      'Ignoring group message (not in WA_GROUP_ALLOWLIST)'
    );
    return;
  }

  let group = groupsRepo.findByJid(groupJid);
  if (!group) {
    group = groupsRepo.create(groupJid, '');
  }

  const textPreview =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    '';
  const trimmed = textPreview.trim();
  const maybeCommand = looksLikeCommand(trimmed);

  // When inactive: only allow activation-related phrases (not all commands)
  if (group.status !== 'active') {
    const t = trimmed.toLowerCase();
    const isActivationFlow =
      t.startsWith('.aktifkan') ||
      t.startsWith('aktifkan') ||
      t === 'ya' ||
      t === 'iya' ||
      t === 'setuju' ||
      t === 'tidak' ||
      t === 'bantuan' ||
      t === 'help';
    if (!isActivationFlow) return;
  }

  const senderJid =
    msg.key.participant ||
    (msg as any).participant ||
    msg.key.remoteJid ||
    '';
  const senderHmac = hmacJid(senderJid, config.hmacSecret, config.hmacKeyVersion);

  // Admin role (LID-aware) + optional phoneNumber for LID users
  let senderRole = 'member';
  let participantPhone: string | undefined;
  try {
    const groupMeta = await sock.groupMetadata(groupJid);
    const p = findParticipant(groupMeta, senderJid) as
      | (import('@whiskeysockets/baileys').GroupParticipant & { phoneNumber?: string })
      | undefined;
    senderRole = roleFromParticipant(p);
    if (senderRole === 'member') {
      senderRole = await checkAdminStatus(sock, groupJid, senderJid);
    }
    participantPhone = p?.phoneNumber;

    if (!group.name && groupMeta.subject) {
      const db = (await import('../db/index.js')).getDb(config.dbPath);
      db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(groupMeta.subject, group.id);
      group = { ...group, name: groupMeta.subject };
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch group metadata');
  }

  const pushName = msg.pushName || '';
  // Prefer admin phone→name directory over WA pushName / bare numbers
  const nameMap = await import('../db/repositories/name-map.repo.js');
  let displayName = nameMap.resolveDisplayName(group.id, senderJid, pushName);
  if (participantPhone) {
    const byPn =
      nameMap.lookupByJid(group.id, participantPhone) ||
      nameMap.lookupByPhone(
        group.id,
        nameMap.phoneDigitsFromJid(participantPhone) || participantPhone
      );
    if (byPn) displayName = byPn;
  }

  const participant = participantsRepo.findOrCreate(
    group.id,
    senderHmac,
    config.hmacKeyVersion,
    displayName
  );
  if (participant.current_role !== senderRole) {
    participantsRepo.updateRole(participant.id, senderRole);
  }

  const normalized = normalizeMessage(msg);
  const pending = getPending(groupJid, participant.wa_jid_hmac);

  // Commands / pending confirmations (admin YA/tidak, etc.)
  if (maybeCommand || pending) {
    await handleCommand({
      sock,
      group,
      participant,
      senderRole,
      normalized,
      config,
    });
    // Activation commands should not be stored as regular chat noise
    if (maybeCommand) return;
  }

  // Silent record all other group messages (community-bot style)
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

  if (!savedMsg) return;

  if (
    normalized.type === 'document' &&
    isSupportedDocument(normalized.documentInfo?.mimeType, normalized.documentInfo?.fileName)
  ) {
    await handleIncomingDocument(sock, msg, {
      groupId: group.id,
      messageDbId: savedMsg.id,
      filename: normalized.documentInfo?.fileName || 'document',
      mimeType: normalized.documentInfo?.mimeType || 'application/octet-stream',
      fileLength: normalized.documentInfo?.fileLength || 0,
      config,
    });
  }

  // Loss Control: enqueue AI reply for regular chat (any member)
  if (
    group.status === 'active' &&
    (group.reply_mode || 'silent') === 'lc' &&
    !maybeCommand &&
    shouldEnqueueLcReply(normalized.type, normalized.content)
  ) {
    enqueueLcReply(group.id, savedMsg.id, pushName || 'Anggota');
  }

  logger.debug(
    { groupId: group.id, msgId: normalized.messageId, type: normalized.type },
    'Message stored'
  );
}

/** Skip pure noise / media-only so LC does not spam. */
function shouldEnqueueLcReply(type: string, content: string): boolean {
  if (type !== 'text' && type !== 'image' && type !== 'video') {
    // documents handled separately; stickers/audio — skip auto roast spam
    return false;
  }
  const t = (content || '').trim();
  if (type === 'image' || type === 'video') {
    // caption-only media
    if (t.length < 2) return false;
  }
  if (t.length < 2) return false;
  // ultra-short ack without question — still allow but short content is ok for roast
  if (t.length > 1500) return true; // still reply, worker will truncate context
  return true;
}

function enqueueLcReply(groupId: number, messageDbId: number, senderName: string): void {
  // Group-wide: max 20 LC replies per 5 minutes
  const groupRl = checkRateLimit(`lc:group:${groupId}`, 20, 5 * 60_000);
  if (!groupRl.allowed) {
    logger.info({ groupId }, 'LC rate limit (group)');
    return;
  }
  // Soft burst: 8 per minute
  const burstRl = checkRateLimit(`lc:burst:${groupId}`, 8, 60_000);
  if (!burstRl.allowed) {
    logger.info({ groupId }, 'LC rate limit (burst)');
    return;
  }

  jobsRepo.create({
    type: 'chat_reply',
    payload_ref: JSON.stringify({
      groupId,
      messageId: messageDbId,
      senderName,
    }),
    idempotency_key: `job:chat_reply:${messageDbId}`,
    max_attempts: 2,
  });
}

function isSupportedDocument(mimeType?: string, fileName?: string): boolean {
  const name = (fileName || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return true;
  if (
    mime.includes('wordprocessingml') ||
    mime === 'application/msword' ||
    name.endsWith('.docx') ||
    name.endsWith('.doc')
  ) {
    return true;
  }
  return false;
}

function fileExtension(filename: string, mimeType: string): string {
  const name = filename.toLowerCase();
  if (name.endsWith('.pdf') || mimeType.includes('pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.doc')) return 'doc';
  if (mimeType.includes('wordprocessingml')) return 'docx';
  if (mimeType === 'application/msword') return 'doc';
  return 'bin';
}

async function handleIncomingDocument(
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
    const buffer = (await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger: logger as any,
        reuploadRequest: sock.updateMediaMessage.bind(sock),
      }
    )) as Buffer;

    if (!buffer || buffer.length === 0) {
      logger.warn({ messageDbId: opts.messageDbId }, 'Empty document buffer downloaded');
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
      logger.info({ hash }, 'Duplicate document skipped');
      return;
    }

    const ext = fileExtension(opts.filename, opts.mimeType);
    const dir = join(opts.config.tempDir, 'docs', String(opts.groupId));
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${doc.id}-${hash.slice(0, 12)}.${ext}`);
    writeFileSync(filePath, buffer);

    documentsRepo.updateStatus(doc.id, 'pending', { extracted_text_path: filePath });

    jobsRepo.create({
      type: 'pdf_analyze',
      payload_ref: JSON.stringify({ documentId: doc.id }),
      idempotency_key: `job:pdf_analyze:${doc.id}`,
    });

    logger.info(
      { documentId: doc.id, filePath, bytes: buffer.length, ext },
      'Document stored and analysis job enqueued'
    );
  } catch (err) {
    logger.error({ err, messageDbId: opts.messageDbId }, 'Failed to download/store document');
  }
}
