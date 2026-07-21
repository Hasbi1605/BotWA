import { getDb } from '../index.js';

export interface Job {
  id: number;
  type: string;
  payload_ref: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string | null;
  idempotency_key: string;
  error_class: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export function create(data: {
  type: string;
  payload_ref: string;
  idempotency_key: string;
  run_after?: string | null;
  max_attempts?: number;
}): Job | null {
  const db = getDb('');
  try {
    return db.prepare(
      `INSERT INTO jobs (type, payload_ref, idempotency_key, run_after, max_attempts)
       VALUES (?, ?, ?, ?, ?) RETURNING *`
    ).get(
      data.type, data.payload_ref, data.idempotency_key,
      data.run_after ?? null, data.max_attempts ?? 3
    ) as Job;
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return null;
    throw e;
  }
}

export function getNextPending(): Job | undefined {
  const db = getDb('');
  return db.prepare(
    `SELECT * FROM jobs
     WHERE status = 'pending' AND (run_after IS NULL OR run_after <= datetime('now'))
     ORDER BY created_at ASC LIMIT 1`
  ).get() as Job | undefined;
}

export function updateStatus(id: number, status: string, extra?: Partial<Job>): void {
  const db = getDb('');
  const sets = ['status = ?', 'updated_at = datetime(\'now\')'];
  const values: any[] = [status];

  if (extra?.error_class) { sets.push('error_class = ?'); values.push(extra.error_class); }
  if (extra?.error_message) { sets.push('error_message = ?'); values.push(extra.error_message); }
  if (status === 'completed') { sets.push('completed_at = datetime(\'now\')'); }

  values.push(id);
  db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function incrementAttempts(id: number): void {
  const db = getDb('');
  db.prepare('UPDATE jobs SET attempts = attempts + 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);
}

export function retryLater(id: number, runAfter: string): void {
  const db = getDb('');
  db.prepare(
    'UPDATE jobs SET status = \'retrying\', run_after = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(runAfter, id);
}
