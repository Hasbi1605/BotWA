import type { WAMessage } from '@whiskeysockets/baileys';

export interface NormalizedMessage {
  messageId: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'other';
  timestamp: string;
  replyTo: string | null;
  mentions: string[] | null;
  documentInfo?: {
    fileName: string;
    mimeType: string;
    fileLength: number;
    data?: Buffer;
  };
}

export function normalizeMessage(msg: WAMessage): NormalizedMessage {
  const message = msg.message;
  const messageId = msg.key.id || '';
  const timestamp = new Date(
    ((msg.messageTimestamp as number) || Date.now() / 1000) * 1000
  ).toISOString();

  if (!message) {
    return { messageId, content: '', type: 'other', timestamp, replyTo: null, mentions: null };
  }

  // Extract content and type
  let content = '';
  let type: NormalizedMessage['type'] = 'text';
  let replyTo: string | null = null;
  let mentions: string[] | null = null;
  let documentInfo: NormalizedMessage['documentInfo'] = undefined;

  // Text message
  if (message.conversation) {
    content = message.conversation;
  } else if (message.extendedTextMessage) {
    content = message.extendedTextMessage.text || '';
    if (message.extendedTextMessage.contextInfo?.quotedMessage) {
      replyTo = message.extendedTextMessage.contextInfo.stanzaId || null;
    }
    mentions = message.extendedTextMessage.contextInfo?.mentionedJid || null;
  }
  // Image with caption
  else if (message.imageMessage) {
    content = message.imageMessage.caption || '';
    type = 'image';
    mentions = message.imageMessage.contextInfo?.mentionedJid || null;
  }
  // Video with caption
  else if (message.videoMessage) {
    content = message.videoMessage.caption || '';
    type = 'video';
    mentions = message.videoMessage.contextInfo?.mentionedJid || null;
  }
  // Audio
  else if (message.audioMessage) {
    type = 'audio';
  }
  // Document
  else if (message.documentMessage) {
    const doc = message.documentMessage;
    content = doc.caption || doc.fileName || '';
    type = 'document';
    documentInfo = {
      fileName: doc.fileName || 'document',
      mimeType: doc.mimetype || 'application/octet-stream',
      fileLength: Number(doc.fileLength) || 0,
    };
  }
  // Sticker
  else if (message.stickerMessage) {
    type = 'sticker';
  }
  // Other types
  else {
    type = 'other';
  }

  return {
    messageId,
    content: content.trim(),
    type,
    timestamp,
    replyTo,
    mentions,
    documentInfo,
  };
}
