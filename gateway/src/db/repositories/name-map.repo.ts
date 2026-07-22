import { getDb } from '../index.js';

export interface NameMapEntry {
  id: number;
  group_id: number;
  phone_digits: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

/** Canonical KKN pilot directory (phone digits without +). */
export const DEFAULT_NAME_DIRECTORY: Array<{ phone: string; name: string }> = [
  { phone: '6287838866063', name: 'Acel' },
  { phone: '6282136928559', name: 'Danu' },
  { phone: '6285659737310', name: 'Marin' },
  { phone: '6282373954730', name: 'Mesi' },
  { phone: '6281329090629', name: 'Nayla' },
  { phone: '6285946957362', name: 'Rahmat' },
  { phone: '6283135811167', name: 'Zia' },
  { phone: '6285181758446', name: 'Tio' },
];

/** Extra WA contact / push labels → canonical directory name. */
export const DEFAULT_NICKNAMES: Array<{ alias: string; name: string }> = [
  { alias: 'Alvito', name: 'Danu' },
  { alias: 'Alvito KKN', name: 'Danu' },
  { alias: 'M. Tio Wisnu Anggara', name: 'Tio' },
  { alias: 'Tio Wisnu Anggara', name: 'Tio' },
  { alias: 'Messi KKN', name: 'Mesi' },
  { alias: 'Mesi KKN', name: 'Mesi' },
];

/** Normalize any phone-ish string to digits starting with 62 when possible. */
export function normalizePhoneDigits(input: string): string | null {
  if (!input) return null;
  let d = String(input).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0') && d.length >= 10) d = '62' + d.slice(1);
  if (d.startsWith('8') && !d.startsWith('62') && d.length >= 9 && d.length <= 13) {
    d = '62' + d;
  }
  if (d.startsWith('62') && d.length >= 11 && d.length <= 15) return d;
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

export function isLikelyLid(jidOrCore: string): boolean {
  const core = jidOrCore.split('@')[0].split(':')[0];
  // Phone JIDs are 62… ~11–15 digits; LIDs are often longer
  if (/^\d+$/.test(core) && core.length > 15) return true;
  if (jidOrCore.includes('@lid')) return true;
  return false;
}

/** Extract phone core from WA jid (returns null for pure LID). */
export function phoneDigitsFromJid(jid: string): string | null {
  if (!jid) return null;
  const user = jid.split('@')[0] || '';
  const core = user.split(':')[0] || '';
  if (isLikelyLid(jid) || isLikelyLid(core)) return null;
  return normalizePhoneDigits(core);
}

/** Collect every phone-like candidate from a Baileys participant object. */
export function phonesFromParticipant(p: any): string[] {
  if (!p) return [];
  const fields = [p.id, p.jid, p.phoneNumber, p.lid, p.participant];
  const out: string[] = [];
  for (const f of fields) {
    if (!f || typeof f !== 'string') continue;
    const fromJid = phoneDigitsFromJid(f);
    if (fromJid) out.push(fromJid);
    const raw = normalizePhoneDigits(f);
    if (raw && raw.startsWith('62')) out.push(raw);
  }
  return [...new Set(out)];
}

/**
 * Parse multi-line directory text, e.g.:
 *   +62 878-3886-6063 = Acel
 */
export function parsePhoneNameDirectory(text: string): Array<{ phone: string; name: string }> {
  const out: Array<{ phone: string; name: string }> = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    let m = line.match(/^([+=\d\s\-().]+)\s*[=:]\s*(.+)$/);
    if (m) {
      const phone = normalizePhoneDigits(m[1]);
      const name = m[2].trim().replace(/^@/, '');
      if (phone && name && !/^\+?\d[\d\s\-]+$/.test(name)) {
        out.push({ phone, name });
        continue;
      }
    }
    m = line.match(/^([A-Za-zÀ-ÿ.~][A-Za-zÀ-ÿ0-9 .'_~-]{0,50})\s*[=:]\s*([+=\d\s\-().]+)$/);
    if (m) {
      const name = m[1].trim().replace(/^~/, '');
      const phone = normalizePhoneDigits(m[2]);
      if (phone && name) out.push({ phone, name });
    }
  }
  return out;
}

function normAliasKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^~/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*kkn\s*$/i, '')
    .trim();
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
      /* skip */
    }
  }
  return n;
}

