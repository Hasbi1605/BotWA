/**
 * WhatsApp-friendly document summary layout for mobile readability.
 * Thorough sections for notulen-style docs (assignments, schedule, shopping, Qs).
 * Uses WA markdown: *bold*, _italic_, blank lines, emoji section anchors.
 */

function asText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && v !== null && 'text' in v) {
    return String((v as { text?: unknown }).text ?? '').trim();
  }
  return String(v).trim();
}

function bullet(items: string[], max = 40): string[] {
  return items
    .map(asText)
    .filter(Boolean)
    .slice(0, max)
    .map((t) => `• ${t}`);
}

/**
 * Render AI document analysis into a scannable WhatsApp message.
 * Caps are high so long notulen (peralatan, belanja) are not silently dropped.
 */
export function renderDocumentSummary(filename: string, analysis: any): string {
  const sections: string[] = [];

  sections.push('📄 *Ringkasan dokumen*');

  if (filename) {
    sections.push(`📁 _${filename}_`);
  }

  const title = asText(analysis?.title);
  if (title) {
    sections.push(`*${title}*`);
  }

  const purpose = asText(analysis?.purpose);
  if (purpose) {
    sections.push(purpose);
  }

  // Structured sections from the document (A/B/C or headings)
  const docSections = Array.isArray(analysis?.sections) ? analysis.sections : [];
  for (const sec of docSections.slice(0, 12)) {
    const heading = asText(sec?.heading);
    const pts = Array.isArray(sec?.points)
      ? sec.points.map(asText).filter(Boolean)
      : [];
    if (!heading && pts.length === 0) continue;
    const block = [
      heading ? `📌 *${heading}*` : '📌 *Bagian*',
      ...bullet(pts, 25),
    ];
    sections.push(block.join('\n'));
  }

  const points = Array.isArray(analysis?.key_points)
    ? analysis.key_points.map(asText).filter(Boolean)
    : [];
  // Only show key_points if we did not already expand rich sections
  if (points.length && docSections.length === 0) {
    sections.push(['✨ *Poin utama*', ...bullet(points, 12)].join('\n'));
  } else if (points.length && docSections.length > 0) {
    // Short highlight strip when sections already detailed
    sections.push(['✨ *Sorotan*', ...bullet(points, 8)].join('\n'));
  }

  const decisions = Array.isArray(analysis?.decisions)
    ? analysis.decisions.map(asText).filter(Boolean)
    : [];
  if (decisions.length) {
    sections.push(['✅ *Keputusan*', ...bullet(decisions, 12)].join('\n'));
  }

  const schedule = Array.isArray(analysis?.schedule)
    ? analysis.schedule.map((s: unknown) => {
        if (typeof s === 'string') return s;
        if (s && typeof s === 'object') {
          const o = s as { when?: string; what?: string };
          const when = asText(o.when);
          const what = asText(o.what);
          if (when && what) return `*${when}* — ${what}`;
          return when || what;
        }
        return asText(s);
      }).filter(Boolean)
    : [];
  if (schedule.length) {
    sections.push(['🗓️ *Jadwal / rundown*', ...bullet(schedule, 15)].join('\n'));
  }

  const deadlines = Array.isArray(analysis?.deadlines)
    ? analysis.deadlines.map((d: unknown) => {
        if (typeof d === 'string') return d;
        if (d && typeof d === 'object') {
          const o = d as { date?: string; description?: string };
          const date = asText(o.date);
          const desc = asText(o.description);
          if (date && desc) return `*${date}* — ${desc}`;
          return date || desc;
        }
        return asText(d);
      }).filter(Boolean)
    : [];
  if (deadlines.length) {
    sections.push(['⏰ *Tenggat*', ...bullet(deadlines, 10)].join('\n'));
  }

  // Person → items (PERKAP style)
  const assignments = Array.isArray(analysis?.assignments) ? analysis.assignments : [];
  if (assignments.length) {
    const lines = ['👥 *Pembagian / penugasan*'];
    for (const a of assignments.slice(0, 30)) {
      const person = asText(a?.person);
      const items = Array.isArray(a?.items)
        ? a.items.map(asText).filter(Boolean)
        : [];
      if (!person && items.length === 0) continue;
      if (items.length) {
        lines.push(`• *${person || '—'}:* ${items.join(', ')}`);
      } else if (person) {
        lines.push(`• *${person}*`);
      }
    }
    if (lines.length > 1) sections.push(lines.join('\n'));
  }

  const tasks = Array.isArray(analysis?.tasks)
    ? analysis.tasks.map((t: unknown) => {
        if (typeof t === 'string') return t;
        if (t && typeof t === 'object') {
          const o = t as { text?: string; assignee?: string; due?: string };
          let line = asText(o.text);
          if (o.assignee) line += ` — _${asText(o.assignee)}_`;
          if (o.due) line += ` (${asText(o.due)})`;
          return line;
        }
        return asText(t);
      }).filter(Boolean)
    : [];
  // Avoid duplicating if assignments already cover equipment division
  if (tasks.length && assignments.length === 0) {
    sections.push(['☑️ *Tugas*', ...bullet(tasks, 25)].join('\n'));
  } else if (tasks.length && assignments.length > 0) {
    // Extra tasks without assignee already in assignments
    sections.push(['☑️ *Tugas lain*', ...bullet(tasks, 12)].join('\n'));
  }

  const questions = Array.isArray(analysis?.open_questions)
    ? analysis.open_questions.map(asText).filter(Boolean)
    : [];
  if (questions.length) {
    sections.push(['❓ *Pertanyaan / survei*', ...bullet(questions, 20)].join('\n'));
  }

  const shopping = Array.isArray(analysis?.shopping_list)
    ? analysis.shopping_list.map(asText).filter(Boolean)
    : [];
  if (shopping.length) {
    sections.push(['🛒 *Barang dibeli*', ...bullet(shopping, 40)].join('\n'));
  }

  if (analysis?.redacted) {
    sections.push('_🔒 Data sensitif disamarkan otomatis._');
  }

  return sections.filter(Boolean).join('\n\n').trim();
}
