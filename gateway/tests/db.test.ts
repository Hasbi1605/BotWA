import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDb, getDb } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import * as jobsRepo from '../src/db/repositories/jobs.repo.js';
import * as remindersRepo from '../src/db/repositories/reminders.repo.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'rembugbot-test-'));
  runMigrations(join(testDir, 'test.db'));
});

afterEach(() => {
  vi.useRealTimers();
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('database migrations', () => {
  it('applies every migration exactly once', () => {
    const db = getDb('');
    expect(db.prepare('SELECT COUNT(*) AS count FROM migrations').get()).toEqual({ count: 12 });

    runMigrations(join(testDir, 'test.db'));
    expect(db.prepare('SELECT COUNT(*) AS count FROM migrations').get()).toEqual({ count: 12 });
  });
});

describe('persistent jobs', () => {
  it('enforces idempotency keys', () => {
    const data = { type: 'retention', payload_ref: '{}', idempotency_key: 'retention:once' };
    expect(jobsRepo.create(data)).not.toBeNull();
    expect(jobsRepo.create(data)).toBeNull();
  });

  it('selects a retry whose ISO run_after is already due', () => {
    const job = jobsRepo.create({
      type: 'retention',
      payload_ref: '{}',
      idempotency_key: 'retention:retry',
      run_after: '2020-01-01T00:00:00.000Z',
    });
    expect(job).not.toBeNull();
    jobsRepo.updateStatus(job!.id, 'retrying');

    expect(jobsRepo.getNextPending()?.id).toBe(job!.id);
    expect(jobsRepo.claimAndIncrementAttempts(job!.id)).toBe(1);
  });
});

describe('schedule reminders', () => {
  function createSchedule(startsAt: string): number {
    const db = getDb('');
    const group = db.prepare(
      "INSERT INTO groups (jid, name, status) VALUES ('test@g.us', 'Test', 'active') RETURNING id",
    ).get() as { id: number };
    const schedule = db.prepare(
      'INSERT INTO schedules (group_id, title, starts_at) VALUES (?, ?, ?) RETURNING id',
    ).get(group.id, 'Rapat', startsAt) as { id: number };
    return schedule.id;
  }

  it('stores day-before reminder at 19:00 WIB and two-hours-before in UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T00:00:00Z'));
    const scheduleId = createSchedule('2026-07-23T09:00:00+07:00');

    remindersRepo.scheduleRemindersFor(scheduleId, '2026-07-23T09:00:00+07:00');
    const rows = getDb('').prepare(
      'SELECT type, due_at FROM reminders WHERE schedule_id = ? ORDER BY type',
    ).all(scheduleId);

    expect(rows).toEqual([
      { type: 'day_before', due_at: '2026-07-22T12:00:00.000Z' },
      { type: 'two_hours', due_at: '2026-07-23T00:00:00.000Z' },
    ]);
  });

  it('returns reminders whose ISO due_at is already due', () => {
    const scheduleId = createSchedule('2026-07-23T09:00:00+07:00');
    remindersRepo.create(scheduleId, 'two_hours', '2020-01-01T00:00:00.000Z');

    expect(remindersRepo.getPendingDue()).toHaveLength(1);
  });
});
