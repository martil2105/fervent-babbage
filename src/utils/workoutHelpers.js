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

// A set counts toward volume/set totals only if it is a working set that was
// actually logged (checked off). Sets from older data lack a `completed` flag,
// so only an explicit `completed === false` excludes a set — this keeps migrated
// history unchanged while ignoring unchecked sets from half-finished workouts.
export const isCountableSet = (set) => {
  if (!set) return false;
  return !set.isWarmup && set.completed !== false;
};

// Calculate total volume load for an exercise (sum of completed working set volumes)
export const getExerciseVolume = (sets) => {
  if (!sets || !Array.isArray(sets)) return 0;
  return sets.reduce(
    (sum, set) => sum + (isCountableSet(set) ? getSetVolume(set.weight, set.reps, false) : 0),
    0
  );
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

      const workingSets = ex.sets ? ex.sets.filter(isCountableSet) : [];
      const vol = workingSets.reduce((sum, s) => sum + getSetVolume(s.weight, s.reps, false), 0);
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
 * Find the most recent completed session that logged a given exercise, and
 * return its working sets as a tidy [{ weight, reps }] list (warmups excluded).
 * Sessions are searched newest-first. Returns null when the exercise has never
 * been logged. Used to show "last time you did X" and to build the duel ghost.
 */
export const getLastSessionSets = (exerciseId, sessions) => {
  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) return null;
  const sorted = [...sessions].sort((a, b) => b.timestamp - a.timestamp);
  for (const session of sorted) {
    const ex = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (ex && ex.sets && ex.sets.length > 0) {
      const working = ex.sets.filter((s) => !s.isWarmup);
      const source = working.length > 0 ? working : ex.sets;
      return {
        timestamp: session.timestamp,
        sets: source.map((s) => ({
          weight: parseFloat(s.weight) || 0,
          reps: parseInt(s.reps) || 0
        }))
      };
    }
  }
  return null;
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
  
  const workingSets = sets.filter(isCountableSet);
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
 * Merge configured exercises with any that appear only in history.
 * Custom "on-the-fly" exercises and previously-deleted templates are logged into
 * history but are not in the current config, so they would otherwise be invisible
 * in the Dashboard breakdown and Personal Bests. This returns the configured
 * exercises first, followed by any history-only exercises (derived from their most
 * recent logged session), flagged with isHistorical: true.
 */
export const getDisplayExercises = (configExercises = [], sessions = []) => {
  const result = [...configExercises];
  const knownIds = new Set(configExercises.map((e) => e.id));

  if (!sessions || !Array.isArray(sessions)) return result;

  // Walk sessions newest-first so the most recent name/target wins for each id
  const sorted = [...sessions].sort((a, b) => b.timestamp - a.timestamp);
  sorted.forEach((session) => {
    session.exercises.forEach((ex) => {
      if (!ex.exerciseId || knownIds.has(ex.exerciseId)) return;
      knownIds.add(ex.exerciseId);
      result.push({
        id: ex.exerciseId,
        name: ex.name || 'Unknown Exercise',
        minReps: ex.targetRange?.min ?? 0,
        maxReps: ex.targetRange?.max ?? 0,
        targetSets: ex.sets?.length || 0,
        muscleGroup: ex.muscleGroup || 'Other',
        exerciseType: ex.exerciseType || 'compound',
        restDuration: ex.restDuration || 120,
        isCustom: true,
        isHistorical: true
      });
    });
  });

  return result;
};

/**
 * Estimated one-rep max using the Epley formula: w × (1 + reps/30).
 * A single rep returns the weight itself. Returns 0 for missing/invalid input.
 * Estimates get fuzzy at high reps, but stay useful as a trend signal.
 */
export const getEstimated1RM = (weight, reps) => {
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  return w * (1 + r / 30);
};

/**
 * Build a chronological per-session strength series for one exercise.
 * Each point: { timestamp, topWeight, est1RM, volume } computed from
 * countable (completed, non-warmup) sets only. Sessions where the exercise
 * has no countable sets are skipped. Used by the Analytics progression chart.
 */
export const getExerciseProgression = (exerciseId, sessions) => {
  if (!sessions || !Array.isArray(sessions)) return [];
  const points = [];

  sessions.forEach((session) => {
    const ex = session.exercises?.find((e) => e.exerciseId === exerciseId);
    if (!ex || !ex.sets) return;
    const working = ex.sets.filter(isCountableSet);
    if (working.length === 0) return;

    let topWeight = 0;
    let est1RM = 0;
    working.forEach((s) => {
      const w = parseFloat(s.weight) || 0;
      if (w > topWeight) topWeight = w;
      const e = getEstimated1RM(s.weight, s.reps);
      if (e > est1RM) est1RM = e;
    });

    points.push({
      timestamp: session.timestamp,
      topWeight,
      est1RM: Math.round(est1RM * 10) / 10,
      volume: getExerciseVolume(ex.sets)
    });
  });

  return points.sort((a, b) => a.timestamp - b.timestamp);
};

/**
 * Average RPE across a session's countable sets (RIR entries are converted).
 * Returns null when no set carries effort data, so callers can skip the point.
 */
export const getSessionAvgRpe = (session) => {
  if (!session || !session.exercises) return null;
  let sum = 0;
  let count = 0;
  session.exercises.forEach((ex) => {
    (ex.sets || []).forEach((set) => {
      if (!isCountableSet(set)) return;
      const rpe = getSetRpe(set);
      if (rpe !== null && !Number.isNaN(rpe)) {
        sum += rpe;
        count += 1;
      }
    });
  });
  if (count === 0) return null;
  return Math.round((sum / count) * 10) / 10;
};

/**
 * Lifetime training totals across all sessions:
 * { sessionsCount, totalVolume, totalSets, totalReps, avgDuration }.
 * Sets/reps/volume count countable sets only; avgDuration averages the
 * sessions that recorded a duration (0 when none did).
 */
export const getLifetimeStats = (sessions) => {
  const stats = { sessionsCount: 0, totalVolume: 0, totalSets: 0, totalReps: 0, avgDuration: 0 };
  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) return stats;

  let durationSum = 0;
  let durationCount = 0;

  sessions.forEach((session) => {
    stats.sessionsCount += 1;
    if (session.duration) {
      durationSum += session.duration;
      durationCount += 1;
    }
    (session.exercises || []).forEach((ex) => {
      (ex.sets || []).forEach((set) => {
        if (!isCountableSet(set)) return;
        stats.totalSets += 1;
        stats.totalReps += parseInt(set.reps) || 0;
        stats.totalVolume += getSetVolume(set.weight, set.reps, false);
      });
    });
  });

  stats.avgDuration = durationCount > 0 ? Math.round(durationSum / durationCount) : 0;
  return stats;
};

