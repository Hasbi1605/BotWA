import type { WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';

const logger = pino({ name: 'outbound' });

const MAX_MESSAGE_LENGTH = 3500;
const MAX_SPLIT_PARTS = 3;

export async function sendMessage(
  sock: WASocket,
  jid: string,
  text: string
): Promise<void> {
  const parts = splitSummary(text);

  for (const part of parts) {
    try {
      await sock.sendMessage(jid, { text: part });
      // Small delay between messages to avoid rate limiting
      if (parts.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (err) {
      logger.error({ err, jid }, 'Failed to send message');
      throw err;
    }
  }
}

export function splitSummary(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const sections = splitAtSectionBoundaries(text);
  const parts: string[] = [];
  let current = '';

  for (const section of sections) {
    if ((current + section).length > MAX_MESSAGE_LENGTH && current.length > 0) {
      parts.push(current.trim());
      current = section;
    } else {
      current += section;
    }
  }
  if (current.trim()) parts.push(current.trim());

  // If still too many parts, condense
  if (parts.length > MAX_SPLIT_PARTS) {
    return condenseKeepingCritical(parts, MAX_SPLIT_PARTS);
  }

  // Label each part
  return parts.map((part, i) => `(${i + 1}/${parts.length})\n${part}`);
}

function splitAtSectionBoundaries(text: string): string[] {
  const sections: string[] = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    // Section boundaries: emoji headers, double newlines, or numbered sections
    if (line.match(/^[🔴🟠🟡🟢🔵📌📋📅📄❓⏰📊📝🔗\*]/u) ||
        line.match(/^\*(Inti diskusi|Sorotan|Pesan penting|Keputusan|Tugas|Usulan jadwal|Dokumen|Pertanyaan|Link)/i) ||
        line.match(/^\d+\.\s/) ||
        line === '') {
      if (current.trim()) {
        sections.push(current + '\n');
      }
      current = line + '\n';
    } else {
      current += line + '\n';
    }
  }

  if (current.trim()) {
    sections.push(current);
  }

  return sections;
}

function condenseKeepingCritical(parts: string[], maxParts: number): string[] {
  // Always keep: decisions, tasks, schedules
  // Can condense: narrative, highlights
  const criticalSections: string[] = [];
  const condensableSections: string[] = [];

  for (const part of parts) {
    if (part.match(/(Keputusan|Tugas|Jadwal|Pengingat|Usulan jadwal)/i)) {
      criticalSections.push(part);
    } else {
      condensableSections.push(part);
    }
  }

  const result: string[] = [...criticalSections];

  // Merge condensable sections
  if (condensableSections.length > 0) {
    const merged = condensableSections.join('\n');
    if (merged.length <= MAX_MESSAGE_LENGTH) {
      result.unshift(merged);
    } else {
      result.unshift(merged.substring(0, MAX_MESSAGE_LENGTH - 50) + '\n\n[...dipotong]');
    }
  }

  return result.slice(0, maxParts).map((part, i) => `(${i + 1}/${Math.min(result.length, maxParts)})\n${part}`);
}
