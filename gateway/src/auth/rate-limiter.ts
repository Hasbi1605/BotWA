const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxPerWindow: number,
  windowMs: number
): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxPerWindow) {
    const retryAfterMs = entry.resetAt - now;
    return { allowed: false, retryAfterMs };
  }

  entry.count++;
  return { allowed: true };
}

export function formatRetryAfter(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  return `${minutes} menit`;
}
