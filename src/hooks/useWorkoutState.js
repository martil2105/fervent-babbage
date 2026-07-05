import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/workoutDb';
import { ensurePersistentStorage } from '../utils/storagePersistence';

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
    const saved = localStorage.getItem('hypertrophy_current_workout');
    return saved ? JSON.parse(saved) : null;
  });

  const [restEndTime, setRestEndTime] = useState(() => {
    const saved = localStorage.getItem('hypertrophy_rest_end_time');
    return saved ? parseInt(saved) : null;
  });

  // Durable-storage status: null = unknown/not yet checked, true = persisted,
  // false = best-effort (browser may evict under disk pressure).
  const [storagePersisted, setStoragePersisted] = useState(null);

  // Keep transient data saved
  useEffect(() => {
    if (currentWorkout) {
      localStorage.setItem('hypertrophy_current_workout', JSON.stringify(currentWorkout));
    } else {
      localStorage.removeItem('hypertrophy_current_workout');
    }
  }, [currentWorkout]);

  useEffect(() => {
    if (restEndTime) {
      localStorage.setItem('hypertrophy_rest_end_time', restEndTime.toString());
    } else {
      localStorage.removeItem('hypertrophy_rest_end_time');
    }
  }, [restEndTime]);

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

  // Rest Timer controls
  const startRestTimer = (seconds) => {
    setRestEndTime(Date.now() + seconds * 1000);
  };

  const extendRestTimer = (seconds) => {
    setRestEndTime((prev) => {
      const base = prev && prev > Date.now() ? prev : Date.now();
      return base + seconds * 1000;
    });
  };

  const clearRestTimer = () => {
    setRestEndTime(null);
  };

  // Helper: Find the last weight logged for an exercise (from working sets only)
  const getLastLoggedWeight = (exerciseId) => {
    // History is already sorted newest to oldest from the Dexie live query!
    for (const session of history) {
      const ex = session.exercises.find((e) => e.exerciseId === exerciseId);
      if (ex && ex.sets && ex.sets.length > 0) {
        const workingSets = ex.sets.filter(s => !s.isWarmup);
        const firstWorkingWithWeight = workingSets.find(s => parseFloat(s.weight) > 0);
        if (firstWorkingWithWeight) {
          return parseFloat(firstWorkingWithWeight.weight);
        }
        if (workingSets.length > 0) {
          return parseFloat(workingSets[0].weight) || 0;
        }
        return parseFloat(ex.sets[0].weight) || 0;
      }
    }
    return 10; // Default fallback
  };

  // Helper: Find the last reps logged for an exercise
  const getLastLoggedReps = (exerciseId) => {
    for (const session of history) {
      const ex = session.exercises.find((e) => e.exerciseId === exerciseId);
      if (ex && ex.sets && ex.sets.length > 0) {
        const workingSets = ex.sets.filter(s => !s.isWarmup);
        if (workingSets.length > 0) {
          return workingSets.map(s => parseInt(s.reps) || 0);
        }
        return ex.sets.map(s => parseInt(s.reps) || 0);
      }
    }
    return null;
  };

  // Start a new workout session
  const startWorkout = () => {
    const workoutExercises = exercises.map((ex) => {
      const lastWeight = getLastLoggedWeight(ex.id);
      const lastRepsList = getLastLoggedReps(ex.id);
      
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
      startTime: Date.now(),
      exercises: workoutExercises
    });
  };

  // Cancel current workout
  const cancelWorkout = () => {
    setCurrentWorkout(null);
    clearRestTimer();
  };

  // Complete current workout
  const completeWorkout = async () => {
    if (!currentWorkout) return;

    const sanitizedExercises = currentWorkout.exercises.map((ex) => ({
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
      id: currentWorkout.id,
      timestamp: Date.now(),
      duration: Math.round((Date.now() - currentWorkout.startTime) / 1000 / 60),
      exercises: sanitizedExercises
    };

    // Add to IndexedDB history store
    await db.history.add(completedSession);
    setCurrentWorkout(null);
    clearRestTimer();
    return completedSession;
  };

  // Edit active workout sets
  const updateSet = (exerciseId, setIndex, field, value) => {
    if (!currentWorkout) return;

    let shouldStartTimer = false;
    let timerDuration = 90;

    setCurrentWorkout((prev) => {
      const updatedExercises = prev.exercises.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;

        const configEx = exercises.find(e => e.id === exerciseId);
        timerDuration = ex.restDuration || configEx?.restDuration || (ex.exerciseType === 'isolation' ? 90 : 120);

        const updatedSets = ex.sets.map((set, idx) => {
          if (idx !== setIndex) return set;
          
          let val = value;
          if (field === 'weight') {
            val = value === '' ? '' : value;
          } else if (field === 'reps') {
            val = value === '' ? '' : parseInt(value) || 0;
          } else if (field === 'rpe') {
            val = value === '' ? '' : parseFloat(value);
          } else if (field === 'rir') {
            val = value === '' ? '' : parseInt(value);
          }

          if (field === 'completed' && value === true && !set.completed) {
            shouldStartTimer = true;
          }

          return {
            ...set,
            [field]: val,
            completedAt: field === 'completed' && value === true ? Date.now() : set.completedAt
          };
        });

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

    if (shouldStartTimer) {
      startRestTimer(timerDuration);
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
              weight: getLastLoggedWeight(exerciseId), 
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
      sets: [
        { weight: 10, reps: 10, completed: false, isWarmup: false, rpe: '', rir: '', completedAt: null }
      ],
      targetRange: { min: 8, max: 12 },
      muscleGroup,
      exerciseType: 'compound',
      restDuration: 120
    };

    setCurrentWorkout((prev) => ({
      ...prev,
      exercises: [...prev.exercises, newExercise]
    }));
  };

  // Add a custom exercise to global config
  const addExerciseToConfig = async (name, targetSets = 4, minReps = 10, maxReps = 12, muscleGroup = 'Other', exerciseType = 'compound', restDuration = 120, weightStep) => {
    if (!name.trim()) return;
    const id = `custom-config-${Date.now()}`;
    const parsedStep = parseInt(weightStep);
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
      weightStep: parsedStep > 0 ? parsedStep : defaultWeightStep(exerciseType)
    };
    await db.exercises.add(newEx);
  };

  // Update exercise in global config
  const updateExerciseInConfig = async (id, updatedFields) => {
    await db.exercises.update(id, updatedFields);
  };

  // Delete exercise from global config
  const deleteExerciseFromConfig = async (id) => {
    await db.exercises.delete(id);
  };

  // Reorder exercises in global config
  const reorderExercises = async (startIndex, endIndex) => {
    const result = Array.from(exercises);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    
    // Rewrite all to enforce re-ordered array
    await db.transaction('rw', db.exercises, async () => {
      await db.exercises.clear();
      await db.exercises.bulkAdd(result);
    });
  };

  // Export data as JSON
  const exportData = () => {
    const dataStr = JSON.stringify({ exercises, history, preferences });
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `hypertrophy_tracker_backup_${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    // Remember when the last backup was taken so Settings can nudge if stale.
    db.preferences.put({ key: 'lastBackupAt', value: Date.now() });
  };

  // Import data from JSON into IndexedDB
  const importData = async (jsonData) => {
    try {
      const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      
      await db.transaction('rw', [db.exercises, db.history, db.preferences], async () => {
        if (parsed.exercises && Array.isArray(parsed.exercises)) {
          await db.exercises.clear();
          await db.exercises.bulkAdd(parsed.exercises);
        }
        if (parsed.history && Array.isArray(parsed.history)) {
          await db.history.clear();
          await db.history.bulkAdd(parsed.history);
        }
        if (parsed.preferences) {
          await db.preferences.clear();
          const prefArray = Object.entries(parsed.preferences).map(([key, value]) => ({ key, value }));
          await db.preferences.bulkPut(prefArray);
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
    await db.transaction('rw', [db.exercises, db.history, db.preferences], async () => {
      await db.exercises.clear();
      await db.history.clear();
      await db.preferences.clear();
      await db.exercises.bulkAdd(DEFAULT_EXERCISES);
      await db.preferences.add({ key: 'prefLoggingMode', value: 'RPE' });
    });
    localStorage.removeItem('hypertrophy_current_workout');
    localStorage.removeItem('hypertrophy_rest_end_time');
    setCurrentWorkout(null);
    clearRestTimer();
  };

  return {
    exercises,
    history,
    currentWorkout,
    preferences,
    restEndTime,
    updatePreference,
    startRestTimer,
    extendRestTimer,
    clearRestTimer,
    startWorkout,
    cancelWorkout,
    completeWorkout,
    updateSet,
    addSetToActive,
    removeSetFromActive,
    addCustomExerciseToActive,
    addExerciseToConfig,
    updateExerciseInConfig,
    deleteExerciseFromConfig,
    reorderExercises,
    exportData,
    importData,
    clearAllData,
    storagePersisted,
    requestPersistentStorage
  };
};
