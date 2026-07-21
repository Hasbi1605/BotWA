import type { WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';

const logger = pino({ name: 'admin' });

export async function checkAdminStatus(
  sock: WASocket,
  groupJid: string,
  senderJid: string
): Promise<'member' | 'admin' | 'superadmin'> {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const participant = metadata.participants.find(p => p.id === senderJid);

    if (!participant) return 'member';
    if (participant.admin === 'superadmin') return 'superadmin';
    if (participant.admin === 'admin') return 'admin';
    return 'member';
  } catch (err) {
    logger.error({ err, groupJid, senderJid }, 'Failed to check admin status');
    return 'member';
  }
}

export function isAdmin(role: string): boolean {
  return role === 'admin' || role === 'superadmin';
}
