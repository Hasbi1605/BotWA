import { getDb } from '../index.js';

export interface SummaryWindow {
  id: number;
  group_id: number;
  start_at: string;
  end_at: string;
  status: string;
  rendered_text: string | null;
  model_route: string | null;
  error_class: string | null;
  attempts: number;
  run_after: string | null;
  idempotency_key: string;
  created_at: string;
  completed_at: string | null;
}

export function create(data: {
  group_id: number;
  start_at: string;
  end_at: string;
  idempotency_key: string;
}): SummaryWindow | null {
  const db = getDb('');
  try {
    return db.prepare(
      `INSERT INTO summary_windows (group_id, start_at, end_at, idempotency_key)
       VALUES (?, ?, ?, ?) RETURNING *`
    ).get(data.group_id, data.start_at, data.end_at, data.idempotency_key) as SummaryWindow;
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return null;
    throw e;
  }
}

export function findById(id: number): SummaryWindow | undefined {
  const db = getDb('');
  return db.prepare('SELECT * FROM summary_windows WHERE id = ?').get(id) as SummaryWindow | undefined;
}

export function updateStatus(id: number, status: string, extra?: Partial<SummaryWindow>): void {
  const db = getDb('');
  // summary_windows has no updated_at column
  const sets = ['status = ?'];
  const values: any[] = [status];

  if (extra?.rendered_text !== undefined) {
    sets.push('rendered_text = ?');
    values.push(extra.rendered_text);
  }
  if (extra?.model_route !== undefined) {
    sets.push('model_route = ?');
    values.push(extra.model_route);
  }
  if (extra?.error_class !== undefined) {
    sets.push('error_class = ?');
    values.push(extra.error_class);
  }
  if (status === 'completed') {
    sets.push('completed_at = datetime(\'now\')');
  }

  values.push(id);
  db.prepare(`UPDATE summary_windows SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function incrementAttempts(id: number): void {
  const db = getDb('');
  db.prepare('UPDATE summary_windows SET attempts = attempts + 1 WHERE id = ?').run(id);
}

export function getLastCompleted(groupId: number): SummaryWindow | undefined {
  const db = getDb('');
  return db.prepare(
    `SELECT * FROM summary_windows
     WHERE group_id = ? AND status = 'completed'
     ORDER BY end_at DESC LIMIT 1`
  ).get(groupId) as SummaryWindow | undefined;
}

export function getPending(): SummaryWindow[] {
  const db = getDb('');
  return db.prepare(
    `SELECT * FROM summary_windows
     WHERE status IN ('pending', 'retrying')
     AND (run_after IS NULL OR run_after <= datetime('now'))
     ORDER BY created_at ASC`
  ).all() as SummaryWindow[];
}
