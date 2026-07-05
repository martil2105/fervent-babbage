import { describe, it, expect } from 'vitest';
import {
  getSetVolume,
  isCountableSet,
  getExerciseVolume,
  getSessionVolume,
  getSetRpe,
  calculateTrend,
  getLastSessionSets,
  getProgressionSuggestion,
  getPersonalBests,
  getDisplayExercises,
  groupSessionsByWeek,
} from './workoutHelpers.js';

// --- small builders to keep the cases readable --------------------------------
const set = (weight, reps, extra = {}) => ({ weight, reps, isWarmup: false, completed: true, ...extra });
const warmup = (weight, reps) => set(weight, reps, { isWarmup: true });
const D = (s) => new Date(s).getTime();

describe('getSetVolume', () => {
  it('multiplies weight by reps for working sets', () => {
    expect(getSetVolume(40, 10)).toBe(400);
  });
  it('returns 0 for warmup sets', () => {
    expect(getSetVolume(40, 10, true)).toBe(0);
  });
  it('coerces string inputs and handles blanks', () => {
    expect(getSetVolume('42.5', '8')).toBe(340);
    expect(getSetVolume('', 10)).toBe(0);
    expect(getSetVolume(20, '')).toBe(0);
  });
});

describe('isCountableSet', () => {
  it('counts a completed working set', () => {
    expect(isCountableSet(set(40, 10))).toBe(true);
  });
  it('excludes warmups', () => {
    expect(isCountableSet(warmup(20, 15))).toBe(false);
  });
  it('excludes explicitly-uncompleted sets but keeps legacy undefined-completed', () => {
    expect(isCountableSet({ weight: 40, reps: 10, isWarmup: false, completed: false })).toBe(false);
    expect(isCountableSet({ weight: 40, reps: 10, isWarmup: false })).toBe(true);
  });
  it('rejects nullish', () => {
    expect(isCountableSet(null)).toBe(false);
    expect(isCountableSet(undefined)).toBe(false);
  });
});

describe('getExerciseVolume / getSessionVolume', () => {
  const sets = [warmup(20, 12), set(40, 10), set(40, 8), { weight: 40, reps: 8, isWarmup: false, completed: false }];
  it('sums only completed working sets', () => {
    // 40*10 + 40*8 = 720 (warmup + uncompleted excluded)
    expect(getExerciseVolume(sets)).toBe(720);
  });
  it('handles empty / invalid input', () => {
    expect(getExerciseVolume([])).toBe(0);
    expect(getExerciseVolume(null)).toBe(0);
  });
  it('sums exercise volumes across a session', () => {
    const session = [{ sets: [set(40, 10)] }, { sets: [set(30, 10), warmup(10, 10)] }];
    expect(getSessionVolume(session)).toBe(700);
  });
});

describe('getSetRpe', () => {
  it('uses explicit rpe when present', () => {
    expect(getSetRpe({ rpe: 8 })).toBe(8);
  });
  it('derives rpe from rir (10 - rir)', () => {
    expect(getSetRpe({ rir: 2 })).toBe(8);
  });
  it('returns null when neither is set', () => {
    expect(getSetRpe({ rpe: '', rir: '' })).toBeNull();
    expect(getSetRpe({})).toBeNull();
  });
});

describe('calculateTrend', () => {
  it('reports none when there is no previous value', () => {
    expect(calculateTrend(1000, 0)).toEqual({ direction: 'none', percentChange: 0 });
    expect(calculateTrend(1000, undefined)).toEqual({ direction: 'none', percentChange: 0 });
  });
  it('detects an increase', () => {
    expect(calculateTrend(1200, 1000)).toEqual({ direction: 'up', percentChange: 20 });
  });
  it('detects a decrease', () => {
    expect(calculateTrend(800, 1000)).toEqual({ direction: 'down', percentChange: 20 });
  });
  it('treats sub-1% moves as flat', () => {
    expect(calculateTrend(1005, 1000)).toEqual({ direction: 'flat', percentChange: 0 });
  });
});

describe('getLastSessionSets', () => {
  const sessions = [
    { id: 'old', timestamp: D('2026-06-20'), exercises: [{ exerciseId: 'bench', sets: [set(40, 12), warmup(15, 20)] }] },
    { id: 'new', timestamp: D('2026-06-27'), exercises: [{ exerciseId: 'bench', sets: [set(42, 11), set(42, 9)] }] },
  ];
  it('returns the newest session, working sets only', () => {
    const r = getLastSessionSets('bench', sessions);
    expect(r.timestamp).toBe(D('2026-06-27'));
    expect(r.sets).toEqual([{ weight: 42, reps: 11 }, { weight: 42, reps: 9 }]);
  });
  it('excludes warmups (falls back to newest that has the exercise)', () => {
    const r = getLastSessionSets('bench', [sessions[0]]);
    expect(r.sets).toEqual([{ weight: 40, reps: 12 }]);
  });
  it('returns null for an unknown exercise or empty history', () => {
    expect(getLastSessionSets('squat', sessions)).toBeNull();
    expect(getLastSessionSets('bench', [])).toBeNull();
  });
});

