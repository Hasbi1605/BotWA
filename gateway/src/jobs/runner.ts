import pino from 'pino';
import type { Config } from '../config/index.js';
import * as jobsRepo from '../db/repositories/jobs.repo.js';
import * as summariesRepo from '../db/repositories/summaries.repo.js';
import * as messagesRepo from '../db/repositories/messages.repo.js';
import * as documentsRepo from '../db/repositories/documents.repo.js';
import { callWorkerSummary, callWorkerPdfAnalyze, callWorkerScheduleDetect } from '../worker-client/index.js';
import { sendMessage } from '../whatsapp/outbound.js';
import { getSocket } from '../whatsapp/connection.js';
import * as groupsRepo from '../db/repositories/groups.repo.js';
import { renderSummary } from './summary-render.js';
import { renderDocumentSummary } from './document-render.js';
import { ingestCandidatesAndAutoActivate } from './schedule-auto.js';

const logger = pino({ name: 'job-runner' });

let running = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startJobRunner(config: Config): void {
  if (pollInterval) return;

  pollInterval = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await processNextJob(config);
    } catch (err) {
      logger.error({ err }, 'Job runner error');
    } finally {
      running = false;
    }
  }, 5000);

  logger.info('Job runner started');
}

export function stopJobRunner(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  logger.info('Job runner stopped');
}

async function processNextJob(config: Config): Promise<void> {
  const job = jobsRepo.getNextPending();
  if (!job) return;

  // Claim atomically so attempt count is current for retry decisions
  const attempts = jobsRepo.claimAndIncrementAttempts(job.id);
  const jobWithAttempts = { ...job, attempts };

  try {
    switch (job.type) {
      case 'summary':
        await processSummaryJob(jobWithAttempts, config);
        break;
      case 'pdf_extract':
      case 'pdf_analyze':
        await processPdfJob(jobWithAttempts, config);
        break;
      case 'schedule_detect':
        await processScheduleJob(jobWithAttempts, config);
        break;
      case 'reminder':
        await processReminderJob(jobWithAttempts, config);
        break;
      case 'retention': {
        const { runRetentionCleanup } = await import('../security/retention.js');
        await runRetentionCleanup(config);
        break;
      }
      default:
        logger.warn({ type: job.type }, 'Unknown job type');
    }

    jobsRepo.updateStatus(job.id, 'completed');
  } catch (err: any) {
    const errorClass = classifyError(err);
    logger.error({ err, jobId: job.id, errorClass, attempts }, 'Job failed');

    if (attempts >= job.max_attempts) {
      jobsRepo.updateStatus(job.id, 'failed_final', {
        error_class: errorClass,
        error_message: err.message,
      });
      await notifyAdminJobFailed(jobWithAttempts, errorClass, config);
    } else {
      // First failure → 15 min, subsequent → 60 min
      const retryDelay = attempts === 1 ? 15 * 60_000 : 60 * 60_000;
      const runAfter = new Date(Date.now() + retryDelay).toISOString();
      jobsRepo.retryLater(job.id, runAfter);
    }
  }
}

