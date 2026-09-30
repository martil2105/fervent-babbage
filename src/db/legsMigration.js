import { inferLegMuscleGroup } from '../utils/workoutHelpers';

// Pure planning for the v5 leg-day update, kept out of workoutDb.js so it can
// be unit-tested without IndexedDB. Takes plain arrays, returns the records to
// bulkPut — it never deletes anything, and running it twice changes nothing.

// Tags too vague to count in analytics. A leg-day slot carrying one of these
// is given the programme's group; a specific tag the user chose is left alone.
const VAGUE_TAGS = new Set([undefined, null, '', 'Legs', 'Other']);

// Recognise an existing exercise as one of the programme's three slots, so a
// "Leg Press" the user created by hand is reused instead of duplicated.
const SLOT_NAME_PATTERNS = {
  'leg-curl': /\bleg[\s-]*curls?\b/i,
  'leg-extension': /\bleg[\s-]*ext/i,
  'leg-press': /\bleg[\s-]*press\b/i
};

// "Leg Press Calf Raise" is a calf exercise, not a leg-press slot.
const CALF = /\bcalf\b|\bcalves\b/i;

const LEGS_ROUTINE_NAME = /^\s*legs?(\s+day)?\s*$/i;

/**
 * Relabel the retired catch-all 'Legs' tag by exercise name. Returns the same
 * object when nothing changes, so callers can detect edits by identity.
 */
export const retagLegsExercise = (ex) => {
  if (!ex || ex.muscleGroup !== 'Legs') return ex;
  const group = inferLegMuscleGroup(ex.name, ex.id);
  return group ? { ...ex, muscleGroup: group } : ex;
};

/**
 * @param {object[]} exercises  current library
 * @param {object[]} routines   current routines
 * @param {{ legSeed: object[], legsRoutineId: string }} opts
 *   legSeed — the programme in session order (LEG_EXERCISES)
 * @returns {{ exercisesToPut: object[], routinesToPut: object[] }}
 */
export const planLegsProgramV5 = (exercises, routines, { legSeed, legsRoutineId }) => {
  const changed = new Map(); // id → updated exercise record

  // 1. Split every 'Legs' tag in the library.
  const library = exercises.map((ex) => {
    const next = retagLegsExercise(ex);
    if (next !== ex) changed.set(next.id, next);
    return next;
  });
  const byId = new Map(library.map((ex) => [ex.id, ex]));

  // 2. Find the leg day: by id, else by name (it may have been deleted and
  //    re-created by hand), else create it after the existing routines.
  let legs =
    routines.find((r) => r.id === legsRoutineId) ||
    routines.find((r) => LEGS_ROUTINE_NAME.test(r.name || ''));
  const isNewRoutine = !legs;
  if (isNewRoutine) {
    const maxOrder = routines.reduce((m, r) => Math.max(m, r.order ?? 0), -1);
    legs = { id: legsRoutineId, name: 'Legs', exerciseIds: [], order: maxOrder + 1 };
  }
  const currentIds = Array.isArray(legs.exerciseIds) ? legs.exerciseIds : [];

  // 3. Fill each programme slot, preferring what the user already has.
  const used = new Set();
  const matches = (seed, ex) =>
    ex.id === seed.id ||
    (!CALF.test(ex.name || '') && (SLOT_NAME_PATTERNS[seed.id]?.test(ex.name || '') ?? false));

  const slotIds = legSeed.map((seed) => {
    const free = (ex) => ex && !used.has(ex.id);
    let pick =
      currentIds.map((id) => byId.get(id)).find((ex) => free(ex) && matches(seed, ex)) ||
      (free(byId.get(seed.id)) ? byId.get(seed.id) : null) ||
      library.find((ex) => free(ex) && matches(seed, ex));

    if (!pick) {
      pick = { ...seed };
      changed.set(pick.id, pick);
      byId.set(pick.id, pick);
    } else if (VAGUE_TAGS.has(pick.muscleGroup) && pick.muscleGroup !== seed.muscleGroup) {
      pick = { ...pick, muscleGroup: seed.muscleGroup };
      changed.set(pick.id, pick);
    }

    used.add(pick.id);
    return pick.id;
  });

  // 4. Programme order first; anything else the user had in there is kept
  //    after it rather than silently dropped.
  const extras = currentIds.filter((id) => !used.has(id));
  const nextIds = [...slotIds, ...extras];

  const sameOrder =
    nextIds.length === currentIds.length && nextIds.every((id, i) => id === currentIds[i]);

  return {
    exercisesToPut: [...changed.values()],
    routinesToPut: isNewRoutine || !sameOrder ? [{ ...legs, exerciseIds: nextIds }] : []
  };
};
