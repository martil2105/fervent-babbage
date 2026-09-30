import { describe, it, expect } from 'vitest';
import { planLegsProgramV5, retagLegsExercise } from './legsMigration.js';

// Mirrors LEG_EXERCISES in workoutDb.js — kept local so this test doesn't
// construct a Dexie instance.
const SEED = [
  { id: 'leg-curl', name: 'Seated Leg Curl', targetSets: 2, minReps: 10, maxReps: 15, muscleGroup: 'Hamstrings', exerciseType: 'isolation' },
  { id: 'leg-extension', name: 'Leg Extension', targetSets: 3, minReps: 10, maxReps: 15, muscleGroup: 'Quads', exerciseType: 'isolation' },
  { id: 'leg-press', name: 'Leg Press', targetSets: 2, minReps: 10, maxReps: 15, muscleGroup: 'Quads', exerciseType: 'compound' },
];
const OPTS = { legSeed: SEED, legsRoutineId: 'routine-legs' };

const push = [
  { id: 'db-chest-press', name: 'Dumbbell Chest Press', muscleGroup: 'Chest' },
  { id: 'lateral-raises', name: 'Lateral Raises', muscleGroup: 'Shoulders' },
];
const pushRoutine = { id: 'routine-push', name: 'Push', exerciseIds: ['db-chest-press', 'lateral-raises'], order: 0 };

// What a v4 install looks like: press then curl, tuned weights, maybe 'Legs'.
const v4 = (tag) => ({
  exercises: [
    ...push,
    { id: 'leg-press', name: 'Leg Press', targetSets: 2, minReps: 10, maxReps: 15, muscleGroup: tag, startingWeight: 80 },
    { id: 'leg-curl', name: 'Seated Leg Curl', targetSets: 2, minReps: 10, maxReps: 15, muscleGroup: tag === 'Quads' ? 'Hamstrings' : tag },
  ],
  routines: [pushRoutine, { id: 'routine-legs', name: 'Legs', exerciseIds: ['leg-press', 'leg-curl'], order: 1 }],
});

// Apply a plan the way Dexie's bulkPut would.
const apply = ({ exercises, routines }, plan) => {
  const put = (list, recs) => {
    const map = new Map(list.map((r) => [r.id, r]));
    recs.forEach((r) => map.set(r.id, r));
    return [...map.values()];
  };
  return { exercises: put(exercises, plan.exercisesToPut), routines: put(routines, plan.routinesToPut) };
};
const legsOf = (state) => state.routines.find((r) => r.id === 'routine-legs');
const ex = (state, id) => state.exercises.find((e) => e.id === id);

