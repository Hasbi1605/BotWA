import { getDb } from '../index.js';

export interface Group {
  id: number;
  jid: string;
  name: string;
  timezone: string;
  status: string;
  summary_cron_morning: string;
  summary_cron_evening: string;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

export function findByJid(jid: string): Group | undefined {
  const db = getDb('');
  return db.prepare('SELECT * FROM groups WHERE jid = ?').get(jid) as Group | undefined;
}

export function findById(id: number): Group | undefined {
  const db = getDb('');
  return db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as Group | undefined;
}

export function listActive(): Group[] {
  const db = getDb('');
  return db.prepare('SELECT * FROM groups WHERE status = ?').all('active') as Group[];
}

export function create(jid: string, name: string): Group {
  const db = getDb('');
  const result = db.prepare(
    'INSERT INTO groups (jid, name) VALUES (?, ?) RETURNING *'
  ).get(jid, name) as Group;
  return result;
}

export function updateStatus(id: number, status: string): void {
  const db = getDb('');
  db.prepare('UPDATE groups SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(status, id);
}

export function setActivated(id: number): void {
  const db = getDb('');
  db.prepare(
    'UPDATE groups SET status = \'active\', activated_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?'
  ).run(id);
}
