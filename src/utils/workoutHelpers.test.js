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
  getEstimated1RM,
  getExerciseProgression,
  getSessionAvgRpe,
  getLifetimeStats,
  getWeeklyStreak,
  getDailyVolumeMap,
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

// --- Analytics page helpers ----------------------------------------------------

describe('getEstimated1RM', () => {
  it('applies the Epley formula for multi-rep sets', () => {
    expect(getEstimated1RM(30, 10)).toBeCloseTo(40); // 30 * (1 + 10/30)
  });
  it('returns the weight itself for a single rep', () => {
    expect(getEstimated1RM(50, 1)).toBe(50);
  });
  it('returns 0 for missing or invalid input', () => {
    expect(getEstimated1RM('', 10)).toBe(0);
    expect(getEstimated1RM(40, 0)).toBe(0);
    expect(getEstimated1RM(0, 8)).toBe(0);
  });
});

describe('getExerciseProgression', () => {
  const sessions = [
    { id: 'b', timestamp: D('2026-06-20'), exercises: [{ exerciseId: 'press', sets: [set(32, 10), set(34, 8)] }] },
    { id: 'a', timestamp: D('2026-06-10'), exercises: [{ exerciseId: 'press', sets: [warmup(20, 10), set(30, 12)] }] },
    { id: 'c', timestamp: D('2026-06-25'), exercises: [{ exerciseId: 'other', sets: [set(99, 5)] }] },
    { id: 'd', timestamp: D('2026-06-28'), exercises: [{ exerciseId: 'press', sets: [set(35, 10, { completed: false })] }] },
  ];
  it('returns chronological points from countable sets only', () => {
    const series = getExerciseProgression('press', sessions);
    expect(series).toHaveLength(2); // session c has no press, d has no countable sets
    expect(series[0].timestamp).toBeLessThan(series[1].timestamp);
    expect(series[0].topWeight).toBe(30); // warmup 20kg ignored
    expect(series[0].est1RM).toBeCloseTo(42); // 30 * (1 + 12/30)
    expect(series[1].topWeight).toBe(34);
    expect(series[1].volume).toBe(32 * 10 + 34 * 8);
  });
  it('handles unknown exercises and empty input', () => {
    expect(getExerciseProgression('nope', sessions)).toEqual([]);
    expect(getExerciseProgression('press', [])).toEqual([]);
  });
});

describe('getSessionAvgRpe', () => {
  it('averages RPE across countable sets, converting RIR', () => {
    const session = {
      exercises: [
        { exerciseId: 'a', sets: [set(30, 10, { rpe: 8 }), set(30, 10, { rir: 1 })] }, // rir 1 -> rpe 9
        { exerciseId: 'b', sets: [warmup(20, 10), set(40, 8, { rpe: 7 })] },
      ],
    };
    expect(getSessionAvgRpe(session)).toBe(8); // (8 + 9 + 7) / 3
  });
  it('returns null when no effort data exists', () => {
    expect(getSessionAvgRpe({ exercises: [{ exerciseId: 'a', sets: [set(30, 10)] }] })).toBeNull();
    expect(getSessionAvgRpe(null)).toBeNull();
  });
});

describe('getLifetimeStats', () => {
  const sessions = [
    { id: 'a', timestamp: D('2026-06-10'), duration: 40, exercises: [{ exerciseId: 'x', sets: [set(30, 10), warmup(20, 10)] }] },
    { id: 'b', timestamp: D('2026-06-12'), duration: 50, exercises: [{ exerciseId: 'x', sets: [set(30, 10), set(30, 8, { completed: false })] }] },
    { id: 'c', timestamp: D('2026-06-14'), exercises: [{ exerciseId: 'x', sets: [set(40, 5)] }] },
  ];
  it('totals sessions, countable sets, reps and volume', () => {
    const stats = getLifetimeStats(sessions);
    expect(stats.sessionsCount).toBe(3);
    expect(stats.totalSets).toBe(3); // warmup + skipped set excluded
    expect(stats.totalReps).toBe(25); // 10 + 10 + 5
    expect(stats.totalVolume).toBe(300 + 300 + 200);
    expect(stats.avgDuration).toBe(45); // only sessions with a duration
  });
  it('returns zeroed stats for empty input', () => {
    expect(getLifetimeStats([])).toEqual({ sessionsCount: 0, totalVolume: 0, totalSets: 0, totalReps: 0, avgDuration: 0 });
  });
});

describe('getWeeklyStreak', () => {
  // 2026-07-10 is a Friday; that week's Monday is 2026-07-06
  const now = new Date('2026-07-10T12:00:00');
  const s = (dateStr) => ({ id: dateStr, timestamp: D(dateStr), exercises: [] });
  it('counts consecutive trained weeks including the current one', () => {
    const streak = getWeeklyStreak([s('2026-07-07'), s('2026-06-30'), s('2026-06-24')], now);
    expect(streak).toBe(3);
  });
  it('does not break the streak on a quiet current week', () => {
    const streak = getWeeklyStreak([s('2026-06-30'), s('2026-06-24')], now);
    expect(streak).toBe(2);
  });
  it('resets when a full week was missed', () => {
    const streak = getWeeklyStreak([s('2026-07-07'), s('2026-06-16')], now);
    expect(streak).toBe(1);
  });
  it('returns 0 with no sessions', () => {
    expect(getWeeklyStreak([], now)).toBe(0);
  });
});

describe('getDailyVolumeMap', () => {
  it('sums session volume per calendar day', () => {
    const t1 = new Date('2026-07-06T08:00:00').getTime();
    const t2 = new Date('2026-07-06T18:00:00').getTime();
    const map = getDailyVolumeMap([
      { id: 'am', timestamp: t1, exercises: [{ exerciseId: 'x', sets: [set(30, 10)] }] },
      { id: 'pm', timestamp: t2, exercises: [{ exerciseId: 'x', sets: [set(20, 10)] }] },
    ]);
    const dayKey = new Date('2026-07-06T00:00:00').setHours(0, 0, 0, 0);
    expect(Object.keys(map)).toHaveLength(1);
    expect(map[dayKey]).toBe(500);
  });
  it('returns an empty map for no sessions', () => {
    expect(getDailyVolumeMap([])).toEqual({});
  });
});
