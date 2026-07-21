/**
 * Render validated summary JSON into casual Indonesian WhatsApp text.
 * Inspired by community bots (e.g. mocasus/whatsapp-group-summary):
 * Inti diskusi, keputusan, tugas, pertanyaan, link, top pengirim.
 * No roast mode — tone stays polite for KKN/desa groups.
 */

export interface RenderSummaryInput {
  output: any;
  startAt: string;
  endAt: string;
  /** Optional PDF blurbs already analyzed in this window */
  documentLines?: string[];
  /** Optional late header e.g. after outage */
  headerPrefix?: string;
  mode?: 'normal' | 'roast';
}

/** Build PERSON_xxx → display name from alias_map { name: PERSON_xxx }. */
export function reverseAliasMap(aliasMap: Record<string, string> | undefined): Map<string, string> {
  const rev = new Map<string, string>();
  if (!aliasMap) return rev;
  for (const [name, alias] of Object.entries(aliasMap)) {
    if (alias) rev.set(alias, name);
  }
  return rev;
}

/** Replace PERSON_001 etc. with real display names throughout a string. */
export function remapAliases(text: string, rev: Map<string, string>): string {
  if (!text || rev.size === 0) return text;
  let out = text;
  // Longer aliases first (PERSON_010 before PERSON_001 is fine with full match)
  const aliases = [...rev.keys()].sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const name = rev.get(alias)!;
    out = out.split(alias).join(name);
  }
  return out;
}

function nameOf(alias: string | null | undefined, rev: Map<string, string>): string {
  if (!alias) return '';
  return rev.get(alias) || alias;
}

export function renderSummary(input: RenderSummaryInput): string {
  const { output, startAt, endAt, documentLines = [], headerPrefix, mode = 'normal' } = input;
  const rev = reverseAliasMap(output?.alias_map);
  const R = (s: string) => remapAliases(s, rev);
  const roast = mode === 'roast';

  const sections: string[] = [];

  if (headerPrefix) {
    sections.push(headerPrefix);
  }

  const startDate = new Date(startAt).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const endDate = new Date(endAt).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  sections.push(
    roast
      ? `🔥 *Ringkasan roast*\n_${startDate} s/d ${endDate}_`
      : `📋 *Ringkasan grup*\n_${startDate} s/d ${endDate}_`
  );

  if (output?.activity) {
    const msgCount = output.activity.message_count ?? 0;
    const people = output.activity.participant_count ?? 0;
    sections.push(`_${msgCount} pesan · ${people} orang aktif_`);
  }

  if (output?.narrative) {
    sections.push(
      roast
        ? `💬 *Inti (santai)*\n${R(output.narrative)}`
        : `💬 *Inti diskusi*\n${R(output.narrative)}`
    );
  }

  if (output?.highlights?.length > 0) {
    const lines = [roast ? '✨ *Yang rame*' : '✨ *Sorotan*'];
    for (const h of output.highlights.slice(0, 8)) {
      lines.push(`• ${R(h.text)}`);
    }
    sections.push(lines.join('\n'));
  }

  if (output?.important_messages?.length > 0) {
    const lines = ['📌 *Pesan penting*'];
    for (const m of output.important_messages.slice(0, 6)) {
      const who = nameOf(m.speaker_alias, rev);
      lines.push(`• *${who}:* _"${R(m.quote)}"_`);
    }
    sections.push(lines.join('\n'));
  }

  if (output?.decisions?.length > 0) {
    const lines = ['✅ *Keputusan*'];
    for (const d of output.decisions) {
      const status =
        d.status === 'tentative'
          ? ' _(sementara)_'
          : d.status === 'disputed'
            ? ' _(belum sepakat)_'
            : '';
      lines.push(`• ${R(d.text)}${status}`);
    }
    sections.push(lines.join('\n'));
  }

  if (output?.tasks?.length > 0) {
    const lines = ['☑️ *Tugas / PR*'];
    for (const t of output.tasks) {
      let taskText = `• ${R(t.text)}`;
      if (t.assignee_alias) taskText += ` — _${nameOf(t.assignee_alias, rev)}_`;
      lines.push(taskText);
    }
    sections.push(lines.join('\n'));
  }

  if (output?.schedule_candidates?.length > 0) {
    const lines = ['🗓️ *Jadwal* _(otomatis + pengingat)_'];
    for (const s of output.schedule_candidates) {
      let schedText = `• *${R(s.title)}*`;
      if (s.date) schedText += `\n  ${s.date}`;
      if (s.time) schedText += ` ${s.time}`;
      else if (s.date) schedText += ' 09:00 _(default)_';
      if (s.location) schedText += ` · ${R(s.location)}`;
      if (s.ambiguities?.length > 0) schedText += ' ⚠️';
      lines.push(schedText);
    }
    sections.push(lines.join('\n'));
  }

  const docsFromModel: string[] = Array.isArray(output?.documents)
    ? output.documents.map((d: any) => (typeof d === 'string' ? d : String(d)))
    : [];
  const allDocs = [...docsFromModel.map(R), ...documentLines];
  if (allDocs.length > 0) {
    const lines = ['📄 *Dokumen*'];
    for (const doc of allDocs.slice(0, 6)) {
      lines.push(`• ${doc}`);
    }
    sections.push(lines.join('\n'));
  }

  if (output?.open_questions?.length > 0) {
    const lines = ['❓ *Pertanyaan terbuka*'];
    for (const q of output.open_questions) {
      lines.push(`• ${R(typeof q === 'string' ? q : String(q))}`);
    }
    sections.push(lines.join('\n'));
  }

  if (output?.links?.length > 0) {
    const lines = ['🔗 *Link*'];
    for (const link of output.links.slice(0, 10)) {
      const who = nameOf(link.sender_alias, rev);
      lines.push(who ? `• *${who}:* ${link.url}` : `• ${link.url}`);
    }
    sections.push(lines.join('\n'));
  }

  if (output?.top_senders?.length > 0) {
    const parts = output.top_senders.slice(0, 5).map((s: any) => {
      const who = nameOf(s.alias, rev);
      return `*${who}* (${s.count})`;
    });
    sections.push(`👥 Top pengirim: ${parts.join(' · ')}`);
  }

  return sections.filter(Boolean).join('\n\n').trim();
}
