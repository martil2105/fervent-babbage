/**
 * Exercise identity: one exercise, one id, however its name gets typed.
 *
 * History links sets to an exercise by id, never by name. Exercises added "on
 * the fly" used to get a fresh id every time, so "Incline Chest Press" logged
 * on two different days became two unrelated exercises — no "last time", no
 * prefill, and two entries in Analytics. Everything here exists so that an
 * exercise is picked from one list, new ones are checked against it, and the
 * duplicates already in history can be found and merged.
 */
import { hasLoggedSets, inferLegMuscleGroup } from './workoutHelpers';

// Shorthand and common misspellings, applied per word before comparing.
const SYNONYMS = {
  db: ['dumbbell'],
  dbs: ['dumbbell'],
  dumbell: ['dumbbell'],
  bb: ['barbell'],
  kb: ['kettlebell'],
  ext: ['extension'],
  ohp: ['overhead', 'press'],
  rdl: ['romanian', 'deadlift'],
  flye: ['fly'],
  pulldown: ['pull', 'down'],
  pushdown: ['push', 'down'],
  pullup: ['pull', 'up'],
  pushup: ['push', 'up'],
  chinup: ['chin', 'up']
};

// Crude plural folding: raises → raise, curls → curl, presses → press,
// flies → fly. Words ending in -ss or -us are left alone (press, plus).
const stem = (word) => {
  if (word.length > 4 && word.endsWith('sses')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
    return word.slice(0, -1);
  }
  return word;
};

const tokens = (name) =>
  String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stem)
    .flatMap((word) => SYNONYMS[word] || [word]);

/**
 * The comparison key for an exercise name. Case, spacing, hyphens, plurals and
 * a few abbreviations don't matter: "Incline Chest-Press", "incline chestpress"
 * and "Incline chest presses" all give "inclinechestpress".
 */
export const exerciseNameKey = (name) => tokens(name).join('');

/** Clean up a typed name for storing: trimmed, single spaces, capitalised. */
export const tidyExerciseName = (name) => {
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim();
  return clean ? clean[0].toUpperCase() + clean.slice(1) : '';
};

/** Levenshtein distance, giving up (returning max + 1) once it exceeds `max`. */
export const editDistance = (a, b, max = Infinity) => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
};

// How far apart two keys may be and still count as "probably a typo".
// Short names get no slack: "row" and "fly" are not typos of each other.
const typoAllowance = (key) => (key.length >= 10 ? 2 : key.length >= 5 ? 1 : 0);

/**
 * Every exercise the app knows about, from the library and from history,
 * one entry per id:
 *   { id, name, key, muscleGroup, exerciseType, minReps, maxReps, targetSets,
 *     restDuration, weightStep, startingWeight, inLibrary, routineIds,
 *     sessionCount, lastUsedAt }
 * History-only exercises (logged on the fly, or deleted from the library) take
 * their details from the most recent session that logged them. sessionCount
 * and lastUsedAt only count sessions where at least one set was ticked.
 */
