import Dexie from 'dexie';
import { planLegsProgramV5 } from './legsMigration';

export const db = new Dexie('HypertrophyTrainerDB');

// The leg day, in session order. Still deliberately small — three machines —
// and array order *is* session order: hamstrings first, then quad isolation,
// then the press to finish. Higher rep ranges are kinder while the movement
// patterns are still being learned, and all three machines load in 5 kg jumps.
export const LEG_EXERCISES = [
  {
    id: 'leg-curl',
    name: 'Seated Leg Curl',
    targetSets: 2,
    minReps: 10,
    maxReps: 15,
    isCustom: false,
    muscleGroup: 'Hamstrings',
    exerciseType: 'isolation',
    restDuration: 90,
    weightStep: 5
  },
  {
    id: 'leg-extension',
    name: 'Leg Extension',
    targetSets: 3,
    minReps: 10,
    maxReps: 15,
    isCustom: false,
    muscleGroup: 'Quads',
    exerciseType: 'isolation',
    restDuration: 90,
    weightStep: 5
  },
  {
    id: 'leg-press',
    name: 'Leg Press',
    targetSets: 2,
    minReps: 10,
    maxReps: 15,
    isCustom: false,
    muscleGroup: 'Quads',
    exerciseType: 'compound',
    restDuration: 150,
    weightStep: 5
  }
];

export const PUSH_ROUTINE_ID = 'routine-push';
export const LEGS_ROUTINE_ID = 'routine-legs';

// Define database tables and index fields
db.version(1).stores({
  exercises: 'id, name, muscleGroup, exerciseType',
  history: 'id, timestamp',
  preferences: 'key' // key-value table for preferences
});

// v2 — PUSH Quest game layer: a key/value store for XP, streak, and
// last-trained bookkeeping. Existing data is preserved on upgrade; the new
// store is simply created empty for users coming from v1.
db.version(2).stores({
  exercises: 'id, name, muscleGroup, exerciseType',
  history: 'id, timestamp',
  preferences: 'key',
  gameState: 'key' // key-value table for game progression (xp, streak, ...)
});

// v3 — PUSH Quest removed (replaced by the Analytics page). Drop the unused
// gameState store; workout history, exercises and preferences are untouched.
db.version(3).stores({
  exercises: 'id, name, muscleGroup, exerciseType',
  history: 'id, timestamp',
  preferences: 'key',
  gameState: null
});

// v4 — Routines. Until now a session meant "every exercise in the library",
// which made a separate leg day impossible: squats would have shown up in the
// push workout. A routine names an ordered subset of the library instead.
//
// On upgrade, the existing flat exercise list *is* the user's push day, so it
// is wrapped verbatim into a Push routine — no exercise or history is touched.
// A Legs routine is then seeded alongside it.
db.version(4).stores({
  exercises: 'id, name, muscleGroup, exerciseType',
  history: 'id, timestamp',
  preferences: 'key',
  routines: 'id, order'
}).upgrade(async (tx) => {
  const existing = await tx.table('exercises').toArray();

  await tx.table('routines').put({
    id: PUSH_ROUTINE_ID,
    name: 'Push',
    exerciseIds: existing.map((ex) => ex.id),
    order: 0
  });

  // bulkPut rather than bulkAdd: if a leg exercise with the same id somehow
  // already exists, overwrite it instead of failing the whole upgrade.
  await tx.table('exercises').bulkPut(LEG_EXERCISES);

  await tx.table('routines').put({
    id: LEGS_ROUTINE_ID,
    name: 'Legs',
    exerciseIds: LEG_EXERCISES.map((ex) => ex.id),
    order: 1
  });
});

// v5 — Leg day becomes Seated Leg Curl → Leg Extension → Leg Press, and the
// retired 'Legs' tag is split into Quads / Hamstrings so analytics stops
// pooling them. Schema is unchanged; this is a data-only step. The planning
// lives in legsMigration.js as a pure function so it can be unit-tested
// without IndexedDB. Existing leg press / leg curl settings are kept as-is.
db.version(5).stores({
  exercises: 'id, name, muscleGroup, exerciseType',
  history: 'id, timestamp',
  preferences: 'key',
  routines: 'id, order'
}).upgrade(async (tx) => {
  const exercises = await tx.table('exercises').toArray();
  const routines = await tx.table('routines').toArray();

  const { exercisesToPut, routinesToPut } = planLegsProgramV5(exercises, routines, {
    legSeed: LEG_EXERCISES,
    legsRoutineId: LEGS_ROUTINE_ID
  });

  if (exercisesToPut.length) await tx.table('exercises').bulkPut(exercisesToPut);
  if (routinesToPut.length) await tx.table('routines').bulkPut(routinesToPut);
});

// Seed default exercises when database is created for the first time.
// Note: Dexie runs `populate` only for brand-new databases — upgrade functions
// do not fire — so fresh installs need their routines created here too.
db.on('populate', () => {
  db.exercises.bulkAdd([
    {
      id: 'db-shoulder-press',
      name: 'Dumbbell Shoulder Press',
      targetSets: 4,
      minReps: 10,
      maxReps: 12,
      isCustom: false,
      muscleGroup: 'Shoulders',
      exerciseType: 'compound',
      restDuration: 120,
      weightStep: 2
    },
    {
      id: 'lateral-raises',
      name: 'Lateral Raises',
      targetSets: 4,
      minReps: 12,
      maxReps: 15,
      isCustom: false,
      muscleGroup: 'Shoulders',
      exerciseType: 'isolation',
      restDuration: 90,
      weightStep: 1
    },
    {
      id: 'db-chest-press',
      name: 'Dumbbell Chest Press',
      targetSets: 4,
      minReps: 10,
      maxReps: 12,
      isCustom: false,
      muscleGroup: 'Chest',
      exerciseType: 'compound',
      restDuration: 120,
      weightStep: 2
    },
    ...LEG_EXERCISES
  ]);

  db.routines.bulkAdd([
    {
      id: PUSH_ROUTINE_ID,
      name: 'Push',
      exerciseIds: ['db-shoulder-press', 'lateral-raises', 'db-chest-press'],
      order: 0
    },
    {
      id: LEGS_ROUTINE_ID,
      name: 'Legs',
      exerciseIds: LEG_EXERCISES.map((ex) => ex.id),
      order: 1
    }
  ]);

  db.preferences.add({ key: 'prefLoggingMode', value: 'RPE' });
});
