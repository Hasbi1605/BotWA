import { getDb } from '../index.js';

export interface Document {
  id: number;
  message_id: number;
  group_id: number;
  hash: string;
  filename: string;
  mime_type: string;
  file_size: number;
  page_count: number | null;
  status: string;
  sensitivity: string;
  extracted_text_path: string | null;
  analysis_json: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export function create(data: {
  message_id: number;
  group_id: number;
  hash: string;
  filename: string;
  mime_type: string;
  file_size: number;
  page_count?: number | null;
}): Document | null {
  const db = getDb('');
  const existing = db.prepare(
    'SELECT * FROM documents WHERE hash = ? AND group_id = ?'
  ).get(data.hash, data.group_id) as Document | undefined;

  if (existing) return null; // duplicate

  return db.prepare(
    `INSERT INTO documents (message_id, group_id, hash, filename, mime_type, file_size, page_count)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).get(
    data.message_id, data.group_id, data.hash, data.filename,
    data.mime_type, data.file_size, data.page_count ?? null
  ) as Document;
}

export function findById(id: number): Document | undefined {
  const db = getDb('');
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Document | undefined;
}

export function updateStatus(id: number, status: string, extra?: Partial<Document>): void {
  const db = getDb('');
  const sets = ['status = ?', 'updated_at = datetime(\'now\')'];
  const values: any[] = [status];

  if (extra?.sensitivity) { sets.push('sensitivity = ?'); values.push(extra.sensitivity); }
  if (extra?.extracted_text_path) { sets.push('extracted_text_path = ?'); values.push(extra.extracted_text_path); }
  if (extra?.analysis_json) { sets.push('analysis_json = ?'); values.push(extra.analysis_json); }
  if (extra?.page_count !== undefined) { sets.push('page_count = ?'); values.push(extra.page_count); }
  if (extra?.error_message) { sets.push('error_message = ?'); values.push(extra.error_message); }

  values.push(id);
  db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function getByGroup(groupId: number): Document[] {
  const db = getDb('');
  return db.prepare(
    'SELECT * FROM documents WHERE group_id = ? ORDER BY created_at DESC'
  ).all(groupId) as Document[];
}

/** Analyzed PDFs whose parent message falls inside the summary window. */
export function getAnalyzedInWindow(groupId: number, startAt: string, endAt: string): Document[] {
  const db = getDb('');
  return db.prepare(
    `SELECT d.*
     FROM documents d
     JOIN messages m ON m.id = d.message_id
     WHERE d.group_id = ?
       AND d.status = 'analyzed'
       AND m.timestamp >= ?
       AND m.timestamp < ?
     ORDER BY m.timestamp ASC`
  ).all(groupId, startAt, endAt) as Document[];
}

export function deleteOlderThan(before: string): number {
  const db = getDb('');
  const result = db.prepare('DELETE FROM documents WHERE created_at < ?').run(before);
  return result.changes;
}
