import { getDb } from '../index.js';

export interface ScheduleCandidate {
  id: number;
  group_id: number;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  ambiguities: string | null;
  source_message_ids: string;
  status: string;
  confirmed_schedule_id: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: number;
  group_id: number;
  title: string;
  starts_at: string;
  location: string | null;
  notes: string | null;
  status: string;
  source_candidate_id: number | null;
  created_at: string;
  updated_at: string;
}

export function createCandidate(data: {
  group_id: number;
  title: string;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  ambiguities?: string[];
  source_message_ids: number[];
  expires_at: string;
}): ScheduleCandidate {
  const db = getDb('');
  return db.prepare(
    `INSERT INTO schedule_candidates (group_id, title, date, time, location, ambiguities, source_message_ids, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).get(
    data.group_id, data.title, data.date ?? null, data.time ?? null,
    data.location ?? null,
    data.ambiguities ? JSON.stringify(data.ambiguities) : null,
    JSON.stringify(data.source_message_ids),
    data.expires_at
  ) as ScheduleCandidate;
}

export function confirmCandidate(candidateId: number, corrections?: Partial<ScheduleCandidate>): Schedule {
  const db = getDb('');
  return db.transaction(() => {
    const candidate = db.prepare('SELECT * FROM schedule_candidates WHERE id = ?').get(candidateId) as ScheduleCandidate;
    if (!candidate) throw new Error('Candidate not found');

    const title = corrections?.title ?? candidate.title;
    const date = corrections?.date ?? candidate.date;
    const time = corrections?.time ?? candidate.time;
    const location = corrections?.location ?? candidate.location;
    const startsAt = date && time ? `${date}T${time}:00` : date ? `${date}T00:00:00` : new Date().toISOString();

    const schedule = db.prepare(
      `INSERT INTO schedules (group_id, title, starts_at, location, source_candidate_id)
       VALUES (?, ?, ?, ?, ?) RETURNING *`
    ).get(candidate.group_id, title, startsAt, location, candidateId) as Schedule;

    db.prepare(
      'UPDATE schedule_candidates SET status = \'confirmed\', confirmed_schedule_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(schedule.id, candidateId);

    return schedule;
  })();
}

export function rejectCandidate(candidateId: number): void {
  const db = getDb('');
  db.prepare('UPDATE schedule_candidates SET status = \'rejected\', updated_at = datetime(\'now\') WHERE id = ?').run(candidateId);
}

export function createSchedule(data: {
  group_id: number;
  title: string;
  starts_at: string;
  location?: string | null;
}): Schedule {
  const db = getDb('');
  return db.prepare(
    `INSERT INTO schedules (group_id, title, starts_at, location)
     VALUES (?, ?, ?, ?) RETURNING *`
  ).get(data.group_id, data.title, data.starts_at, data.location ?? null) as Schedule;
}

export function updateSchedule(id: number, updates: Partial<Schedule>): void {
  const db = getDb('');
  const sets = ['updated_at = datetime(\'now\')'];
  const values: any[] = [];

  if (updates.title) { sets.push('title = ?'); values.push(updates.title); }
  if (updates.starts_at) { sets.push('starts_at = ?'); values.push(updates.starts_at); }
  if (updates.location !== undefined) { sets.push('location = ?'); values.push(updates.location); }
  if (updates.status) { sets.push('status = ?'); values.push(updates.status); }
  if (updates.notes !== undefined) { sets.push('notes = ?'); values.push(updates.notes); }

  values.push(id);
  db.prepare(`UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function cancelSchedule(id: number): void {
  const db = getDb('');
  db.prepare('UPDATE schedules SET status = \'cancelled\', updated_at = datetime(\'now\') WHERE id = ?').run(id);
  db.prepare('UPDATE reminders SET status = \'cancelled\' WHERE schedule_id = ? AND status = \'pending\'').run(id);
}

export function getActiveByGroup(groupId: number): Schedule[] {
  const db = getDb('');
  return db.prepare(
    'SELECT * FROM schedules WHERE group_id = ? AND status = \'active\' ORDER BY starts_at ASC'
  ).all(groupId) as Schedule[];
}

export function getCandidatesByGroup(groupId: number): ScheduleCandidate[] {
  const db = getDb('');
  return db.prepare(
    `SELECT * FROM schedule_candidates
     WHERE group_id = ? AND status = 'candidate'
     ORDER BY created_at ASC`
  ).all(groupId) as ScheduleCandidate[];
}

export function expireOldCandidates(before: string): number {
  const db = getDb('');
  const result = db.prepare(
    'UPDATE schedule_candidates SET status = \'expired\', updated_at = datetime(\'now\') WHERE status = \'candidate\' AND expires_at < ?'
  ).run(before);
  return result.changes;
}

export function findScheduleById(id: number): Schedule | undefined {
  const db = getDb('');
  return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as Schedule | undefined;
}

export function findCandidateById(id: number): ScheduleCandidate | undefined {
  const db = getDb('');
  return db.prepare('SELECT * FROM schedule_candidates WHERE id = ?').get(id) as ScheduleCandidate | undefined;
}
