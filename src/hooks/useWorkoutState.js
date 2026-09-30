import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LEG_EXERCISES, PUSH_ROUTINE_ID, LEGS_ROUTINE_ID } from '../db/workoutDb';
import { ensurePersistentStorage } from '../utils/storagePersistence';
import {
  getAllTimeBest,
  getLastSessionSets,
  isBestStale,
  roundWeight
} from '../utils/workoutHelpers';
import { retagLegsExercise } from '../db/legsMigration';
import { parseBackup, saveBackupFile, backupFileName } from '../utils/backupFile';
import {
  pickBackupFolder,
  writeBackup,
  isBackupDue,
  ensureWritePermission
} from '../utils/autoBackup';

// The backup folder handle is a live browser object, not data. It lives in the
// preferences table so it survives restarts, but it must never be written into
// an export payload — JSON.stringify would silently turn it into `{}`.
const BACKUP_HANDLE_KEY = 'backupFolderHandle';

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
    if (p.key !== BACKUP_HANDLE_KEY) prefs[p.key] = p.value;
  });
  return prefs;
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

// Default whole-kg weight increment for an exercise: compounds jump in 2 kg,
// isolations in 1 kg. Used when an exercise has no explicit weightStep yet.
export const defaultWeightStep = (exerciseType) =>
  exerciseType === 'isolation' ? 1 : 2;

export const useWorkoutState = () => {
  // 1. Reactive Queries from IndexedDB using Dexie
  const exercises = useLiveQuery(() => db.exercises.toArray()) || [];
  
  // Sort history newest to oldest for easy listing
  const history = useLiveQuery(() => db.history.orderBy('timestamp').reverse().toArray()) || [];

  // Routines in display order (Push, Legs, ...)
  const routines = useLiveQuery(() => db.routines.orderBy('order').toArray()) || [];

  const preferencesObj = useLiveQuery(async () => {
    const arr = await db.preferences.toArray();
    const prefs = { prefLoggingMode: 'RPE' };
    arr.forEach(p => {
      prefs[p.key] = p.value;
    });
    return prefs;
  });
  
  const preferences = preferencesObj || { prefLoggingMode: 'RPE' };

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

  // Read straight from the database rather than the live queries: this runs
  // immediately after a workout is written, and the live query hasn't caught up.
  const buildBackupPayload = async () => {
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

  const writeBackupNow = async (handle) => {
    const payload = await buildBackupPayload();
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

  // Helper: reps of each set that was done last time, in order
  const getLastLoggedReps = (exerciseId) => {
    const last = getLastSessionSets(exerciseId, history);
    return last ? last.sets.map((s) => s.reps) : null;
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

    // Prefill anchors on the heaviest weight ever completed, not the last
    // session — so one bad day doesn't reset the target. The staleness guard
    // stops that becoming a trap: a best older than STALE_BEST_DAYS means the
    // strength is likely gone, so we fall back to what was actually lifted
    // most recently. Date.now() is safe here (event handler, not render).
    const startedAt = Date.now();

    const workoutExercises = sourceExercises.map((ex) => {
      const best = getAllTimeBest(ex.id, history);
      const useBest = best !== null && !isBestStale(best, startedAt);

      const loggedWeight = useBest ? best.weight : getLastLoggedWeight(ex.id);
      const lastRepsList = useBest ? best.reps : getLastLoggedReps(ex.id);

      // With no history at all, fall back to the exercise's configured starting
      // weight — and if that isn't set either, leave the field blank. Inventing
      // a number here (it used to hard-code 10 kg) is worse than asking: on a
      // leg press the empty sled alone can outweigh the guess.
      const lastWeight = loggedWeight !== null
        ? loggedWeight
        : (typeof ex.startingWeight === 'number' && ex.startingWeight > 0
            ? ex.startingWeight
            : '');

      const sets = [];
      const numSets = ex.targetSets || 4;
      for (let i = 0; i < numSets; i++) {
        const prevRep = lastRepsList && lastRepsList[i] !== undefined ? lastRepsList[i] : ex.minReps;
        sets.push({
          weight: lastWeight,
          reps: prevRep,
          completed: false,
          isWarmup: false,
          rpe: '',
          rir: '',
          completedAt: null
        });
      }

      return {
        exerciseId: ex.id,
        name: ex.name,
        sets,
        targetRange: { min: ex.minReps, max: ex.maxReps },
        muscleGroup: ex.muscleGroup || 'Other',
        exerciseType: ex.exerciseType || 'compound',
        restDuration: ex.restDuration || 120,
        weightStep: ex.weightStep || defaultWeightStep(ex.exerciseType)
      };
    });

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

  // Cancel current workout
  const cancelWorkout = () => {
    setCurrentWorkout(null);
    clearRestTimer();
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
  };

  // Remove a session from history entirely — for a test session, a duplicate,
  // or one finished by accident. The UI confirms before calling this.
  const deleteHistorySession = async (sessionId) => {
    await db.history.delete(sessionId);
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

  // Add a custom exercise to active workout on the fly
  const addCustomExerciseToActive = (name, muscleGroup = 'Other') => {
    if (!currentWorkout || !name.trim()) return;

    const id = `custom-${Date.now()}`;
    const newExercise = {
      exerciseId: id,
      name: name.trim(),
      // Blank weight rather than an invented 10 kg — same rule as the prefill
      // for library exercises with no history.
      sets: [
        { weight: '', reps: 10, completed: false, isWarmup: false, rpe: '', rir: '', completedAt: null }
      ],
      targetRange: { min: 8, max: 12 },
      muscleGroup,
      exerciseType: 'compound',
      restDuration: 120,
      weightStep: defaultWeightStep('compound')
    };

    setCurrentWorkout((prev) => ({
      ...prev,
      exercises: [...prev.exercises, newExercise]
    }));
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
          // The backup folder is device configuration, not restorable data —
          // carry it across so restoring a backup doesn't silently disable
          // future backups.
          const keptHandle = await db.preferences.get(BACKUP_HANDLE_KEY);
          await db.preferences.clear();
          const prefArray = Object.entries(parsed.preferences)
            .filter(([key]) => key !== BACKUP_HANDLE_KEY)
            .map(([key, value]) => ({ key, value }));
          await db.preferences.bulkPut(prefArray);
          if (keptHandle) await db.preferences.put(keptHandle);
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
    cancelWorkout,
    completeWorkout,
    updateHistorySession,
    deleteHistorySession,
    updateSet,
    addSetToActive,
    removeSetFromActive,
    addCustomExerciseToActive,
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
    backupFolderName: preferences?.[BACKUP_HANDLE_KEY]?.name || null
  };
};
