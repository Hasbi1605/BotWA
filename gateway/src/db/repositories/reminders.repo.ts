import { getDb } from '../index.js';

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
  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) {
    return;
  }

  const now = Date.now();

  // Day before at 19:00 (relative to starts_at calendar day, using same UTC offset as startsAt)
  const dayBefore = new Date(startsAt);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(19, 0, 0, 0);

  // Two hours before event
  const twoHours = new Date(startsAt.getTime() - 2 * 60 * 60 * 1000);

  const plans: Array<{ type: 'day_before' | 'two_hours'; due: Date }> = [
    { type: 'day_before', due: dayBefore },
    { type: 'two_hours', due: twoHours },
  ];

  for (const plan of plans) {
    if (plan.due.getTime() <= now) continue;
    if (existsByScheduleAndType(scheduleId, plan.type)) continue;
    create(scheduleId, plan.type, plan.due.toISOString());
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
     WHERE r.status = 'pending' AND r.due_at <= datetime('now')
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
