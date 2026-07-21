import type { Config } from '../config/index.js';
import * as messagesRepo from '../db/repositories/messages.repo.js';
import * as documentsRepo from '../db/repositories/documents.repo.js';
import * as summariesRepo from '../db/repositories/summaries.repo.js';
import * as auditRepo from '../db/repositories/audit.repo.js';
import * as schedulesRepo from '../db/repositories/schedules.repo.js';
import pino from 'pino';

const logger = pino({ name: 'retention' });

export async function runRetentionCleanup(config: Config): Promise<void> {
  logger.info('Starting retention cleanup');

  const now = new Date();

  // Messages: 14 days
  const messagesBefore = new Date(now.getTime() - config.retentionMessagesDays * 24 * 60 * 60 * 1000);
  const deletedMessages = messagesRepo.deleteOlderThan(messagesBefore.toISOString());
  logger.info({ deletedMessages, before: messagesBefore.toISOString() }, 'Cleaned up old messages');

  // Documents: raw files older than retention (24h handled separately in PDF cleanup)
  const docsBefore = new Date(now.getTime() - config.retentionMessagesDays * 24 * 60 * 60 * 1000);
  const deletedDocs = documentsRepo.deleteOlderThan(docsBefore.toISOString());
  logger.info({ deletedDocs }, 'Cleaned up old documents');

  // Audit logs: 90 days
  const auditBefore = new Date(now.getTime() - config.retentionAuditDays * 24 * 60 * 60 * 1000);
  const deletedAudit = auditRepo.deleteOlderThan(auditBefore.toISOString());
  logger.info({ deletedAudit }, 'Cleaned up old audit logs');

  // Expired schedule candidates
  const expiredCandidates = schedulesRepo.expireOldCandidates(now.toISOString());
  logger.info({ expiredCandidates }, 'Expired old schedule candidates');

  logger.info('Retention cleanup completed');
}
