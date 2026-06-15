import { useState, useEffect } from 'react';

// Default exercise definitions with new fields
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
    restDuration: 120
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
    restDuration: 90
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
    restDuration: 120
  }
];

export const useWorkoutState = () => {
  // 1. Exercises Configuration (with inline migration)
  const [exercises, setExercises] = useState(() => {
    const saved = localStorage.getItem('hypertrophy_exercises');
    const raw = saved ? JSON.parse(saved) : DEFAULT_EXERCISES;
    
    let migrated = false;
    const migratedExs = raw.map(ex => {
      let changed = false;
      const copy = { ...ex };
      
      if (!('muscleGroup' in copy)) {
        if (copy.id === 'db-shoulder-press' || copy.id === 'lateral-raises') {
          copy.muscleGroup = 'Shoulders';
        } else if (copy.id === 'db-chest-press') {
          copy.muscleGroup = 'Chest';
        } else {
          copy.muscleGroup = 'Triceps';
        }
        changed = true;
      }
      
      if (!('exerciseType' in copy)) {
        copy.exerciseType = copy.id === 'lateral-raises' ? 'isolation' : 'compound';
        changed = true;
      }
      
      if (!('restDuration' in copy)) {
        copy.restDuration = copy.exerciseType === 'isolation' ? 90 : 120;
        changed = true;
      }
      
      if (changed) migrated = true;
      return copy;
    });
    
    if (migrated) {
      localStorage.setItem('hypertrophy_exercises', JSON.stringify(migratedExs));
    }
    return migratedExs;
  });

  // 2. Workout History (with inline migration)
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('hypertrophy_history');
    const raw = saved ? JSON.parse(saved) : [];
    
    let migrated = false;
    const migratedHist = raw.map(session => {
      let sessionChanged = false;
      const updatedExs = session.exercises.map(ex => {
        let exChanged = false;
        
        let mg = ex.muscleGroup;
        if (!mg) {
          mg = ex.exerciseId === 'db-shoulder-press' || ex.exerciseId === 'lateral-raises' ? 'Shoulders' : ex.exerciseId === 'db-chest-press' ? 'Chest' : 'Triceps';
          exChanged = true;
        }

        const updatedSets = ex.sets.map(set => {
          let setChanged = false;
          const setCopy = { ...set };
          
          if (!('isWarmup' in setCopy)) {
            setCopy.isWarmup = false;
            setChanged = true;
          }
          if (!('completed' in setCopy)) {
            setCopy.completed = true;
            setChanged = true;
          }
          if (setChanged) exChanged = true;
          return setCopy;
        });

        if (exChanged) sessionChanged = true;
        return {
          ...ex,
          muscleGroup: mg,
          sets: updatedSets
        };
      });

      if (sessionChanged) migrated = true;
      return {
        ...session,
        exercises: updatedExs
      };
    });

    if (migrated) {
      localStorage.setItem('hypertrophy_history', JSON.stringify(migratedHist));
    }
    return migratedHist;
  });

  // 3. Current Active Workout
  const [currentWorkout, setCurrentWorkout] = useState(() => {
    const saved = localStorage.getItem('hypertrophy_current_workout');
    return saved ? JSON.parse(saved) : null;
  });

  // 4. Preferences
  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem('hypertrophy_preferences');
    return saved ? JSON.parse(saved) : { prefLoggingMode: 'RPE' }; // 'RPE' | 'RIR'
  });

  // 5. Rest Timer End Time
  const [restEndTime, setRestEndTime] = useState(() => {
    const saved = localStorage.getItem('hypertrophy_rest_end_time');
    return saved ? parseInt(saved) : null;
  });

  // Save changes to local storage on changes
  useEffect(() => {
    localStorage.setItem('hypertrophy_exercises', JSON.stringify(exercises));
  }, [exercises]);

  useEffect(() => {
    localStorage.setItem('hypertrophy_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (currentWorkout) {
      localStorage.setItem('hypertrophy_current_workout', JSON.stringify(currentWorkout));
    } else {
      localStorage.removeItem('hypertrophy_current_workout');
    }
  }, [currentWorkout]);

  useEffect(() => {
    localStorage.setItem('hypertrophy_preferences', JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (restEndTime) {
      localStorage.setItem('hypertrophy_rest_end_time', restEndTime.toString());
    } else {
      localStorage.removeItem('hypertrophy_rest_end_time');
    }
  }, [restEndTime]);

  // Update preferences helper
  const updatePreference = (key, value) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: value
    }));
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
    const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);
    for (const session of sortedHistory) {
      const ex = session.exercises.find((e) => e.exerciseId === exerciseId);
      if (ex && ex.sets && ex.sets.length > 0) {
        // Find the first working set that has a weight
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
    const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);
    for (const session of sortedHistory) {
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
        restDuration: ex.restDuration || 120
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
  const completeWorkout = () => {
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

    setHistory((prev) => [completedSession, ...prev]);
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
  const addExerciseToConfig = (name, targetSets = 4, minReps = 10, maxReps = 12, muscleGroup = 'Other', exerciseType = 'compound', restDuration = 120) => {
    if (!name.trim()) return;
    const id = `custom-config-${Date.now()}`;
    const newEx = {
      id,
      name: name.trim(),
      targetSets: parseInt(targetSets) || 4,
      minReps: parseInt(minReps) || 10,
      maxReps: parseInt(maxReps) || 12,
      isCustom: true,
      muscleGroup,
      exerciseType,
      restDuration: parseInt(restDuration) || 120
    };
    setExercises((prev) => [...prev, newEx]);
  };

  // Update exercise in global config
  const updateExerciseInConfig = (id, updatedFields) => {
    setExercises((prev) =>
      prev.map((ex) => (ex.id === id ? { ...ex, ...updatedFields } : ex))
    );
  };

  // Delete exercise from global config
  const deleteExerciseFromConfig = (id) => {
    setExercises((prev) => prev.filter((ex) => ex.id !== id));
  };

  // Reorder exercises in global config
  const reorderExercises = (startIndex, endIndex) => {
    setExercises((prev) => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
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
  };

  // Import data from JSON
  const importData = (jsonData) => {
    try {
      const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      if (parsed.exercises && Array.isArray(parsed.exercises)) {
        setExercises(parsed.exercises);
      }
      if (parsed.history && Array.isArray(parsed.history)) {
        setHistory(parsed.history);
      }
      if (parsed.preferences) {
        setPreferences(parsed.preferences);
      }
      return true;
    } catch (e) {
      console.error('Error importing data:', e);
      return false;
    }
  };

  // Reset all data
  const clearAllData = () => {
    localStorage.removeItem('hypertrophy_exercises');
    localStorage.removeItem('hypertrophy_history');
    localStorage.removeItem('hypertrophy_current_workout');
    localStorage.removeItem('hypertrophy_preferences');
    localStorage.removeItem('hypertrophy_rest_end_time');
    setExercises(DEFAULT_EXERCISES);
    setHistory([]);
    setCurrentWorkout(null);
    setPreferences({ prefLoggingMode: 'RPE' });
    setRestEndTime(null);
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
    clearAllData
  };
};
