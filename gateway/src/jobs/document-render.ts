/**
 * WhatsApp-friendly document summary — complete but NOT a second copy of the PDF.
 *
 * Strategy when the model returns structured `sections` (A/B/C…):
 *   • sections = body of truth (primary)
 *   • skip fields that only restate the same content (duplicate sorotan, tasks
 *     exploded per person, shopping list again, questions again, etc.)
 *   • keep a short purpose + at most a few unique follow-ups (e.g. open items)
 *
 * When sections are empty: fall back to flatter key_points / decisions / tasks.
 */

function asText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && v !== null && 'text' in v) {
    return String((v as { text?: unknown }).text ?? '').trim();
  }
  return String(v).trim();
}

function bullet(items: string[], max = 20): string[] {
  return items
    .map(asText)
    .filter(Boolean)
    .slice(0, max)
    .map((t) => `• ${t}`);
}

function hasRichSections(analysis: any): boolean {
  const sections = Array.isArray(analysis?.sections) ? analysis.sections : [];
  if (sections.length < 2) return false;
  let points = 0;
  for (const s of sections) {
    if (Array.isArray(s?.points)) points += s.points.length;
  }
  return points >= 4;
}

/** Collapse long shopping lists into fewer lines for mobile. */
function compactList(items: string[], perLine = 4, maxItems = 24): string[] {
  const clean = items.map(asText).filter(Boolean).slice(0, maxItems);
  const lines: string[] = [];
  for (let i = 0; i < clean.length; i += perLine) {
    lines.push(`• ${clean.slice(i, i + perLine).join(' · ')}`);
  }
  return lines;
}

/**
 * Render AI document analysis into a scannable WhatsApp message.
 */
