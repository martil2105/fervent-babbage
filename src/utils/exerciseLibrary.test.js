import { describe, it, expect } from 'vitest';
import {
  exerciseNameKey,
  tidyExerciseName,
  editDistance,
  buildExerciseCatalog,
  findMatchingExercise,
  searchExercises,
  findDuplicateExerciseGroups,
  planExerciseMerge,
  guessMuscleGroup,
  guessExerciseType,
} from './exerciseLibrary.js';

const set = (weight, reps, extra = {}) => ({ weight, reps, isWarmup: false, completed: true, ...extra });
const D = (s) => new Date(s).getTime();
const entry = (exerciseId, name, sets = [set(30, 10)], extra = {}) => ({ exerciseId, name, sets, ...extra });
const session = (id, iso, exercises, extra = {}) => ({ id, timestamp: D(iso), exercises, ...extra });

describe('exerciseNameKey', () => {
  it('ignores case, spaces, hyphens and punctuation', () => {
    const key = exerciseNameKey('Incline Chest Press');
    expect(exerciseNameKey('incline chestpress')).toBe(key);
    expect(exerciseNameKey('  Incline  chest-press ')).toBe(key);
    expect(exerciseNameKey('INCLINE CHEST PRESS.')).toBe(key);
  });
  it('folds plurals', () => {
    expect(exerciseNameKey('Lateral Raises')).toBe(exerciseNameKey('Lateral Raise'));
    expect(exerciseNameKey('Leg Curls')).toBe(exerciseNameKey('Leg Curl'));
    expect(exerciseNameKey('Incline Presses')).toBe(exerciseNameKey('Incline Press'));
    expect(exerciseNameKey('Cable Flies')).toBe(exerciseNameKey('Cable Fly'));
    expect(exerciseNameKey('Cable Flyes')).toBe(exerciseNameKey('Cable Fly'));
  });
  it('expands common shorthand', () => {
    expect(exerciseNameKey('DB Shoulder Press')).toBe(exerciseNameKey('Dumbbell Shoulder Press'));
    expect(exerciseNameKey('Dumbell Shoulder Press')).toBe(exerciseNameKey('Dumbbell Shoulder Press'));
    expect(exerciseNameKey('RDL')).toBe(exerciseNameKey('Romanian Deadlift'));
    expect(exerciseNameKey('Lat Pulldown')).toBe(exerciseNameKey('Lat Pull-Down'));
  });
  it('keeps genuinely different exercises apart', () => {
    expect(exerciseNameKey('Leg Press')).not.toBe(exerciseNameKey('Leg Curl'));
    expect(exerciseNameKey('Hip Abduction')).not.toBe(exerciseNameKey('Hip Adduction'));
    expect(exerciseNameKey('Press')).not.toBe(exerciseNameKey('Pres'));
  });
  it('is empty for empty input', () => {
    expect(exerciseNameKey('')).toBe('');
    expect(exerciseNameKey(undefined)).toBe('');
    expect(exerciseNameKey(' - ')).toBe('');
  });
});

describe('tidyExerciseName', () => {
  it('trims, collapses spaces and capitalises', () => {
    expect(tidyExerciseName('  incline   chest press ')).toBe('Incline chest press');
    expect(tidyExerciseName('')).toBe('');
  });
});

describe('editDistance', () => {
  it('counts single edits', () => {
    expect(editDistance('abduction', 'adduction')).toBe(1);
    expect(editDistance('press', 'pres')).toBe(1);
    expect(editDistance('same', 'same')).toBe(0);
  });
  it('stops early past the limit', () => {
    expect(editDistance('abcdefgh', 'zzzzzzzz', 2)).toBe(3);
  });
});

describe('buildExerciseCatalog', () => {
  const library = [{ id: 'icp', name: 'Incline Chest Press', muscleGroup: 'Chest', exerciseType: 'compound' }];
  const routines = [{ id: 'routine-push', order: 0, exerciseIds: ['icp'] }];
  const sessions = [
    session('a', '2026-09-01', [entry('icp', 'Incline Chest Press'), entry('custom-1', 'incline chestpress')]),
    session('b', '2026-09-10', [entry('custom-1', 'Incline chestpress', [set(30, 10, { completed: false })])]),
    session('c', '2026-09-12', [entry('custom-2', 'Cable Fly', [set(10, 15)], { muscleGroup: 'Chest', exerciseType: 'isolation', targetRange: { min: 12, max: 15 } })]),
  ];
  const catalog = buildExerciseCatalog(library, routines, sessions);
  const byId = Object.fromEntries(catalog.map((e) => [e.id, e]));

  it('lists library and history-only exercises once each', () => {
    expect(catalog.map((e) => e.id).sort()).toEqual(['custom-1', 'custom-2', 'icp']);
    expect(byId.icp.inLibrary).toBe(true);
    expect(byId['custom-1'].inLibrary).toBe(false);
  });
  it('names a history-only exercise after its latest appearance', () => {
    expect(byId['custom-1'].name).toBe('Incline chestpress');
    expect(byId['custom-2'].minReps).toBe(12);
    expect(byId['custom-2'].maxReps).toBe(15);
    expect(byId['custom-2'].exerciseType).toBe('isolation');
  });
  it('counts only sessions where a set was ticked', () => {
    expect(byId['custom-1'].sessionCount).toBe(1);
    expect(byId['custom-1'].lastUsedAt).toBe(D('2026-09-01'));
  });
  it('records routine membership and the comparison key', () => {
    expect(byId.icp.routineIds).toEqual(['routine-push']);
    expect(byId.icp.key).toBe(byId['custom-1'].key);
  });
});

