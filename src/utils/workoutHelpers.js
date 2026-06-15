/**
 * Workout Helpers
 * Utility functions for Push Hypertrophy Trainer calculations and data analysis.
 */

export const MUSCLE_GROUPS = ['Chest', 'Shoulders', 'Triceps', 'Lats', 'Back', 'Legs', 'Abs', 'Other'];

// Calculate volume load of a set: weight * reps (returns 0 for warmups)
export const getSetVolume = (weight, reps, isWarmup = false) => {
  if (isWarmup) return 0;
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps) || 0;
  return w * r;
};

// Calculate total volume load for an exercise (sum of working set volumes)
export const getExerciseVolume = (sets) => {
  if (!sets || !Array.isArray(sets)) return 0;
  return sets.reduce((sum, set) => sum + getSetVolume(set.weight, set.reps, set.isWarmup), 0);
};

// Calculate total volume load for a workout session
export const getSessionVolume = (exercises) => {
  if (!exercises || !Array.isArray(exercises)) return 0;
  return exercises.reduce((sum, ex) => sum + getExerciseVolume(ex.sets), 0);
};

// Helper: Get Monday of a given date (at 00:00:00)
export const getMondayOfDate = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  // Adjust so Monday is index 0. If Sunday, it's index 6, otherwise index - 1
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

// Helper: Get start of a day
export const getStartOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper: Format date to local readable format
export const formatDate = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Helper: Format time to local readable format
export const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Get the Sunday of the week containing the Monday
export const getSundayOfMonday = (monday) => {
  const sun = new Date(monday);
  sun.setDate(sun.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return sun;
};

// Format a week range e.g., "Jun 15 - Jun 21"
export const formatWeekRange = (mondayDate) => {
  const mon = new Date(mondayDate);
  const sun = getSundayOfMonday(mon);
  
  const options = { month: 'short', day: 'numeric' };
  return `${mon.toLocaleDateString(undefined, options)} - ${sun.toLocaleDateString(undefined, options)}`;
};

// Helper to resolve RIR to RPE and vice versa
export const getSetRpe = (set) => {
  if (set.rpe !== undefined && set.rpe !== null && set.rpe !== '') {
    return parseFloat(set.rpe);
  }
  if (set.rir !== undefined && set.rir !== null && set.rir !== '') {
    return 10 - parseFloat(set.rir);
  }
  return null;
};

/**
 * Group sessions by calendar week (Monday to Sunday).
 * Returns an array of week objects sorted chronologically:
 * {
 *   weekStart: number (Monday timestamp),
 *   weekLabel: string,
 *   totalVolume: number,
 *   sessionsCount: number,
 *   exerciseVolume: { [exerciseId]: number },
 *   exerciseSets: { [exerciseId]: number },
 *   muscleGroupVolume: { [muscleGroup]: number },
 *   muscleGroupSets: { [muscleGroup]: number }
 * }
 */
export const groupSessionsByWeek = (sessions, exercisesList = []) => {
  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
    return [];
  }

  const weeksMap = {};

  sessions.forEach((session) => {
    const monday = getMondayOfDate(session.timestamp);
    const key = monday.getTime();

    if (!weeksMap[key]) {
      weeksMap[key] = {
        weekStart: key,
        weekLabel: formatWeekRange(monday),
        totalVolume: 0,
        sessionsCount: 0,
        exerciseVolume: {},
        exerciseSets: {},
        muscleGroupVolume: {},
        muscleGroupSets: {}
      };
      
      // Initialize exercise maps for current definitions
      exercisesList.forEach(ex => {
        weeksMap[key].exerciseVolume[ex.id] = 0;
        weeksMap[key].exerciseSets[ex.id] = 0;
      });

      // Initialize muscle group maps
      MUSCLE_GROUPS.forEach(mg => {
        weeksMap[key].muscleGroupVolume[mg] = 0;
        weeksMap[key].muscleGroupSets[mg] = 0;
      });
    }

    const weekData = weeksMap[key];
    weekData.sessionsCount += 1;
    
    session.exercises.forEach((ex) => {
      // Find muscle group
      const configEx = exercisesList.find(e => e.id === ex.exerciseId);
      const mg = configEx?.muscleGroup || ex.muscleGroup || 'Other';

      const workingSets = ex.sets ? ex.sets.filter(s => !s.isWarmup) : [];
      const vol = workingSets.reduce((sum, s) => sum + getSetVolume(s.weight, s.reps, s.isWarmup), 0);
      const workingSetCount = workingSets.length;
      
      // Accumulate total volume
      weekData.totalVolume += vol;
      
      // Accumulate per-exercise volume
      if (!weekData.exerciseVolume[ex.exerciseId]) {
        weekData.exerciseVolume[ex.exerciseId] = 0;
      }
      weekData.exerciseVolume[ex.exerciseId] += vol;
      
      // Accumulate per-exercise working sets
      if (!weekData.exerciseSets[ex.exerciseId]) {
        weekData.exerciseSets[ex.exerciseId] = 0;
      }
      weekData.exerciseSets[ex.exerciseId] += workingSetCount;

      // Accumulate per-muscle group volume
      if (!weekData.muscleGroupVolume[mg]) {
        weekData.muscleGroupVolume[mg] = 0;
      }
      weekData.muscleGroupVolume[mg] += vol;

      // Accumulate per-muscle group sets
      if (!weekData.muscleGroupSets[mg]) {
        weekData.muscleGroupSets[mg] = 0;
      }
      weekData.muscleGroupSets[mg] += workingSetCount;
    });
  });

  // Convert map to array and sort by date (chronological)
  return Object.values(weeksMap).sort((a, b) => a.weekStart - b.weekStart);
};

