import { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LEG_EXERCISES, PUSH_ROUTINE_ID, LEGS_ROUTINE_ID } from '../db/workoutDb';
import { ensurePersistentStorage } from '../utils/storagePersistence';
import {
  getLastSessionSets,
  roundWeight,
  buildWorkoutExercise,
  defaultWeightStep
} from '../utils/workoutHelpers';
import {
  buildExerciseCatalog,
  findMatchingExercise,
  planExerciseMerge,
  tidyExerciseName
} from '../utils/exerciseLibrary';
import { retagLegsExercise } from '../db/legsMigration';
import { parseBackup, saveBackupFile, backupFileName } from '../utils/backupFile';
import {
  pickBackupFolder,
  writeBackup,
  isBackupDue,
  ensureWritePermission
} from '../utils/autoBackup';
import {
  GITHUB_CONFIG_KEY,
  GITHUB_STATUS_KEY,
  checkRepo,
  pushBackup,
  fetchRemoteBackup,
  backupFingerprint,
  parseRepo,
  GithubBackupError
} from '../utils/githubBackup';

// The backup folder handle is a live browser object, not data. It lives in the
// preferences table so it survives restarts, but it must never be written into
// an export payload — JSON.stringify would silently turn it into `{}`.
const BACKUP_HANDLE_KEY = 'backupFolderHandle';

// Preferences that describe this device's backup setup rather than the log.
// Never exported (the GitHub token above all — an exported file gets shared),
// and carried across an import so restoring doesn't switch backups off.
const DEVICE_ONLY_PREFS = [BACKUP_HANDLE_KEY, GITHUB_CONFIG_KEY, GITHUB_STATUS_KEY];

// How often app open / return-to-app may check whether GitHub is behind.
const GITHUB_RECHECK_MS = 2 * 60 * 1000;

// localStorage keys for the in-progress session. The workout itself lives here
// rather than in IndexedDB until it's finished; App reads the first key to
// reopen on the Workout tab after the browser has killed the page.
export const CURRENT_WORKOUT_KEY = 'hypertrophy_current_workout';
const REST_END_KEY = 'hypertrophy_rest_end_time';
const REST_TOTAL_KEY = 'hypertrophy_rest_total_ms';

