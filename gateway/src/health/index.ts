import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { isConnected } from '../whatsapp/connection.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health/live', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  fastify.get('/health/ready', async () => {
    const checks: Record<string, string> = {};

    // SQLite
    try {
      const db = getDb('');
      db.prepare('SELECT 1').get();
      checks.sqlite = 'ok';
    } catch {
      checks.sqlite = 'error';
    }

    // WhatsApp
    checks.whatsapp = isConnected() ? 'connected' : 'disconnected';

    const allOk = Object.values(checks).every(v => v === 'ok' || v === 'connected');

    return {
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  });
}
