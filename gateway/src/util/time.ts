import { DateTime } from 'luxon';

/**
 * Normalize any ISO / parseable timestamp to UTC ISO with trailing Z
 * so SQLite lexicographic range queries are correct.
 */
export function toUtcIso(input: string | Date | DateTime): string {
  if (input instanceof DateTime) {
    const iso = input.toUTC().toISO();
    if (!iso) throw new Error('Invalid DateTime');
    return iso;
  }
  if (input instanceof Date) {
    return input.toISOString();
  }
  const s = String(input).trim();
  // Already UTC Z
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(s)) {
    return s;
  }
  const dt = DateTime.fromISO(s, { setZone: true });
  if (!dt.isValid) {
    // Fallback: Date parse
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid timestamp: ${s}`);
    return d.toISOString();
  }
  const iso = dt.toUTC().toISO();
  if (!iso) throw new Error(`Invalid timestamp: ${s}`);
  return iso;
}
