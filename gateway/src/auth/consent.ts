import type { WASocket } from '@whiskeysockets/baileys';
import type { Group } from '../db/repositories/groups.repo.js';
import { setActivated, updateStatus } from '../db/repositories/groups.repo.js';
import { sendMessage } from '../whatsapp/outbound.js';

const PRIVACY_NOTICE = `🔒 *Pemberitahuan Privasi RembugBot*

Bot ini akan memproses pesan dalam grup ini untuk:
• Membuat ringkasan otomatis 2x sehari (08.00 & 20.00 WIB)
• Mendeteksi jadwal dan keputusan penting
• Menganalisis dokumen PDF yang dibagikan

Data yang diproses:
• Isi pesan grup (disimpan maksimal 14 hari)
• Display name pengirim (sebagai pseudonym)
• Dokumen PDF (dihapus dalam 24 jam)

Data TIDAK dikirim ke WhatsApp atau pihak ketiga lainnya.
Nomor telepon tidak dikirim ke layanan AI.

Untuk informasi lebih lanjut, hubungi admin grup.

Ketik *.aktifkan setuju* untuk mengonfirmasi.`;

export async function handleActivation(
  sock: WASocket,
  groupJid: string,
  group: Group,
  args: string[]
): Promise<void> {
  if (args.length === 0) {
    // Show privacy notice
    await sendMessage(sock, groupJid, PRIVACY_NOTICE);
    return;
  }

  if (args[0] === 'setuju') {
    setActivated(group.id);
    await sendMessage(sock, groupJid, '✅ RembugBot telah diaktifkan untuk grup ini.\n\nKetik *.bantuan* untuk melihat daftar perintah.');
    return;
  }

  await sendMessage(sock, groupJid, 'Perintah tidak dikenal. Ketik *.aktifkan* untuk melihat pemberitahuan privasi.');
}

export async function handlePause(
  sock: WASocket,
  groupJid: string,
  group: Group
): Promise<void> {
  updateStatus(group.id, 'paused');
  await sendMessage(sock, groupJid, '⏸️ RembugBot dijeda. Ketik *.resume* untuk melanjutkan.');
}

export async function handleResume(
  sock: WASocket,
  groupJid: string,
  group: Group
): Promise<void> {
  updateStatus(group.id, 'active');
  await sendMessage(sock, groupJid, '▶️ RembugBot dilanjutkan.');
}

const pendingDeletions = new Map<string, { groupId: number; expiresAt: number }>();

export async function handleDeleteData(
  sock: WASocket,
  groupJid: string,
  group: Group,
  actorHmac: string
): Promise<void> {
  const key = `${groupJid}:${actorHmac}`;
  const pending = pendingDeletions.get(key);

  if (pending && Date.now() < pending.expiresAt) {
    // Second confirmation - delete data
    pendingDeletions.delete(key);
    const { getDb } = await import('../db/index.js');
    const db = getDb('');
    db.prepare('DELETE FROM messages WHERE group_id = ?').run(group.id);
    db.prepare('DELETE FROM documents WHERE group_id = ?').run(group.id);
    db.prepare('DELETE FROM summary_windows WHERE group_id = ?').run(group.id);
    db.prepare('DELETE FROM schedule_candidates WHERE group_id = ?').run(group.id);
    db.prepare('DELETE FROM reminders WHERE schedule_id IN (SELECT id FROM schedules WHERE group_id = ?)').run(group.id);
    db.prepare('DELETE FROM schedules WHERE group_id = ?').run(group.id);
    updateStatus(group.id, 'inactive');
    await sendMessage(sock, groupJid, '🗑️ Seluruh data grup telah dihapus. Bot dinonaktifkan.');
    return;
  }

  // First request
  pendingDeletions.set(key, { groupId: group.id, expiresAt: Date.now() + 10 * 60 * 1000 });
  await sendMessage(sock, groupJid, '⚠️ Anda yakin ingin menghapus seluruh data grup?\n\nKetik *.hapusdata* lagi dalam 10 menit untuk mengonfirmasi.');
}
