import { getDb } from '../index.js';
import { DateTime } from 'luxon';

export interface Reminder {
  id: number;
  schedule_id: number;
  type: string;
  due_at: string;
  sent_at: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export function create(scheduleId: number, type: string, dueAt: string): Reminder {
  const db = getDb('');
  return db.prepare(
    'INSERT INTO reminders (schedule_id, type, due_at) VALUES (?, ?, ?) RETURNING *'
  ).get(scheduleId, type, dueAt) as Reminder;
}

/**
 * Create day-before (19:00 local-ish wall clock relative to starts_at date)
 * and two-hours-before reminders for a confirmed schedule.
 * Skips reminder types that already exist or whose due time is already past.
 */
export function scheduleRemindersFor(scheduleId: number, startsAtIso: string): void {
  const startsAt = DateTime.fromISO(startsAtIso, {
    zone: 'Asia/Jakarta',
    setZone: true,
  }).setZone('Asia/Jakarta');
  if (!startsAt.isValid) {
    return;
  }

  const now = Date.now();

  // Day before at 19:00 WIB, independent of the container's system timezone.
  const dayBefore = startsAt.startOf('day').minus({ days: 1 }).set({ hour: 19 });

  // Two hours before event
  const twoHours = startsAt.minus({ hours: 2 });

  const plans: Array<{ type: 'day_before' | 'two_hours'; due: DateTime }> = [
    { type: 'day_before', due: dayBefore },
    { type: 'two_hours', due: twoHours },
  ];

  for (const plan of plans) {
    if (plan.due.toMillis() <= now) continue;
    if (existsByScheduleAndType(scheduleId, plan.type)) continue;
    create(scheduleId, plan.type, plan.due.toUTC().toISO()!);
  }
}

export function markSent(id: number): void {
  const db = getDb('');
  db.prepare(
    'UPDATE reminders SET status = \'sent\', sent_at = datetime(\'now\') WHERE id = ?'
  ).run(id);
}

export function markFailed(id: number, errorMessage: string): void {
  const db = getDb('');
  db.prepare(
    'UPDATE reminders SET status = \'failed\', error_message = ? WHERE id = ?'
  ).run(errorMessage, id);
}

export function cancelBySchedule(scheduleId: number): void {
  const db = getDb('');
  db.prepare(
    'UPDATE reminders SET status = \'cancelled\' WHERE schedule_id = ? AND status = \'pending\''
  ).run(scheduleId);
}

export function getPendingDue(): Reminder[] {
  const db = getDb('');
  return db.prepare(
    `SELECT r.*, s.title, s.starts_at, s.location, s.notes, s.group_id
     FROM reminders r
     JOIN schedules s ON s.id = r.schedule_id
     WHERE r.status = 'pending' AND datetime(r.due_at) <= datetime('now')
     ORDER BY r.due_at ASC`
  ).all() as Reminder[];
}

export function existsByScheduleAndType(scheduleId: number, type: string): boolean {
  const db = getDb('');
  const row = db.prepare(
    'SELECT 1 FROM reminders WHERE schedule_id = ? AND type = ? LIMIT 1'
  ).get(scheduleId, type);
  return !!row;
}
