/**
 * Short-lived pending admin confirmations (activation, delete, schedule pick).
 * In-memory only — fine for single-process gateway.
 */

export type PendingKind = 'activate' | 'delete' | 'schedule_pick' | 'pdf_pick';

export interface PendingAction {
  kind: PendingKind;
  groupId: number;
  groupJid: string;
  actorHmac: string;
  expiresAt: number;
  /** For schedule_pick / pdf_pick: ordered option ids */
  options?: number[];
}

const store = new Map<string, PendingAction>();
const TTL_MS = 10 * 60 * 1000;

function key(groupJid: string, actorHmac: string): string {
  return `${groupJid}:${actorHmac}`;
}

export function setPending(
  groupJid: string,
  actorHmac: string,
  action: Omit<PendingAction, 'expiresAt' | 'groupJid' | 'actorHmac'>
): void {
  store.set(key(groupJid, actorHmac), {
    ...action,
    groupJid,
    actorHmac,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function getPending(groupJid: string, actorHmac: string): PendingAction | null {
  const k = key(groupJid, actorHmac);
  const p = store.get(k);
  if (!p) return null;
  if (Date.now() > p.expiresAt) {
    store.delete(k);
    return null;
  }
  return p;
}

export function clearPending(groupJid: string, actorHmac: string): void {
  store.delete(key(groupJid, actorHmac));
}
