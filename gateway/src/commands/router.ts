import type { WASocket } from '@whiskeysockets/baileys';
import type { Group } from '../db/repositories/groups.repo.js';
import type { Participant } from '../db/repositories/participants.repo.js';
import type { NormalizedMessage } from '../whatsapp/normalizer.js';
import type { Config } from '../config/index.js';
import { isAdmin } from '../auth/admin.js';
import { checkRateLimit, formatRetryAfter } from '../auth/rate-limiter.js';
import { handleActivation, handlePause, handleResume, handleDeleteData } from '../auth/consent.js';
import { sendMessage } from '../whatsapp/outbound.js';
import * as auditRepo from '../db/repositories/audit.repo.js';

interface CommandContext {
  group: Group;
  participant: Participant;
  senderRole: string;
  normalized: NormalizedMessage;
  config: Config;
}

export async function handleCommand(
  sock: WASocket,
  ctx: CommandContext
): Promise<void> {
  const groupJid = ctx.group.jid;
  const content = ctx.normalized.content;
  const parts = content.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Activation commands don't require admin
  if (command === '.aktifkan') {
    await handleActivation(sock, groupJid, ctx.group, args);
    return;
  }

  // All other commands require admin
  if (!isAdmin(ctx.senderRole)) {
    await sendMessage(sock, groupJid, '⛔ Perintah ini hanya untuk admin grup.');
    return;
  }

  // Rate limiting
  const rateLimitKey = `${ctx.group.id}:${ctx.participant.id}:${command}`;
  const rateCheck = checkRateLimit(rateLimitKey, 10, 60_000);
  if (!rateCheck.allowed) {
    await sendMessage(sock, groupJid, `⏳ Terlalu sering. Coba lagi dalam ${formatRetryAfter(rateCheck.retryAfterMs!)}.`);
    return;
  }

  // Log admin action
  auditRepo.log({
    group_id: ctx.group.id,
    actor_hmac: ctx.participant.wa_jid_hmac,
    command: content.substring(0, 200),
  });

  // Route commands
  switch (command) {
    case '.bantuan':
      await handleHelp(sock, groupJid);
      break;

    case '.status':
      await handleStatus(sock, groupJid, ctx);
      break;

    case '.pause':
      await handlePause(sock, groupJid, ctx.group);
      break;

    case '.resume':
      await handleResume(sock, groupJid, ctx.group);
      break;

    case '.hapusdata':
      await handleDeleteData(sock, groupJid, ctx.group, ctx.participant.wa_jid_hmac);
      break;

    case '.ringkas':
      if (args[0] === 'sekarang') {
        await handleSummaryNow(sock, groupJid, ctx);
      } else {
        await sendMessage(sock, groupJid, 'Ketik *.ringkas sekarang* untuk ringkasan manual.');
      }
      break;

    case '.jadwal':
      await handleSchedule(sock, groupJid, ctx, args);
      break;

    case '.pdf':
      await handlePdfCommand(sock, groupJid, ctx, args);
      break;

    default:
      await sendMessage(sock, groupJid, `Perintah tidak dikenal: ${command}\nKetik *.bantuan* untuk daftar perintah.`);
  }
}

async function handleHelp(sock: WASocket, groupJid: string): Promise<void> {
  const helpText = `📋 *Daftar Perintah Admin*

*.aktifkan* — Aktifkan bot di grup
*.ringkas sekarang* — Buat ringkasan sekarang
*.jadwal* — Lihat jadwal dan kandidat
*.jadwal tambah "judul" DD-MM-YYYY HH:mm "lokasi"* — Tambah jadwal
*.jadwal konfirmasi <id>* — Konfirmasi kandidat jadwal
*.jadwal batal <id>* — Batalkan jadwal
*.jadwal tolak <id>* — Tolak kandidat
*.pdf proses <id>* — Proses ulang PDF
*.pdf izinkan <id>* — Izinkan PDF sensitif
*.status* — Status bot
*.pause* — Jeda bot
*.resume* — Lanjutkan bot
*.hapusdata* — Hapus data grup
*.bantuan* — Tampilkan bantuan ini`;

  await sendMessage(sock, groupJid, helpText);
}

