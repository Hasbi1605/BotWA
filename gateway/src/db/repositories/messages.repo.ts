import { getDb } from '../index.js';

export interface Message {
  id: number;
  message_id: string;
  group_id: number;
  participant_id: number;
  timestamp: string;
  type: string;
  content: string;
  reply_to: string | null;
  mentions: string | null;
  deleted_at: string | null;
  created_at: string;
}

export function insert(data: {
  message_id: string;
  group_id: number;
  participant_id: number;
  timestamp: string;
  type: string;
  content: string;
  reply_to?: string | null;
  mentions?: string | null;
}): Message | null {
  const db = getDb('');
  try {
    return db.prepare(
      `INSERT INTO messages (message_id, group_id, participant_id, timestamp, type, content, reply_to, mentions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).get(
      data.message_id, data.group_id, data.participant_id, data.timestamp,
      data.type, data.content, data.reply_to ?? null, data.mentions ?? null
    ) as Message;
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return null;
    throw e;
  }
}

export function findByGroupAndTimeRange(groupId: number, startAt: string, endAt: string): Message[] {
  const db = getDb('');
  return db.prepare(
    `SELECT m.*, p.display_name, p.wa_jid_hmac
     FROM messages m
     JOIN participants p ON p.id = m.participant_id
     WHERE m.group_id = ? AND m.timestamp >= ? AND m.timestamp < ? AND m.deleted_at IS NULL
     ORDER BY m.timestamp ASC`
  ).all(groupId, startAt, endAt) as Message[];
}

export function findById(id: number): Message | undefined {
  const db = getDb('');
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message | undefined;
}

/** Recent messages for LC chat context (newest last). */
export function findRecentByGroup(
  groupId: number,
  limit = 20
): Array<Message & { display_name?: string }> {
  const db = getDb('');
  const rows = db
    .prepare(
      `SELECT m.*, p.display_name
       FROM messages m
       JOIN participants p ON p.id = m.participant_id
       WHERE m.group_id = ? AND m.deleted_at IS NULL
       ORDER BY m.timestamp DESC
       LIMIT ?`
    )
    .all(groupId, limit) as Array<Message & { display_name?: string }>;
  return rows.reverse();
}

export function markDeleted(groupId: number, messageId: string): void {
  const db = getDb('');
  db.prepare(
    'UPDATE messages SET deleted_at = datetime(\'now\') WHERE group_id = ? AND message_id = ?'
  ).run(groupId, messageId);
}

export function updateContent(groupId: number, messageId: string, content: string): void {
  const db = getDb('');
  db.prepare(
    'UPDATE messages SET content = ? WHERE group_id = ? AND message_id = ?'
  ).run(content, groupId, messageId);
}

export function countByGroup(groupId: number, since: string): number {
  const db = getDb('');
  const row = db.prepare(
    'SELECT COUNT(*) as cnt FROM messages WHERE group_id = ? AND timestamp >= ? AND deleted_at IS NULL'
  ).get(groupId, since) as { cnt: number };
  return row.cnt;
}

export function deleteOlderThan(before: string): number {
  const db = getDb('');
  const result = db.prepare('DELETE FROM messages WHERE timestamp < ?').run(before);
  return result.changes;
}

export function existsByMessageId(groupId: number, messageId: string): boolean {
  const db = getDb('');
  const row = db.prepare(
    'SELECT 1 FROM messages WHERE group_id = ? AND message_id = ? LIMIT 1'
  ).get(groupId, messageId);
  return !!row;
}
