import { getDb } from '../index.js';

export type MemoryKind = 'fact' | 'person' | 'norm' | 'alias' | 'admin';

export interface GroupMemory {
  id: number;
  group_id: number;
  kind: MemoryKind;
  mem_key: string;
  content: string;
  confidence: number;
  pinned: number;
  created_at: string;
  updated_at: string;
}

const MAX_MEMORIES_PER_GROUP = 50;

export function listByGroup(groupId: number, limit = 50): GroupMemory[] {
  const db = getDb('');
  return db
    .prepare(
      `SELECT * FROM group_memories
       WHERE group_id = ?
       ORDER BY pinned DESC, confidence DESC, updated_at DESC
       LIMIT ?`
    )
    .all(groupId, limit) as GroupMemory[];
}

/** Compact text block for AI prompts. */
export function formatForPrompt(groupId: number, maxItems = 40): string {
  const rows = listByGroup(groupId, maxItems);
  if (rows.length === 0) return '';
  const lines = ['Memori grup (dipelajari dari chat — pakai bila relevan, jangan mengarang di luar ini):'];
  for (const r of rows) {
    const pin = r.pinned ? '📌' : '•';
    lines.push(`${pin} [${r.kind}] ${r.mem_key}: ${r.content}`);
  }
  return lines.join('\n');
}

export function upsert(data: {
  group_id: number;
  kind: MemoryKind;
  mem_key: string;
  content: string;
  confidence?: number;
  pinned?: boolean;
}): GroupMemory {
  const db = getDb('');
  const key = data.mem_key.trim().slice(0, 120);
  const content = data.content.trim().slice(0, 500);
  const confidence = Math.min(1, Math.max(0, data.confidence ?? 0.7));
  const pinned = data.pinned ? 1 : 0;

  const existing = db
    .prepare(
      'SELECT * FROM group_memories WHERE group_id = ? AND kind = ? AND mem_key = ?'
    )
    .get(data.group_id, data.kind, key) as GroupMemory | undefined;

  if (existing) {
    // Don't lower confidence of pinned admin notes unless content updated by admin
    const conf = existing.pinned
      ? Math.max(existing.confidence, confidence)
      : confidence;
    const pin = existing.pinned || pinned ? 1 : 0;
    db.prepare(
      `UPDATE group_memories
       SET content = ?, confidence = ?, pinned = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(content, conf, pin, existing.id);
    return db.prepare('SELECT * FROM group_memories WHERE id = ?').get(existing.id) as GroupMemory;
  }

  const row = db
    .prepare(
      `INSERT INTO group_memories (group_id, kind, mem_key, content, confidence, pinned)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .get(data.group_id, data.kind, key, content, confidence, pinned) as GroupMemory;

  pruneIfNeeded(data.group_id);
  return row;
}

export function removeKey(groupId: number, kind: MemoryKind, memKey: string): void {
  const db = getDb('');
  db.prepare(
    'DELETE FROM group_memories WHERE group_id = ? AND kind = ? AND mem_key = ? AND pinned = 0'
  ).run(groupId, kind, memKey);
}

export function clearGroup(groupId: number, { keepPinned = true } = {}): number {
  const db = getDb('');
  if (keepPinned) {
    const r = db
      .prepare('DELETE FROM group_memories WHERE group_id = ? AND pinned = 0')
      .run(groupId);
    return r.changes;
  }
  const r = db.prepare('DELETE FROM group_memories WHERE group_id = ?').run(groupId);
  return r.changes;
}

export function countByGroup(groupId: number): number {
  const db = getDb('');
  const row = db
    .prepare('SELECT COUNT(*) as cnt FROM group_memories WHERE group_id = ?')
    .get(groupId) as { cnt: number };
  return row.cnt;
}

function pruneIfNeeded(groupId: number): void {
  const db = getDb('');
  const cnt = countByGroup(groupId);
  if (cnt <= MAX_MEMORIES_PER_GROUP) return;
  // Drop lowest confidence unpinned first
  const excess = cnt - MAX_MEMORIES_PER_GROUP;
  db.prepare(
    `DELETE FROM group_memories WHERE id IN (
       SELECT id FROM group_memories
       WHERE group_id = ? AND pinned = 0
       ORDER BY confidence ASC, updated_at ASC
       LIMIT ?
     )`
  ).run(groupId, excess);
}

export function applyConsolidateResult(
  groupId: number,
  items: Array<{
    kind?: string;
    key?: string;
    mem_key?: string;
    content?: string;
    confidence?: number;
    action?: string;
  }>
): { upserted: number; removed: number } {
  let upserted = 0;
  let removed = 0;
  for (const item of items) {
    const kind = normalizeKind(item.kind);
    const key = (item.mem_key || item.key || '').trim();
    const content = (item.content || '').trim();
    const action = (item.action || 'upsert').toLowerCase();
    if (!kind || !key) continue;

    if (action === 'delete' || action === 'remove') {
      removeKey(groupId, kind, key);
      removed++;
      continue;
    }
    if (!content) continue;
    upsert({
      group_id: groupId,
      kind,
      mem_key: key,
      content,
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.7,
    });
    upserted++;
  }
  return { upserted, removed };
}

function normalizeKind(k?: string): MemoryKind | null {
  const v = (k || 'fact').toLowerCase();
  if (v === 'fact' || v === 'person' || v === 'norm' || v === 'alias' || v === 'admin') {
    return v;
  }
  if (v === 'habit' || v === 'kebiasaan') return 'person';
  if (v === 'rule' || v === 'aturan') return 'norm';
  if (v === 'name' || v === 'panggilan') return 'alias';
  return 'fact';
}
