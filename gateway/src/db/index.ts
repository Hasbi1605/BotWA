import Database from 'better-sqlite3';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

let db: Database.Database | null = null;

export function getDb(dbPath: string): Database.Database {
  if (db) return db;

  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
