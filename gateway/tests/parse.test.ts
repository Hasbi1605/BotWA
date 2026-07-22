import { describe, expect, it } from 'vitest';
import { looksLikeCommand, parseIntent } from '../src/commands/parse.js';
import { jidsMatch, isAdmin, jidCore } from '../src/auth/admin.js';

describe('command parser (natural Indonesian)', () => {
  it('parses activation phrases', () => {
    expect(parseIntent('aktifkan bot').name).toBe('activate');
    expect(parseIntent('.aktifkan').name).toBe('activate');
    expect(parseIntent('aktifkan bot setuju').name).toBe('activate_confirm');
    expect(parseIntent('YA').name).toBe('confirm_yes');
    expect(parseIntent('tidak').name).toBe('confirm_no');
  });

  it('parses everyday admin phrases', () => {
    expect(parseIntent('ringkas').name).toBe('summary');
    expect(parseIntent('ringkas sekarang').name).toBe('summary');
    expect(parseIntent('bantuan').name).toBe('help');
    expect(parseIntent('admin').name).toBe('help_admin');
    expect(parseIntent('jeda').name).toBe('pause');
    expect(parseIntent('lanjut').name).toBe('resume');
    expect(parseIntent('hapus data').name).toBe('delete_data');
    expect(parseIntent('jadwal').name).toBe('schedule_list');
    expect(parseIntent('mode').name).toBe('mode');
    expect(parseIntent('mode normal').name).toBe('mode_normal');
    expect(parseIntent('mode roast').name).toBe('mode_roast');
    expect(parseIntent('.mode roast').name).toBe('mode_roast');
    expect(parseIntent('lc on').name).toBe('lc_on');
    expect(parseIntent('lc off').name).toBe('lc_off');
    expect(parseIntent('lc nyala').name).toBe('lc_on');
    expect(parseIntent('lc mati').name).toBe('lc_off');
    expect(parseIntent('mode lc').name).toBe('lc_on');
    expect(parseIntent('mode silent').name).toBe('lc_off');
    expect(parseIntent('memori').name).toBe('memory_status');
    expect(parseIntent('memori reset').name).toBe('memory_reset');
    expect(parseIntent('ingat: SCH titik kumpul').name).toBe('memory_add');
  });

  it('does not treat normal chat as commands', () => {
    expect(looksLikeCommand('besok kita rapat ya')).toBe(false);
    expect(looksLikeCommand('ok siap')).toBe(false);
    expect(looksLikeCommand('ringkas')).toBe(true);
  });
});

describe('LID-aware jid matching', () => {
  it('matches device-suffixed and bare phone cores', () => {
    expect(jidsMatch('6283878525697:3@s.whatsapp.net', '6283878525697@s.whatsapp.net')).toBe(true);
    expect(jidCore('143766145003610:3@lid')).toBe('143766145003610');
    expect(isAdmin('member')).toBe(false);
  });
});
