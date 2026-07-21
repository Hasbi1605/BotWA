import { getDb } from '../index.js';

export interface AdminAction {
  id: number;
  group_id: number;
  actor_hmac: string;
  command: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
}

export function log(data: {
  group_id: number;
  actor_hmac: string;
  command: string;
  target_type?: string;
  target_id?: string;
  details?: string;
}): AdminAction {
  const db = getDb('');
  return db.prepare(
    `INSERT INTO admin_actions (group_id, actor_hmac, command, target_type, target_id, details)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
  ).get(
    data.group_id, data.actor_hmac, data.command,
    data.target_type ?? null, data.target_id ?? null, data.details ?? null
  ) as AdminAction;
}

export function getByGroup(groupId: number, limit = 50): AdminAction[] {
  const db = getDb('');
  return db.prepare(
    'SELECT * FROM admin_actions WHERE group_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(groupId, limit) as AdminAction[];
}

export function deleteOlderThan(before: string): number {
  const db = getDb('');
  const result = db.prepare('DELETE FROM admin_actions WHERE created_at < ?').run(before);
  return result.changes;
}
