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
    expect(text).toContain('⏰ *Tenggat*');
    expect(text).toContain('_Ayu_');
    expect(text).toMatch(/\n\n✨ \*Poin utama\*/);
  });

  it('renders thorough notulen fields without aggressive truncation', () => {
    const text = renderDocumentSummary('notulen.pdf', {
      title: 'Notulen',
      purpose: 'Lengkap.',
      sections: [
        {
          heading: 'REVISI PROKER',
          points: ['SIKOFUN', 'PENGELOLAAN WISATA', 'INFRASTRUKTUR'],
        },
      ],
      assignments: [
        { person: 'Nayla', items: ['Megicom'] },
        { person: 'Acel', items: ['Wajan', 'Stopkontak'] },
      ],
      schedule: [{ when: 'Minggu 12 Juli 07.00', what: 'Survei di SCH' }],
      open_questions: ['Tempat wisata masih beroperasi?', 'Total anak dusun?'],
      shopping_list: ['Beras', 'Minyak Goreng', 'Telur', 'Garam'],
    });

    expect(text).toContain('📌 *REVISI PROKER*');
    expect(text).toContain('👥 *Pembagian / penugasan*');
    expect(text).toContain('*Nayla:*');
    expect(text).toContain('Megicom');
    expect(text).toContain('🗓️ *Jadwal / rundown*');
    expect(text).toContain('❓ *Pertanyaan / survei*');
    expect(text).toContain('🛒 *Barang dibeli*');
    expect(text).toContain('Beras');
    expect(text).toContain('Minyak Goreng');
  });
});
