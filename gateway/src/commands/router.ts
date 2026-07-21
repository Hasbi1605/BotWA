import type { WASocket } from '@whiskeysockets/baileys';
import type { Group } from '../db/repositories/groups.repo.js';
import type { Participant } from '../db/repositories/participants.repo.js';
import type { NormalizedMessage } from '../whatsapp/normalizer.js';
import type { Config } from '../config/index.js';
import { isAdmin, isBotGroupAdmin } from '../auth/admin.js';
import { checkRateLimit, formatRetryAfter } from '../auth/rate-limiter.js';
import {
  handleActivationStart,
  handleActivationConfirm,
  handlePause,
  handleResume,
  handleDeleteData,
  clearDeletePending,
  ONBOARDING,
} from '../auth/consent.js';
import { sendMessage } from '../whatsapp/outbound.js';
import * as auditRepo from '../db/repositories/audit.repo.js';
import { parseIntent, looksLikeCommand } from './parse.js';
import { setPending, getPending, clearPending } from './pending.js';

export interface CommandContext {
  group: Group;
  participant: Participant;
  senderRole: string;
  normalized: NormalizedMessage;
  config: Config;
  sock: WASocket;
}

export { looksLikeCommand };

const HELP_MEMBER = `👋 *RembugBot*

Saya ringkas chat grup *otomatis* 2× sehari (08.00 & 20.00 WIB).

*Anggota:* chat biasa saja — tidak perlu perintah.
*Admin grup:* ketik *aktifkan bot* (sekali) lalu *bantuan* / *admin*.`;

const HELP_ADMIN = `🛠️ *Menu admin (singkat)*

• *aktifkan bot* — nyalakan bot (+ setuju privasi)
• *ringkas* — ringkasan sekarang
• *jadwal* — lihat jadwal / usulan
• *status* — status bot
• *jeda* / *lanjut* — hentikan / hidupkan sementara
• *hapus data* — hapus data grup (butuh konfirmasi YA)
• *admin* — tampilkan menu ini lagi

*Cara mudah:*
Saat bot tanya, cukup balas *YA* / *tidak* / nomor pilihan.

Anggota tidak perlu hafal perintah.`;

