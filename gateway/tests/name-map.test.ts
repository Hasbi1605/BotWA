import { describe, expect, it } from 'vitest';
import {
  normalizePhoneDigits,
  parsePhoneNameDirectory,
  phoneDigitsFromJid,
} from '../src/db/repositories/name-map.repo.js';

describe('name map phone parsing', () => {
  it('normalizes Indonesian phones', () => {
    expect(normalizePhoneDigits('+62 878-3886-6063')).toBe('6287838866063');
    expect(normalizePhoneDigits('087838866063')).toBe('6287838866063');
    expect(normalizePhoneDigits('6282136928559')).toBe('6282136928559');
  });

  it('extracts phone from jid', () => {
    expect(phoneDigitsFromJid('6287838866063:3@s.whatsapp.net')).toBe('6287838866063');
    expect(phoneDigitsFromJid('6287838866063@s.whatsapp.net')).toBe('6287838866063');
  });

  it('parses multi-line directory', () => {
    const text = `
+62 878-3886-6063 = Acel
+62 821-3692-8559 = Danu
+62 856-5973-7310 = Marin
+62 823-7395-4730 = Mesi
+62 813-2909-0629 = Nayla
+62 859-4695-7362 = Rahmat
+62 831-3581-1167 = Zia
+62 851-8175-8446 = Tio
`;
    const pairs = parsePhoneNameDirectory(text);
    expect(pairs).toHaveLength(8);
    expect(pairs.find((p) => p.name === 'Acel')?.phone).toBe('6287838866063');
    expect(pairs.find((p) => p.name === 'Tio')?.phone).toBe('6285181758446');
  });
});