export function upsertNickname(groupId: number, alias: string, displayName: string): void {
  const db = getDb('');
  const key = normAliasKey(alias);
  const name = displayName.trim().slice(0, 80);
  if (!key || !name) return;
  db.prepare(
    `INSERT INTO group_name_aliases (group_id, alias_key, display_name)
     VALUES (?, ?, ?)
     ON CONFLICT(group_id, alias_key) DO UPDATE SET
       display_name = excluded.display_name,
       updated_at = datetime('now')`
  ).run(groupId, key, name);
}

export function linkLidToPhone(groupId: number, lidJid: string, phoneDigits: string): void {
  const db = getDb('');
  const lid = lidJid.split('@')[0].split(':')[0].toLowerCase();
  const phone = normalizePhoneDigits(phoneDigits);
  if (!lid || !phone) return;
  // Skip if "lid" is already a normal phone core
  if (lid.startsWith('62') && lid.length <= 15) return;
  db.prepare(
    `INSERT INTO group_lid_map (group_id, lid_core, phone_digits)
     VALUES (?, ?, ?)
     ON CONFLICT(group_id, lid_core) DO UPDATE SET
       phone_digits = excluded.phone_digits,
       updated_at = datetime('now')`
  ).run(groupId, lid, phone);
}

export function phoneFromLid(groupId: number, lidJid: string): string | null {
  const lid = lidJid.split('@')[0].split(':')[0].toLowerCase();
  if (!lid) return null;
  const db = getDb('');
  const row = db
    .prepare(
      'SELECT phone_digits FROM group_lid_map WHERE group_id = ? AND lid_core = ?'
    )
    .get(groupId, lid) as { phone_digits: string } | undefined;
  return row?.phone_digits || null;
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
  if (digits) {
    const n = lookupByPhone(groupId, digits);
    if (n) return n;
  }
  // LID → previously learned phone → name
  if (isLikelyLid(jid)) {
    const phone = phoneFromLid(groupId, jid);
    if (phone) return lookupByPhone(groupId, phone);
  }
  return null;
}

export function lookupByNickname(groupId: number, label: string): string | null {
  const key = normAliasKey(label);
  if (!key) return null;
  const db = getDb('');
  // exact
  let row = db
    .prepare(
      'SELECT display_name FROM group_name_aliases WHERE group_id = ? AND alias_key = ?'
    )
    .get(groupId, key) as { display_name: string } | undefined;
  if (row) return row.display_name;
  // without trailing noise
  const short = key.replace(/\s+kkn$/i, '').trim();
  if (short !== key) {
    row = db
      .prepare(
        'SELECT display_name FROM group_name_aliases WHERE group_id = ? AND alias_key = ?'
      )
      .get(groupId, short) as { display_name: string } | undefined;
    if (row) return row.display_name;
  }
  // match if alias is prefix of label or vice versa
  const all = db
    .prepare('SELECT alias_key, display_name FROM group_name_aliases WHERE group_id = ?')
    .all(groupId) as Array<{ alias_key: string; display_name: string }>;
  for (const a of all) {
    if (key === a.alias_key || key.includes(a.alias_key) || a.alias_key.includes(key)) {
      return a.display_name;
    }
  }
  return null;
}

export function listByGroup(groupId: number): NameMapEntry[] {
  const db = getDb('');
  return db
    .prepare(
      'SELECT * FROM group_name_map WHERE group_id = ? ORDER BY display_name COLLATE NOCASE'
    )
    .all(groupId) as NameMapEntry[];
}