/**
 * Calculate the trend between two volumes.
 * Returns: { direction: 'up'|'flat'|'down'|'none', percentChange: number }
 */
export const calculateTrend = (currentVolume, previousVolume) => {
  if (previousVolume === undefined || previousVolume === null || previousVolume === 0) {
    return { direction: 'none', percentChange: 0 };
  }

  const change = currentVolume - previousVolume;
  const percentChange = (change / previousVolume) * 100;
  
  // Use a 1% threshold to distinguish flat from up/down
  if (percentChange > 1) {
    return { direction: 'up', percentChange: Math.round(percentChange) };
  } else if (percentChange < -1) {
    return { direction: 'down', percentChange: Math.round(Math.abs(percentChange)) };
  } else {
    return { direction: 'flat', percentChange: 0 };
  }
};

/**
 * Progression Helper
 * Only suggest weight increase if all working sets hit the top of the rep range
 * AND the last working set's RPE was <= 9 (i.e. there was room/RIR >= 1).
 * If reps were met but RPE was 10 (or RIR = 0), suggest holding the weight.
 */
export const getProgressionSuggestion = (exerciseId, sessions, exerciseDef) => {
  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
    return {
      type: 'initial',
      text: 'Log your first workout to establish a baseline.'
    };
  }

  // Find the last session that contains this exercise
  let lastExerciseData = null;

  // Search from most recent to oldest
  const sortedSessions = [...sessions].sort((a, b) => b.timestamp - a.timestamp);
  
  for (const session of sortedSessions) {
    const exData = session.exercises.find((ex) => ex.exerciseId === exerciseId);
    if (exData && exData.sets && exData.sets.length > 0) {
      lastExerciseData = exData;
      break;
    }
  }

  if (!lastExerciseData) {
    return {
      type: 'initial',
      text: 'First time logging this exercise. Focus on proper form!'
    };
  }

  // Check if we hit the top of the rep range across all working sets
  const targetMax = lastExerciseData.targetRange?.max || exerciseDef?.maxReps || 12;
  const sets = lastExerciseData.sets;
  
  const workingSets = sets.filter(s => !s.isWarmup);
  if (workingSets.length === 0) {
    return {
      type: 'reps',
      text: 'Add working sets (non-warmup) to calculate double-progression suggestions.',
      action: 'Add Working Sets'
    };
  }

  const hitMaxAllWorkingSets = workingSets.every(set => (parseInt(set.reps) || 0) >= targetMax);

  if (hitMaxAllWorkingSets) {
    const lastWorkingSet = workingSets[workingSets.length - 1];
    const lastRpe = getSetRpe(lastWorkingSet);

    if (lastRpe !== null && lastRpe > 9) {
      return {
        type: 'hold',
        text: `Hit max reps (${targetMax}) on all working sets, but difficulty was high (RPE ${lastRpe}). Suggest holding weight next time to build confidence/cleaner form.`,
        action: 'Hold Weight'
      };
    } else {
      const rpeText = lastRpe !== null ? ` at RPE ${lastRpe}` : '';
      return {
        type: 'weight',
        text: `Excellent! Hit max reps (${targetMax}) on all working sets${rpeText}. Try increasing weight by +1kg to +2.5kg.`,
        action: 'Increase Weight'
      };
    }
  } else {
    // Find how many reps they did and which sets didn't reach the target
    const subTargetSetsCount = workingSets.filter(set => (parseInt(set.reps) || 0) < targetMax).length;
    return {
      type: 'reps',
      text: `Focus on hitting the top rep range (${targetMax}) across all working sets. Push for more reps in the remaining ${subTargetSetsCount} set(s).`,
      action: 'Increase Reps'
    };
  }
};

/**
 * Get personal bests for each exercise.
 * Returns: {
 *   [exerciseId]: {
 *     maxWeight: number,
 *     maxSessionVolume: number
 *   }
 * }
 */
export const getPersonalBests = (sessions) => {
  const pbs = {};

  if (!sessions || !Array.isArray(sessions)) return pbs;

  sessions.forEach((session) => {
    session.exercises.forEach((ex) => {
      const exId = ex.exerciseId;
      if (!pbs[exId]) {
        pbs[exId] = { maxWeight: 0, maxSessionVolume: 0 };
      }

      // 1. Max Weight in a single set (working set only)
      ex.sets.forEach((set) => {
        if (set.isWarmup) return;
        const weight = parseFloat(set.weight) || 0;
        if (weight > pbs[exId].maxWeight) {
          pbs[exId].maxWeight = weight;
        }
      });

      // 2. Max Volume in a single session for this exercise (working sets only)
      const vol = getExerciseVolume(ex.sets);
      if (vol > pbs[exId].maxSessionVolume) {
        pbs[exId].maxSessionVolume = vol;
      }
    });
  });

  return pbs;
};