async function processSummaryJob(job: jobsRepo.Job, config: Config): Promise<void> {
  const payload = JSON.parse(job.payload_ref);
  const summary = summariesRepo.findById(payload.summaryId);
  if (!summary) throw new Error('Summary window not found');

  const group = groupsRepo.findById(summary.group_id);
  if (!group) throw new Error('Group not found');

  // Get messages in window
  const messages = messagesRepo.findByGroupAndTimeRange(summary.group_id, summary.start_at, summary.end_at);

  if (messages.length === 0) {
    summariesRepo.updateStatus(summary.id, 'completed', { rendered_text: '' });
    logger.info({ summaryId: summary.id }, 'No messages in window, skipping');
    return;
  }

  const mode = (group.summary_mode === 'roast' ? 'roast' : 'normal') as 'normal' | 'roast';

  // Call worker
  const result = await callWorkerSummary({
    group_id: summary.group_id,
    window: { start: summary.start_at, end: summary.end_at },
    mode,
    messages: messages.map(m => ({
      id: m.id,
      content: m.content,
      sender_name: (m as any).display_name || 'Unknown',
      timestamp: m.timestamp,
      reply_to: m.reply_to,
      type: m.type,
    })),
  }, config);

  if (result.status === 'ok' && result.output) {
    const documentLines = loadDocumentLinesForWindow(
      summary.group_id,
      summary.start_at,
      summary.end_at
    );
    const rendered = renderSummary({
      output: result.output,
      startAt: summary.start_at,
      endAt: summary.end_at,
      documentLines,
      mode,
    });

    // Update summary window
    summariesRepo.updateStatus(summary.id, 'completed', {
      rendered_text: rendered,
      model_route: result.model_route,
    });

    // Full-auto schedules from summary + background detect pass
    ingestCandidatesAndAutoActivate(summary.group_id, result.output?.schedule_candidates || []);
    jobsRepo.create({
      type: 'schedule_detect',
      payload_ref: JSON.stringify({
        groupId: summary.group_id,
        startAt: summary.start_at,
        endAt: summary.end_at,
      }),
      idempotency_key: `job:schedule_detect:${summary.id}`,
    });

    // Send to group
    const sock = getSocket();
    if (sock && group.status === 'active' && rendered) {
      await sendMessage(sock, group.jid, rendered);
    }
  } else {
    throw new Error(result.error || 'Worker returned error');
  }
}

function loadDocumentLinesForWindow(groupId: number, startAt: string, endAt: string): string[] {
  const docs = documentsRepo.getAnalyzedInWindow(groupId, startAt, endAt);
  const lines: string[] = [];
  for (const doc of docs) {
    if (!doc.analysis_json) {
      lines.push(`${doc.filename} (sudah dianalisis)`);
      continue;
    }
    try {
      const analysis = JSON.parse(doc.analysis_json);
      const summaryText =
        analysis?.summary ||
        analysis?.analysis?.summary ||
        analysis?.title ||
        null;
      if (summaryText) {
        lines.push(`${doc.filename}: ${String(summaryText).slice(0, 200)}`);
      } else {
        lines.push(`${doc.filename} (sudah dianalisis)`);
      }
    } catch {
      lines.push(`${doc.filename} (sudah dianalisis)`);
    }
  }
  return lines;
}

async function processPdfJob(job: jobsRepo.Job, config: Config): Promise<void> {
  const payload = JSON.parse(job.payload_ref);
  const doc = documentsRepo.findById(payload.documentId);
  if (!doc) throw new Error('Document not found');

  if (!doc.extracted_text_path) {
    throw new Error('Document file path missing — media was not downloaded');
  }

  const group = groupsRepo.findById(doc.group_id);
  documentsRepo.updateStatus(doc.id, 'analyzing');

  const result = await callWorkerPdfAnalyze({
    document_id: doc.id,
    file_path: doc.extracted_text_path,
    metadata: { filename: doc.filename, page_count: doc.page_count },
  }, config);

  // Worker returns nested analysis / status fields
  const analysis = result.analysis ?? result;
  const status = (analysis as any)?.status || result.status;

  // Legacy held → treat as analyzed with redaction note (no admin confirm)
  if (status === 'held' || (analysis as any)?.reason === 'sensitive_data') {
    const safeBody = {
      title: doc.filename,
      purpose: 'Dokumen memuat pola data sensitif; ringkasan disamarkan.',
      key_points: [
        'Beberapa nomor/data pribadi disamarkan otomatis.',
        (analysis as any)?.summary || 'Tidak menampilkan data mentah di grup.',
      ],
      redacted: true,
    };
    documentsRepo.updateStatus(doc.id, 'analyzed', {
      sensitivity: 'held',
      analysis_json: JSON.stringify(safeBody),
    });
    if (group?.status === 'active') {
      await postDocumentSummaryToGroup(group.jid, doc.filename, safeBody);
    }
    return;
  }

  if (status === 'unprocessable') {
    documentsRepo.updateStatus(doc.id, 'unprocessable', {
      error_message: (analysis as any)?.error || result.error || 'unprocessable',
    });
    return;
  }

  if (status === 'error' || result.status === 'error') {
    documentsRepo.updateStatus(doc.id, 'error', {
      error_message: (analysis as any)?.error || result.error || 'Document analysis failed',
    });
    throw new Error((analysis as any)?.error || result.error || 'Document analysis failed');
  }

  const body = (analysis as any)?.analysis ?? analysis;
  documentsRepo.updateStatus(doc.id, 'analyzed', {
    analysis_json: JSON.stringify(body),
    page_count: (analysis as any)?.page_count ?? doc.page_count,
    sensitivity: (analysis as any)?.redacted ? 'held' : 'clear',
  });

  if (group?.status === 'active') {
    await postDocumentSummaryToGroup(group.jid, doc.filename, body);
  }
}