describe('findMatchingExercise', () => {
  const catalog = buildExerciseCatalog(
    [{ id: 'icp', name: 'Incline Chest Press' }, { id: 'abd', name: 'Hip Abduction' }],
    [],
    []
  );
  it('finds the same exercise under another spelling', () => {
    expect(findMatchingExercise('incline chestpress', catalog).exact.id).toBe('icp');
  });
  it('suggests likely typos without treating them as the same', () => {
    const r = findMatchingExercise('Incline Chest Pres', catalog);
    expect(r.exact).toBeNull();
    expect(r.similar.map((e) => e.id)).toEqual(['icp']);
  });
  it('offers the look-alike but never auto-matches it', () => {
    const r = findMatchingExercise('Hip Adduction', catalog);
    expect(r.exact).toBeNull();
    expect(r.similar.map((e) => e.id)).toEqual(['abd']);
  });
  it('returns nothing for an empty name', () => {
    expect(findMatchingExercise('  ', catalog)).toEqual({ exact: null, similar: [] });
  });
});

describe('searchExercises', () => {
  const catalog = buildExerciseCatalog(
    [
      { id: 'icp', name: 'Incline Chest Press' },
      { id: 'cp', name: 'Dumbbell Chest Press' },
      { id: 'lr', name: 'Lateral Raises' },
    ],
    [],
    [session('s', '2026-09-20', [entry('cp', 'Dumbbell Chest Press')])]
  );
  it('ranks exact, then prefix, then contains', () => {
    expect(searchExercises('incline chest press', catalog).map((e) => e.id)).toEqual(['icp']);
    expect(searchExercises('incl', catalog).map((e) => e.id)).toEqual(['icp']);
    expect(searchExercises('chest', catalog).map((e) => e.id)).toEqual(['cp', 'icp']); // recent first
  });
  it('matches every word in any order', () => {
    expect(searchExercises('press incline', catalog).map((e) => e.id)).toEqual(['icp']);
  });
  it('tolerates a typo', () => {
    expect(searchExercises('inclne', catalog).map((e) => e.id)).toEqual(['icp']);
    expect(searchExercises('laterl raise', catalog).map((e) => e.id)).toEqual(['lr']);
  });
  it('shows one entry for unmerged duplicates', () => {
    const dup = buildExerciseCatalog(
      [{ id: 'icp', name: 'Incline Chest Press' }],
      [],
      [session('s', '2026-09-01', [entry('custom-1', 'incline chestpress')])]
    );
    expect(searchExercises('incline', dup).map((e) => e.id)).toEqual(['icp']);
  });
  it('returns nothing for an empty query', () => {
    expect(searchExercises('', catalog)).toEqual([]);
  });
});

describe('findDuplicateExerciseGroups', () => {
  it('groups spellings of one exercise and keeps the library entry', () => {
    const catalog = buildExerciseCatalog(
      [{ id: 'icp', name: 'Incline Chest Press' }],
      [],
      [
        session('a', '2026-09-01', [entry('custom-1', 'incline chestpress')]),
        session('b', '2026-09-08', [entry('custom-2', 'Incline chest press')]),
        session('c', '2026-09-15', [entry('custom-3', 'Cable Fly')]),
      ]
    );
    const groups = findDuplicateExerciseGroups(catalog);
    expect(groups).toHaveLength(1);
    expect(groups[0].target.id).toBe('icp');
    expect(groups[0].others.map((e) => e.id).sort()).toEqual(['custom-1', 'custom-2']);
  });
  it('without a library entry, keeps the most used spelling', () => {
    const catalog = buildExerciseCatalog([], [], [
      session('a', '2026-09-01', [entry('custom-1', 'incline chestpress')]),
      session('b', '2026-09-08', [entry('custom-2', 'Incline Chest Press')]),
      session('c', '2026-09-15', [entry('custom-2', 'Incline Chest Press')]),
    ]);
    expect(findDuplicateExerciseGroups(catalog)[0].target.id).toBe('custom-2');
  });
  it('finds nothing when every name is distinct', () => {
    const catalog = buildExerciseCatalog([{ id: 'a', name: 'Leg Press' }, { id: 'b', name: 'Leg Curl' }], [], []);
    expect(findDuplicateExerciseGroups(catalog)).toEqual([]);
  });
});