/**
 * Resolve the best display name for a sender.
 * Priority: directory(phone/LID) > nickname(pushName) > pushName (if not phone-like) > Anggota
 */
export function resolveDisplayName(
  groupId: number,
  senderJid: string,
  pushName?: string | null,
  extraPhones: string[] = []
): string {
  // 1) JID / LID map
  const byJid = lookupByJid(groupId, senderJid);
  if (byJid) return byJid;

  // 2) Extra phones from group metadata participant
  for (const ph of extraPhones) {
    const n = lookupByPhone(groupId, ph) || lookupByJid(groupId, ph);
    if (n) {
      // Learn LID → phone for next time
      const phone = normalizePhoneDigits(ph) || phoneDigitsFromJid(ph);
      if (phone && isLikelyLid(senderJid)) {
        try {
          linkLidToPhone(groupId, senderJid, phone);
        } catch {
          /* ignore */
        }
      }
      return n;
    }
  }

  const push = (pushName || '').trim();
  if (push) {
    // 3) Nickname / contact label (Alvito → Danu)
    const byNick = lookupByNickname(groupId, push);
    if (byNick) return byNick;

    // 4) pushName is a phone
    const asPhone = normalizePhoneDigits(push);
    if (asPhone) {
      const byPush = lookupByPhone(groupId, asPhone);
      if (byPush) return byPush;
    }

    // 5) Non-phone push name — only if not a known wrong temporary label
    if (!/^\+?\d[\d\s\-()]{6,}$/.test(push)) {
      // Still prefer directory if push is almost a directory name
      const dir = listByGroup(groupId);
      const pushKey = normAliasKey(push);
      for (const d of dir) {
        if (normAliasKey(d.display_name) === pushKey) return d.display_name;
      }
      return push;
    }
  }

  return 'Anggota';
}

/** Seed default phone directory + nicknames for a group (idempotent). */
export function seedDefaultDirectory(groupId: number): number {
  const n = upsertMany(groupId, DEFAULT_NAME_DIRECTORY);
  for (const a of DEFAULT_NICKNAMES) {
    upsertNickname(groupId, a.alias, a.name);
  }
  // Also nickname each canonical name to itself for matching "Danu KKN"
  for (const p of DEFAULT_NAME_DIRECTORY) {
    upsertNickname(groupId, p.name, p.name);
    upsertNickname(groupId, `${p.name} KKN`, p.name);
  }
  return n;
}

export function formatDirectoryForPrompt(groupId: number): string {
  const rows = listByGroup(groupId);
  if (!rows.length) return '';
  const lines = [
    'Direktori nama anggota (pakai nama kanonik ini di ringkasan; jangan sebut nomor HP):',
  ];
  for (const r of rows) {
    lines.push(`- ${r.display_name}`);
  }
  const db = getDb('');
  const aliases = db
    .prepare(
      'SELECT alias_key, display_name FROM group_name_aliases WHERE group_id = ? ORDER BY display_name'
    )
    .all(groupId) as Array<{ alias_key: string; display_name: string }>;
  const extra = aliases.filter(
    (a) => normAliasKey(a.alias_key) !== normAliasKey(a.display_name)
  );
  if (extra.length) {
    lines.push('Alias / nama kontak yang sama orangnya:');
    for (const a of extra.slice(0, 20)) {
      lines.push(`- "${a.alias_key}" = ${a.display_name}`);
    }
  }
  return lines.join('\n');
}

export function replacePhonesWithNames(groupId: number, text: string): string {
  if (!text) return text;
  const rows = listByGroup(groupId);
  if (!rows.length) return text;
  let out = text;
  const sorted = [...rows].sort((a, b) => b.phone_digits.length - a.phone_digits.length);
  for (const r of sorted) {
    const d = r.phone_digits;
    const variants = new Set<string>([d]);
    if (d.startsWith('62')) {
      variants.add('+' + d);
      variants.add('0' + d.slice(2));
    }
    for (const v of variants) {
      out = out.split(v).join(r.display_name);
    }
  }
  return out;
}
