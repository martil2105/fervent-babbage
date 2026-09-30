import { describe, it, expect } from 'vitest';
import {
  parseBackup,
  summarizeSessions,
  countSessionsLostByRestore,
  backupFileName,
} from './backupFile.js';

const session = (id, iso) => ({ id, timestamp: new Date(iso).getTime(), exercises: [] });
const backup = (extra = {}) => ({
  exercises: [{ id: 'leg-press', name: 'Leg Press' }],
  history: [session('a', '2026-09-01'), session('b', '2026-09-20')],
  preferences: { prefLoggingMode: 'RPE' },
  routines: [{ id: 'routine-legs', name: 'Legs', exerciseIds: ['leg-press'], order: 0 }],
  ...extra,
});

describe('parseBackup', () => {
  it('accepts a real backup and summarises it', () => {
    const r = parseBackup(JSON.stringify(backup()));
    expect(r.ok).toBe(true);
    expect(r.summary).toEqual({
      sessions: 2,
      exercises: 1,
      routines: 1,
      firstAt: new Date('2026-09-01').getTime(),
      lastAt: new Date('2026-09-20').getTime(),
    });
  });

  it('accepts an already-parsed object and an old backup without routines', () => {
    const old = backup();
    delete old.routines;
    const r = parseBackup(old);
    expect(r.ok).toBe(true);
    expect(r.summary.routines).toBe(0);
  });

  it('rejects text that is not JSON', () => {
    const r = parseBackup('not json {');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/valid JSON/);
  });

  it('rejects JSON that is not a backup — including an empty object', () => {
    expect(parseBackup('{}').ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
    expect(parseBackup('42').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ hello: 'world' })).ok).toBe(false);
  });

  it('rejects damaged records instead of importing half a log', () => {
    expect(parseBackup(backup({ exercises: [{ name: 'No id' }] })).ok).toBe(false);
    expect(parseBackup(backup({ history: [{ id: 'x', exercises: [] }] })).ok).toBe(false); // no timestamp
    expect(parseBackup(backup({ history: [{ id: 'x', timestamp: 1 }] })).ok).toBe(false); // no exercises
    expect(parseBackup(backup({ routines: [{ id: 'r' }] })).ok).toBe(false); // no exerciseIds
    expect(parseBackup(backup({ routines: 'nope' })).ok).toBe(false);
  });

  it('rejects duplicate ids, which would abort the restore halfway', () => {
    const dupEx = backup({ exercises: [{ id: 'a', name: 'A' }, { id: 'a', name: 'A again' }] });
    const dupHist = backup({ history: [session('s', '2026-09-01'), session('s', '2026-09-02')] });
    expect(parseBackup(dupEx).ok).toBe(false);
    expect(parseBackup(dupHist).ok).toBe(false);
  });
});

describe('summarizeSessions', () => {
  it('finds the first and last timestamps', () => {
    expect(summarizeSessions([session('b', '2026-09-20'), session('a', '2026-09-01')])).toEqual({
      count: 2,
      firstAt: new Date('2026-09-01').getTime(),
      lastAt: new Date('2026-09-20').getTime(),
    });
  });
  it('is empty-safe', () => {
    expect(summarizeSessions([])).toEqual({ count: 0, firstAt: null, lastAt: null });
    expect(summarizeSessions(undefined)).toEqual({ count: 0, firstAt: null, lastAt: null });
  });
});

describe('countSessionsLostByRestore', () => {
  const inBackup = [session('a', '2026-09-01'), session('b', '2026-09-20')];

  it('counts sessions logged since the backup was taken', () => {
    const current = [...inBackup, session('c', '2026-09-24'), session('d', '2026-09-27')];
    expect(countSessionsLostByRestore(current, inBackup)).toBe(2);
  });

  it('counts sessions the backup never had, whatever their date', () => {
    const current = [session('x', '2026-08-15'), ...inBackup];
    expect(countSessionsLostByRestore(current, inBackup)).toBe(1);
  });

  it('does not count sessions the backup brings back', () => {
    expect(countSessionsLostByRestore(inBackup, inBackup)).toBe(0);
  });

  it('counts everything when the backup has no sessions', () => {
    expect(countSessionsLostByRestore(inBackup, [])).toBe(2);
  });
});

describe('backupFileName', () => {
  it('stamps the date', () => {
    expect(backupFileName(new Date('2026-09-30T10:00:00Z'))).toBe('hypertrophy_tracker_backup_2026-09-30.json');
  });
});
