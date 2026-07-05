/**
 * usePushQuest — the PUSH Quest game layer's data hook.
 *
 * Everything the game shows is derived from the user's REAL training history
 * (Dexie) rather than the prototype's static sample data:
 *   • ghost      — your most recent comparable session, set by set
 *   • pbGhost    — your all-time best sets per exercise (harder difficulty)
 *   • leagueRows — this calendar week vs your past weeks, by volume
 *   • path       — this week's Mon→Sun training path
 *   • player     — streak, XP, level, league tier (XP/streak persist)
 *   • achievements — earned flags computed from real stats
 *
 * `finishDuel` saves a real completed session back to history (so the duel is a
 * legit, gamified way to log a push day) and banks XP into the gameState store.
 */
import { useMemo, useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/workoutDb';
import {
  getSessionVolume,
  getExerciseVolume,
  getMondayOfDate,
  getStartOfDay,
  groupSessionsByWeek,
  formatDate,
} from '../../utils/workoutHelpers';

const DAY_MS = 86400000;
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const stepFor = (exerciseType, configStep) =>
  configStep || (exerciseType === 'isolation' ? 1 : 2);

// Working sets of an exercise entry as tidy {w, r} pairs.
const workingPairs = (ex) => {
  const working = ex.sets.filter((s) => !s.isWarmup);
  const source = working.length > 0 ? working : ex.sets;
  return source.map((s) => ({ w: parseFloat(s.weight) || 0, r: parseInt(s.reps) || 0 }));
};

// Turn a stored session into a duel-ready ghost (exercises + ghostSets).
const ghostFromSession = (session, exercises) =>
  session && {
    label: formatDate(session.timestamp),
    timestamp: session.timestamp,
    totalVolume: Math.round(getSessionVolume(session.exercises)),
    exercises: session.exercises.map((ex) => {
      const cfg = exercises.find((e) => e.id === ex.exerciseId);
      return {
        id: ex.exerciseId,
        name: ex.name,
        muscleGroup: ex.muscleGroup || cfg?.muscleGroup || 'Other',
        type: ex.exerciseType || cfg?.exerciseType || 'compound',
        minReps: ex.targetRange?.min ?? cfg?.minReps ?? 8,
        maxReps: ex.targetRange?.max ?? cfg?.maxReps ?? 12,
        rest: ex.restDuration || cfg?.restDuration || 120,
        weightStep: stepFor(ex.exerciseType || cfg?.exerciseType, cfg?.weightStep),
        ghostSets: workingPairs(ex),
      };
    }),
  };

export function usePushQuest(history = [], exercises = []) {
  const gameState = useLiveQuery(() => db.gameState.get('progress'));
  // Capture "now" once per mount so the date-boundary math below stays pure
  // across re-renders (React 19 flags calling Date.now() during render).
  const [now] = useState(() => Date.now());

  const sessions = useMemo(
    () => [...history].sort((a, b) => b.timestamp - a.timestamp),
    [history]
  );

  // ---- Ghost = your most recent session -----------------------------------
  const ghost = useMemo(
    () => ghostFromSession(sessions[0], exercises),
    [sessions, exercises]
  );

  // ---- All-time PB ghost = each exercise's best-volume session -------------
  const pbGhost = useMemo(() => {
    if (!sessions[0]) return null;
    const exList = sessions[0].exercises.map((ex) => {
      let best = null;
      let bestVol = -1;
      for (const s of sessions) {
        const match = s.exercises.find((e) => e.exerciseId === ex.exerciseId);
        if (!match) continue;
        const v = getExerciseVolume(match.sets);
        if (v > bestVol) {
          bestVol = v;
          best = match;
        }
      }
      const cfg = exercises.find((e) => e.id === ex.exerciseId);
      const src = best || ex;
      return {
        id: ex.exerciseId,
        name: ex.name,
        muscleGroup: ex.muscleGroup || cfg?.muscleGroup || 'Other',
        type: ex.exerciseType || cfg?.exerciseType || 'compound',
        minReps: ex.targetRange?.min ?? cfg?.minReps ?? 8,
        maxReps: ex.targetRange?.max ?? cfg?.maxReps ?? 12,
        rest: ex.restDuration || cfg?.restDuration || 120,
        weightStep: stepFor(ex.exerciseType || cfg?.exerciseType, cfg?.weightStep),
        ghostSets: workingPairs(src),
      };
    });
    const totalVolume = Math.round(
      exList.reduce((a, e) => a + e.ghostSets.reduce((s, g) => s + g.w * g.r, 0), 0)
    );
    return { label: 'All-time PB', timestamp: null, totalVolume, exercises: exList };
  }, [sessions, exercises]);

  // ---- League: this week vs past weeks by volume --------------------------
  const leagueRows = useMemo(() => {
    const weeks = groupSessionsByWeek(history, exercises);
    if (weeks.length === 0) return [];
    const currentMonday = getMondayOfDate(now).getTime();
    return weeks
      .map((w) => ({
        id: `w-${w.weekStart}`,
        label: w.weekStart === currentMonday ? 'THIS WEEK' : `Week of ${w.weekLabel.split(' - ')[0]}`,
        vol: Math.round(w.totalVolume),
        tier: w.weekStart === currentMonday ? 'now' : 'past',
      }))
      .filter((r) => r.vol > 0 || r.tier === 'now');
  }, [history, exercises, now]);

  const currentWeekVol = useMemo(
    () => leagueRows.find((r) => r.tier === 'now')?.vol || 0,
    [leagueRows]
  );

  // ---- Player: streak, XP, level, league tier -----------------------------
  const lifetimeVolume = useMemo(
    () => Math.round(sessions.reduce((a, s) => a + getSessionVolume(s.exercises), 0)),
    [sessions]
  );

  const streak = useMemo(() => {
    const days = new Set(sessions.map((s) => getStartOfDay(s.timestamp).getTime()));
    if (days.size === 0) return 0;
    const today = getStartOfDay(now).getTime();
    let cursor = days.has(today) ? today : today - DAY_MS; // grace: trained yesterday keeps it alive
    let count = 0;
    while (days.has(cursor)) {
      count += 1;
      cursor -= DAY_MS;
    }
    return count;
  }, [sessions, now]);

  const xp = gameState?.xp || 0;
  const level = Math.floor(xp / 500) + 1;
  const league = level >= 15 ? 'Platinum' : level >= 10 ? 'Gold' : level >= 5 ? 'Silver' : 'Bronze';
  const player = { streak, xp, level, league, lifetimeVolume };

  // ---- Weekly path (Mon → Sun) --------------------------------------------
  const path = useMemo(() => {
    const monday = getMondayOfDate(now).getTime();
    const today = getStartOfDay(now).getTime();
    const todayIdx = Math.min(6, Math.max(0, Math.round((today - monday) / DAY_MS)));
    // Volume logged on each day of the week
    const volByDay = {};
    sessions.forEach((s) => {
      const dayStart = getStartOfDay(s.timestamp).getTime();
      const idx = Math.round((dayStart - monday) / DAY_MS);
      if (idx >= 0 && idx <= 6) volByDay[idx] = (volByDay[idx] || 0) + getSessionVolume(s.exercises);
    });
    return WEEKDAYS.map((day, i) => {
      const vol = Math.round(volByDay[i] || 0);
      const trained = vol > 0;
      let status;
      let label;
      if (trained) {
        status = 'done';
        label = 'Push';
      } else if (i < todayIdx) {
        status = 'rest';
        label = 'Rest';
      } else if (i === todayIdx) {
        status = 'current';
        label = 'Ghost Duel';
      } else {
        status = 'locked';
        label = 'Push';
      }
      const node = { id: day.toLowerCase(), day, label, status };
      if (trained) {
        node.vol = vol;
        node.crown = Math.min(5, Math.max(1, Math.round(vol / 1500)));
      }
      return node;
    });
  }, [sessions, now]);

  // ---- Achievements (earned flags from real stats) ------------------------
  const achievements = useMemo(() => {
    const wins = gameState?.ghostWins || 0;
    const bestCombo = gameState?.bestCombo || 0;
    return [
      { id: 'streak7', icon: 'Flame', name: '7-Day Streak', desc: 'Train every scheduled day for a week', tone: 'warning', earned: streak >= 7 },
      { id: 'ghost5', icon: 'Ghost', name: 'Ghostbuster', desc: 'Defeat your ghost 5 times', tone: 'accent', earned: wins >= 5 },
      { id: 'pb1', icon: 'Trophy', name: 'First Blood', desc: 'Log your first session', tone: 'success', earned: sessions.length >= 1 },
      { id: 'vol100', icon: 'Dumbbell', name: '100 Tonnes', desc: 'Lift 100,000 kg lifetime volume', tone: 'accent', earned: lifetimeVolume >= 100000 },
      { id: 'combo10', icon: 'Zap', name: 'Combo ×10', desc: 'Log 10 sets without breaking combo', tone: 'warning', earned: bestCombo >= 10 },
      { id: 'crown15', icon: 'Crown', name: 'Crowned', desc: 'Reach a 30-day streak', tone: 'warning', earned: streak >= 30 },
    ];
  }, [gameState, streak, sessions.length, lifetimeVolume]);

  // ---- finishDuel: save a real session + bank XP --------------------------
  const finishDuel = useCallback(async (results, duelExercises) => {
    const exercisesForHistory = duelExercises
      .map((ex) => ({
        exerciseId: ex.id,
        name: ex.name,
        muscleGroup: ex.muscleGroup || 'Other',
        exerciseType: ex.type || 'compound',
        restDuration: ex.rest || 120,
        targetRange: { min: ex.minReps ?? 8, max: ex.maxReps ?? 12 },
        sets: ex.sets
          .filter((s) => s.done)
          .map((s) => ({
            weight: Math.round(parseFloat(s.w)) || 0,
            reps: parseInt(s.r) || 0,
            isWarmup: false,
            completed: true,
            rpe: null,
            rir: null,
          })),
      }))
      .filter((ex) => ex.sets.length > 0);

    if (exercisesForHistory.length > 0) {
      const session = {
        id: crypto.randomUUID ? crypto.randomUUID() : `duel-${Date.now()}`,
        timestamp: Date.now(),
        duration: 0,
        source: 'duel',
        exercises: exercisesForHistory,
      };
      await db.history.add(session);
    }

    const current = (await db.gameState.get('progress')) || { key: 'progress', xp: 0, ghostWins: 0, bestCombo: 0 };
    await db.gameState.put({
      key: 'progress',
      xp: (current.xp || 0) + (results.xp || 0),
      ghostWins: (current.ghostWins || 0) + (results.victory ? 1 : 0),
      bestCombo: Math.max(current.bestCombo || 0, results.combo || 0),
      lastTrained: Date.now(),
    });
  }, []);

  return {
    ghost,
    pbGhost,
    leagueRows,
    currentWeekVol,
    path,
    player,
    achievements,
    hasHistory: sessions.length > 0,
    finishDuel,
  };
}
