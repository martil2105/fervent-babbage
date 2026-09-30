/**
 * Backup files: checking one before it replaces the log, and saving one in a
 * way that actually reaches the phone's storage.
 *
 * Import replaces everything on the device, so a file is read and summarised
 * first and only written after the person has seen what it contains. A wrong
 * or older file is the one mistake here that can't be undone.
 */

const NOT_A_BACKUP = 'This file doesn’t look like a HYPERTROPHY.LOG backup.';

const hasDuplicates = (ids) => new Set(ids).size !== ids.length;

/**
 * Validate a backup (JSON text or an already-parsed object) and summarise it.
 *
 * Returns { ok: false, error } or { ok: true, data, summary } where summary is
 * { sessions, exercises, routines, firstAt, lastAt } — timestamps are null
 * when the backup holds no sessions.
 */
export const parseBackup = (input) => {
  let data;
  try {
    data = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return { ok: false, error: 'This file isn’t valid JSON, so it can’t be a backup.' };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: NOT_A_BACKUP };
  }

  const hasExercises = Array.isArray(data.exercises);
  const hasHistory = Array.isArray(data.history);
  if (!hasExercises && !hasHistory) {
    return { ok: false, error: `${NOT_A_BACKUP} It has no exercises or workout history.` };
  }

  if (hasExercises) {
    const bad = data.exercises.some((ex) => !ex || typeof ex.id !== 'string' || !ex.id || typeof ex.name !== 'string');
    if (bad) return { ok: false, error: `${NOT_A_BACKUP} An exercise is missing its id or name.` };
    if (hasDuplicates(data.exercises.map((ex) => ex.id))) {
      return { ok: false, error: 'This backup lists the same exercise twice, so it can’t be restored safely.' };
    }
  }

  if (hasHistory) {
    const bad = data.history.some(
      (s) => !s || s.id === undefined || s.id === null || !Number.isFinite(s.timestamp) || !Array.isArray(s.exercises)
    );
    if (bad) return { ok: false, error: `${NOT_A_BACKUP} A workout is missing its id, date or exercises.` };
    if (hasDuplicates(data.history.map((s) => s.id))) {
      return { ok: false, error: 'This backup lists the same workout twice, so it can’t be restored safely.' };
    }
  }

  if (data.routines !== undefined) {
    const ok = Array.isArray(data.routines) &&
      data.routines.every((r) => r && typeof r.id === 'string' && Array.isArray(r.exerciseIds));
    if (!ok) return { ok: false, error: `${NOT_A_BACKUP} Its sessions list is damaged.` };
  }

  const span = summarizeSessions(hasHistory ? data.history : []);
  return {
    ok: true,
    data,
    summary: {
      sessions: span.count,
      exercises: hasExercises ? data.exercises.length : 0,
      routines: Array.isArray(data.routines) ? data.routines.length : 0,
      firstAt: span.firstAt,
      lastAt: span.lastAt
    }
  };
};

/** { count, firstAt, lastAt } for a list of sessions (timestamps null if empty). */
export const summarizeSessions = (sessions) => {
  let firstAt = null;
  let lastAt = null;
  const list = Array.isArray(sessions) ? sessions : [];
  list.forEach((s) => {
    if (!Number.isFinite(s?.timestamp)) return;
    if (firstAt === null || s.timestamp < firstAt) firstAt = s.timestamp;
    if (lastAt === null || s.timestamp > lastAt) lastAt = s.timestamp;
  });
  return { count: list.length, firstAt, lastAt };
};

/**
 * How many sessions on this device the backup doesn't contain — i.e. what
 * restoring it would throw away. With an older backup of the same log these
 * are exactly the workouts logged since it was taken. Sessions whose id is
 * also in the backup are not counted: those come back with the restore.
 */
export const countSessionsLostByRestore = (currentSessions, backupSessions) => {
  const backupIds = new Set((backupSessions || []).map((s) => s.id));
  return (currentSessions || []).filter((s) => !backupIds.has(s.id)).length;
};

export const backupFileName = (date = new Date()) =>
  `hypertrophy_tracker_backup_${date.toISOString().split('T')[0]}.json`;

/**
 * Hand a backup to the person. On a phone that can share files (iOS Safari,
 * including the home-screen app) this opens the share sheet, whose "Save to
 * Files" is the dependable way to get a file out of a web app there. Elsewhere
 * — and whenever sharing isn't possible — it downloads the file instead.
 *
 * Must be called straight from a tap: sharing needs the gesture, so nothing
 * slow may run before it. Returns 'shared', 'downloaded' or 'cancelled'.
 */
export const saveBackupFile = async (json, filename = backupFileName()) => {
  const blob = new Blob([json], { type: 'application/json' });

  const coarsePointer = typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  if (coarsePointer && typeof File === 'function' && typeof navigator.canShare === 'function') {
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (err) {
        if (err?.name === 'AbortError') return 'cancelled';
        // Anything else (lost gesture, unsupported type): fall back to download.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start reading the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
};
