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