async function handleStatus(sock: WASocket, groupJid: string, ctx: CommandContext): Promise<void> {
  const { isConnected } = await import('../whatsapp/connection.js');
  const messagesRepo = await import('../db/repositories/messages.repo.js');
  const summariesRepo = await import('../db/repositories/summaries.repo.js');

  const messageCount = messagesRepo.countByGroup(ctx.group.id, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const lastSummary = summariesRepo.getLastCompleted(ctx.group.id);

  const statusText = `📊 *Status RembugBot*

🟢 WhatsApp: ${isConnected() ? 'Terhubung' : 'Terputus'}
📱 Grup: ${ctx.group.status}
💬 Pesan 24 jam: ${messageCount}
📝 Ringkasan terakhir: ${lastSummary ? lastSummary.completed_at : 'Belum ada'}
⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

  await sendMessage(sock, groupJid, statusText);
}

async function handleSummaryNow(sock: WASocket, groupJid: string, ctx: CommandContext): Promise<void> {
  const { checkRateLimit } = await import('../auth/rate-limiter.js');

  // Rate limit: 1 per 30 minutes, max 4 per day
  const rateCheck = checkRateLimit(`summary:${ctx.group.id}`, 4, 24 * 60 * 60 * 1000);
  if (!rateCheck.allowed) {
    await sendMessage(sock, groupJid, '⏳ Batas ringkasan manual tercapai (4x/hari).');
    return;
  }

  const rateCheck30 = checkRateLimit(`summary30:${ctx.group.id}`, 1, 30 * 60 * 1000);
  if (!rateCheck30.allowed) {
    await sendMessage(sock, groupJid, `⏳ Tunggu ${formatRetryAfter(rateCheck30.retryAfterMs!)} sebelum ringkasan manual berikutnya.`);
    return;
  }

  // Create summary job
  const jobsRepo = await import('../db/repositories/jobs.repo.js');
  const summariesRepo = await import('../db/repositories/summaries.repo.js');
  const { DateTime } = await import('luxon');

  const now = DateTime.now().setZone('Asia/Jakarta');
  const lastSummary = summariesRepo.getLastCompleted(ctx.group.id);
  const startAt = lastSummary?.end_at || now.minus({ hours: 12 }).toISO();
  const endAt = now.toISO();

  const summary = summariesRepo.create({
    group_id: ctx.group.id,
    start_at: startAt!,
    end_at: endAt!,
    idempotency_key: `manual:${ctx.group.id}:${startAt}:${endAt}`,
  });

  if (!summary) {
    await sendMessage(sock, groupJid, 'Ringkasan dengan periode ini sudah dibuat.');
    return;
  }

  jobsRepo.create({
    type: 'summary',
    payload_ref: JSON.stringify({ summaryId: summary.id }),
    idempotency_key: `job:summary:${summary.id}`,
  });

  await sendMessage(sock, groupJid, '📝 Ringkasan manual sedang dibuat...');
}

async function handleSchedule(sock: WASocket, groupJid: string, ctx: CommandContext, args: string[]): Promise<void> {
  const schedulesRepo = await import('../db/repositories/schedules.repo.js');

  if (args.length === 0) {
    // List schedules and candidates
    const active = schedulesRepo.getActiveByGroup(ctx.group.id);
    const candidates = schedulesRepo.getCandidatesByGroup(ctx.group.id);

    let text = '';

    if (active.length > 0) {
      text += '📅 *Jadwal Terkonfirmasi*\n';
      for (const s of active) {
        const date = new Date(s.starts_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'short' });
        text += `• #${s.id} ${s.title} — ${date}`;
        if (s.location) text += ` @ ${s.location}`;
        text += '\n';
      }
    }

    if (candidates.length > 0) {
      text += '\n🔍 *Kandidat Jadwal*\n';
      for (const c of candidates) {
        text += `• #${c.id} ${c.title}`;
        if (c.date) text += ` — ${c.date}`;
        if (c.time) text += ` ${c.time}`;
        if (c.location) text += ` @ ${c.location}`;
        if (c.ambiguities) {
          const amb = JSON.parse(c.ambiguities);
          if (amb.length > 0) text += ` ⚠️ ${amb.join(', ')}`;
        }
        text += '\n';
      }
    }

    if (!text) text = 'Tidak ada jadwal atau kandidat aktif.';

    await sendMessage(sock, groupJid, text);
    return;
  }

  const subCommand = args[0];

  if (subCommand === 'tambah' && args.length >= 3) {
    // Parse: .jadwal tambah "judul" DD-MM-YYYY HH:mm "lokasi"
    const raw = ctx.normalized.content;
    const titleMatch = raw.match(/"([^"]+)"/);
    const dateMatch = args.find(a => a.match(/\d{2}-\d{2}-\d{4}/));
    const timeMatch = args.find(a => a.match(/\d{2}:\d{2}/));
    const locMatch = raw.match(/"([^"]+)"\s*$/);

    if (!titleMatch || !dateMatch) {
      await sendMessage(sock, groupJid, 'Format: *.jadwal tambah "judul" DD-MM-YYYY HH:mm "lokasi"');
      return;
    }

    const { DateTime } = await import('luxon');
    const localStartsAt = DateTime.fromFormat(
      `${dateMatch} ${timeMatch || '00:00'}`,
      'dd-MM-yyyy HH:mm',
      { zone: 'Asia/Jakarta' },
    );
    if (!localStartsAt.isValid) {
      await sendMessage(sock, groupJid, 'Tanggal atau waktu tidak valid.');
      return;
    }
    const startsAt = localStartsAt.toUTC().toISO()!;

    const schedule = schedulesRepo.createSchedule({
      group_id: ctx.group.id,
      title: titleMatch[1],
      starts_at: startsAt,
      location: locMatch?.[1] || null,
    });

    // Schedule day-before + two-hours-before reminders
    const { scheduleRemindersFor } = await import('../db/repositories/reminders.repo.js');
    scheduleRemindersFor(schedule.id, schedule.starts_at);
    await enqueueReminderSweep(ctx);

    await sendMessage(sock, groupJid, `✅ Jadwal ditambahkan: #${schedule.id} ${schedule.title}`);
    return;
  }

  if (subCommand === 'konfirmasi' && args[1]) {
    const candidateId = parseInt(args[1], 10);
    const candidate = schedulesRepo.findCandidateById(candidateId);

    if (!candidate || candidate.group_id !== ctx.group.id || candidate.status !== 'candidate') {
      await sendMessage(sock, groupJid, 'Kandidat tidak ditemukan atau sudah diproses.');
      return;
    }

    const schedule = schedulesRepo.confirmCandidate(candidateId);
    const { scheduleRemindersFor } = await import('../db/repositories/reminders.repo.js');
    scheduleRemindersFor(schedule.id, schedule.starts_at);
    await enqueueReminderSweep(ctx);

    await sendMessage(sock, groupJid, `✅ Jadwal dikonfirmasi: #${schedule.id} ${schedule.title}`);
    return;
  }

  if (subCommand === 'batal' && args[1]) {
    const scheduleId = parseInt(args[1], 10);
    const schedule = schedulesRepo.findScheduleById(scheduleId);

    if (!schedule || schedule.group_id !== ctx.group.id) {
      await sendMessage(sock, groupJid, 'Jadwal tidak ditemukan.');
      return;
    }

    schedulesRepo.cancelSchedule(scheduleId);
    await sendMessage(sock, groupJid, `❌ Jadwal #${scheduleId} dibatalkan.`);
    return;
  }

  if (subCommand === 'tolak' && args[1]) {
    const candidateId = parseInt(args[1], 10);
    schedulesRepo.rejectCandidate(candidateId);
    await sendMessage(sock, groupJid, `❌ Kandidat #${candidateId} ditolak.`);
    return;
  }

  await sendMessage(sock, groupJid, 'Format tidak valid. Ketik *.jadwal* untuk melihat daftar.');
}