export function renderDocumentSummary(filename: string, analysis: any): string {
  const sectionsOut: string[] = [];
  const rich = hasRichSections(analysis);

  sectionsOut.push('📄 *Ringkasan dokumen*');
  if (filename) sectionsOut.push(`📁 _${filename}_`);

  const title = asText(analysis?.title);
  if (title) sectionsOut.push(`*${title}*`);

  // Purpose: keep short (trim if model wrote an essay)
  let purpose = asText(analysis?.purpose);
  if (purpose) {
    const sentences = purpose.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > 3) {
      purpose = sentences.slice(0, 3).join(' ');
    }
    if (purpose.length > 420) {
      purpose = purpose.slice(0, 400).replace(/\s+\S*$/, '') + '…';
    }
    sectionsOut.push(purpose);
  }

  // Primary: document structure
  const docSections = Array.isArray(analysis?.sections) ? analysis.sections : [];
  for (const sec of docSections.slice(0, 10)) {
    const heading = asText(sec?.heading);
    const pts = Array.isArray(sec?.points)
      ? sec.points.map(asText).filter(Boolean)
      : [];
    if (!heading && pts.length === 0) continue;
    sectionsOut.push(
      [heading ? `📌 *${heading}*` : '📌 *Bagian*', ...bullet(pts, 18)].join('\n')
    );
  }

  if (!rich) {
    // Flat fallback when model did not return sections
    const points = Array.isArray(analysis?.key_points)
      ? analysis.key_points.map(asText).filter(Boolean)
      : [];
    if (points.length) {
      sectionsOut.push(['✨ *Poin utama*', ...bullet(points, 10)].join('\n'));
    }

    const decisions = Array.isArray(analysis?.decisions)
      ? analysis.decisions.map(asText).filter(Boolean)
      : [];
    if (decisions.length) {
      sectionsOut.push(['✅ *Keputusan*', ...bullet(decisions, 10)].join('\n'));
    }

    const schedule = Array.isArray(analysis?.schedule)
      ? analysis.schedule
          .map((s: unknown) => {
            if (typeof s === 'string') return s;
            if (s && typeof s === 'object') {
              const o = s as { when?: string; what?: string };
              const when = asText(o.when);
              const what = asText(o.what);
              if (when && what) return `*${when}* — ${what}`;
              return when || what;
            }
            return asText(s);
          })
          .filter(Boolean)
      : [];
    if (schedule.length) {
      sectionsOut.push(['🗓️ *Jadwal*', ...bullet(schedule, 10)].join('\n'));
    }

    const assignments = Array.isArray(analysis?.assignments) ? analysis.assignments : [];
    if (assignments.length) {
      const lines = ['👥 *Pembagian*'];
      for (const a of assignments.slice(0, 20)) {
        const person = asText(a?.person);
        const items = Array.isArray(a?.items)
          ? a.items.map(asText).filter(Boolean)
          : [];
        if (!person && !items.length) continue;
        lines.push(
          items.length
            ? `• *${person || '—'}:* ${items.join(', ')}`
            : `• *${person}*`
        );
      }
      if (lines.length > 1) sectionsOut.push(lines.join('\n'));
    }

    const tasks = Array.isArray(analysis?.tasks)
      ? analysis.tasks
          .map((t: unknown) => {
            if (typeof t === 'string') return t;
            if (t && typeof t === 'object') {
              const o = t as { text?: string; assignee?: string; due?: string };
              let line = asText(o.text);
              if (o.assignee) line += ` — _${asText(o.assignee)}_`;
              if (o.due) line += ` (${asText(o.due)})`;
              return line;
            }
            return asText(t);
          })
          .filter(Boolean)
      : [];
    if (tasks.length) {
      sectionsOut.push(['☑️ *Tugas*', ...bullet(tasks, 15)].join('\n'));
    }

    const questions = Array.isArray(analysis?.open_questions)
      ? analysis.open_questions.map(asText).filter(Boolean)
      : [];
    if (questions.length) {
      sectionsOut.push(['❓ *Pertanyaan*', ...bullet(questions, 12)].join('\n'));
    }

    const shopping = Array.isArray(analysis?.shopping_list)
      ? analysis.shopping_list.map(asText).filter(Boolean)
      : [];
    if (shopping.length) {
      sectionsOut.push(['🛒 *Belanja*', ...compactList(shopping)].join('\n'));
    }

    const deadlines = Array.isArray(analysis?.deadlines)
      ? analysis.deadlines
          .map((d: unknown) => {
            if (typeof d === 'string') return d;
            if (d && typeof d === 'object') {
              const o = d as { date?: string; description?: string };
              const date = asText(o.date);
              const desc = asText(o.description);
              if (date && desc) return `*${date}* — ${desc}`;
              return date || desc;
            }
            return asText(d);
          })
          .filter(Boolean)
      : [];
    if (deadlines.length) {
      sectionsOut.push(['⏰ *Tenggat*', ...bullet(deadlines, 8)].join('\n'));
    }
  } else {
    // Rich sections already told the story — only add a SHORT action strip if useful.
    // Prefer open loops that are easy to miss, not a second full dump.
    const looseEnds: string[] = [];

    // Single line for unresolved "tanya dulu" style items from decisions/tasks
    const decisions = Array.isArray(analysis?.decisions)
      ? analysis.decisions.map(asText).filter(Boolean)
      : [];
    for (const d of decisions.slice(0, 3)) {
      if (/tanya|konfirmasi|belum|menunggu|nyusul|menyusul/i.test(d)) {
        looseEnds.push(d);
      }
    }
    const tasks = Array.isArray(analysis?.tasks)
      ? analysis.tasks
          .map((t: unknown) => {
            if (typeof t === 'string') return t;
            if (t && typeof t === 'object') {
              return asText((t as { text?: string }).text);
            }
            return asText(t);
          })
          .filter(Boolean)
      : [];
    for (const t of tasks.slice(0, 5)) {
      if (/tanya|konfirmasi|belum|menunggu/i.test(t)) {
        looseEnds.push(t);
      }
    }

    if (looseEnds.length) {
      const uniq = [...new Set(looseEnds)].slice(0, 5);
      sectionsOut.push(['⚠️ *Masih terbuka*', ...bullet(uniq, 5)].join('\n'));
    }
  }

  if (analysis?.redacted) {
    sectionsOut.push('_🔒 Data sensitif disamarkan otomatis._');
  }

  return sectionsOut.filter(Boolean).join('\n\n').trim();
}