/**
 * Count consecutive calendar weeks with at least one session, walking
 * backwards from the week containing `now`. A quiet current week doesn't
 * break the streak (the week isn't over yet) — it just isn't counted.
 */
export const getWeeklyStreak = (sessions, now = new Date()) => {
  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) return 0;

  const trainedWeeks = new Set(
    sessions.map((s) => getMondayOfDate(s.timestamp).getTime())
  );

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  let cursor = getMondayOfDate(now).getTime();
  let streak = 0;

  // Current week counts if trained; otherwise start checking from last week.
  if (trainedWeeks.has(cursor)) {
    streak += 1;
  }
  cursor -= WEEK_MS;

  while (trainedWeeks.has(cursor)) {
    streak += 1;
    cursor -= WEEK_MS;
  }

  return streak;
};

/**
 * Map of day-start timestamp -> total session volume for that day.
 * Powers the consistency heatmap on the Analytics page.
 */
export const getDailyVolumeMap = (sessions) => {
  const map = {};
  if (!sessions || !Array.isArray(sessions)) return map;
  sessions.forEach((session) => {
    const day = getStartOfDay(session.timestamp).getTime();
    map[day] = (map[day] || 0) + getSessionVolume(session.exercises);
  });
  return map;
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

      // 1. Max Weight in a single set (completed working sets only)
      ex.sets.forEach((set) => {
        if (!isCountableSet(set)) return;
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
