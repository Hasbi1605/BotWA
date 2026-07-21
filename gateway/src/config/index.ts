import { z } from 'zod';

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production']).default('development'),
  dbPath: z.string().default('./data/rembugbot.db'),
  waAuthDir: z.string().default('./data/auth'),
  waGroupAllowlist: z.array(z.string()).default([]),
  waBotNumber: z.string().optional(),

  workerUrl: z.string().url().default('http://localhost:8000'),
  workerAuthToken: z.string().min(16),

  // Optional on gateway — AI tokens live on the worker; keep for shared .env convenience
  ghModelsTokenA: z.string().optional().default(''),
  ghModelsTokenB: z.string().optional().default(''),

  retentionMessagesDays: z.number().int().positive().default(14),
  retentionPdfRawHours: z.number().int().positive().default(24),
  retentionSummariesDays: z.number().int().positive().default(90),
  retentionAuditDays: z.number().int().positive().default(90),
  retentionLogsDays: z.number().int().positive().default(30),

  summaryCronMorning: z.string().default('0 8 * * *'),
  summaryCronEvening: z.string().default('0 20 * * *'),
  summaryTimezone: z.string().default('Asia/Jakarta'),

  alertWebhookUrl: z.string().url().optional().or(z.literal('')).transform(v => v || undefined),
  alertAdminJids: z.array(z.string()).default([]),

  hmacKeyVersion: z.number().int().default(1),
  hmacSecret: z.string().min(32),

  /** Directory for downloaded media (PDFs, etc.) */
  tempDir: z.string().default('./data/temp'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const raw = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    dbPath: process.env.DB_PATH ?? './data/rembugbot.db',
    waAuthDir: process.env.WA_AUTH_DIR ?? './data/auth',
    waGroupAllowlist: (process.env.WA_GROUP_ALLOWLIST ?? '').split(',').filter(Boolean),
    waBotNumber: process.env.WA_BOT_NUMBER,
    workerUrl: process.env.WORKER_URL ?? 'http://localhost:8000',
    workerAuthToken: process.env.WORKER_AUTH_TOKEN ?? '',
    ghModelsTokenA: process.env.GH_MODELS_TOKEN_A ?? '',
    ghModelsTokenB: process.env.GH_MODELS_TOKEN_B ?? '',
    retentionMessagesDays: parseInt(process.env.RETENTION_MESSAGES_DAYS ?? '14', 10),
    retentionPdfRawHours: parseInt(process.env.RETENTION_PDF_RAW_HOURS ?? '24', 10),
    retentionSummariesDays: parseInt(process.env.RETENTION_SUMMARIES_DAYS ?? '90', 10),
    retentionAuditDays: parseInt(process.env.RETENTION_AUDIT_DAYS ?? '90', 10),
    retentionLogsDays: parseInt(process.env.RETENTION_LOGS_DAYS ?? '30', 10),
    summaryCronMorning: process.env.SUMMARY_CRON_MORNING ?? '0 8 * * *',
    summaryCronEvening: process.env.SUMMARY_CRON_EVENING ?? '0 20 * * *',
    summaryTimezone: process.env.SUMMARY_TIMEZONE ?? 'Asia/Jakarta',
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL ?? '',
    alertAdminJids: (process.env.ALERT_ADMIN_JIDS ?? '').split(',').filter(Boolean),
    hmacKeyVersion: parseInt(process.env.HMAC_KEY_VERSION ?? '1', 10),
    hmacSecret: process.env.HMAC_SECRET ?? '',
    tempDir: process.env.TEMP_DIR ?? './data/temp',
  };

  return configSchema.parse(raw);
}
