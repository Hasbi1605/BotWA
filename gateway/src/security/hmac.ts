import { createHmac } from 'crypto';

export function hmacJid(jid: string, secret: string, keyVersion: number): string {
  return createHmac('sha256', secret)
    .update(`${keyVersion}:${jid}`)
    .digest('hex');
}
