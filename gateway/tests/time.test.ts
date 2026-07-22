import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { toUtcIso } from '../src/util/time.js';

describe('toUtcIso', () => {
  it('converts Asia/Jakarta wall times to UTC Z', () => {
    const start = DateTime.fromObject(
      { year: 2026, month: 7, day: 22, hour: 8, minute: 0 },
      { zone: 'Asia/Jakarta' }
    );
    const end = DateTime.fromObject(
      { year: 2026, month: 7, day: 22, hour: 20, minute: 0 },
      { zone: 'Asia/Jakarta' }
    );
    expect(toUtcIso(start)).toBe('2026-07-22T01:00:00.000Z');
    expect(toUtcIso(end)).toBe('2026-07-22T13:00:00.000Z');
  });

  it('normalizes offset ISO to Z so range queries work with message timestamps', () => {
    const offsetForm = '2026-07-22T08:00:00.000+07:00';
    const utcForm = toUtcIso(offsetForm);
    expect(utcForm).toBe('2026-07-22T01:00:00.000Z');

    // Message at 08:00:26 WIB is after window start
    const msg = '2026-07-22T01:00:26.000Z';
    expect(msg >= utcForm).toBe(true);

    // BUG pattern: offset string would exclude this message
    expect(msg >= offsetForm).toBe(false);
  });
});
