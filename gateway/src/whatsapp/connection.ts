import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import type { Config } from '../config/index.js';
import { handleMessage } from './message-handler.js';

const logger = pino({ name: 'whatsapp' });

let sock: WASocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

async function persistQr(config: Config, qr: string): Promise<void> {
  try {
    mkdirSync(config.tempDir, { recursive: true });
    const txtPath = join(config.tempDir, 'wa-qr.txt');
    const pngPath = join(config.tempDir, 'wa-qr.png');
    writeFileSync(txtPath, qr, 'utf8');
    await QRCode.toFile(pngPath, qr, {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    logger.info({ pngPath, txtPath }, 'QR image written for pairing');
  } catch (err) {
    logger.warn({ err }, 'Failed to persist QR image');
  }
}

export async function connectWhatsApp(config: Config): Promise<WASocket> {
  const authDir = join(config.waAuthDir, 'session');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  sock = makeWASocket({
    auth: state,
    logger: logger as any,
    browser: ['RembugBot', 'Chrome', '1.0.0'],
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: undefined,
    keepAliveIntervalMs: 30_000,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('QR code received, scan with WhatsApp Linked Devices');
      qrcode.generate(qr, { small: true });
      void persistQr(config, qr);
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn({ statusCode, shouldReconnect }, 'Connection closed');

      if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 60_000);
        logger.info({ attempt: reconnectAttempts, delayMs: delay }, 'Reconnecting...');
        setTimeout(() => connectWhatsApp(config), delay);
      } else if (statusCode === DisconnectReason.loggedOut) {
        logger.fatal('Session logged out. Re-pairing required.');
        sock = null;
      } else {
        logger.fatal('Max reconnect attempts reached.');
        sock = null;
      }
    }

    if (connection === 'open') {
      reconnectAttempts = 0;
      logger.info('WhatsApp connected successfully');
    }
  });

  sock.ev.on('messages.upsert', async (upsert) => {
    if (upsert.type !== 'notify') return;
    for (const msg of upsert.messages) {
      try {
        await handleMessage(sock!, msg, config);
      } catch (err) {
        logger.error({ err, messageId: msg.key.id }, 'Error handling message');
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      if (update.update?.messageStubType === proto.WebMessageInfo.StubType.REVOKE) {
        // Message deleted — soft-delete handled when we have group/message context
        logger.debug({ update }, 'Message revoke/update received');
      }
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    logger.info({ update }, 'Group participant update');
  });

  return sock;
}

export function getSocket(): WASocket | null {
  return sock;
}

export function isConnected(): boolean {
  return sock?.user !== undefined;
}