export async function handleCommand(ctx: CommandContext): Promise<void> {
  const { sock } = ctx;
  const groupJid = ctx.group.jid;
  const raw = ctx.normalized.content;
  const intent = parseIntent(raw);
  const pending = getPending(groupJid, ctx.participant.wa_jid_hmac);

  // Resolve yes/no against pending flows first
  if (intent.name === 'confirm_yes' || intent.name === 'confirm_no') {
    if (!isAdmin(ctx.senderRole)) {
      // Members can ignore; don't spam
      return;
    }
    if (!pending) {
      if (intent.name === 'confirm_yes' || intent.name === 'confirm_no') {
        // bare ya/tidak without context — ignore silently for natural chat
        if (!raw.startsWith('.')) return;
        await sendMessage(sock, groupJid, 'Tidak ada konfirmasi yang menunggu. Ketik *bantuan* untuk menu.');
      }
      return;
    }
    await handlePendingReply(ctx, pending, intent.name, intent.args[0]);
    return;
  }

  // Help is available to everyone (short member version)
  if (intent.name === 'help') {
    if (isAdmin(ctx.senderRole)) {
      await sendMessage(sock, groupJid, HELP_ADMIN);
    } else {
      await sendMessage(sock, groupJid, HELP_MEMBER);
    }
    return;
  }

  // Everything below: admin only
  if (!isAdmin(ctx.senderRole)) {
    if (looksLikeCommand(raw)) {
      await sendMessage(
        sock,
        groupJid,
        '🙂 Perintah ini khusus *admin grup*.\nAnggota cukup chat biasa — bot yang kerja.'
      );
    }
    return;
  }

  // Rate limit admin actions
  const rateLimitKey = `${ctx.group.id}:${ctx.participant.id}:${intent.name}`;
  const rateCheck = checkRateLimit(rateLimitKey, 12, 60_000);
  if (!rateCheck.allowed) {
    await sendMessage(
      sock,
      groupJid,
      `⏳ Pelan-pelan ya. Coba lagi dalam ${formatRetryAfter(rateCheck.retryAfterMs!)}.`
    );
    return;
  }

  auditRepo.log({
    group_id: ctx.group.id,
    actor_hmac: ctx.participant.wa_jid_hmac,
    command: raw.substring(0, 200),
  });

  switch (intent.name) {
    case 'activate': {
      const botAdmin = await isBotGroupAdmin(sock, groupJid);
      const step = await handleActivationStart(sock, groupJid, botAdmin);
      if (step === 'privacy') {
        setPending(groupJid, ctx.participant.wa_jid_hmac, {
          kind: 'activate',
          groupId: ctx.group.id,
        });
      }
      break;
    }
    case 'activate_confirm': {
      const botAdmin = await isBotGroupAdmin(sock, groupJid);
      if (!botAdmin) {
        await handleActivationStart(sock, groupJid, false);
        break;
      }
      clearPending(groupJid, ctx.participant.wa_jid_hmac);
      await handleActivationConfirm(sock, groupJid, ctx.group);
      break;
    }
    case 'help_admin':
      await sendMessage(sock, groupJid, HELP_ADMIN);
      break;
    case 'status':
      await handleStatus(ctx);
      break;
    case 'summary':
      await handleSummaryNow(ctx);
      break;
    case 'pause':
      await handlePause(sock, groupJid, ctx.group);
      break;
    case 'resume':
      await handleResume(sock, groupJid, ctx.group);
      break;
    case 'delete_data':
      setPending(groupJid, ctx.participant.wa_jid_hmac, {
        kind: 'delete',
        groupId: ctx.group.id,
      });
      await handleDeleteData(sock, groupJid, ctx.group, ctx.participant.wa_jid_hmac);
      break;
    case 'schedule_list':
      await handleScheduleList(ctx);
      break;
    case 'schedule_add':
      await handleScheduleAdd(ctx);
      break;
    case 'schedule_confirm':
      await handleScheduleConfirm(ctx, intent.args[0]);
      break;
    case 'schedule_reject':
      await handleScheduleReject(ctx, intent.args[0]);
      break;
    case 'schedule_cancel':
      await handleScheduleCancel(ctx, intent.args[0]);
      break;
    case 'pdf_list':
      await handlePdfList(ctx);
      break;
    case 'pdf_allow':
      await handlePdfAllow(ctx, intent.args[0]);
      break;
    case 'pdf_retry':
      await handlePdfRetry(ctx, intent.args[0]);
      break;
    case 'unknown':
      if (raw.startsWith('.') || looksLikeCommand(raw)) {
        await sendMessage(
          sock,
          groupJid,
          'Hmm, belum ketemu perintah itu.\nKetik *bantuan* (singkat) atau *admin* (lengkap).'
        );
      }
      break;
    default:
      break;
  }
}

async function handlePendingReply(
  ctx: CommandContext,
  pending: NonNullable<ReturnType<typeof getPending>>,
  answer: 'confirm_yes' | 'confirm_no',
  pick?: string
): Promise<void> {
  const { sock, group, participant } = ctx;
  const groupJid = group.jid;

  if (answer === 'confirm_no') {
    // Reject listed schedule candidates when admin declines a pick menu
    if (pending.kind === 'schedule_pick' && pending.options?.length) {
      const schedulesRepo = await import('../db/repositories/schedules.repo.js');
      for (const id of pending.options) {
        try {
          schedulesRepo.rejectCandidate(id);
        } catch {
          /* already processed */
        }
      }
      clearPending(groupJid, participant.wa_jid_hmac);
      await sendMessage(sock, groupJid, 'Baik, usulan jadwal ditolak.');
      return;
    }
    clearPending(groupJid, participant.wa_jid_hmac);
    clearDeletePending(groupJid, participant.wa_jid_hmac);
    await sendMessage(sock, groupJid, 'Baik, dibatalkan.');
    return;
  }

  if (pending.kind === 'activate') {
    clearPending(groupJid, participant.wa_jid_hmac);
    const botAdmin = await isBotGroupAdmin(sock, groupJid);
    if (!botAdmin) {
      await handleActivationStart(sock, groupJid, false);
      return;
    }
    await handleActivationConfirm(sock, groupJid, group);
    return;
  }

  if (pending.kind === 'delete') {
    clearPending(groupJid, participant.wa_jid_hmac);
    // Second confirmation via handleDeleteData (still needs second call path)
    await handleDeleteData(sock, groupJid, group, participant.wa_jid_hmac);
    return;
  }

  if (pending.kind === 'schedule_pick' && pending.options?.length) {
    const idx = pick ? parseInt(pick, 10) - 1 : 0;
    const id = pending.options[idx] ?? pending.options[0];
    clearPending(groupJid, participant.wa_jid_hmac);
    await handleScheduleConfirm(ctx, String(id));
    return;
  }

  if (pending.kind === 'pdf_pick' && pending.options?.length) {
    const idx = pick ? parseInt(pick, 10) - 1 : 0;
    const id = pending.options[idx] ?? pending.options[0];
    clearPending(groupJid, participant.wa_jid_hmac);
    await handlePdfAllow(ctx, String(id));
    return;
  }

  clearPending(groupJid, participant.wa_jid_hmac);
  await sendMessage(sock, groupJid, 'Konfirmasi tidak dikenali. Ketik *bantuan*.');
}