describe('planExerciseMerge', () => {
  const target = { id: 'icp', name: 'Incline Chest Press', muscleGroup: 'Chest', exerciseType: 'compound' };
  const sessions = [
    session('a', '2026-09-01', [entry('custom-1', 'incline chestpress', [set(30, 10)], { muscleGroup: 'Other' }), entry('lr', 'Lateral Raises')]),
    session('b', '2026-09-08', [entry('icp', 'Incline Chest Press', [set(32.5, 8)]), entry('custom-1', 'incline chestpress', [set(30, 12)])]),
    session('c', '2026-09-15', [entry('lr', 'Lateral Raises')]),
  ];
  const library = [target, { id: 'lr', name: 'Lateral Raises' }];
  const routines = [{ id: 'r', exerciseIds: ['custom-1', 'lr', 'icp'] }];

  it('relabels the source in every session that logged it', () => {
    const plan = planExerciseMerge({ sessions, library, routines, sourceId: 'custom-1', target });
    const a = plan.sessionsToUpdate.find((u) => u.id === 'a');
    expect(a.exercises[0]).toMatchObject({ exerciseId: 'icp', name: 'Incline Chest Press', muscleGroup: 'Chest' });
    expect(a.exercises[0].sets).toEqual([set(30, 10)]);
    expect(a.exercises[1].exerciseId).toBe('lr');
  });
  it('folds the sets together when a session logged both', () => {
    const plan = planExerciseMerge({ sessions, library, routines, sourceId: 'custom-1', target });
    const b = plan.sessionsToUpdate.find((u) => u.id === 'b');
    expect(b.exercises).toHaveLength(1);
    expect(b.exercises[0].sets).toEqual([set(32.5, 8), set(30, 12)]);
  });
  it('leaves untouched sessions out of the write', () => {
    const plan = planExerciseMerge({ sessions, library, routines, sourceId: 'custom-1', target });
    expect(plan.sessionsToUpdate.map((u) => u.id).sort()).toEqual(['a', 'b']);
  });
  it('repoints routines without listing the target twice', () => {
    const plan = planExerciseMerge({ sessions, library, routines, sourceId: 'custom-1', target });
    expect(plan.routinesToPut).toEqual([{ id: 'r', exerciseIds: ['icp', 'lr'] }]);
  });
  it("carries the source's settings over when the target has no library record", () => {
    const lib = [{ id: 'custom-1', name: 'incline chestpress', targetSets: 3, weightStep: 2.5 }];
    const plan = planExerciseMerge({ sessions, library: lib, routines: [], sourceId: 'custom-1', target: { id: 'custom-9', name: 'Incline Chest Press', muscleGroup: 'Chest', exerciseType: 'compound' } });
    expect(plan.exerciseIdsToDelete).toEqual(['custom-1']);
    expect(plan.exercisesToPut).toEqual([{ id: 'custom-9', name: 'Incline Chest Press', targetSets: 3, weightStep: 2.5, muscleGroup: 'Chest', exerciseType: 'compound' }]);
  });
  it('refuses a merge into itself', () => {
    expect(planExerciseMerge({ sessions, library, routines, sourceId: 'icp', target })).toBeNull();
  });
});

describe('guessMuscleGroup / guessExerciseType', () => {
  it('guesses the group from the name', () => {
    expect(guessMuscleGroup('Incline Chest Press')).toBe('Chest');
    expect(guessMuscleGroup('Cable Lateral Raise')).toBe('Shoulders');
    expect(guessMuscleGroup('Overhead Tricep Extension')).toBe('Triceps');
    expect(guessMuscleGroup('Rear Delt Fly')).toBe('Shoulders');
    expect(guessMuscleGroup('Lat Pulldown')).toBe('Lats');
    expect(guessMuscleGroup('Seated Cable Row')).toBe('Back');
    expect(guessMuscleGroup('Hanging Leg Raise')).toBe('Abs');
    expect(guessMuscleGroup('Hack Squat')).toBe('Quads');
    expect(guessMuscleGroup('Mystery Machine')).toBe('Other');
  });
  it('guesses isolation vs compound', () => {
    expect(guessExerciseType('Cable Fly')).toBe('isolation');
    expect(guessExerciseType('Leg Extension')).toBe('isolation');
    expect(guessExerciseType('Incline Chest Press')).toBe('compound');
  });
});

describe('duplicate preference — tidier name wins a tie', () => {
  it('keeps the capitalised, spaced spelling when usage is equal', () => {
    const catalog = buildExerciseCatalog([], [], [
      session('a', '2026-09-10', [entry('custom-1', 'Incline Chest Press')]),
      session('b', '2026-09-17', [entry('custom-2', 'incline chestpress')]),
    ]);
    expect(findDuplicateExerciseGroups(catalog)[0].target.id).toBe('custom-1');
    expect(searchExercises('incline', catalog).map((e) => e.id)).toEqual(['custom-1']);
  });
});
