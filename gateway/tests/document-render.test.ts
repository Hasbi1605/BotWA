import { describe, expect, it } from 'vitest';
import { renderDocumentSummary } from '../src/jobs/document-render.js';

describe('document summary mobile layout', () => {
  it('uses bold headers, italic filename, icons, and blank lines', () => {
    const text = renderDocumentSummary('NOTULEN RAPAT 10 JULI.pdf', {
      title: 'Notulen Rapat 10 Juli',
      purpose: 'Hasil rapat kelompok KKN tentang proker dan timeline.',
      key_points: ['Proker utama di minggu awal', 'Pembagian perlengkapan sudah ditunjuk'],
      decisions: ['Proker: SIKOFUN, wisata, infrastruktur'],
      tasks: [
        { text: 'Membawa megicom', assignee: 'Ayu' },
        { text: 'Tanya kompor dan gas' },
      ],
      deadlines: [{ date: '2026-07-24', description: 'Kumpul proposal' }],
    });

    expect(text).toContain('📄 *Ringkasan dokumen*');
    expect(text).toContain('📁 _NOTULEN RAPAT 10 JULI.pdf_');
    expect(text).toContain('*Notulen Rapat 10 Juli*');
    expect(text).toContain('✨ *Poin utama*');
    expect(text).toContain('✅ *Keputusan*');
    expect(text).toContain('☑️ *Tugas*');
    expect(text).toContain('🗓️ *Tenggat*');
    expect(text).toContain('_Ayu_');
    // Breathing room between major blocks
    expect(text).toMatch(/\n\n✨ \*Poin utama\*/);
    expect(text).toMatch(/\n\n✅ \*Keputusan\*/);
  });
});
