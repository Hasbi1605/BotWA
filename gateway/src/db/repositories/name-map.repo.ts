import { getDb } from '../index.js';

export interface NameMapEntry {
  id: number;
  group_id: number;
  phone_digits: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

/** Normalize any phone-ish string to digits starting with 62 when possible. */
export function normalizePhoneDigits(input: string): string | null {
  if (!input) return null;
  let d = input.replace(/\D/g, '');
  if (!d) return null;
  // 08xxx → 628xxx
  if (d.startsWith('0') && d.length >= 10) d = '62' + d.slice(1);
  // 8xxx (missing country) → 628xxx
  if (d.startsWith('8') && !d.startsWith('62') && d.length >= 9 && d.length <= 13) {
    d = '62' + d;
  }
  if (d.startsWith('62') && d.length >= 11 && d.length <= 15) return d;
  // bare local length without 62 — still store if long enough
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

/** Extract phone core from WA jid (ignore LID if not phone-like). */
export function phoneDigitsFromJid(jid: string): string | null {
  if (!jid) return null;
  const user = jid.split('@')[0] || '';
  const core = user.split(':')[0] || '';
  // LID ids are long numeric but not phones — reject if too long without 62
  if (core.length > 15 && !core.startsWith('62')) return null;
  return normalizePhoneDigits(core);
}

/**
 * Parse multi-line directory text, e.g.:
 *   +62 878-3886-6063 = Acel
 *   6282136928559: Danu
 *   Acel = +62 878...
 */
export function parsePhoneNameDirectory(text: string): Array<{ phone: string; name: string }> {
  const out: Array<{ phone: string; name: string }> = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // phone = name  OR  phone: name
    let m = line.match(/^([+=\d\s\-().]+)\s*[=:]\s*(.+)$/);
    if (m) {
      const phone = normalizePhoneDigits(m[1]);
      const name = m[2].trim().replace(/^@/, '');
      if (phone && name && !/^\+?\d[\d\s\-]+$/.test(name)) {
        out.push({ phone, name });
        continue;
      }
    }
    // name = phone
    m = line.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .'_-]{0,40})\s*[=:]\s*([+=\d\s\-().]+)$/);
    if (m) {
      const name = m[1].trim();
      const phone = normalizePhoneDigits(m[2]);
      if (phone && name) out.push({ phone, name });
    }
  }
  return out;
}

export function upsert(groupId: number, phoneDigits: string, displayName: string): NameMapEntry {
  const db = getDb('');
  const phone = normalizePhoneDigits(phoneDigits);
  const name = displayName.trim().slice(0, 80);
  if (!phone || !name) throw new Error('Invalid phone/name');

  return db
    .prepare(
      `INSERT INTO group_name_map (group_id, phone_digits, display_name)
       VALUES (?, ?, ?)
       ON CONFLICT(group_id, phone_digits) DO UPDATE SET
         display_name = excluded.display_name,
         updated_at = datetime('now')
       RETURNING *`
    )
    .get(groupId, phone, name) as NameMapEntry;
}

export function upsertMany(
  groupId: number,
  pairs: Array<{ phone: string; name: string }>
): number {
  let n = 0;
  for (const p of pairs) {
    try {
      upsert(groupId, p.phone, p.name);
      n++;
    } catch {
      /* skip bad rows */
    }
  }
  return n;
}

export function lookupByPhone(groupId: number, phoneDigits: string): string | null {
  const phone = normalizePhoneDigits(phoneDigits);
  if (!phone) return null;
  const db = getDb('');
  const row = db
    .prepare(
      'SELECT display_name FROM group_name_map WHERE group_id = ? AND phone_digits = ?'
    )
    .get(groupId, phone) as { display_name: string } | undefined;
  return row?.display_name || null;
}

export function lookupByJid(groupId: number, jid: string): string | null {
  const digits = phoneDigitsFromJid(jid);
  if (!digits) return null;
  return lookupByPhone(groupId, digits);
}

export function listByGroup(groupId: number): NameMapEntry[] {
  const db = getDb('');
  return db
    .prepare(
      'SELECT * FROM group_name_map WHERE group_id = ? ORDER BY display_name COLLATE NOCASE'
    )
    .all(groupId) as NameMapEntry[];
}

/** Prefer directory name over pushName / WA number. */
export function resolveDisplayName(
  groupId: number,
  senderJid: string,
  pushName?: string | null
): string {
  const mapped = lookupByJid(groupId, senderJid);
  if (mapped) return mapped;

  const push = (pushName || '').trim();
  // If pushName is basically a phone number, try map
  const asPhone = normalizePhoneDigits(push);
  if (asPhone) {
    const byPush = lookupByPhone(groupId, asPhone);
    if (byPush) return byPush;
  }

  if (push && !/^\+?\d[\d\s\-()]{6,}$/.test(push)) return push;

  // last resort: map from jid digits shown as name
  const digits = phoneDigitsFromJid(senderJid);
  if (digits) {
    const again = lookupByPhone(groupId, digits);
    if (again) return again;
  }
  return push || 'Anggota';
}

/** Directory block for AI (names only + optional last4 for disambiguation). */
export function formatDirectoryForPrompt(groupId: number): string {
  const rows = listByGroup(groupId);
  if (!rows.length) return '';
  const lines = [
    'Direktori nama anggota (pakai nama ini, jangan sebut nomor HP di balasan):',
  ];
  for (const r of rows) {
    lines.push(`- ${r.display_name}`);
  }
  return lines.join('\n');
}

/** Replace bare phones in text with known names (for context / mentions). */
export function replacePhonesWithNames(groupId: number, text: string): string {
  if (!text) return text;
  const rows = listByGroup(groupId);
  if (!rows.length) return text;
  let out = text;
  // longer phones first
  const sorted = [...rows].sort((a, b) => b.phone_digits.length - a.phone_digits.length);
  for (const r of sorted) {
    const d = r.phone_digits;
    // +62…, 62…, 08…
    const variants = new Set<string>([d]);
    if (d.startsWith('62')) {
      variants.add('+' + d);
      variants.add('0' + d.slice(2));
    }
    for (const v of variants) {
      // loose: allow spaces/dashes between digit groups by normalizing later — simple fixed replace
      out = out.split(v).join(r.display_name);
    }
  }
  return out;
}
