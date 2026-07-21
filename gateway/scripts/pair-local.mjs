#!/usr/bin/env node
/**
 * Pair WhatsApp from your laptop (residential network), then upload
 * the session to the VPS. Cloud IPs often fail pairing with Baileys.
 *
 * After a successful pair, WhatsApp returns stream error 515 and expects
 * a reconnect — that is normal, not a failure.
 *
 * Usage:
 *   cd gateway && npm install
 *   node scripts/pair-local.mjs [628xxxxxxxxxx]
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
const authDir = join(__dirname, '..', '..', 'data', 'auth-local', 'session');
const phone = (process.argv[2] || process.env.WA_BOT_NUMBER || '').replace(/\D/g, '');

mkdirSync(authDir, { recursive: true });

const logger = pino({ level: 'info' });

let version;
try {
  version = (await fetchLatestWaWebVersion({})).version;
  console.log('WA Web version', version);
} catch {
  console.warn('Could not fetch latest WA version; using default');
}

let pairingCodeRequested = false;
let reconnectAttempts = 0;
const MAX_RECONNECT = 8;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const alreadyLinked = Boolean(state.creds?.me?.id);

  console.log('Pairing locally… auth dir:', authDir);
  if (alreadyLinked) {
    console.log('Existing partial session for', state.creds.me.id, '— reconnecting (no new QR needed)…');
  } else if (phone) {
    console.log('Will also request pairing code for', phone);
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

    // Only show QR / pairing code if not already linked
    if (qr && !state.creds?.me?.id) {
      console.log('\n=== Scan QR (Linked devices) — immediately ===\n');
      qrcode.generate(qr, { small: true });

      if (phone && !pairingCodeRequested && !state.creds.registered) {
        pairingCodeRequested = true;
        try {
          // small delay helps some WA clients
          await new Promise((r) => setTimeout(r, 1500));
          const code = await sock.requestPairingCode(phone);
          console.log('\n=== Or enter pairing code on phone ===');
          console.log(`Code: ${code}`);
          console.log(`Phone: ${phone}`);
          console.log('WhatsApp → Linked devices → Link with phone number\n');
        } catch (e) {
          pairingCodeRequested = false;
          console.warn('Pairing code request failed:', e?.message || e);
        }
      }
    }

    if (connection === 'open') {
      console.log('\n✅ PAIRING SUCCESS');
      console.log(`Logged in as: ${sock.user?.id || state.creds?.me?.id}`);
      console.log(`Session saved to: ${authDir}`);
      console.log('Next: bilang ke Grok / jalankan ./scripts/upload-session-to-staging.sh\n');
      // allow creds flush
      setTimeout(() => process.exit(0), 500);
      return;
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output?.statusCode
        : undefined;
      const msg = lastDisconnect?.error?.message || String(lastDisconnect?.error || '');

      // 515 = restart required after successful pair — MUST reconnect, do not exit
      if (statusCode === 515) {
        console.log('\n↻ Pairing OK — WhatsApp minta restart stream (kode 515). Menyambung ulang…\n');
        reconnectAttempts = 0;
        setTimeout(() => start(), 1000);
        return;
      }

      if (statusCode === DisconnectReason.loggedOut) {
        console.error('Logged out — hapus data/auth-local lalu ulangi pairing dari awal');
        process.exit(1);
      }

      reconnectAttempts += 1;
      if (reconnectAttempts > MAX_RECONNECT) {
        console.error('Terlalu banyak reconnect gagal:', { statusCode, msg });
        process.exit(1);
      }

      const delay = Math.min(1000 * reconnectAttempts, 8000);
      console.warn(`Connection closed (${statusCode}): ${msg}. Reconnect #${reconnectAttempts} in ${delay}ms…`);
      setTimeout(() => start(), delay);
    }
  });
}

await start();
