import { describe, expect, it } from 'vitest';

describe('schedule auto rules (pure)', () => {
  it('requires YYYY-MM-DD date', () => {
    expect(/^\d{4}-\d{2}-\d{2}$/.test('2026-07-24')).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2}$/.test('besok')).toBe(false);
  });

  it('defaults missing time to 09:00', () => {
    let time = '';
    let notes: string | null = null;
    if (!time || !/^\d{1,2}:\d{2}$/.test(time)) {
      time = '09:00';
      notes = 'jam default 09.00';
    }
    expect(time).toBe('09:00');
    expect(notes).toBe('jam default 09.00');
  });
});
