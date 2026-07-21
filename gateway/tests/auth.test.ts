import { describe, expect, it, vi } from 'vitest';

import { checkAdminStatus, isAdmin } from '../src/auth/admin.js';
import { checkRateLimit, formatRetryAfter } from '../src/auth/rate-limiter.js';
import { hmacJid } from '../src/security/hmac.js';

describe('admin authorization', () => {
  it('accepts only admin and superadmin roles', () => {
    expect(isAdmin('member')).toBe(false);
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('superadmin')).toBe(true);
  });

  it('fails closed when group metadata cannot be read', async () => {
    const socket = {
      groupMetadata: vi.fn().mockRejectedValue(new Error('offline')),
    };

    await expect(checkAdminStatus(socket as never, 'group@g.us', 'user@s.whatsapp.net'))
      .resolves.toBe('member');
  });

  it('matches participants by phoneNumber/LID variants', async () => {
    const socket = {
      groupMetadata: vi.fn().mockResolvedValue({
        participants: [
          {
            id: '999@lid',
            phoneNumber: '628111@s.whatsapp.net',
            admin: 'admin',
          },
        ],
      }),
    };

    await expect(
      checkAdminStatus(socket as never, 'group@g.us', '628111:2@s.whatsapp.net')
    ).resolves.toBe('admin');
  });
});

describe('rate limiter', () => {
  it('blocks requests beyond the configured window and resets afterward', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T00:00:00Z'));
    const key = `test:${crypto.randomUUID()}`;

    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toMatchObject({ allowed: false, retryAfterMs: 60_000 });

    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    vi.useRealTimers();
  });

  it('formats partial minutes conservatively', () => {
    expect(formatRetryAfter(60_001)).toBe('2 menit');
  });
});

describe('participant pseudonymization', () => {
  it('is deterministic and secret-dependent', () => {
    const jid = '628123456789@s.whatsapp.net';
    expect(hmacJid(jid, 'a'.repeat(32), 1)).toBe(hmacJid(jid, 'a'.repeat(32), 1));
    expect(hmacJid(jid, 'a'.repeat(32), 1)).not.toBe(hmacJid(jid, 'b'.repeat(32), 2));
  });
});