async function handlePdfCommand(sock: WASocket, groupJid: string, ctx: CommandContext, args: string[]): Promise<void> {
  if (args.length < 2) {
    await sendMessage(sock, groupJid, 'Format: *.pdf proses <id>* atau *.pdf izinkan <id>*');
    return;
  }

  const subCommand = args[0];
  const docId = parseInt(args[1], 10);
  const documentsRepo = await import('../db/repositories/documents.repo.js');
  const jobsRepo = await import('../db/repositories/jobs.repo.js');
  const doc = documentsRepo.findById(docId);

  if (!doc || doc.group_id !== ctx.group.id) {
    await sendMessage(sock, groupJid, 'Dokumen tidak ditemukan.');
    return;
  }

  if (subCommand === 'proses') {
    documentsRepo.updateStatus(docId, 'pending');
    jobsRepo.create({
      type: 'pdf_analyze',
      payload_ref: JSON.stringify({ documentId: docId }),
      idempotency_key: `job:pdf_analyze:retry:${docId}:${Date.now()}`,
    });
    await sendMessage(sock, groupJid, `📄 PDF #${docId} akan diproses ulang.`);
    return;
  }

  if (subCommand === 'izinkan') {
    documentsRepo.updateStatus(docId, 'pending', { sensitivity: 'cleared_by_admin' });
    jobsRepo.create({
      type: 'pdf_analyze',
      payload_ref: JSON.stringify({ documentId: docId }),
      idempotency_key: `job:pdf_analyze:allow:${docId}:${Date.now()}`,
    });
    await sendMessage(sock, groupJid, `✅ PDF #${docId} diizinkan untuk diproses.`);
    return;
  }

  await sendMessage(sock, groupJid, 'Perintah PDF tidak dikenal.');
}

/** Ensure a periodic reminder sweep job exists so due reminders get sent. */
async function enqueueReminderSweep(ctx: CommandContext): Promise<void> {
  const jobsRepo = await import('../db/repositories/jobs.repo.js');
  // Idempotent hourly key keeps queue small while still processing new reminders
  const hourKey = new Date().toISOString().slice(0, 13);
  jobsRepo.create({
    type: 'reminder',
    payload_ref: JSON.stringify({ groupId: ctx.group.id }),
    idempotency_key: `job:reminder:sweep:${hourKey}`,
  });
}
