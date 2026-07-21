import Fastify from 'fastify';
import pino from 'pino';
import { loadConfig } from './config/index.js';
import { getDb, closeDb } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { connectWhatsApp } from './whatsapp/connection.js';
import { startScheduler, stopScheduler } from './scheduler/index.js';
import { startJobRunner, stopJobRunner } from './jobs/runner.js';
import { healthRoutes } from './health/index.js';

const logger = pino({ name: 'gateway' });

async function main(): Promise<void> {
  logger.info('Starting RembugBot Gateway');

  // Load config
  const config = loadConfig();

  // Run database migrations
  logger.info('Running database migrations');
  runMigrations(config.dbPath);

  // Initialize database connection
  getDb(config.dbPath);

  // Start health check server
  const fastify = Fastify({ logger: false });
  await healthRoutes(fastify);
  await fastify.listen({ port: 3000, host: '0.0.0.0' });
  logger.info('Health server listening on :3000');

  // Start scheduler
  startScheduler(config);

  // Start job runner
  startJobRunner(config);

  // Connect to WhatsApp
  try {
    await connectWhatsApp(config);
    logger.info('WhatsApp connection initiated');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to WhatsApp');
    // Continue running - will retry on connection update
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    stopScheduler();
    stopJobRunner();
    closeDb();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Schedule daily retention cleanup at 03:00 WIB
  const cron = await import('node-cron');
  cron.default.schedule('0 3 * * *', async () => {
    try {
      const { runRetentionCleanup } = await import('./security/retention.js');
      await runRetentionCleanup(config);
    } catch (err) {
      logger.error({ err }, 'Retention cleanup failed');
    }
  }, { timezone: config.summaryTimezone });

  logger.info('Gateway started successfully');
}

main().catch((err) => {
  logger.fatal({ err }, 'Gateway failed to start');
  process.exit(1);
});
