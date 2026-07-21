import { describe, expect, it } from 'vitest';
import {
  remapAliases,
  renderSummary,
  reverseAliasMap,
} from '../src/jobs/summary-render.js';

describe('summary render (community-style)', () => {
  const aliasMap = {
    Ayu: 'PERSON_001',
    Budi: 'PERSON_002',
  };

  it('reverses alias map', () => {
    const rev = reverseAliasMap(aliasMap);
    expect(rev.get('PERSON_001')).toBe('Ayu');
    expect(rev.get('PERSON_002')).toBe('Budi');
  });

  it('remaps PERSON aliases in free text', () => {
    const rev = reverseAliasMap(aliasMap);
    expect(remapAliases('PERSON_001 setuju, PERSON_002 bawa proyektor', rev)).toBe(
      'Ayu setuju, Budi bawa proyektor'
    );
  });

  it('renders casual Indonesian sections with names, links, top senders', () => {
    const text = renderSummary({
      output: {
        alias_map: aliasMap,
        activity: { message_count: 12, participant_count: 2 },
        narrative: 'PERSON_001 mengusulkan rapat, PERSON_002 setuju.',
        highlights: [{ text: 'Rapat — PERSON_001 aktif', source_message_ids: [1] }],
        important_messages: [
          {
            speaker_alias: 'PERSON_001',
            quote: 'Rapat jam 3 sore',
            source_message_id: 1,
          },
        ],
        decisions: [{ text: 'Rapat besok', status: 'confirmed', source_message_ids: [1] }],
        tasks: [
          {
            text: 'Bawa proyektor',
            assignee_alias: 'PERSON_002',
            source_message_ids: [2],
          },
        ],
        schedule_candidates: [
          {
            title: 'Rapat balai',
            date: '2026-07-22',
            time: '15:00',
            location: 'balai desa',
            ambiguities: [],
            source_message_ids: [1],
          },
        ],
        open_questions: ['Siapa yang catat notulen?'],
        links: [
          {
            url: 'https://example.com/rapat',
            sender_alias: 'PERSON_002',
            source_message_id: 3,
          },
        ],
        top_senders: [
          { alias: 'PERSON_001', count: 8 },
          { alias: 'PERSON_002', count: 4 },
        ],
      },
      startAt: '2026-07-21T01:00:00.000Z',
      endAt: '2026-07-21T13:00:00.000Z',
      documentLines: ['Proposal.pdf: ringkasan singkat'],
    });

    expect(text).toContain('*Inti diskusi*');
    expect(text).toContain('Ayu mengusulkan rapat, Budi setuju.');
    expect(text).toContain('Ayu: "Rapat jam 3 sore"');
    expect(text).toContain('*Keputusan*');
    expect(text).toContain('Bawa proyektor — Budi');
    expect(text).toContain('*Usulan jadwal*');
    expect(text).toContain('*Dokumen*');
    expect(text).toContain('Proposal.pdf');
    expect(text).toContain('*Pertanyaan terbuka*');
    expect(text).toContain('*Link*');
    expect(text).toContain('Budi: https://example.com/rapat');
    expect(text).toContain('Top pengirim: Ayu (8), Budi (4)');
    expect(text).not.toContain('PERSON_001');
  });

  it('skips empty optional sections', () => {
    const text = renderSummary({
      output: {
        activity: { message_count: 1, participant_count: 1 },
        narrative: 'Hanya satu topik singkat.',
        highlights: [],
        decisions: [],
        tasks: [],
        links: [],
        top_senders: [],
      },
      startAt: '2026-07-21T01:00:00.000Z',
      endAt: '2026-07-21T13:00:00.000Z',
    });
    expect(text).toContain('*Inti diskusi*');
    expect(text).not.toContain('*Keputusan*');
    expect(text).not.toContain('*Link*');
    expect(text).not.toContain('Top pengirim');
  });
});
