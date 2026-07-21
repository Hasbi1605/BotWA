import cron from 'node-cron';
import { DateTime } from 'luxon';
import type { Config } from '../config/index.js';
import * as groupsRepo from '../db/repositories/groups.repo.js';
import * as summariesRepo from '../db/repositories/summaries.repo.js';
import * as jobsRepo from '../db/repositories/jobs.repo.js';
import pino from 'pino';

const logger = pino({ name: 'scheduler' });

let morningTask: cron.ScheduledTask | null = null;
let eveningTask: cron.ScheduledTask | null = null;
let reminderTask: cron.ScheduledTask | null = null;

export function startScheduler(config: Config): void {
  const tz = config.summaryTimezone;

  morningTask = cron.schedule(config.summaryCronMorning, () => {
    createSummaryWindows('morning', tz);
  }, { timezone: tz });

  eveningTask = cron.schedule(config.summaryCronEvening, () => {
    createSummaryWindows('evening', tz);
  }, { timezone: tz });

  // Sweep due reminders every 5 minutes
  reminderTask = cron.schedule('*/5 * * * *', () => {
    const hourKey = new Date().toISOString().slice(0, 13);
    const minuteBucket = Math.floor(new Date().getMinutes() / 5);
    jobsRepo.create({
      type: 'reminder',
      payload_ref: JSON.stringify({ sweep: true }),
      idempotency_key: `job:reminder:sweep:${hourKey}:${minuteBucket}`,
    });
  }, { timezone: tz });

  logger.info({ morning: config.summaryCronMorning, evening: config.summaryCronEvening, tz }, 'Scheduler started');
}

export function stopScheduler(): void {
  morningTask?.stop();
  eveningTask?.stop();
  reminderTask?.stop();
  logger.info('Scheduler stopped');
}

function createSummaryWindows(period: 'morning' | 'evening', tz: string): void {
  const now = DateTime.now().setZone(tz);
  let startAt: DateTime;
  let endAt: DateTime;

  if (period === 'morning') {
    // Morning: [prev 20:00, today 08:00)
    startAt = now.minus({ days: 1 }).set({ hour: 20, minute: 0, second: 0, millisecond: 0 });
    endAt = now.set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
  } else {
    // Evening: [today 08:00, today 20:00)
    startAt = now.set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
    endAt = now.set({ hour: 20, minute: 0, second: 0, millisecond: 0 });
  }

  const startISO = startAt.toISO()!;
  const endISO = endAt.toISO()!;

  const activeGroups = groupsRepo.listActive();
  logger.info({ period, groups: activeGroups.length, start: startISO, end: endISO }, 'Creating summary windows');

  for (const group of activeGroups) {
    const idempotencyKey = `summary:${group.id}:${startISO}:${endISO}`;

    const summary = summariesRepo.create({
      group_id: group.id,
      start_at: startISO,
      end_at: endISO,
      idempotency_key: idempotencyKey,
    });

    if (!summary) {
      logger.info({ groupId: group.id, period }, 'Summary window already exists (idempotent)');
      continue;
    }

    jobsRepo.create({
      type: 'summary',
      payload_ref: JSON.stringify({ summaryId: summary.id }),
      idempotency_key: `job:summary:${summary.id}`,
    });

    logger.info({ groupId: group.id, summaryId: summary.id, period }, 'Summary window created');
  }
}
