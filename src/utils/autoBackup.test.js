import { describe, it, expect } from 'vitest';
import { isBackupDue, daysSinceBackup, BACKUP_INTERVAL_DAYS } from './autoBackup.js';

const DAY = 86400000;
const now = new Date('2026-08-01T12:00:00').getTime();

describe('isBackupDue', () => {
  it('treats a never-backed-up log as due — the case that matters most', () => {
    expect(isBackupDue(null, now)).toBe(true);
    expect(isBackupDue(undefined, now)).toBe(true);
    expect(isBackupDue(0, now)).toBe(true);
  });
  it('is not due inside the interval', () => {
    expect(isBackupDue(now - 1 * DAY, now)).toBe(false);
  });
  it('is due once the interval has passed', () => {
    expect(isBackupDue(now - (BACKUP_INTERVAL_DAYS + 1) * DAY, now)).toBe(true);
  });
  it('honours a custom interval', () => {
    expect(isBackupDue(now - 5 * DAY, now, 7)).toBe(false);
    expect(isBackupDue(now - 8 * DAY, now, 7)).toBe(true);
  });
});

describe('daysSinceBackup', () => {
  it('counts whole days', () => {
    expect(daysSinceBackup(now - 3 * DAY, now)).toBe(3);
  });
  it('returns 0 for a backup taken earlier today', () => {
    expect(daysSinceBackup(now - 3600000, now)).toBe(0);
  });
  it('returns null when there has never been one', () => {
    expect(daysSinceBackup(null, now)).toBeNull();
  });
  it('never goes negative on a clock skew', () => {
    expect(daysSinceBackup(now + 2 * DAY, now)).toBe(0);
  });
});
