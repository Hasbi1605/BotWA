/**
 * Lightweight intent parser for casual Indonesian + legacy dotted commands.
 * Goal: members rarely need commands; admins use short phrases.
 */

export type IntentName =
  | 'activate'
  | 'activate_confirm'
  | 'help'
  | 'help_admin'
  | 'status'
  | 'summary'
  | 'mode'
  | 'mode_normal'
  | 'mode_roast'
  | 'pause'
  | 'resume'
  | 'delete_data'
  | 'schedule_list'
  | 'schedule_add'
  | 'schedule_confirm'
  | 'schedule_reject'
  | 'schedule_cancel'
  | 'pdf_list'
  | 'pdf_allow'
  | 'pdf_retry'
  | 'confirm_yes'
  | 'confirm_no'
  | 'unknown';

export interface ParsedIntent {
  name: IntentName;
  /** Remaining free text / args after the trigger phrase */
  args: string[];
  raw: string;
}

function norm(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!?,]+$/g, '')
    .replace(/\s+/g, ' ');
}

/** True if text looks like a bot command / admin phrase (not normal chat). */
export function looksLikeCommand(text: string): boolean {
  const t = norm(text);
  if (!t) return false;
  if (t.startsWith('.')) return true;

  // Short confirmations only when pending flow exists (caller decides)
  // Here we mark likely command phrases for inactive groups etc.
  const triggers = [
    /^aktifkan(\s+bot)?$/,
    /^aktifkan(\s+bot)?\s+(setuju|ya)$/,
    /^(ya|iya|y|setuju|ok|oke|boleh)$/,
    /^(tidak|ga|gak|nggak|batal|cancel|no)$/,
    /^(bantuan|help|menu|perintah)$/,
    /^(admin|menu admin|bantuan admin)$/,
    /^(status|cek status)$/,
    /^(ringkas|rangkum|ringkas sekarang|rangkum sekarang|summary)(\s+sekarang)?$/,
    /^(mode)(\s+(normal|roast))?$/,
    /^(jeda|pause|istirahat)$/,
    /^(lanjut(kan)?|resume|hidupkan)$/,
    /^(hapus\s*data|hapusdata)$/,
    /^jadwal(\s|$)/,
    /^pdf(\s|$)/,
  ];
  return triggers.some((re) => re.test(t));
}

export function parseIntent(text: string): ParsedIntent {
  const raw = text.trim();
  const t = norm(raw);

  // Legacy dotted commands
  if (raw.startsWith('.')) {
    const parts = raw.slice(1).trim().split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'aktifkan':
        if (args[0]?.toLowerCase() === 'setuju' || args[0]?.toLowerCase() === 'ya') {
          return { name: 'activate_confirm', args, raw };
        }
        return { name: 'activate', args, raw };
      case 'bantuan':
      case 'help':
        return { name: 'help', args, raw };
      case 'admin':
        return { name: 'help_admin', args, raw };
      case 'status':
        return { name: 'status', args, raw };
      case 'ringkas':
      case 'rangkum':
      case 'summary':
        return { name: 'summary', args, raw };
      case 'mode':
        return parseModeArgs(args, raw);
      case 'pause':
      case 'jeda':
        return { name: 'pause', args, raw };
      case 'resume':
      case 'lanjut':
      case 'lanjutkan':
        return { name: 'resume', args, raw };
      case 'hapusdata':
      case 'hapus':
        return { name: 'delete_data', args, raw };
      case 'jadwal':
        return parseScheduleArgs(args, raw);
      case 'pdf':
        return parsePdfArgs(args, raw);
      default:
        return { name: 'unknown', args: parts, raw };
    }
  }

  // Natural Indonesian phrases
  if (/^aktifkan(\s+bot)?\s+(setuju|ya)$/.test(t)) {
    return { name: 'activate_confirm', args: [], raw };
  }
  if (/^aktifkan(\s+bot)?$/.test(t)) {
    return { name: 'activate', args: [], raw };
  }
  if (/^(ya|iya|y|setuju|ok|oke|boleh)$/.test(t)) {
    return { name: 'confirm_yes', args: [], raw };
  }
  if (/^(tidak|ga|gak|nggak|batal|cancel|no)$/.test(t)) {
    return { name: 'confirm_no', args: [], raw };
  }
  if (/^(bantuan|help|menu|perintah)$/.test(t)) {
    return { name: 'help', args: [], raw };
  }
  if (/^(admin|menu admin|bantuan admin)$/.test(t)) {
    return { name: 'help_admin', args: [], raw };
  }
  if (/^(status|cek status)$/.test(t)) {
    return { name: 'status', args: [], raw };
  }
  if (/^(ringkas|rangkum|summary)(\s+sekarang)?$/.test(t)) {
    return { name: 'summary', args: [], raw };
  }
  if (/^mode\b/.test(t)) {
    const rest = t.replace(/^mode\s*/, '');
    const args = rest ? rest.split(/\s+/) : [];
    return parseModeArgs(args, raw);
  }
  if (/^(jeda|pause|istirahat)$/.test(t)) {
    return { name: 'pause', args: [], raw };
  }
  if (/^(lanjut(kan)?|resume|hidupkan)$/.test(t)) {
    return { name: 'resume', args: [], raw };
  }
  if (/^(hapus\s*data|hapusdata)$/.test(t)) {
    return { name: 'delete_data', args: [], raw };
  }
  if (/^jadwal\b/.test(t)) {
    const rest = t.replace(/^jadwal\s*/, '');
    const args = rest ? rest.split(/\s+/) : [];
    return parseScheduleArgs(args, raw);
  }
  if (/^pdf\b/.test(t)) {
    const rest = t.replace(/^pdf\s*/, '');
    const args = rest ? rest.split(/\s+/) : [];
    return parsePdfArgs(args, raw);
  }

  // Number-only replies for menu picks (1/2/3)
  if (/^\d{1,2}$/.test(t)) {
    return { name: 'confirm_yes', args: [t], raw };
  }

  return { name: 'unknown', args: [], raw };
}

function parseModeArgs(args: string[], raw: string): ParsedIntent {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'normal') return { name: 'mode_normal', args, raw };
  if (sub === 'roast' || sub === 'roasting' || sub === 'santai') {
    return { name: 'mode_roast', args, raw };
  }
  return { name: 'mode', args, raw };
}

function parseScheduleArgs(args: string[], raw: string): ParsedIntent {
  if (args.length === 0) return { name: 'schedule_list', args, raw };
  const sub = args[0].toLowerCase();
  if (sub === 'tambah' || sub === 'add') return { name: 'schedule_add', args: args.slice(1), raw };
  if (sub === 'konfirmasi' || sub === 'ya' || sub === 'ok') {
    return { name: 'schedule_confirm', args: args.slice(1), raw };
  }
  if (sub === 'tolak' || sub === 'tidak') return { name: 'schedule_reject', args: args.slice(1), raw };
  if (sub === 'batal' || sub === 'cancel') return { name: 'schedule_cancel', args: args.slice(1), raw };
  return { name: 'schedule_list', args, raw };
}

function parsePdfArgs(args: string[], raw: string): ParsedIntent {
  if (args.length === 0) return { name: 'pdf_list', args, raw };
  const sub = args[0].toLowerCase();
  if (sub === 'izinkan' || sub === 'allow' || sub === 'ya') {
    return { name: 'pdf_allow', args: args.slice(1), raw };
  }
  if (sub === 'proses' || sub === 'ulang' || sub === 'retry') {
    return { name: 'pdf_retry', args: args.slice(1), raw };
  }
  return { name: 'pdf_list', args, raw };
}