async function handleStatus(ctx: CommandContext): Promise<void> {
  const { isConnected } = await import('../whatsapp/connection.js');
  const messagesRepo = await import('../db/repositories/messages.repo.js');
  const summariesRepo = await import('../db/repositories/summaries.repo.js');

  const messageCount = messagesRepo.countByGroup(
    ctx.group.id,
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  );
  const lastSummary = summariesRepo.getLastCompleted(ctx.group.id);
  const statusLabel =
    ctx.group.status === 'active'
      ? 'Aktif'
      : ctx.group.status === 'paused'
        ? 'Dijeda'
        : 'Belum aktif';

  await sendMessage(
    ctx.sock,
    ctx.group.jid,
    `📊 *Status bot*

WhatsApp: ${isConnected() ? 'Terhubung ✅' : 'Terputus ⚠️'}
Grup: ${statusLabel}
Pesan 24 jam: ${messageCount}
Ringkasan terakhir: ${lastSummary?.completed_at ? new Date(lastSummary.completed_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'Belum ada'}
Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`
  );
}

async function handleSummaryNow(ctx: CommandContext): Promise<void> {
  const rateCheck = checkRateLimit(`summary:${ctx.group.id}`, 4, 24 * 60 * 60 * 1000);
  if (!rateCheck.allowed) {
    await sendMessage(ctx.sock, ctx.group.jid, '⏳ Batas ringkasan manual hari ini sudah tercapai (4×).');
    return;
  }
  const rateCheck30 = checkRateLimit(`summary30:${ctx.group.id}`, 1, 30 * 60 * 1000);
  if (!rateCheck30.allowed) {
    await sendMessage(
      ctx.sock,
      ctx.group.jid,
      `⏳ Tunggu ${formatRetryAfter(rateCheck30.retryAfterMs!)} sebelum minta ringkasan lagi.`
    );
    return;
  }

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
    await sendMessage(ctx.sock, ctx.group.jid, 'Ringkasan periode ini sudah ada / sedang diproses.');
    return;
  }

  jobsRepo.create({
    type: 'summary',
    payload_ref: JSON.stringify({ summaryId: summary.id }),
    idempotency_key: `job:summary:${summary.id}`,
  });

  await sendMessage(ctx.sock, ctx.group.jid, '📝 Oke, ringkasan sedang dibuat. Sebentar ya…');
}

async function handleScheduleList(ctx: CommandContext): Promise<void> {
  const schedulesRepo = await import('../db/repositories/schedules.repo.js');
  const active = schedulesRepo.getActiveByGroup(ctx.group.id);
  const candidates = schedulesRepo.getCandidatesByGroup(ctx.group.id);

  if (active.length === 0 && candidates.length === 0) {
    await sendMessage(
      ctx.sock,
      ctx.group.jid,
      '📅 Belum ada jadwal.\n\nKalau ada rencana di chat, bot akan usulkan nanti.\nAdmin bisa balas *YA* untuk menyetujui usulan.'
    );
    return;
  }

  let text = '';
  if (active.length > 0) {
    text += '📅 *Jadwal*\n';
    for (const s of active) {
      const date = new Date(s.starts_at).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'full',
        timeStyle: 'short',
      });
      text += `• ${s.title} — ${date}`;
      if (s.location) text += ` @ ${s.location}`;
      text += '\n';
    }
  }

  if (candidates.length > 0) {
    text += '\n🔎 *Usulan (menunggu admin)*\n';
    const ids: number[] = [];
    candidates.forEach((c, i) => {
      ids.push(c.id);
      text += `${i + 1}. ${c.title}`;
      if (c.date) text += ` — ${c.date}`;
      if (c.time) text += ` ${c.time}`;
      if (c.location) text += ` @ ${c.location}`;
      text += '\n';
    });
    text += '\nBalas *YA* (setujui pertama) atau nomor pilihan, atau *tidak* untuk tolak semua usulan teratas.';
    setPending(ctx.group.jid, ctx.participant.wa_jid_hmac, {
      kind: 'schedule_pick',
      groupId: ctx.group.id,
      options: ids,
    });
  }

  await sendMessage(ctx.sock, ctx.group.jid, text.trim());
}

