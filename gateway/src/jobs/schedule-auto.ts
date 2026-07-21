/**
 * Full-auto schedule activation rules (product choice A).
 * Date required; missing time → 09:00 WIB + note.
 */
import { DateTime } from 'luxon';
import * as schedulesRepo from '../db/repositories/schedules.repo.js';
import { scheduleRemindersFor } from '../db/repositories/reminders.repo.js';
import pino from 'pino';

const logger = pino({ name: 'schedule-auto' });

export interface AutoCandidate {
  title?: string | null;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  ambiguities?: string[] | null;
  source_message_ids?: number[] | null;
}

/**
 * Try to auto-activate a schedule from AI candidate fields.
 * Returns schedule id if created, null if skipped.
 */
export function tryAutoActivateSchedule(
  groupId: number,
  candidate: AutoCandidate
): number | null {
  const title = (candidate.title || '').trim();
  if (!title) return null;

  const date = (candidate.date || '').trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    logger.debug({ title, date }, 'Skip auto schedule: missing/invalid date');
    return null;
  }

  let time = (candidate.time || '').trim();
  let notes: string | null = null;
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) {
    time = '09:00';
    notes = 'jam default 09.00';
  } else {
    // normalize HH:mm
    const [h, m] = time.split(':');
    time = `${h.padStart(2, '0')}:${m}`;
  }

  const localStartsAt = DateTime.fromISO(`${date}T${time}:00`, { zone: 'Asia/Jakarta' });
  if (!localStartsAt.isValid) {
    logger.warn({ title, date, time }, 'Skip auto schedule: invalid datetime');
    return null;
  }

  // Do not schedule deep in the past (>1 day)
  if (localStartsAt < DateTime.now().setZone('Asia/Jakarta').minus({ days: 1 })) {
    logger.debug({ title, date }, 'Skip auto schedule: too far in the past');
    return null;
  }

  const startsAt = localStartsAt.toUTC().toISO()!;

  // Dedupe: same group, same title (case-insensitive), same start hour
  const active = schedulesRepo.getActiveByGroup(groupId);
  const titleKey = title.toLowerCase();
  for (const s of active) {
    const sameTitle = s.title.trim().toLowerCase() === titleKey;
    const sameSlot =
      Math.abs(new Date(s.starts_at).getTime() - new Date(startsAt).getTime()) < 60 * 60 * 1000;
    if (sameTitle && sameSlot) {
      logger.info({ scheduleId: s.id, title }, 'Skip duplicate schedule');
      return null;
    }
  }

  const schedule = schedulesRepo.createSchedule({
    group_id: groupId,
    title,
    starts_at: startsAt,
    location: candidate.location ?? null,
  });
  if (notes) {
    schedulesRepo.updateSchedule(schedule.id, { notes });
  }
  scheduleRemindersFor(schedule.id, schedule.starts_at);
  logger.info({ scheduleId: schedule.id, title, startsAt, notes }, 'Auto-activated schedule');
  return schedule.id;
}

/** Persist raw candidate for audit then auto-activate if eligible. */
export function ingestCandidatesAndAutoActivate(
  groupId: number,
  candidates: AutoCandidate[]
): void {
  if (!Array.isArray(candidates)) return;
  for (const c of candidates) {
    if (!c?.title) continue;
    try {
      schedulesRepo.createCandidate({
        group_id: groupId,
        title: c.title,
        date: c.date ?? null,
        time: c.time ?? null,
        location: c.location ?? null,
        ambiguities: c.ambiguities ?? [],
        source_message_ids: c.source_message_ids ?? [],
        expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      });
    } catch (err) {
      logger.warn({ err }, 'createCandidate failed');
    }
    tryAutoActivateSchedule(groupId, c);
  }
}
