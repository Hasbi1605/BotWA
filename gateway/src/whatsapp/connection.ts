import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  proto,
  Browsers,
  fetchLatestWaWebVersion,
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
let pairingCodeRequested = false;

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

function normalizePhone(raw: string): string {
  // digits only, keep country code (e.g. 62812...)
  return raw.replace(/\D/g, '');
}

async function requestPairingCodeIfNeeded(config: Config, socket: WASocket, registered: boolean): Promise<void> {
  if (registered || pairingCodeRequested) return;
  if (!config.waBotNumber) {
    logger.info('WA_BOT_NUMBER not set — using QR pairing only');
    return;
  }

  const phone = normalizePhone(config.waBotNumber);
  if (phone.length < 10) {
    logger.warn({ phone }, 'WA_BOT_NUMBER looks invalid; skipping pairing code');
    return;
  }

  pairingCodeRequested = true;
  try {
    // Small delay so the socket is fully initialized
    await new Promise((r) => setTimeout(r, 2500));
    const code = await socket.requestPairingCode(phone);
    mkdirSync(config.tempDir, { recursive: true });
    const path = join(config.tempDir, 'wa-pairing-code.txt');
    writeFileSync(path, `${code}\n`, 'utf8');
    logger.info(
      { phoneSuffix: phone.slice(-4), code, path },
      'Pairing code ready — WhatsApp → Linked devices → Link with phone number'
    );
  } catch (err) {
    pairingCodeRequested = false;
    logger.error({ err }, 'Failed to request pairing code; fall back to QR');
  }
}

export async function connectWhatsApp(config: Config): Promise<WASocket> {
  const authDir = join(config.waAuthDir, 'session');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const registered = Boolean(state.creds?.registered);

  // Keep WA Web version current — stale versions increase link/pair failures
  let version: [number, number, number] | undefined;
  try {
    const latest = await fetchLatestWaWebVersion({});
    version = latest.version;
    logger.info({ version, isLatest: latest.isLatest }, 'Using WA Web version');
  } catch (err) {
    logger.warn({ err }, 'fetchLatestWaWebVersion failed; using Baileys default');
  }

  sock = makeWASocket({
    version,
    auth: state,
    logger: logger as any,
    // Desktop-like fingerprint reduces some link-device rejections vs custom strings
    browser: Browsers.macOS('Safari'),
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: undefined,
    keepAliveIntervalMs: 30_000,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  // Prefer pairing code when phone is configured (often more reliable than QR from VPS IPs)
  void requestPairingCodeIfNeeded(config, sock, registered);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('QR code received, scan with WhatsApp → Linked devices');
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
        pairingCodeRequested = false;
      } else {
        logger.fatal('Max reconnect attempts reached.');
        sock = null;
      }
    }

    if (connection === 'open') {
      reconnectAttempts = 0;
      logger.info('WhatsApp connected successfully');
      // List groups so operators can copy JIDs into WA_GROUP_ALLOWLIST
      void (async () => {
        try {
          const groups = await sock!.groupFetchAllParticipating();
          const list = Object.values(groups).map((g) => ({
            jid: g.id,
            subject: g.subject,
            size: g.participants?.length,
          }));
          logger.info({ groups: list, count: list.length }, 'Participating WhatsApp groups');
        } catch (err) {
          logger.warn({ err }, 'Failed to list participating groups');
        }
      })();
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
