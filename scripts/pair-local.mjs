#!/usr/bin/env node
/**
 * Pair WhatsApp from your laptop (residential network), then upload
 * the session to the VPS. Cloud IPs often fail pairing with Baileys.
 *
 * Usage:
 *   cd gateway && npm install
 *   node ../scripts/pair-local.mjs [628xxxxxxxxxx]
 */
import makeWASocket, {
  useMultiFileAuthState,
  Browsers,
  fetchLatestWaWebVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const authDir = join(__dirname, '..', 'data', 'auth-local', 'session');
const phone = (process.argv[2] || process.env.WA_BOT_NUMBER || '').replace(/\D/g, '');

mkdirSync(authDir, { recursive: true });

const logger = pino({ level: 'info' });
const { state, saveCreds } = await useMultiFileAuthState(authDir);
let version;
try {
  version = (await fetchLatestWaWebVersion({})).version;
  console.log('WA Web version', version);
} catch {
  console.warn('Could not fetch latest WA version; using default');
}

const sock = makeWASocket({
  version,
  auth: state,
  logger,
  browser: Browsers.macOS('Safari'),
  markOnlineOnConnect: false,
  syncFullHistory: false,
});

sock.ev.on('creds.update', saveCreds);

sock.ev.on('connection.update', async (update) => {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    console.log('\n=== Scan QR (Linked devices) — immediately ===\n');
    qrcode.generate(qr, { small: true });
    if (phone && !state.creds.registered) {
      try {
        const code = await sock.requestPairingCode(phone);
        console.log('\n=== Or enter pairing code on phone ===');
        console.log(`Code: ${code}`);
        console.log(`Phone: ${phone}`);
        console.log('WhatsApp → Linked devices → Link with phone number\n');
      } catch (e) {
        console.warn('Pairing code request failed:', e?.message || e);
      }
    }
  }

  if (connection === 'open') {
    console.log('\n✅ PAIRING SUCCESS');
    console.log(`Session saved to: ${authDir}`);
    console.log('Next: upload session to VPS (ask Grok to run upload script).\n');
    process.exit(0);
  }

  if (connection === 'close') {
    const code = (lastDisconnect?.error instanceof Boom)
      ? lastDisconnect.error.output?.statusCode
      : undefined;
    console.error('Connection closed', { code, msg: lastDisconnect?.error?.message });
    if (code === DisconnectReason.loggedOut) {
      console.error('Logged out — delete data/auth-local and retry');
    }
    process.exit(1);
  }
});

console.log('Pairing locally… auth dir:', authDir);
if (phone) console.log('Will also request pairing code for', phone);
else console.log('Tip: pass phone for pairing code: node scripts/pair-local.mjs 6283878525697');