export const buildExerciseCatalog = (library = [], routines = [], sessions = []) => {
  const byId = new Map();

  (library || []).forEach((ex) => {
    byId.set(ex.id, {
      ...ex,
      inLibrary: true,
      routineIds: [],
      sessionCount: 0,
      lastUsedAt: null,
      namedAt: Infinity // library names are authoritative
    });
  });

  (sessions || []).forEach((session) => {
    (session.exercises || []).forEach((entry) => {
      if (!entry.exerciseId) return;
      let item = byId.get(entry.exerciseId);
      if (!item) {
        item = {
          id: entry.exerciseId,
          name: entry.name || 'Unknown exercise',
          muscleGroup: entry.muscleGroup || 'Other',
          exerciseType: entry.exerciseType || 'compound',
          minReps: entry.targetRange?.min ?? 8,
          maxReps: entry.targetRange?.max ?? 12,
          targetSets: (entry.sets || []).length || 3,
          restDuration: entry.restDuration || 120,
          weightStep: entry.weightStep,
          inLibrary: false,
          routineIds: [],
          sessionCount: 0,
          lastUsedAt: null,
          namedAt: -Infinity
        };
        byId.set(entry.exerciseId, item);
      }
      // A history-only exercise is described by its most recent appearance.
      if (!item.inLibrary && session.timestamp > item.namedAt) {
        item.namedAt = session.timestamp;
        item.name = entry.name || item.name;
        item.muscleGroup = entry.muscleGroup || item.muscleGroup;
        item.exerciseType = entry.exerciseType || item.exerciseType;
        item.minReps = entry.targetRange?.min ?? item.minReps;
        item.maxReps = entry.targetRange?.max ?? item.maxReps;
        item.targetSets = (entry.sets || []).length || item.targetSets;
        item.restDuration = entry.restDuration || item.restDuration;
        item.weightStep = entry.weightStep ?? item.weightStep;
      }
      if (hasLoggedSets(entry)) {
        item.sessionCount += 1;
        if (item.lastUsedAt === null || session.timestamp > item.lastUsedAt) {
          item.lastUsedAt = session.timestamp;
        }
      }
    });
  });

  [...(routines || [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .forEach((routine) => {
      (routine.exerciseIds || []).forEach((id) => {
        const item = byId.get(id);
        if (item && !item.routineIds.includes(routine.id)) item.routineIds.push(routine.id);
      });
    });

  return [...byId.values()].map((item) => {
    const rest = { ...item };
    delete rest.namedAt;
    return { ...rest, key: exerciseNameKey(item.name) };
  });
};

/**
 * Look a typed name up in the catalog before creating anything.
 * Returns { exact, similar }: `exact` is an entry whose name means the same
 * thing (see exerciseNameKey), `similar` are likely typos of the name.
 */
export const findMatchingExercise = (name, catalog = []) => {
  const key = exerciseNameKey(name);
  if (!key) return { exact: null, similar: [] };
  const exact = pickPreferred(catalog.filter((e) => e.key === key));
  const allowance = typoAllowance(key);
  const similar = allowance === 0 ? [] : catalog
    .filter((e) => e.key !== key && editDistance(e.key, key, allowance) <= allowance)
    .sort(byPreference);
  return { exact, similar: dedupeByKey(similar) };
};

// How carefully a name was typed: capitalised, words spaced out. Only breaks
// ties — "Incline Chest Press" is kept over "incline chestpress" when neither
// is in the library or used more than the other.
const nameCare = (name = '') =>
  (/^[A-Z]/.test(name) ? 2 : 0) + (name.match(/\s/g) || []).length;

// Library entries before history-only ones, then the ones in a session, then
// the most used, then the better-typed name, then the most recent.
const byPreference = (a, b) =>
  (Number(b.inLibrary) - Number(a.inLibrary)) ||
  ((b.routineIds?.length || 0) - (a.routineIds?.length || 0)) ||
  ((b.sessionCount || 0) - (a.sessionCount || 0)) ||
  (nameCare(b.name) - nameCare(a.name)) ||
  ((b.lastUsedAt || 0) - (a.lastUsedAt || 0));

const pickPreferred = (entries) => (entries.length ? [...entries].sort(byPreference)[0] : null);

// One entry per key — the preferred one — so unmerged duplicates don't show
// up twice in a list.
export const dedupeByKey = (entries) => {
  const best = new Map();
  entries.forEach((e) => {
    const current = best.get(e.key);
    if (!current || byPreference(e, current) < 0) best.set(e.key, e);
  });
  return entries.filter((e) => best.get(e.key) === e);
};

/**
 * Filter and rank the catalog for a search box. Matches, best first:
 * same name → name starts with the query → contains it → contains every word
 * of it → probable typo. Ties go to the most recently used. An empty query
 * returns nothing (callers show their grouped list instead).
 */
export const searchExercises = (query, catalog = []) => {
  const key = exerciseNameKey(query);
  if (!key) return [];
  const words = tokens(query);
  const allowance = typoAllowance(key);

  const scored = [];
  catalog.forEach((entry) => {
    let score = null;
    if (entry.key === key) score = 0;
    else if (entry.key.startsWith(key)) score = 1;
    else if (entry.key.includes(key)) score = 2;
    else if (words.length > 1 && words.every((w) => entry.key.includes(w))) score = 3;
    else if (allowance > 0 && editDistance(entry.key.slice(0, key.length + allowance), key, allowance) <= allowance) score = 4;
    if (score !== null) scored.push({ entry, score });
  });

  scored.sort((a, b) =>
    a.score - b.score ||
    ((b.entry.lastUsedAt || 0) - (a.entry.lastUsedAt || 0)) ||
    a.entry.name.localeCompare(b.entry.name)
  );
  return dedupeByKey(scored.map((s) => s.entry));
};

/**
 * Groups of catalog entries that are the same exercise under different
 * spellings (same exerciseNameKey). Each group names the entry to keep —
 * library first, then the one in a session, the most used, the most recent —
 * and the others that would be merged into it.
 * Returns [{ key, target, others: [...] }], most-used groups first.
 */
export const findDuplicateExerciseGroups = (catalog = []) => {
  const groups = new Map();
  catalog.forEach((entry) => {
    if (!entry.key) return;
    if (!groups.has(entry.key)) groups.set(entry.key, []);
    groups.get(entry.key).push(entry);
  });
  return [...groups.values()]
    .filter((members) => members.length > 1)
    .map((members) => {
      const sorted = [...members].sort(byPreference);
      return { key: sorted[0].key, target: sorted[0], others: sorted.slice(1) };
    })
    .sort((a, b) =>
      [b.target, ...b.others].reduce((n, e) => n + (e.sessionCount || 0), 0) -
      [a.target, ...a.others].reduce((n, e) => n + (e.sessionCount || 0), 0)
    );
};

/**
 * Work out what merging `sourceId` into `targetId` changes. Pure: it takes
 * plain arrays and returns the records to write.
 *
 *   - every session that logged the source now logs the target (id, name,
 *     muscle group, type); if a session has both, the source's sets are
 *     appended to the target's entry
 *   - the source's library record is removed; if the target had no library
 *     record, the source's settings carry over under the target's identity
 *   - routines point at the target instead, without listing it twice
 *
 * `target` describes the exercise being kept (a catalog entry).
 * Returns { sessionsToUpdate: [{ id, exercises }], exercisesToPut,
 *           exerciseIdsToDelete, routinesToPut } or null if nothing to do.
 */
export const planExerciseMerge = ({ sessions = [], library = [], routines = [], sourceId, target }) => {
  const targetId = target?.id;
  if (!sourceId || !targetId || sourceId === targetId) return null;

  const targetFields = {
    name: target.name,
    muscleGroup: target.muscleGroup,
    exerciseType: target.exerciseType
  };

  const sessionsToUpdate = [];
  sessions.forEach((session) => {
    const entries = session.exercises || [];
    const srcIdx = entries.findIndex((e) => e.exerciseId === sourceId);
    if (srcIdx === -1) return;
    const tgtIdx = entries.findIndex((e) => e.exerciseId === targetId);

    let next;
    if (tgtIdx === -1) {
      next = entries.map((e, i) => (i === srcIdx
        ? {
            ...e,
            exerciseId: targetId,
            name: targetFields.name || e.name,
            muscleGroup: targetFields.muscleGroup || e.muscleGroup,
            exerciseType: targetFields.exerciseType || e.exerciseType
          }
        : e));
    } else {
      const moved = entries[srcIdx].sets || [];
      next = entries
        .map((e, i) => (i === tgtIdx ? { ...e, sets: [...(e.sets || []), ...moved] } : e))
        .filter((_, i) => i !== srcIdx);
    }
    sessionsToUpdate.push({ id: session.id, exercises: next });
  });

  const sourceRecord = library.find((e) => e.id === sourceId);
  const targetRecord = library.find((e) => e.id === targetId);
  const exerciseIdsToDelete = sourceRecord ? [sourceId] : [];
  const exercisesToPut = !targetRecord && sourceRecord
    ? [{ ...sourceRecord, id: targetId, ...targetFields }]
    : [];

  const routinesToPut = routines
    .filter((r) => (r.exerciseIds || []).includes(sourceId))
    .map((r) => {
      const ids = [];
      r.exerciseIds.forEach((id) => {
        const mapped = id === sourceId ? targetId : id;
        if (!ids.includes(mapped)) ids.push(mapped);
      });
      return { ...r, exerciseIds: ids };
    });

  return { sessionsToUpdate, exercisesToPut, exerciseIdsToDelete, routinesToPut };
};

// Upper-body name patterns, most specific first: "overhead tricep extension"
// is triceps before "overhead" makes it shoulders, "rear delt fly" is
// shoulders before "fly" makes it chest.
const UPPER_GROUPS = [
  ['Triceps', /tricep|push[\s-]*down|skull|kick[\s-]*back|close[\s-]*grip/i],
  ['Shoulders', /shoulder|lateral|overhead|\bohp\b|delt|arnold|military|upright|face[\s-]*pull/i],
  ['Chest', /chest|bench|\bpec|\bfl(y|ye|ies)\b|push[\s-]*up|\bdips?\b|cross[\s-]*over/i],
  ['Lats', /\blats?\b|pull[\s-]*down|pull[\s-]*up|chin[\s-]*up|pull[\s-]*over/i],
  ['Back', /\brows?\b|\bback\b|shrug|deadlift/i],
  ['Abs', /\babs?\b|crunch|plank|sit[\s-]*up|leg[\s-]*raise|\bcore\b/i]
];

// A named body part beats a movement word: "tricep extension" is triceps even
// though "extension" alone would read as a leg extension.
const NAMED_PARTS = [
  ['Triceps', /tricep/i],
  ['Chest', /chest|\bpec/i],
  ['Shoulders', /shoulder|delt/i],
  ['Lats', /\blats?\b/i]
];

/** First guess at a new exercise's muscle group from its name (editable). */
export const guessMuscleGroup = (name) => {
  const text = String(name ?? '');
  if (/leg[\s-]*raise/i.test(text)) return 'Abs';
  const named = NAMED_PARTS.find(([, re]) => re.test(text));
  if (named) return named[0];
  const leg = inferLegMuscleGroup(text);
  if (leg) return leg;
  const hit = UPPER_GROUPS.find(([, re]) => re.test(text));
  return hit ? hit[0] : 'Other';
};

/** First guess at compound vs isolation from the name (editable). */
export const guessExerciseType = (name) =>
  /raise|curl|extension|\bfl(y|ye|ies)\b|push[\s-]*down|kick[\s-]*back|cross[\s-]*over|pec[\s-]*deck|shrug|calf|abduct|adduct|face[\s-]*pull|pull[\s-]*over/i
    .test(String(name ?? ''))
    ? 'isolation'
    : 'compound';
