import type { GroupMetadata, GroupParticipant, WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';

const logger = pino({ name: 'admin' });

export type MemberRole = 'member' | 'admin' | 'superadmin';

/** Normalize WA ids so LID / device suffixes still match. */
export function jidCore(jid: string | undefined | null): string {
  if (!jid) return '';
  // 628xxx:2@s.whatsapp.net → 628xxx ; 123@lid → 123
  return jid.split('@')[0].split(':')[0].toLowerCase();
}

export function jidsMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return jidCore(a) === jidCore(b);
}

export function findParticipant(
  metadata: GroupMetadata,
  senderJid: string
): GroupParticipant | undefined {
  return metadata.participants.find((p) => {
    const anyP = p as GroupParticipant & { phoneNumber?: string; jid?: string };
    return (
      jidsMatch(p.id, senderJid) ||
      jidsMatch(anyP.phoneNumber, senderJid) ||
      jidsMatch(anyP.jid, senderJid)
    );
  });
}

export function roleFromParticipant(p?: GroupParticipant): MemberRole {
  if (!p) return 'member';
  if (p.admin === 'superadmin') return 'superadmin';
  if (p.admin === 'admin') return 'admin';
  return 'member';
}

export function isAdmin(role: string): boolean {
  return role === 'admin' || role === 'superadmin';
}

export async function checkAdminStatus(
  sock: WASocket,
  groupJid: string,
  senderJid: string
): Promise<MemberRole> {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    return roleFromParticipant(findParticipant(metadata, senderJid));
  } catch (err) {
    logger.error({ err, groupJid, senderJid }, 'Failed to check admin status');
    return 'member';
  }
}

/** Returns true if the bot account is admin/superadmin of the group. */
export async function isBotGroupAdmin(sock: WASocket, groupJid: string): Promise<boolean> {
  try {
    const botId = sock.user?.id;
    if (!botId) return false;
    const metadata = await sock.groupMetadata(groupJid);
    const role = roleFromParticipant(findParticipant(metadata, botId));
    return isAdmin(role);
  } catch (err) {
    logger.warn({ err, groupJid }, 'Failed to check bot admin status');
    return false;
  }
}