describe('planLegsProgramV5', () => {
  it('adds Leg Extension and orders the day curl → extension → press', () => {
    const before = v4('Quads');
    const after = apply(before, planLegsProgramV5(before.exercises, before.routines, OPTS));
    expect(legsOf(after).exerciseIds).toEqual(['leg-curl', 'leg-extension', 'leg-press']);
    expect(ex(after, 'leg-extension')).toMatchObject({ targetSets: 3, minReps: 10, maxReps: 15, muscleGroup: 'Quads' });
  });

  it('keeps the tuned settings on existing leg press and curl', () => {
    const before = v4('Quads');
    const after = apply(before, planLegsProgramV5(before.exercises, before.routines, OPTS));
    expect(ex(after, 'leg-press').startingWeight).toBe(80);
    expect(ex(after, 'leg-press').targetSets).toBe(2);
  });

  it("splits 'Legs'-tagged exercises into quads and hamstrings", () => {
    const before = v4('Legs');
    const after = apply(before, planLegsProgramV5(before.exercises, before.routines, OPTS));
    expect(ex(after, 'leg-press').muscleGroup).toBe('Quads');
    expect(ex(after, 'leg-curl').muscleGroup).toBe('Hamstrings');
  });

  it("gives vague tags ('Other') the programme's group but respects a specific choice", () => {
    const before = v4('Other');
    before.exercises.find((e) => e.id === 'leg-curl').muscleGroup = 'Glutes';
    const after = apply(before, planLegsProgramV5(before.exercises, before.routines, OPTS));
    expect(ex(after, 'leg-press').muscleGroup).toBe('Quads');
    expect(ex(after, 'leg-curl').muscleGroup).toBe('Glutes');
  });

  it('is a no-op the second time', () => {
    const before = v4('Legs');
    const once = apply(before, planLegsProgramV5(before.exercises, before.routines, OPTS));
    const again = planLegsProgramV5(once.exercises, once.routines, OPTS);
    expect(again.exercisesToPut).toEqual([]);
    expect(again.routinesToPut).toEqual([]);
  });

  it('never touches push exercises or the push routine', () => {
    const before = v4('Legs');
    const plan = planLegsProgramV5(before.exercises, before.routines, OPTS);
    const ids = [...plan.exercisesToPut, ...plan.routinesToPut].map((r) => r.id);
    expect(ids).not.toContain('db-chest-press');
    expect(ids).not.toContain('routine-push');
  });

  it('reuses a hand-made "Leg Press" instead of seeding a duplicate', () => {
    const before = {
      exercises: [...push, { id: 'custom-config-1', name: 'Leg press', muscleGroup: 'Legs' }],
      routines: [pushRoutine, { id: 'routine-legs', name: 'Legs', exerciseIds: ['custom-config-1'], order: 1 }],
    };
    const after = apply(before, planLegsProgramV5(before.exercises, before.routines, OPTS));
    expect(legsOf(after).exerciseIds).toEqual(['leg-curl', 'leg-extension', 'custom-config-1']);
    expect(after.exercises.filter((e) => /press/i.test(e.name) && e.muscleGroup === 'Quads')).toHaveLength(1);
  });

  it('does not mistake a calf raise on the leg press for the press slot', () => {
    const before = {
      exercises: [...push, { id: 'calf', name: 'Leg Press Calf Raise', muscleGroup: 'Calves' }],
      routines: [pushRoutine, { id: 'routine-legs', name: 'Legs', exerciseIds: ['calf'], order: 1 }],
    };
    const after = apply(before, planLegsProgramV5(before.exercises, before.routines, OPTS));
    expect(legsOf(after).exerciseIds).toEqual(['leg-curl', 'leg-extension', 'leg-press', 'calf']);
  });

  it('finds a re-created leg day by name', () => {
    const before = {
      exercises: [...push],
      routines: [pushRoutine, { id: 'routine-99', name: 'Leg day', exerciseIds: [], order: 1 }],
    };
    const plan = planLegsProgramV5(before.exercises, before.routines, OPTS);
    expect(plan.routinesToPut).toHaveLength(1);
    expect(plan.routinesToPut[0]).toMatchObject({ id: 'routine-99', exerciseIds: ['leg-curl', 'leg-extension', 'leg-press'] });
  });

  it('creates the leg day if it was deleted', () => {
    const before = { exercises: [...push], routines: [pushRoutine] };
    const plan = planLegsProgramV5(before.exercises, before.routines, OPTS);
    expect(plan.routinesToPut[0]).toMatchObject({ id: 'routine-legs', name: 'Legs', order: 1 });
    expect(plan.exercisesToPut.map((e) => e.id)).toEqual(['leg-curl', 'leg-extension', 'leg-press']);
  });
});

describe('retagLegsExercise', () => {
  it('returns the same object when nothing changes', () => {
    const e = { id: 'x', name: 'Bench', muscleGroup: 'Chest' };
    expect(retagLegsExercise(e)).toBe(e);
  });
  it('leaves an unclassifiable Legs tag alone', () => {
    const e = { id: 'x', name: 'Mystery Machine', muscleGroup: 'Legs' };
    expect(retagLegsExercise(e)).toBe(e);
  });
});
