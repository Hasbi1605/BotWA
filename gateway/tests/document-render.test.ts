import { describe, expect, it } from 'vitest';
import { renderDocumentSummary } from '../src/jobs/document-render.js';

describe('document summary mobile layout', () => {
  it('flat mode: uses icons and sections without rich structure', () => {
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
  });

  it('rich sections mode: does NOT re-dump sorotan/tasks/shopping/questions', () => {
    const text = renderDocumentSummary('notulen.pdf', {
      title: 'Notulen',
      purpose:
        'Notulen rapat KKN. Membahas proker, timeline, perkap, survei, rundown, belanja. Anggota harus paham tugas masing-masing. Kalimat keempat yang seharusnya terpotong.',
      sections: [
        {
          heading: 'B. REVISI PROKER',
          points: ['SIKOFUN', 'PENGELOLAAN WISATA', 'INFRASTRUKTUR'],
        },
        {
          heading: 'D. PERKAP',
          points: ['Megicom: Nayla', 'Kasur: Lara, Nayla, …'],
        },
        {
          heading: 'E. PERTANYAAN SURVEI',
          points: ['Tempat wisata masih beroperasi?'],
        },
        {
          heading: 'G. BELANJA',
          points: ['Beras, minyak, telur, …'],
        },
      ],
      // Would be redundant if rendered
      key_points: ['should not appear as full second body'],
      decisions: ['Proker utama di minggu awal'],
      tasks: [
        { text: 'Membawa kasur', assignee: 'Lara' },
        { text: 'Membawa kasur', assignee: 'Nayla' },
        { text: 'Konfirmasi kompor dan gas' },
      ],
      assignments: [{ person: 'Nayla', items: ['Megicom'] }],
      schedule: [{ when: '12 Juli', what: 'Survei' }],
      open_questions: ['Total anak dusun?'],
      shopping_list: ['Beras', 'Minyak', 'Telur'],
    });

    expect(text).toContain('📌 *B. REVISI PROKER*');
    expect(text).toContain('📌 *D. PERKAP*');
    // Redundant dumps must not appear
    expect(text).not.toContain('✨ *Poin utama*');
    expect(text).not.toContain('✨ *Sorotan*');
    expect(text).not.toContain('👥 *Pembagian*');
    expect(text).not.toContain('🛒 *Belanja*');
    expect(text).not.toContain('❓ *Pertanyaan*');
    expect(text).not.toContain('☑️ *Tugas*');
    expect(text).not.toContain('Membawa kasur');
    // Only open loops
    expect(text).toContain('⚠️ *Masih terbuka*');
    expect(text).toContain('Konfirmasi kompor dan gas');
    // purpose trimmed to ~3 sentences
    expect(text).not.toContain('Kalimat keempat');
  });
});