describe('getProgressionSuggestion', () => {
  const def = { maxReps: 12 };
  const makeSession = (sets) => [{
    id: 's', timestamp: D('2026-06-27'),
    exercises: [{ exerciseId: 'bench', targetRange: { min: 10, max: 12 }, sets }],
  }];

  it('suggests a baseline when there is no history', () => {
    expect(getProgressionSuggestion('bench', [], def).type).toBe('initial');
  });
  it('suggests a weight increase when all sets hit max reps at a comfortable RPE', () => {
    const s = getProgressionSuggestion('bench', makeSession([set(40, 12, { rpe: 8 }), set(40, 12, { rpe: 8 })]), def);
    expect(s.type).toBe('weight');
  });
  it('suggests holding when max reps were hit but RPE was maxed out', () => {
    const s = getProgressionSuggestion('bench', makeSession([set(40, 12, { rpe: 10 }), set(40, 12, { rpe: 10 })]), def);
    expect(s.type).toBe('hold');
  });
  it('suggests more reps when the top of the range was not reached', () => {
    const s = getProgressionSuggestion('bench', makeSession([set(40, 12, { rpe: 8 }), set(40, 9, { rpe: 8 })]), def);
    expect(s.type).toBe('reps');
  });
  it('asks for working sets when only warmups were logged', () => {
    const s = getProgressionSuggestion('bench', makeSession([warmup(20, 12)]), def);
    expect(s.type).toBe('reps');
    expect(s.action).toBe('Add Working Sets');
  });
});

describe('getPersonalBests', () => {
  const sessions = [
    { id: 'a', timestamp: D('2026-06-01'), exercises: [{ exerciseId: 'bench', sets: [set(40, 10), warmup(60, 3)] }] },
    { id: 'b', timestamp: D('2026-06-08'), exercises: [{ exerciseId: 'bench', sets: [set(45, 8), set(45, 8)] }] },
  ];
  it('tracks the heaviest completed working set and best session volume', () => {
    const pb = getPersonalBests(sessions);
    // heaviest counted set is 45 (the 60 is a warmup, excluded)
    expect(pb.bench.maxWeight).toBe(45);
    // best single-session volume: 45*8 + 45*8 = 720 vs 400
    expect(pb.bench.maxSessionVolume).toBe(720);
  });
});

describe('getDisplayExercises', () => {
  it('appends history-only exercises after the configured ones', () => {
    const config = [{ id: 'bench', name: 'Bench', muscleGroup: 'Chest' }];
    const sessions = [{
      id: 's', timestamp: D('2026-06-27'),
      exercises: [
        { exerciseId: 'bench', name: 'Bench', targetRange: { min: 8, max: 12 }, sets: [set(40, 10)] },
        { exerciseId: 'flyes', name: 'Cable Flyes', muscleGroup: 'Chest', targetRange: { min: 12, max: 15 }, sets: [set(15, 12)] },
      ],
    }];
    const result = getDisplayExercises(config, sessions);
    const ids = result.map((e) => e.id);
    expect(ids).toEqual(['bench', 'flyes']);
    expect(result.find((e) => e.id === 'flyes').isHistorical).toBe(true);
  });
});

describe('groupSessionsByWeek', () => {
  const sessions = [
    { id: 'mon', timestamp: D('2026-06-15'), exercises: [{ exerciseId: 'bench', muscleGroup: 'Chest', sets: [set(40, 10)] }] },
    { id: 'wed', timestamp: D('2026-06-17'), exercises: [{ exerciseId: 'bench', muscleGroup: 'Chest', sets: [set(40, 10)] }] },
    { id: 'nextmon', timestamp: D('2026-06-22'), exercises: [{ exerciseId: 'bench', muscleGroup: 'Chest', sets: [set(50, 10)] }] },
  ];
  it('groups sessions into calendar weeks, chronologically', () => {
    const weeks = groupSessionsByWeek(sessions, []);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].sessionsCount).toBe(2);
    expect(weeks[0].totalVolume).toBe(800); // 400 + 400
    expect(weeks[1].totalVolume).toBe(500); // 50 * 10
    expect(weeks[0].weekStart).toBeLessThan(weeks[1].weekStart);
  });
  it('returns an empty array for no sessions', () => {
    expect(groupSessionsByWeek([], [])).toEqual([]);
  });
});
