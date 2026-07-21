import { getDb } from '../index.js';

export interface Participant {
  id: number;
  group_id: number;
  wa_jid_hmac: string;
  key_version: number;
  display_name: string;
  current_role: string;
  first_seen_at: string;
  last_seen_at: string;
}

export function findOrCreate(groupId: number, jidHmac: string, keyVersion: number, displayName: string): Participant {
  const db = getDb('');
  const existing = db.prepare(
    'SELECT * FROM participants WHERE group_id = ? AND wa_jid_hmac = ?'
  ).get(groupId, jidHmac) as Participant | undefined;

  if (existing) {
    if (displayName && displayName !== existing.display_name) {
      db.prepare(
        'UPDATE participants SET display_name = ?, last_seen_at = datetime(\'now\') WHERE id = ?'
      ).run(displayName, existing.id);
    }
    return { ...existing, display_name: displayName || existing.display_name };
  }

  const result = db.prepare(
    'INSERT INTO participants (group_id, wa_jid_hmac, key_version, display_name) VALUES (?, ?, ?, ?) RETURNING *'
  ).get(groupId, jidHmac, keyVersion, displayName) as Participant;
  return result;
}

export function updateRole(id: number, role: string): void {
  const db = getDb('');
  db.prepare('UPDATE participants SET current_role = ? WHERE id = ?').run(role, id);
}

export function findById(id: number): Participant | undefined {
  const db = getDb('');
  return db.prepare('SELECT * FROM participants WHERE id = ?').get(id) as Participant | undefined;
}

export function findByGroup(groupId: number): Participant[] {
  const db = getDb('');
  return db.prepare('SELECT * FROM participants WHERE group_id = ?').all(groupId) as Participant[];
}

export function touchLastSeen(id: number): void {
  const db = getDb('');
  db.prepare('UPDATE participants SET last_seen_at = datetime(\'now\') WHERE id = ?').run(id);
}
