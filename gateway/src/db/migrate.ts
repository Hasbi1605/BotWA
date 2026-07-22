import { getDb } from './index.js';

export function runMigrations(dbPath: string): void {
  const db = getDb(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM migrations').all().map((r: any) => r.name)
  );

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      db.transaction(() => {
        db.exec(migration.sql);
        db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
      })();
      console.log(`Applied migration: ${migration.name}`);
    }
  }
}

const migrations = [
  {
    name: '001_groups',
    sql: `
      CREATE TABLE groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        jid TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
        status TEXT NOT NULL DEFAULT 'inactive'
          CHECK (status IN ('inactive', 'active', 'paused', 'deactivated')),
        summary_cron_morning TEXT NOT NULL DEFAULT '0 8 * * *',
        summary_cron_evening TEXT NOT NULL DEFAULT '0 20 * * *',
        activated_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_groups_jid ON groups(jid);
      CREATE INDEX idx_groups_status ON groups(status);
    `,
  },
  {
    name: '002_participants',
    sql: `
      CREATE TABLE participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        wa_jid_hmac TEXT NOT NULL,
        key_version INTEGER NOT NULL DEFAULT 1,
        display_name TEXT NOT NULL DEFAULT '',
        current_role TEXT NOT NULL DEFAULT 'member'
          CHECK (current_role IN ('member', 'admin', 'superadmin')),
        first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(group_id, wa_jid_hmac)
      );
      CREATE INDEX idx_participants_group ON participants(group_id);
      CREATE INDEX idx_participants_hmac ON participants(wa_jid_hmac);
    `,
  },
  {
    name: '003_messages',
    sql: `
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        participant_id INTEGER NOT NULL REFERENCES participants(id),
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text'
          CHECK (type IN ('text', 'image', 'video', 'audio', 'document', 'sticker', 'other')),
        content TEXT NOT NULL DEFAULT '',
        reply_to TEXT,
        mentions TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(group_id, message_id)
      );
      CREATE INDEX idx_messages_group_ts ON messages(group_id, timestamp);
      CREATE INDEX idx_messages_group_id ON messages(group_id);
      CREATE INDEX idx_messages_participant ON messages(participant_id);
    `,
  },
  {
    name: '004_documents',
    sql: `
      CREATE TABLE documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL REFERENCES messages(id),
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        hash TEXT NOT NULL,
        filename TEXT NOT NULL DEFAULT '',
        mime_type TEXT NOT NULL DEFAULT '',
        file_size INTEGER NOT NULL DEFAULT 0,
        page_count INTEGER,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'extracting', 'extracted', 'analyzing', 'analyzed', 'held', 'unprocessable', 'error')),
        sensitivity TEXT NOT NULL DEFAULT 'clear'
          CHECK (sensitivity IN ('clear', 'held', 'cleared_by_admin')),
        extracted_text_path TEXT,
        analysis_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_documents_group ON documents(group_id);
      CREATE INDEX idx_documents_hash ON documents(hash);
      CREATE INDEX idx_documents_status ON documents(status);
    `,
  },
  {
    name: '005_summary_windows',
    sql: `
      CREATE TABLE summary_windows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'running', 'completed', 'retrying', 'failed', 'failed_final')),
        rendered_text TEXT,
        model_route TEXT,
        error_class TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        run_after TEXT,
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        UNIQUE(group_id, start_at, end_at)
      );
      CREATE UNIQUE INDEX idx_summary_idempotency ON summary_windows(idempotency_key);
      CREATE INDEX idx_summary_status ON summary_windows(status);
      CREATE INDEX idx_summary_group ON summary_windows(group_id);
    `,
  },
  {
    name: '006_summary_evidence',
    sql: `
      CREATE TABLE summary_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        summary_id INTEGER NOT NULL REFERENCES summary_windows(id) ON DELETE CASCADE,
        section TEXT NOT NULL,
        item_id TEXT,
        message_id INTEGER NOT NULL REFERENCES messages(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_evidence_summary ON summary_evidence(summary_id);
    `,
  },
  {
    name: '007_schedules',
    sql: `
      CREATE TABLE schedule_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        date TEXT,
        time TEXT,
        location TEXT,
        ambiguities TEXT,
        source_message_ids TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'candidate'
          CHECK (status IN ('candidate', 'confirmed', 'rejected', 'expired', 'cancelled')),
        confirmed_schedule_id INTEGER,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        location TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'completed', 'cancelled')),
        source_candidate_id INTEGER REFERENCES schedule_candidates(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_schedules_group ON schedules(group_id);
      CREATE INDEX idx_schedules_status ON schedules(status);
      CREATE INDEX idx_candidates_group ON schedule_candidates(group_id);
      CREATE INDEX idx_candidates_status ON schedule_candidates(status);
    `,
  },
  {
    name: '008_reminders',
    sql: `
      CREATE TABLE reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('day_before', 'two_hours')),
        due_at TEXT NOT NULL,
        sent_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_reminders_schedule ON reminders(schedule_id);
      CREATE INDEX idx_reminders_status ON reminders(status);
      CREATE INDEX idx_reminders_due ON reminders(due_at);
    `,
  },
  {
    name: '009_admin_actions',
    sql: `
      CREATE TABLE admin_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        actor_hmac TEXT NOT NULL,
        command TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_audit_group ON admin_actions(group_id);
      CREATE INDEX idx_audit_created ON admin_actions(created_at);
    `,
  },
  {
    name: '010_provider_health',
    sql: `
      CREATE TABLE provider_health (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL DEFAULT 'healthy'
          CHECK (state IN ('healthy', 'cooldown', 'disabled')),
        cooldown_until TEXT,
        last_error_class TEXT,
        last_error_at TEXT,
        consecutive_errors INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_provider_state ON provider_health(state);
    `,
  },
  {
    name: '011_jobs',
    sql: `
      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL
          CHECK (type IN ('summary', 'pdf_extract', 'pdf_analyze', 'schedule_detect', 'reminder', 'retention')),
        payload_ref TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'running', 'completed', 'failed', 'retrying', 'failed_final')),
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        run_after TEXT,
        idempotency_key TEXT NOT NULL,
        error_class TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );
      CREATE UNIQUE INDEX idx_jobs_idempotency ON jobs(idempotency_key);
      CREATE INDEX idx_jobs_status ON jobs(status);
      CREATE INDEX idx_jobs_type ON jobs(type);
      CREATE INDEX idx_jobs_run_after ON jobs(run_after);
    `,
  },
  {
    name: '012_config_kv',
    sql: `
      CREATE TABLE config_kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    name: '013_groups_summary_mode',
    sql: `
      ALTER TABLE groups ADD COLUMN summary_mode TEXT NOT NULL DEFAULT 'normal'
        CHECK (summary_mode IN ('normal', 'roast'));
    `,
  },
  {
    name: '014_groups_reply_mode',
    sql: `
      ALTER TABLE groups ADD COLUMN reply_mode TEXT NOT NULL DEFAULT 'silent'
        CHECK (reply_mode IN ('silent', 'lc'));
    `,
  },
  {
    name: '015_jobs_chat_reply_type',
    sql: `
      CREATE TABLE jobs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL
          CHECK (type IN ('summary', 'pdf_extract', 'pdf_analyze', 'schedule_detect', 'reminder', 'retention', 'chat_reply')),
        payload_ref TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'running', 'completed', 'failed', 'retrying', 'failed_final')),
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        run_after TEXT,
        idempotency_key TEXT NOT NULL,
        error_class TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );
      INSERT INTO jobs_new (
        id, type, payload_ref, status, attempts, max_attempts, run_after,
        idempotency_key, error_class, error_message, created_at, updated_at, completed_at
      )
      SELECT
        id, type, payload_ref, status, attempts, max_attempts, run_after,
        idempotency_key, error_class, error_message, created_at, updated_at, completed_at
      FROM jobs;
      DROP TABLE jobs;
      ALTER TABLE jobs_new RENAME TO jobs;
      CREATE UNIQUE INDEX idx_jobs_idempotency ON jobs(idempotency_key);
      CREATE INDEX idx_jobs_status ON jobs(status);
      CREATE INDEX idx_jobs_type ON jobs(type);
      CREATE INDEX idx_jobs_run_after ON jobs(run_after);
    `,
  },
  {
    name: '016_group_memories',
    sql: `
      CREATE TABLE group_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        kind TEXT NOT NULL
          CHECK (kind IN ('fact', 'person', 'norm', 'alias', 'admin')),
        mem_key TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.7,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(group_id, kind, mem_key)
      );
      CREATE INDEX idx_group_memories_group ON group_memories(group_id);
      CREATE INDEX idx_group_memories_kind ON group_memories(group_id, kind);
    `,
  },
  {
    name: '017_jobs_memory_consolidate',
    sql: `
      CREATE TABLE jobs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL
          CHECK (type IN (
            'summary', 'pdf_extract', 'pdf_analyze', 'schedule_detect',
            'reminder', 'retention', 'chat_reply', 'memory_consolidate'
          )),
        payload_ref TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'running', 'completed', 'failed', 'retrying', 'failed_final')),
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        run_after TEXT,
        idempotency_key TEXT NOT NULL,
        error_class TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );
      INSERT INTO jobs_new (
        id, type, payload_ref, status, attempts, max_attempts, run_after,
        idempotency_key, error_class, error_message, created_at, updated_at, completed_at
      )
      SELECT
        id, type, payload_ref, status, attempts, max_attempts, run_after,
        idempotency_key, error_class, error_message, created_at, updated_at, completed_at
      FROM jobs;
      DROP TABLE jobs;
      ALTER TABLE jobs_new RENAME TO jobs;
      CREATE UNIQUE INDEX idx_jobs_idempotency ON jobs(idempotency_key);
      CREATE INDEX idx_jobs_status ON jobs(status);
      CREATE INDEX idx_jobs_type ON jobs(type);
      CREATE INDEX idx_jobs_run_after ON jobs(run_after);
    `,
  },
  {
    name: '018_group_name_map',
    sql: `
      CREATE TABLE group_name_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        phone_digits TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(group_id, phone_digits)
      );
      CREATE INDEX idx_group_name_map_group ON group_name_map(group_id);
      CREATE INDEX idx_group_name_map_phone ON group_name_map(group_id, phone_digits);
    `,
  },
  {
    name: '019_name_aliases_and_lid_map',
    sql: `
      CREATE TABLE group_name_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        alias_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(group_id, alias_key)
      );
      CREATE INDEX idx_group_name_aliases_group ON group_name_aliases(group_id);

      CREATE TABLE group_lid_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        lid_core TEXT NOT NULL,
        phone_digits TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(group_id, lid_core)
      );
      CREATE INDEX idx_group_lid_map_group ON group_lid_map(group_id);
    `,
  },
];