async function handleScheduleAdd(ctx: CommandContext): Promise<void> {
  const schedulesRepo = await import('../db/repositories/schedules.repo.js');
  const raw = ctx.normalized.content;
  const titleMatch = raw.match(/"([^"]+)"/);
  const dateMatch = raw.match(/\b(\d{2}-\d{2}-\d{4})\b/);
  const timeMatch = raw.match(/\b(\d{2}:\d{2})\b/);
  const titles = [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const location = titles.length > 1 ? titles[titles.length - 1] : null;

  if (!titleMatch || !dateMatch) {
    await sendMessage(
      ctx.sock,
      ctx.group.jid,
      'Tambah jadwal contoh:\n*jadwal tambah "Rapat" 25-07-2026 15:00 "Balai desa"*'
    );
    return;
  }

  const { DateTime } = await import('luxon');
  const localStartsAt = DateTime.fromFormat(
    `${dateMatch[1]} ${timeMatch?.[1] || '00:00'}`,
    'dd-MM-yyyy HH:mm',
    { zone: 'Asia/Jakarta' }
  );
  if (!localStartsAt.isValid) {
    await sendMessage(ctx.sock, ctx.group.jid, 'Tanggal/waktu tidak valid. Pakai DD-MM-YYYY HH:mm');
    return;
  }

  const schedule = schedulesRepo.createSchedule({
    group_id: ctx.group.id,
    title: titleMatch[1],
    starts_at: localStartsAt.toUTC().toISO()!,
    location,
  });

  const { scheduleRemindersFor } = await import('../db/repositories/reminders.repo.js');
  scheduleRemindersFor(schedule.id, schedule.starts_at);
  await enqueueReminderSweep(ctx);

  await sendMessage(ctx.sock, ctx.group.jid, `✅ Jadwal dicatat: *${schedule.title}*`);
}

async function handleScheduleConfirm(ctx: CommandContext, idStr?: string): Promise<void> {
  const schedulesRepo = await import('../db/repositories/schedules.repo.js');
  let candidateId = idStr ? parseInt(idStr, 10) : NaN;

  if (!Number.isFinite(candidateId)) {
    const candidates = schedulesRepo.getCandidatesByGroup(ctx.group.id);
    if (candidates.length === 1) candidateId = candidates[0].id;
    else if (candidates.length > 1) {
      await handleScheduleList(ctx);
      return;
    } else {
      await sendMessage(ctx.sock, ctx.group.jid, 'Tidak ada usulan jadwal untuk dikonfirmasi.');
      return;
    }
  }

  const candidate = schedulesRepo.findCandidateById(candidateId);
  if (!candidate || candidate.group_id !== ctx.group.id || candidate.status !== 'candidate') {
    await sendMessage(ctx.sock, ctx.group.jid, 'Usulan tidak ditemukan atau sudah diproses.');
    return;
  }

  const schedule = schedulesRepo.confirmCandidate(candidateId);
  const { scheduleRemindersFor } = await import('../db/repositories/reminders.repo.js');
  scheduleRemindersFor(schedule.id, schedule.starts_at);
  await enqueueReminderSweep(ctx);
  await sendMessage(ctx.sock, ctx.group.jid, `✅ Jadwal disetujui: *${schedule.title}*`);
}

async function handleScheduleReject(ctx: CommandContext, idStr?: string): Promise<void> {
  const schedulesRepo = await import('../db/repositories/schedules.repo.js');
  let candidateId = idStr ? parseInt(idStr, 10) : NaN;
  if (!Number.isFinite(candidateId)) {
    const candidates = schedulesRepo.getCandidatesByGroup(ctx.group.id);
    if (candidates.length === 1) candidateId = candidates[0].id;
    else {
      await sendMessage(ctx.sock, ctx.group.jid, 'Sebut usulan mana: *jadwal* dulu, lalu balas nomornya.');
      return;
    }
  }
  schedulesRepo.rejectCandidate(candidateId);
  await sendMessage(ctx.sock, ctx.group.jid, 'Usulan jadwal ditolak.');
}