async function postDocumentSummaryToGroup(
  groupJid: string,
  filename: string,
  analysis: any
): Promise<void> {
  const sock = getSocket();
  if (!sock) return;
  const text = renderDocumentSummary(filename, analysis);
  if (text) await sendMessage(sock, groupJid, text);
}

async function processScheduleJob(job: jobsRepo.Job, config: Config): Promise<void> {
  const payload = JSON.parse(job.payload_ref);
  const messages = messagesRepo.findByGroupAndTimeRange(payload.groupId, payload.startAt, payload.endAt);

  if (messages.length === 0) {
    logger.info({ jobId: job.id }, 'No messages for schedule detect');
    return;
  }

  const result = await callWorkerScheduleDetect({
    group_id: payload.groupId,
    messages: messages.map(m => ({
      id: m.id,
      content: m.content,
      sender_name: (m as any).display_name || 'Unknown',
      timestamp: m.timestamp,
    })),
    reference_time: new Date().toISOString(),
  }, config);

  if (result.status === 'ok' && result.candidates) {
    ingestCandidatesAndAutoActivate(payload.groupId, result.candidates);
  }
}

async function processReminderJob(_job: jobsRepo.Job, _config: Config): Promise<void> {
  const remindersRepo = await import('../db/repositories/reminders.repo.js');
  const pendingReminders = remindersRepo.getPendingDue();

  const sock = getSocket();
  if (!sock) return;

  for (const reminder of pendingReminders) {
    try {
      const schedule = (await import('../db/repositories/schedules.repo.js')).findScheduleById(reminder.schedule_id);
      if (!schedule || schedule.status !== 'active') {
        remindersRepo.cancelBySchedule(reminder.schedule_id);
        continue;
      }

      const group = groupsRepo.findById(schedule.group_id);
      if (!group || group.status !== 'active') continue;

      const dateStr = new Date(schedule.starts_at).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'full',
        timeStyle: 'short',
      });

      const reminderType = reminder.type === 'day_before' ? '📅 Besok' : '⏰ 2 jam lagi';
      const text = `${reminderType}: *${schedule.title}*\n🕐 ${dateStr}` +
                   (schedule.location ? `\n📍 ${schedule.location}` : '') +
                   (schedule.notes ? `\n📝 ${schedule.notes}` : '');

      await sendMessage(sock, group.jid, text);
      remindersRepo.markSent(reminder.id);
    } catch (err) {
      logger.error({ err, reminderId: reminder.id }, 'Failed to send reminder');
      remindersRepo.markFailed(reminder.id, String(err));
    }
  }
}

function classifyError(err: any): string {
  if (err.status === 429 || err.statusCode === 429) return 'rate_limit';
  if (err.status === 401 || err.statusCode === 401) return 'auth';
  if (err.status === 413 || err.statusCode === 413) return 'payload_too_large';
  if (err.status >= 500) return 'server_error';
  if (err.code === 'ETIMEDOUT' || err.code === 'UND_ERR_CONNECT_TIMEOUT') return 'timeout';
  return 'unknown';
}

async function notifyAdminJobFailed(job: jobsRepo.Job, errorClass: string, config: Config): Promise<void> {
  const sock = getSocket();
  if (!sock) return;

  for (const adminJid of config.alertAdminJids) {
    try {
      await sock.sendMessage(adminJid, {
        text: `⚠️ *RembugBot Alert*\nJob ${job.type} gagal setelah ${job.attempts} percobaan.\nError: ${errorClass}`,
      });
    } catch {
      // Can't notify - log only
      logger.error({ adminJid, jobId: job.id }, 'Failed to notify admin');
    }
  }
}
