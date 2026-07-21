/**
 * WhatsApp-friendly document summary layout for mobile readability.
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

function bullet(items: string[], max = 6): string[] {
  return items
    .map(asText)
    .filter(Boolean)
    .slice(0, max)
    .map((t) => `• ${t}`);
}

/**
 * Render AI document analysis into a scannable WhatsApp message.
 */
export function renderDocumentSummary(filename: string, analysis: any): string {
  const sections: string[] = [];

  // Header block
  sections.push('📄 *Ringkasan dokumen*');

  // Meta — italic filename so it doesn't compete with body
  const fileLine = filename ? `📁 _${filename}_` : '';
  if (fileLine) sections.push(fileLine);

  const title = asText(analysis?.title);
  if (title) {
    sections.push(`*${title}*`);
  }

  const purpose = asText(analysis?.purpose);
  if (purpose) {
    sections.push(purpose);
  }

  const points = Array.isArray(analysis?.key_points)
    ? analysis.key_points.map(asText).filter(Boolean)
    : [];
  if (points.length) {
    sections.push(['✨ *Poin utama*', ...bullet(points, 6)].join('\n'));
  }

  const decisions = Array.isArray(analysis?.decisions)
    ? analysis.decisions.map(asText).filter(Boolean)
    : [];
  if (decisions.length) {
    sections.push(['✅ *Keputusan*', ...bullet(decisions, 5)].join('\n'));
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
  if (tasks.length) {
    sections.push(['☑️ *Tugas*', ...bullet(tasks, 5)].join('\n'));
  }

  const deadlines = Array.isArray(analysis?.deadlines)
    ? analysis.deadlines.map((d: unknown) => {
        if (typeof d === 'string') return d;
        if (d && typeof d === 'object') {
          const o = d as { date?: string; description?: string };
          const date = asText(o.date);
          const desc = asText(o.description);
          if (date && desc) return `${date} — ${desc}`;
          return date || desc;
        }
        return asText(d);
      }).filter(Boolean)
    : [];
  if (deadlines.length) {
    sections.push(['🗓️ *Tenggat*', ...bullet(deadlines, 4)].join('\n'));
  }

  if (analysis?.redacted) {
    sections.push('_🔒 Data sensitif disamarkan otomatis._');
  }

  // Double newline between sections = breathing room on mobile
  return sections.filter(Boolean).join('\n\n').trim();
}