async function handleScheduleCancel(ctx: CommandContext, idStr?: string): Promise<void> {
  const schedulesRepo = await import('../db/repositories/schedules.repo.js');
  const scheduleId = idStr ? parseInt(idStr, 10) : NaN;
  if (!Number.isFinite(scheduleId)) {
    await sendMessage(ctx.sock, ctx.group.jid, 'Contoh: *jadwal batal 3* (lihat daftar di *jadwal*).');
    return;
  }
  const schedule = schedulesRepo.findScheduleById(scheduleId);
  if (!schedule || schedule.group_id !== ctx.group.id) {
    await sendMessage(ctx.sock, ctx.group.jid, 'Jadwal tidak ditemukan.');
    return;
  }
  schedulesRepo.cancelSchedule(scheduleId);
  await sendMessage(ctx.sock, ctx.group.jid, `Jadwal *${schedule.title}* dibatalkan.`);
}

async function handlePdfList(ctx: CommandContext): Promise<void> {
  const documentsRepo = await import('../db/repositories/documents.repo.js');
  const docs = documentsRepo.getByGroup(ctx.group.id).slice(0, 8);
  if (docs.length === 0) {
    await sendMessage(ctx.sock, ctx.group.jid, 'Belum ada PDF yang diproses di grup ini.');
    return;
  }
  let text = '📄 *PDF terakhir*\n';
  const heldIds: number[] = [];
  docs.forEach((d, i) => {
    text += `${i + 1}. ${d.filename} — ${d.status}`;
    if (d.sensitivity === 'held') {
      text += ' ⚠️ ditahan';
      heldIds.push(d.id);
    }
    text += '\n';
  });
  if (heldIds.length > 0) {
    text += '\nAda PDF ditahan (data sensitif). Balas *YA* untuk izinkan yang pertama, atau *pdf izinkan <no>*.';
    setPending(ctx.group.jid, ctx.participant.wa_jid_hmac, {
      kind: 'pdf_pick',
      groupId: ctx.group.id,
      options: heldIds,
    });
  }
  await sendMessage(ctx.sock, ctx.group.jid, text.trim());
}

async function handlePdfAllow(ctx: CommandContext, idStr?: string): Promise<void> {
  const documentsRepo = await import('../db/repositories/documents.repo.js');
  const jobsRepo = await import('../db/repositories/jobs.repo.js');
  const docId = idStr ? parseInt(idStr, 10) : NaN;
  if (!Number.isFinite(docId)) {
    await handlePdfList(ctx);
    return;
  }
  const doc = documentsRepo.findById(docId);
  if (!doc || doc.group_id !== ctx.group.id) {
    await sendMessage(ctx.sock, ctx.group.jid, 'PDF tidak ditemukan.');
    return;
  }
  documentsRepo.updateStatus(docId, 'pending', { sensitivity: 'cleared_by_admin' });
  jobsRepo.create({
    type: 'pdf_analyze',
    payload_ref: JSON.stringify({ documentId: docId }),
    idempotency_key: `job:pdf_analyze:allow:${docId}:${Date.now()}`,
  });
  await sendMessage(ctx.sock, ctx.group.jid, `✅ PDF *${doc.filename}* diizinkan & akan diproses.`);
}

async function handlePdfRetry(ctx: CommandContext, idStr?: string): Promise<void> {
  const documentsRepo = await import('../db/repositories/documents.repo.js');
  const jobsRepo = await import('../db/repositories/jobs.repo.js');
  const docId = idStr ? parseInt(idStr, 10) : NaN;
  if (!Number.isFinite(docId)) {
    await sendMessage(ctx.sock, ctx.group.jid, 'Contoh: *pdf proses 2* — lihat daftar di *pdf*.');
    return;
  }
  const doc = documentsRepo.findById(docId);
  if (!doc || doc.group_id !== ctx.group.id) {
    await sendMessage(ctx.sock, ctx.group.jid, 'PDF tidak ditemukan.');
    return;
  }
  documentsRepo.updateStatus(docId, 'pending');
  jobsRepo.create({
    type: 'pdf_analyze',
    payload_ref: JSON.stringify({ documentId: docId }),
    idempotency_key: `job:pdf_analyze:retry:${docId}:${Date.now()}`,
  });
  await sendMessage(ctx.sock, ctx.group.jid, `📄 PDF *${doc.filename}* diproses ulang.`);
}

async function enqueueReminderSweep(ctx: CommandContext): Promise<void> {
  const jobsRepo = await import('../db/repositories/jobs.repo.js');
  const hourKey = new Date().toISOString().slice(0, 13);
  jobsRepo.create({
    type: 'reminder',
    payload_ref: JSON.stringify({ groupId: ctx.group.id }),
    idempotency_key: `job:reminder:sweep:${hourKey}`,
  });
}

export async function sendOnboarding(sock: WASocket, groupJid: string): Promise<void> {
  await sendMessage(sock, groupJid, ONBOARDING);
}