// Read a JSON value from localStorage without letting a corrupt entry take the
// whole app down on startup (JSON.parse throws, and this runs during render).
const readStoredJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const readStoredInt = (key) => {
  try {
    const n = parseInt(localStorage.getItem(key), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
};

const toPlainPreferences = (entries) => {
  const prefs = {};
  entries.forEach((p) => {
    if (!DEVICE_ONLY_PREFS.includes(p.key)) prefs[p.key] = p.value;
  });
  return prefs;
};

// Everything a backup holds, read straight from the database rather than the
// live queries: this runs right after writes the live queries haven't caught.
const readBackupPayload = async () => {
  const [exs, hist, prefEntries, rts] = await Promise.all([
    db.exercises.toArray(),
    db.history.toArray(),
    db.preferences.toArray(),
    db.routines.toArray()
  ]);
  return {
    exercises: exs,
    history: hist,
    preferences: toPlainPreferences(prefEntries),
    routines: rts
  };
};

// --- Automatic backup to GitHub -----------------------------------------------
//
// Module-level rather than inside the hook: it only touches the database, and
// one queue has to serialise every caller (finishing a workout, reopening the
// app, coming back online) so two pushes never race for the same file.

const readPref = async (key) => (await db.preferences.get(key))?.value;

let githubQueue = Promise.resolve();
let lastGithubCheckAt = 0;

const syncToGithubNow = async ({ always = false, overwrite = false } = {}) => {
  const config = await readPref(GITHUB_CONFIG_KEY);
  if (!config?.token) return { status: 'off' };

  const status = (await readPref(GITHUB_STATUS_KEY)) || {};
  const payload = await readBackupPayload();
  const fingerprint = backupFingerprint(payload);

  // Nothing changed since the last save there: no request at all, which is
  // what makes checking on every app open free. After a failed attempt it
  // tries anyway, so the error clears itself once GitHub is reachable again.
  if (!always && !overwrite && status.syncedSha && !status.error && status.fingerprint === fingerprint) {
    return { status: 'unchanged' };
  }

  let result;
  try {
    result = await pushBackup({ config, payload, syncedSha: status.syncedSha || null, overwrite });
  } catch (err) {
    result = {
      status: 'error',
      code: err instanceof GithubBackupError ? err.code : 'http',
      httpStatus: err?.httpStatus ?? null
    };
  }

  // Turned off while the request was in flight: don't leave state behind.
  if (!(await readPref(GITHUB_CONFIG_KEY))) return { status: 'off' };

  const now = Date.now();
  if (result.status === 'pushed') {
    await db.preferences.bulkPut([
      { key: GITHUB_STATUS_KEY, value: { syncedSha: result.sha, fingerprint, lastSuccessAt: now, error: null } },
      { key: 'lastBackupAt', value: now }
    ]);
  } else if (result.status === 'conflict') {
    await db.preferences.put({
      key: GITHUB_STATUS_KEY,
      value: {
        ...status,
        error: 'conflict',
        errorAt: now,
        conflict: { lost: result.lost, sessions: result.remoteSummary.sessions, lastAt: result.remoteSummary.lastAt }
      }
    });
  } else {
    await db.preferences.put({
      key: GITHUB_STATUS_KEY,
      value: { ...status, error: result.code, errorStatus: result.httpStatus, errorAt: now, conflict: null }
    });
  }
  return result;
};

/**
 * Save the log to GitHub if it changed since the last save there. Never
 * throws — it runs in the background, and a failed backup must never look
 * like a failed workout save; failures are recorded for Settings instead.
 *
 * { always } saves even when unchanged (the "Back up now" button).
 * { overwrite } replaces GitHub's copy even if it holds workouts this device
 * doesn't — only ever from the person explicitly choosing that.
 *
 * Resolves to { status: 'off' | 'unchanged' | 'pushed' | 'conflict' | 'error', … }.
 */
// After restoring from GitHub: this device now matches the copy with `sha`.
const markGithubSynced = async (sha) => {
  const payload = await readBackupPayload();
  const now = Date.now();
  await db.preferences.bulkPut([
    { key: GITHUB_STATUS_KEY, value: { syncedSha: sha, fingerprint: backupFingerprint(payload), lastSuccessAt: now, error: null } },
    { key: 'lastBackupAt', value: now }
  ]);
};

const syncToGithub = (options) => {
  const run = githubQueue.then(() => syncToGithubNow(options));
  githubQueue = run.catch(() => {});
  return run.catch((err) => {
    console.warn('GitHub backup failed:', err);
    return { status: 'error', code: 'http' };
  });
};

// Default exercises backup list (for reset/seeding fallback)
const DEFAULT_EXERCISES = [
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
];

// Routines restored by a full data reset, mirroring the fresh-install seed.
const DEFAULT_ROUTINES = [
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
];

// Re-exported for anything that imported it from here before it moved to
// workoutHelpers alongside buildWorkoutExercise.
export { defaultWeightStep };

const newId = (prefix) =>
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;

// Library record for a brand-new exercise. Rep range and sets are sensible
// starting points; everything is editable in Settings.
const newLibraryExercise = ({ name, muscleGroup = 'Other', exerciseType = 'compound' }) => ({
  id: newId('ex'),
  name: tidyExerciseName(name),
  targetSets: 3,
  minReps: 8,
  maxReps: 12,
  isCustom: true,
  muscleGroup,
  exerciseType,
  restDuration: exerciseType === 'isolation' ? 90 : 120,
  weightStep: defaultWeightStep(exerciseType),
  startingWeight: null
});

// The library fields of a catalog entry (drops the derived bookkeeping).
const toLibraryRecord = (entry) => ({
  id: entry.id,
  name: entry.name,
  targetSets: entry.targetSets || 3,
  minReps: entry.minReps ?? 8,
  maxReps: entry.maxReps ?? 12,
  isCustom: true,
  muscleGroup: entry.muscleGroup || 'Other',
  exerciseType: entry.exerciseType || 'compound',
  restDuration: entry.restDuration || (entry.exerciseType === 'isolation' ? 90 : 120),
  weightStep: entry.weightStep || defaultWeightStep(entry.exerciseType),
  startingWeight: entry.startingWeight ?? null
});

export const useWorkoutState = () => {
  // 1. Reactive Queries from IndexedDB using Dexie. The raw results are
  // undefined until the first read resolves; the `|| []` copies below are for
  // consumers, while memos key off the raw (stable) results.
  const exercisesQuery = useLiveQuery(() => db.exercises.toArray());
  const exercises = exercisesQuery || [];

  // Sort history newest to oldest for easy listing
  const historyQuery = useLiveQuery(() => db.history.orderBy('timestamp').reverse().toArray());
  const history = historyQuery || [];

  // Routines in display order (Push, Legs, ...)
  const routinesQuery = useLiveQuery(() => db.routines.orderBy('order').toArray());
  const routines = routinesQuery || [];

  const preferencesObj = useLiveQuery(async () => {
    const arr = await db.preferences.toArray();
    const prefs = { prefLoggingMode: 'RPE' };
    arr.forEach(p => {
      prefs[p.key] = p.value;
    });
    return prefs;
  });
  
  const preferences = preferencesObj || { prefLoggingMode: 'RPE' };

  // Every exercise the app knows — library plus ones that only exist in
  // history — with usage counts and name keys. Feeds the exercise picker,
  // duplicate detection and the exercise page.
  const catalog = useMemo(
    () => buildExerciseCatalog(exercisesQuery || [], routinesQuery || [], historyQuery || []),
    [exercisesQuery, routinesQuery, historyQuery]
  );

  // 2. LocalStorage for transient/active session data (Refreshes safe)
  const [currentWorkout, setCurrentWorkout] = useState(() => {
    const saved = readStoredJson(CURRENT_WORKOUT_KEY);
    return saved && Array.isArray(saved.exercises) ? saved : null;
  });

  const [restEndTime, setRestEndTime] = useState(() => readStoredInt(REST_END_KEY));

  // How long the current rest interval is, so the UI can show elapsed as a
  // proportion rather than a bare countdown. Persisted alongside the end time —
  // without it a reload mid-rest would have no denominator.
  const [restTotalMs, setRestTotalMs] = useState(() => readStoredInt(REST_TOTAL_KEY) || 0);

  // Durable-storage status: null = unknown/not yet checked, true = persisted,
  // false = best-effort (browser may evict under disk pressure).
  const [storagePersisted, setStoragePersisted] = useState(null);

  // Set while a finished workout is being written, so a second tap on Finish
  // can't save it twice.
  const completingRef = useRef(false);

  // Keep transient data saved
  useEffect(() => {
    if (currentWorkout) {
      localStorage.setItem(CURRENT_WORKOUT_KEY, JSON.stringify(currentWorkout));
    } else {
      localStorage.removeItem(CURRENT_WORKOUT_KEY);
    }
  }, [currentWorkout]);

  useEffect(() => {
    if (restEndTime) {
      localStorage.setItem(REST_END_KEY, restEndTime.toString());
    } else {
      localStorage.removeItem(REST_END_KEY);
    }
  }, [restEndTime]);

  useEffect(() => {
    if (restTotalMs) {
      localStorage.setItem(REST_TOTAL_KEY, restTotalMs.toString());
    } else {
      localStorage.removeItem(REST_TOTAL_KEY);
    }
  }, [restTotalMs]);

  // Ask the browser to keep our IndexedDB data durable (exempt from automatic
  // eviction). Runs once on load; the result is surfaced in Settings.
  useEffect(() => {
    let active = true;
    ensurePersistentStorage().then((res) => {
      if (active) setStoragePersisted(res.supported ? res.persisted : null);
    });
    return () => { active = false; };
  }, []);

  // Manual re-request (from the Settings "Enable" button).
  const requestPersistentStorage = async () => {
    const res = await ensurePersistentStorage();
    const status = res.supported ? res.persisted : null;
    setStoragePersisted(status);
    return status;
  };

  // 3. Automatic data migration from localStorage to IndexedDB
  useEffect(() => {
    const runMigration = async () => {
      try {
        const dbExercisesCount = await db.exercises.count();
        const dbHistoryCount = await db.history.count();
        
        const oldExercisesRaw = localStorage.getItem('hypertrophy_exercises');
        const oldHistoryRaw = localStorage.getItem('hypertrophy_history');
        const oldPrefRaw = localStorage.getItem('hypertrophy_preferences');
        
        // Migrate Exercises Configuration
        if (oldExercisesRaw && dbExercisesCount <= 3) {
          const oldExs = JSON.parse(oldExercisesRaw);
          // Empty seed data to copy exact settings from old localStorage
          await db.exercises.clear();
          const migratedExs = oldExs.map(ex => {
            const copy = { ...ex };
            if (!('muscleGroup' in copy)) {
              copy.muscleGroup = copy.id === 'db-shoulder-press' || copy.id === 'lateral-raises' ? 'Shoulders' : copy.id === 'db-chest-press' ? 'Chest' : 'Triceps';
            }
            if (!('exerciseType' in copy)) {
              copy.exerciseType = copy.id === 'lateral-raises' ? 'isolation' : 'compound';
            }
            if (!('restDuration' in copy)) {
              copy.restDuration = copy.exerciseType === 'isolation' ? 90 : 120;
            }
            if (!('weightStep' in copy)) {
              copy.weightStep = defaultWeightStep(copy.exerciseType);
            }
            return copy;
          });
          await db.exercises.bulkAdd(migratedExs);
          console.log('Exercises migrated to IndexedDB successfully.');
        }
        
        // Migrate Completed History Logs
        if (oldHistoryRaw && dbHistoryCount === 0) {
          const oldHist = JSON.parse(oldHistoryRaw);
          const migratedHist = oldHist.map(session => ({
            ...session,
            exercises: session.exercises.map(ex => ({
              ...ex,
              muscleGroup: ex.muscleGroup || (ex.exerciseId === 'db-shoulder-press' || ex.exerciseId === 'lateral-raises' ? 'Shoulders' : ex.exerciseId === 'db-chest-press' ? 'Chest' : 'Triceps'),
              sets: ex.sets.map(set => ({
                weight: parseFloat(set.weight) || 0,
                reps: parseInt(set.reps) || 0,
                isWarmup: set.isWarmup !== undefined ? !!set.isWarmup : false,
                completed: set.completed !== undefined ? !!set.completed : true,
                rpe: set.rpe !== undefined ? set.rpe : null,
                rir: set.rir !== undefined ? set.rir : null
              }))
            }))
          }));
          await db.history.bulkAdd(migratedHist);
          console.log('History logs migrated to IndexedDB successfully.');
        }

        // Migrate Preferences
        if (oldPrefRaw) {
          const oldPrefs = JSON.parse(oldPrefRaw);
          if (oldPrefs.prefLoggingMode) {
            await db.preferences.put({ key: 'prefLoggingMode', value: oldPrefs.prefLoggingMode });
          }
        }

        // Backfill weightStep on any existing exercises that predate the field,
        // so the whole-kg stepper always has a sensible increment to use.
        const allExs = await db.exercises.toArray();
        const needStep = allExs.filter((ex) => typeof ex.weightStep !== 'number');
        if (needStep.length > 0) {
          await Promise.all(
            needStep.map((ex) =>
              db.exercises.update(ex.id, { weightStep: defaultWeightStep(ex.exerciseType) })
            )
          );
        }

        // Clear migrated localStorage parameters to prevent re-runs
        localStorage.removeItem('hypertrophy_exercises');
        localStorage.removeItem('hypertrophy_history');
        localStorage.removeItem('hypertrophy_preferences');
      } catch (err) {
        console.error('IndexedDB data migration failed:', err);
      }
    };

    runMigration();
  }, []);

  // Update preferences helper
  const updatePreference = async (key, value) => {
    await db.preferences.put({ key, value });
  };

  // --- Automatic backup ----------------------------------------------------

  const writeBackupNow = async (handle) => {
    const payload = await readBackupPayload();
    const name = await writeBackup(handle, payload);
    if (name) await db.preferences.put({ key: 'lastBackupAt', value: Date.now() });
    return name;
  };

  // Choose the folder. Must run from a click — the picker requires a gesture.
  const chooseBackupFolder = async () => {
    const handle = await pickBackupFolder();
    if (!handle) return null;
    await db.preferences.put({ key: BACKUP_HANDLE_KEY, value: handle });
    // Write one immediately, so the setup is proven rather than assumed.
    await writeBackupNow(handle);
    return handle.name;
  };

  const forgetBackupFolder = async () => {
    await db.preferences.delete(BACKUP_HANDLE_KEY);
  };

  // Called after a workout is saved. Silent by design: no folder, no permission,
  // or not yet due are all normal states, not failures worth interrupting for.
  const maybeAutoBackup = async () => {
    const stored = await db.preferences.get(BACKUP_HANDLE_KEY);
    const handle = stored?.value;
    if (!handle) return null;

    const lastAt = (await db.preferences.get('lastBackupAt'))?.value || null;
    if (!isBackupDue(lastAt, Date.now())) return null;
    if (!(await ensureWritePermission(handle))) return null;

    return writeBackupNow(handle);
  };

  // GitHub: check on open, on coming back to the app, and on reconnecting.
  // Each check is free unless the log changed (see syncToGithubNow), so this
  // also catches up a push that was cut off — finishing a workout with no
  // signal in the gym, or closing the app before the upload finished.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastGithubCheckAt < GITHUB_RECHECK_MS) return;
      lastGithubCheckAt = now;
      syncToGithub();
    };
    const onOnline = () => {
      lastGithubCheckAt = 0;
      check();
    };
    // Give startup (migrations, the first live queries) a moment first.
    const timer = setTimeout(check, 3000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', onOnline);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Connect a repo: check the token can see it, save the setup, then back up
  // straight away so it's proven rather than assumed. If the repo already has
  // a backup with workouts this device lacks (a new phone, a reset), that
  // first save is refused and Settings offers to restore it instead.
  const connectGithubBackup = async ({ repo, token }) => {
    const parsed = parseRepo(repo);
    if (!parsed) return { status: 'error', code: 'bad-repo' };
    const cleanToken = (token || '').trim();
    if (!cleanToken) return { status: 'error', code: 'no-token' };

    let info;
    try {
      info = await checkRepo({ ...parsed, token: cleanToken });
    } catch (err) {
      return { status: 'error', code: err?.code || 'http', httpStatus: err?.httpStatus ?? null };
    }

    const [owner, name] = (info.fullName || '').split('/');
    await db.preferences.bulkPut([
      {
        key: GITHUB_CONFIG_KEY,
        value: { owner: owner || parsed.owner, repo: name || parsed.repo, token: cleanToken, isPrivate: info.isPrivate }
      },
      { key: GITHUB_STATUS_KEY, value: {} }
    ]);

    lastGithubCheckAt = Date.now();
    const result = await syncToGithub({ always: true });
    // A token that can't write (or stopped working) isn't a setup worth
    // keeping: undo it so the form can show what to fix.
    if (result.status === 'error' && ['read-only', 'bad-token', 'no-access'].includes(result.code)) {
      await db.preferences.bulkDelete([GITHUB_CONFIG_KEY, GITHUB_STATUS_KEY]);
    }
    return result;
  };

  const disconnectGithubBackup = async () => {
    await db.preferences.bulkDelete([GITHUB_CONFIG_KEY, GITHUB_STATUS_KEY]);
  };

  const backUpToGithubNow = () => syncToGithub({ always: true });

  // The person chose to replace GitHub's copy with this device's data.
  const replaceGithubBackup = () => syncToGithub({ overwrite: true });

  // Fetch and check the backup in the repo, for the restore confirmation.
  // Returns { ok: true, data, summary, sha } or { ok: false, code }.
  const fetchGithubBackup = async () => {
    const config = await readPref(GITHUB_CONFIG_KEY);
    if (!config?.token) return { ok: false, code: 'off' };
    try {
      return { ok: true, ...(await fetchRemoteBackup(config)) };
    } catch (err) {
      return { ok: false, code: err?.code || 'http', httpStatus: err?.httpStatus ?? null };
    }
  };

  // Restore a fetched GitHub backup, then record that this device now matches
  // that copy — so the next save writes over it normally rather than seeing
  // a copy it didn't write.
  const restoreFromGithub = async (data, sha) => {
    const ok = await importData(data);
    if (!ok) return false;
    await markGithubSynced(sha);
    return true;
  };

  // Rest Timer controls
  const startRestTimer = (seconds) => {
    setRestEndTime(Date.now() + seconds * 1000);
    setRestTotalMs(seconds * 1000);
  };

  const extendRestTimer = (seconds) => {
    const nowMs = Date.now();
    const expired = !restEndTime || restEndTime <= nowMs;
    setRestEndTime((expired ? nowMs : restEndTime) + seconds * 1000);
    // Extending a running rest lengthens the interval, so the rule refills
    // rather than overflowing past full. After it has run out, +30s is a new
    // 30-second interval — adding to the spent total would start the rule
    // nearly empty.
    setRestTotalMs(expired ? seconds * 1000 : restTotalMs + seconds * 1000);
  };

  const clearRestTimer = () => {
    setRestEndTime(null);
    setRestTotalMs(0);
  };

  // Helper: heaviest weight from the most recent session in which this
  // exercise was actually done. Built on getLastSessionSets, which ignores
  // unticked sets — they still hold the prefilled weight, so an exercise that
  // was skipped used to pose as "last time" and seed the next prefill with a
  // weight that had never been lifted. Returns null when nothing is logged, so
  // callers can distinguish "no history" from "lifted 0 kg".
  const getLastLoggedWeight = (exerciseId) => {
    const last = getLastSessionSets(exerciseId, history);
    return last ? Math.max(...last.sets.map((s) => s.weight)) : null;
  };

  // Start a new workout session for a routine.
  //
  // The routine's exerciseIds decide both *which* exercises appear and in what
  // order. If the id is unknown (or omitted) we fall back to the whole library,
  // which is exactly the pre-routines behaviour — so a missing routine degrades
  // to a valid session rather than an empty one.
  const startWorkout = (routineId) => {
    const routine = routines.find((r) => r.id === routineId);

    const sourceExercises = routine
      ? routine.exerciseIds
          .map((id) => exercises.find((ex) => ex.id === id))
          .filter(Boolean)
      : exercises;

    if (sourceExercises.length === 0) return;

    // Prefill anchors on the heaviest weight ever completed, with a fallback
    // to the last session actually done when that best has gone stale — see
    // buildWorkoutExercise. Date.now() is safe here (event handler, not render).
    const startedAt = Date.now();
    const workoutExercises = sourceExercises.map((ex) => buildWorkoutExercise(ex, history, startedAt));

    setCurrentWorkout({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      startTime: startedAt,
      routineId: routine?.id || null,
      // Denormalised so history stays readable if the routine is later
      // renamed or deleted.
      routineName: routine?.name || null,
      exercises: workoutExercises
    });
  };

  // Start with no exercises and add them from the list as you go.
  const startEmptyWorkout = () => {
    setCurrentWorkout({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      startTime: Date.now(),
      routineId: null,
      routineName: null,
      exercises: []
    });
  };

  // Cancel current workout
  const cancelWorkout = () => {
    setCurrentWorkout(null);
    clearRestTimer();
  };

  // --- Exercise library -----------------------------------------------------

  // Make sure an exercise has a library record, so every future use shares its
  // id (and therefore its history). Exercises that only exist in history —
  // added on the fly before, or deleted from the library — are adopted under
  // their existing id, which reconnects them to what was logged.
  const ensureInLibrary = async (entry) => {
    if (!entry?.id) return null;
    const existing = await db.exercises.get(entry.id);
    if (existing) return existing;
    const record = toLibraryRecord(entry);
    await db.exercises.put(record);
    return record;
  };

  // Create a new library exercise — unless the name is one the app already
  // knows under another spelling, in which case that exercise is returned
  // (and adopted into the library if it only lived in history). The pickers
  // check first too; this is the last line against duplicates.
  const createExercise = async ({ name, muscleGroup, exerciseType }) => {
    const clean = tidyExerciseName(name);
    if (!clean) return null;
    const { exact } = findMatchingExercise(clean, catalog);
    if (exact) return ensureInLibrary(exact);
    const record = newLibraryExercise({ name: clean, muscleGroup, exerciseType });
    await db.exercises.add(record);
    return record;
  };

  // --- Changing today's workout (never the saved session) -------------------

  // Add an exercise to the running workout, prefilled from its history the
  // same way a session prefills. Already in today's workout: no-op.
  const addExerciseToActive = async (entry) => {
    if (!currentWorkout || !entry?.id) return;
    if (currentWorkout.exercises.some((ex) => ex.exerciseId === entry.id)) return;
    const def = (await ensureInLibrary(entry)) || entry;
    const built = buildWorkoutExercise(def, history, Date.now());
    setCurrentWorkout((prev) => (
      !prev || prev.exercises.some((ex) => ex.exerciseId === built.exerciseId)
        ? prev
        : { ...prev, exercises: [...prev.exercises, built] }
    ));
  };

  const moveActiveExercise = (exerciseId, delta) => {
    setCurrentWorkout((prev) => {
      if (!prev) return prev;
      const from = prev.exercises.findIndex((ex) => ex.exerciseId === exerciseId);
      const to = from + delta;
      if (from === -1 || to < 0 || to >= prev.exercises.length) return prev;
      const next = [...prev.exercises];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...prev, exercises: next };
    });
  };

  const removeActiveExercise = (exerciseId) => {
    setCurrentWorkout((prev) => (
      prev ? { ...prev, exercises: prev.exercises.filter((ex) => ex.exerciseId !== exerciseId) } : prev
    ));
  };

  // Complete current workout. Returns the saved session, or null when there
  // was nothing to save or a save is already running (a double tap on Finish
  // used to write the same session twice and fail on the duplicate id). If
  // the database write throws, the workout stays open and the error goes to
  // the caller.
  const completeWorkout = async () => {
    if (!currentWorkout || completingRef.current) return null;
    completingRef.current = true;
    try {
      return await saveCompletedWorkout(currentWorkout);
    } finally {
      completingRef.current = false;
    }
  };

  const saveCompletedWorkout = async (workout) => {
    const sanitizedExercises = workout.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((set) => {
        let finalRpe = set.rpe !== '' && set.rpe !== null ? parseFloat(set.rpe) : null;
        let finalRir = set.rir !== '' && set.rir !== null ? parseInt(set.rir) : null;

        if (finalRpe === null && finalRir !== null) {
          finalRpe = 10 - finalRir;
        } else if (finalRir === null && finalRpe !== null) {
          finalRir = 10 - finalRpe;
        }

        return {
          weight: parseFloat(set.weight) || 0,
          reps: parseInt(set.reps) || 0,
          isWarmup: !!set.isWarmup,
          completed: !!set.completed,
          rpe: finalRpe,
          rir: finalRir
        };
      })
    })).filter(ex => ex.sets.length > 0);

    const completedSession = {
      id: workout.id,
      timestamp: Date.now(),
      duration: Math.round((Date.now() - workout.startTime) / 1000 / 60),
      routineId: workout.routineId || null,
      routineName: workout.routineName || null,
      exercises: sanitizedExercises
    };

    // Add to IndexedDB history store
    await db.history.add(completedSession);
    setCurrentWorkout(null);
    clearRestTimer();

    // Finishing a workout is the natural checkpoint: the data just changed and
    // we're inside a user gesture, which is when file writes are permitted.
    // Best-effort — a failed backup must never look like a failed save.
    maybeAutoBackup().catch((err) => console.warn('Automatic backup failed:', err));
    lastGithubCheckAt = Date.now();
    syncToGithub();

    return completedSession;
  };

  // Edit a completed session in history (sets, exercises, date, duration).
  // Sets are sanitized the same way completeWorkout does it, so downstream
  // consumers (volume, PBs, analytics) can keep assuming clean numbers.
  const updateHistorySession = async (sessionId, updates) => {
    const changes = {};

    if (updates.exercises) {
      changes.exercises = updates.exercises
        .map((ex) => ({
          ...ex,
          sets: ex.sets.map((set) => ({
            // Same half-kilo grid as live logging, so an edit can't store 12.3
            weight: roundWeight(set.weight),
            reps: parseInt(set.reps) || 0,
            isWarmup: !!set.isWarmup,
            completed: !!set.completed,
            rpe: set.rpe === '' || set.rpe === undefined ? null : set.rpe,
            rir: set.rir === '' || set.rir === undefined ? null : set.rir
          }))
        }))
        .filter((ex) => ex.sets.length > 0);
    }

    if (updates.timestamp !== undefined) {
      const ts = new Date(updates.timestamp).getTime();
      if (!Number.isNaN(ts)) changes.timestamp = ts;
    }

    if (updates.duration !== undefined) {
      changes.duration = Math.max(0, parseInt(updates.duration) || 0);
    }

    await db.history.update(sessionId, changes);
    syncToGithub();
  };

  // Remove a session from history entirely — for a test session, a duplicate,
  // or one finished by accident. The UI confirms before calling this.
  const deleteHistorySession = async (sessionId) => {
    await db.history.delete(sessionId);
    syncToGithub();
  };

  // Edit active workout sets.
  //
  // Whether ticking this set should start the rest timer is decided up front
  // from the rendered state, not inside the setState updater: React may defer
  // an updater until the next render (always, once another update is queued in
  // the same tick) and may run it twice in StrictMode, so a flag written from
  // inside it was read before it was set. The updater itself stays pure.
  const updateSet = (exerciseId, setIndex, field, value) => {
    if (!currentWorkout) return;

    const activeEx = currentWorkout.exercises.find((ex) => ex.exerciseId === exerciseId);
    const target = activeEx?.sets?.[setIndex];
    const startsRest = field === 'completed' && value === true && !!target && !target.completed;
    const configEx = exercises.find((e) => e.id === exerciseId);
    const restSeconds = activeEx?.restDuration || configEx?.restDuration ||
      (activeEx?.exerciseType === 'isolation' ? 90 : 120);
    const completedAt = field === 'completed' ? (value === true ? Date.now() : null) : undefined;

    let val = value;
    if (field === 'reps') {
      val = value === '' ? '' : parseInt(value) || 0;
    } else if (field === 'rpe') {
      val = value === '' ? '' : parseFloat(value);
    } else if (field === 'rir') {
      val = value === '' ? '' : parseInt(value);
    }

    setCurrentWorkout((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((set, idx) => {
            if (idx !== setIndex) return set;
            return completedAt === undefined
              ? { ...set, [field]: val }
              : { ...set, [field]: val, completedAt };
          })
        };
      })
    }));

    if (startsRest) {
      startRestTimer(restSeconds);
    }
  };

  // Add set to active workout
  const addSetToActive = (exerciseId) => {
    if (!currentWorkout) return;

    setCurrentWorkout((prev) => {
      const updatedExercises = prev.exercises.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;

        const lastSet = ex.sets[ex.sets.length - 1];
        const newSet = lastSet
          ? { ...lastSet, completed: false, completedAt: null, rpe: '', rir: '' }
          : {
              weight: getLastLoggedWeight(exerciseId) ?? '',
              reps: ex.targetRange.min,
              completed: false, 
              isWarmup: false, 
              rpe: '', 
              rir: '',
              completedAt: null 
            };

        return {
          ...ex,
          sets: [...ex.sets, newSet]
        };
      });

      return {
        ...prev,
        exercises: updatedExercises
      };
    });
  };

  // Remove set from active workout
  const removeSetFromActive = (exerciseId, setIndex) => {
    if (!currentWorkout) return;

    setCurrentWorkout((prev) => {
      const updatedExercises = prev.exercises.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;
        const updatedSets = ex.sets.filter((_, idx) => idx !== setIndex);
        return {
          ...ex,
          sets: updatedSets
        };
      });

      return {
        ...prev,
        exercises: updatedExercises
      };
    });
  };

  // Add a custom exercise to the global library and attach it to a routine.
  //
  // The routine attachment matters: an exercise that belongs to no routine can
  // never appear in a session, so it would look silently broken. When no
  // routine is given we append to the first one rather than orphan it.
  const addExerciseToConfig = async (name, targetSets = 4, minReps = 10, maxReps = 12, muscleGroup = 'Other', exerciseType = 'compound', restDuration = 120, weightStep, routineId, startingWeight) => {
    if (!name.trim()) return;
    const id = `custom-config-${Date.now()}`;
    const parsedStep = roundWeight(weightStep);
    const parsedStart = roundWeight(startingWeight);
    const newEx = {
      id,
      name: name.trim(),
      targetSets: parseInt(targetSets) || 4,
      minReps: parseInt(minReps) || 10,
      maxReps: parseInt(maxReps) || 12,
      isCustom: true,
      muscleGroup,
      exerciseType,
      restDuration: parseInt(restDuration) || 120,
      weightStep: parsedStep > 0 ? parsedStep : defaultWeightStep(exerciseType),
      startingWeight: parsedStart > 0 ? parsedStart : null
    };
    await db.exercises.add(newEx);

    const target = routines.find((r) => r.id === routineId) || routines[0];
    if (target) {
      await db.routines.update(target.id, {
        exerciseIds: [...target.exerciseIds, id]
      });
    }
  };

  // Update exercise in global config
  const updateExerciseInConfig = async (id, updatedFields) => {
    await db.exercises.update(id, updatedFields);
  };

  // Delete exercise from global config, and drop it from any routine that
  // referenced it — otherwise the routine keeps a dangling id forever.
  const deleteExerciseFromConfig = async (id) => {
    await db.transaction('rw', [db.exercises, db.routines], async () => {
      await db.exercises.delete(id);

      const affected = await db.routines
        .filter((r) => r.exerciseIds.includes(id))
        .toArray();

      await Promise.all(
        affected.map((r) =>
          db.routines.update(r.id, {
            exerciseIds: r.exerciseIds.filter((exId) => exId !== id)
          })
        )
      );
    });
  };

  // --- Routine management --------------------------------------------------

  const addRoutine = async (name) => {
    if (!name.trim()) return;
    const maxOrder = routines.reduce((max, r) => Math.max(max, r.order ?? 0), -1);
    await db.routines.add({
      id: `routine-${Date.now()}`,
      name: name.trim(),
      exerciseIds: [],
      order: maxOrder + 1
    });
  };

  const renameRoutine = async (routineId, name) => {
    if (!name.trim()) return;
    await db.routines.update(routineId, { name: name.trim() });
  };

  const deleteRoutine = async (routineId) => {
    await db.routines.delete(routineId);
  };

  // Add/remove an exercise's membership in a routine without touching the
  // exercise itself — the library is shared, routines just reference it.
  const setExerciseInRoutine = async (routineId, exerciseId, member) => {
    const routine = routines.find((r) => r.id === routineId);
    if (!routine) return;

    const has = routine.exerciseIds.includes(exerciseId);
    if (member === has) return;

    await db.routines.update(routineId, {
      exerciseIds: member
        ? [...routine.exerciseIds, exerciseId]
        : routine.exerciseIds.filter((id) => id !== exerciseId)
    });
  };

  // Move an exercise within a saved session (Settings → Sessions → Order).
  const moveExerciseInRoutine = async (routineId, exerciseId, delta) => {
    const routine = routines.find((r) => r.id === routineId);
    if (!routine) return;
    const ids = [...routine.exerciseIds];
    const from = ids.indexOf(exerciseId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    ids.splice(from, 1);
    ids.splice(to, 0, exerciseId);
    await db.routines.update(routineId, { exerciseIds: ids });
  };

  // Merge exercises that are the same lift under different names into
  // `target` (a catalog entry). History is rewritten — every session that
  // logged a source now logs the target — in one transaction, so it either
  // all happens or none of it does. See planExerciseMerge for the details.
  const mergeExercises = async (sourceIds, target) => {
    const sources = (sourceIds || []).filter((id) => id && id !== target?.id);
    if (!target?.id || sources.length === 0) return false;

    await db.transaction('rw', [db.history, db.exercises, db.routines], async () => {
      let sessions = await db.history.toArray();
      let library = await db.exercises.toArray();
      let savedRoutines = await db.routines.toArray();

      for (const sourceId of sources) {
        const plan = planExerciseMerge({ sessions, library, routines: savedRoutines, sourceId, target });
        if (!plan) continue;

        for (const u of plan.sessionsToUpdate) {
          await db.history.update(u.id, { exercises: u.exercises });
        }
        if (plan.exerciseIdsToDelete.length) await db.exercises.bulkDelete(plan.exerciseIdsToDelete);
        if (plan.exercisesToPut.length) await db.exercises.bulkPut(plan.exercisesToPut);
        if (plan.routinesToPut.length) await db.routines.bulkPut(plan.routinesToPut);

        // Keep the working copies current for the next source in the batch.
        const updated = new Map(plan.sessionsToUpdate.map((u) => [u.id, u.exercises]));
        sessions = sessions.map((sess) => (updated.has(sess.id) ? { ...sess, exercises: updated.get(sess.id) } : sess));
        library = library
          .filter((ex) => !plan.exerciseIdsToDelete.includes(ex.id))
          .concat(plan.exercisesToPut.filter((ex) => !library.some((l) => l.id === ex.id)));
        const routinesById = new Map(plan.routinesToPut.map((r) => [r.id, r]));
        savedRoutines = savedRoutines.map((r) => routinesById.get(r.id) || r);
      }
    });

    // A workout in progress that includes a merged exercise follows it too.
    setCurrentWorkout((prev) => {
      if (!prev || !prev.exercises.some((ex) => sources.includes(ex.exerciseId))) return prev;
      const hasTarget = prev.exercises.some((ex) => ex.exerciseId === target.id);
      let placed = hasTarget;
      return {
        ...prev,
        exercises: prev.exercises
          .map((ex) => {
            if (!sources.includes(ex.exerciseId)) return ex;
            if (placed) return null; // target already here: drop the duplicate card
            placed = true;
            return { ...ex, exerciseId: target.id, name: target.name };
          })
          .filter(Boolean)
      };
    });
    return true;
  };

  // Export data as JSON.
  //
  // Built from the in-memory copies rather than a fresh database read: on iOS
  // the share sheet only opens straight from the tap, and an await on
  // IndexedDB first can cost the gesture. The file goes out through the share
  // sheet on phones ("Save to Files") and as a plain download elsewhere — the
  // old data: URI link did nothing reliable in an iOS home-screen app while
  // still stamping "backed up", which silenced the warning with no file saved.
  // Returns 'shared' | 'downloaded' | 'cancelled'.
  const exportData = async () => {
    const plainPrefs = toPlainPreferences(
      Object.entries(preferences).map(([key, value]) => ({ key, value }))
    );
    const dataStr = JSON.stringify({ exercises, history, preferences: plainPrefs, routines });

    const result = await saveBackupFile(dataStr, backupFileName(new Date()));

    // Remember when the last backup was taken so the Dashboard can nudge when
    // it goes stale — but not when the share sheet was dismissed unsaved.
    if (result !== 'cancelled') {
      await db.preferences.put({ key: 'lastBackupAt', value: Date.now() });
    }
    return result;
  };

  // Import a backup into IndexedDB, replacing what's there. Accepts JSON text
  // or an object; either way it is validated by parseBackup first, so a file
  // that isn't a backup (or `{}`) is rejected instead of "succeeding" while
  // quietly wiping nothing — or half the log. The write is one transaction:
  // it lands completely or not at all.
  const importData = async (jsonData) => {
    try {
      const checked = parseBackup(jsonData);
      if (!checked.ok) {
        console.error('Backup rejected:', checked.error);
        return false;
      }
      const parsed = checked.data;

      await db.transaction('rw', [db.exercises, db.history, db.preferences, db.routines], async () => {
        if (parsed.exercises && Array.isArray(parsed.exercises)) {
          await db.exercises.clear();
          // Backups from before the quads/hamstrings split may carry the
          // retired 'Legs' tag; relabel on the way in so Settings shows the
          // real group. Nothing else about the backup is altered.
          await db.exercises.bulkAdd(parsed.exercises.map(retagLegsExercise));
        }
        if (parsed.history && Array.isArray(parsed.history)) {
          await db.history.clear();
          await db.history.bulkAdd(parsed.history);
        }
        // Backups taken before routines existed have no `routines` key. Rather
        // than leave the user with zero routines (and so no way to start a
        // session), rebuild a single routine holding the imported library.
        if (parsed.routines && Array.isArray(parsed.routines)) {
          await db.routines.clear();
          await db.routines.bulkAdd(parsed.routines);
        } else if (parsed.exercises && Array.isArray(parsed.exercises)) {
          await db.routines.clear();
          await db.routines.add({
            id: PUSH_ROUTINE_ID,
            name: 'Push',
            exerciseIds: parsed.exercises.map((ex) => ex.id),
            order: 0
          });
        }
        if (parsed.preferences) {
          // The backup folder and the GitHub setup are device configuration,
          // not restorable data — carry them across so restoring a backup
          // doesn't silently disable future backups.
          const kept = (await db.preferences.bulkGet(DEVICE_ONLY_PREFS)).filter(Boolean);
          await db.preferences.clear();
          const prefArray = Object.entries(parsed.preferences)
            .filter(([key]) => !DEVICE_ONLY_PREFS.includes(key))
            .map(([key, value]) => ({ key, value }));
          await db.preferences.bulkPut(prefArray);
          if (kept.length > 0) await db.preferences.bulkPut(kept);
        }
      });
      return true;
    } catch (e) {
      console.error('Error importing data into IndexedDB:', e);
      return false;
    }
  };

  // Reset all data
  const clearAllData = async () => {
    await db.transaction('rw', [db.exercises, db.history, db.preferences, db.routines], async () => {
      await db.exercises.clear();
      await db.history.clear();
      await db.preferences.clear();
      await db.routines.clear();
      await db.exercises.bulkAdd(DEFAULT_EXERCISES);
      await db.routines.bulkAdd(DEFAULT_ROUTINES);
      await db.preferences.add({ key: 'prefLoggingMode', value: 'RPE' });
    });
    localStorage.removeItem(CURRENT_WORKOUT_KEY);
    localStorage.removeItem(REST_END_KEY);
    localStorage.removeItem(REST_TOTAL_KEY);
    setCurrentWorkout(null);
    clearRestTimer();
  };

  return {
    exercises,
    history,
    routines,
    currentWorkout,
    preferences,
    restEndTime,
    restTotalMs,
    updatePreference,
    startRestTimer,
    extendRestTimer,
    clearRestTimer,
    startWorkout,
    startEmptyWorkout,
    cancelWorkout,
    completeWorkout,
    updateHistorySession,
    deleteHistorySession,
    updateSet,
    addSetToActive,
    removeSetFromActive,
    addExerciseToActive,
    moveActiveExercise,
    removeActiveExercise,
    catalog,
    createExercise,
    ensureInLibrary,
    mergeExercises,
    moveExerciseInRoutine,
    addExerciseToConfig,
    updateExerciseInConfig,
    deleteExerciseFromConfig,
    addRoutine,
    renameRoutine,
    deleteRoutine,
    setExerciseInRoutine,
    exportData,
    importData,
    clearAllData,
    storagePersisted,
    requestPersistentStorage,
    chooseBackupFolder,
    forgetBackupFolder,
    backupFolderName: preferences?.[BACKUP_HANDLE_KEY]?.name || null,
    // The token stays in here; the UI only ever gets the repo's name.
    githubRepo: preferences?.[GITHUB_CONFIG_KEY]
      ? {
          fullName: `${preferences[GITHUB_CONFIG_KEY].owner}/${preferences[GITHUB_CONFIG_KEY].repo}`,
          isPrivate: !!preferences[GITHUB_CONFIG_KEY].isPrivate
        }
      : null,
    githubStatus: preferences?.[GITHUB_STATUS_KEY] || null,
    connectGithubBackup,
    disconnectGithubBackup,
    backUpToGithubNow,
    replaceGithubBackup,
    fetchGithubBackup,
    restoreFromGithub
  };
};
