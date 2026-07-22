import type { WASocket } from '@whiskeysockets/baileys';
import type { Group } from '../db/repositories/groups.repo.js';
import { setActivated, updateStatus } from '../db/repositories/groups.repo.js';
import { sendMessage } from '../whatsapp/outbound.js';

/** Short onboarding when bot joins or is activated — casual Indonesian. */
export const ONBOARDING = `Halo, saya *RembugBot* 👋

Saya bantu *otomatis*:
• Ringkas chat grup 2× sehari (08.00 & 20.00 WIB)
• Baca PDF/Word yang dikirim di grup
• Ingatkan jadwal penting

*Anggota:* chat biasa saja — tidak perlu perintah.
*Admin grup:* ketik *aktifkan bot* untuk mulai.`;

export const PRIVACY_NOTICE = `🔒 *Privasi singkat*

Bot akan membaca pesan di grup ini untuk ringkasan, dokumen, dan jadwal.

• Pesan disimpan maksimal *14 hari*
• Nama tampilan dipakai sebagai samaran (bukan nomor HP)
• File dihapus dalam *24 jam*
• Data *tidak* dijual ke pihak lain

Admin: balas *YA* atau *setuju* untuk mengaktifkan.
Balas *tidak* untuk membatalkan.`;

export async function handleActivationStart(
  sock: WASocket,
  groupJid: string
): Promise<'privacy'> {
  await sendMessage(sock, groupJid, PRIVACY_NOTICE);
  return 'privacy';
}

export async function handleActivationConfirm(
  sock: WASocket,
  groupJid: string,
  group: Group
): Promise<void> {
  setActivated(group.id);
  try {
    const nameMap = await import('../db/repositories/name-map.repo.js');
    nameMap.seedDefaultDirectory(group.id);
  } catch {
    /* non-fatal */
  }
  await sendMessage(
    sock,
    groupJid,
    `✅ *RembugBot aktif* di grup ini.

Anggota: chat biasa — bot kerja sendiri.
Admin: *bantuan* · *mode normal* / *mode roast* · *jadwal* · *jeda*

Ringkasan otomatis: *08.00* & *20.00* WIB (mode: *normal*).`
  );
}

export async function handlePause(
  sock: WASocket,
  groupJid: string,
  group: Group
): Promise<void> {
  updateStatus(group.id, 'paused');
  await sendMessage(
    sock,
    groupJid,
    '⏸️ Bot dijeda. Ringkasan, dokumen, dan pengingat berhenti sementara.\nAdmin: ketik *lanjut* untuk menghidupkan lagi.'
  );
}

export async function handleResume(
  sock: WASocket,
  groupJid: string,
  group: Group
): Promise<void> {
  updateStatus(group.id, 'active');
  await sendMessage(sock, groupJid, '▶️ Bot aktif lagi. Automasi jalan.');
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
    pendingDeletions.delete(key);
    const { getDb } = await import('../db/index.js');
    const db = getDb('');
    db.prepare('DELETE FROM messages WHERE group_id = ?').run(group.id);
    db.prepare('DELETE FROM documents WHERE group_id = ?').run(group.id);
    db.prepare('DELETE FROM summary_windows WHERE group_id = ?').run(group.id);
    db.prepare('DELETE FROM schedule_candidates WHERE group_id = ?').run(group.id);
    db.prepare(
      'DELETE FROM reminders WHERE schedule_id IN (SELECT id FROM schedules WHERE group_id = ?)'
    ).run(group.id);
    db.prepare('DELETE FROM schedules WHERE group_id = ?').run(group.id);
    try {
      db.prepare('DELETE FROM group_memories WHERE group_id = ?').run(group.id);
    } catch {
      /* table may not exist on very old DB mid-migrate */
    }
    try {
      db.prepare('DELETE FROM group_name_map WHERE group_id = ?').run(group.id);
      db.prepare('DELETE FROM group_name_aliases WHERE group_id = ?').run(group.id);
      db.prepare('DELETE FROM group_lid_map WHERE group_id = ?').run(group.id);
    } catch {
      /* optional tables */
    }
    updateStatus(group.id, 'inactive');
    await sendMessage(sock, groupJid, '🗑️ Data grup sudah dihapus. Bot dimatikan untuk grup ini.');
    return;
  }

  pendingDeletions.set(key, { groupId: group.id, expiresAt: Date.now() + 10 * 60 * 1000 });
  await sendMessage(
    sock,
    groupJid,
    '⚠️ Hapus *semua* data grup (pesan, ringkasan, jadwal)?\n\nBalas *YA* dalam 10 menit untuk konfirmasi, atau *tidak* untuk batal.'
  );
}

export function clearDeletePending(groupJid: string, actorHmac: string): void {
  pendingDeletions.delete(`${groupJid}:${actorHmac}`);
}

export function hasDeletePending(groupJid: string, actorHmac: string): boolean {
  const p = pendingDeletions.get(`${groupJid}:${actorHmac}`);
  if (!p) return false;
  if (Date.now() > p.expiresAt) {
    pendingDeletions.delete(`${groupJid}:${actorHmac}`);
    return false;
  }
  return true;
}
