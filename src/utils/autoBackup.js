/**
 * Automatic backups to a folder on disk.
 *
 * Everything this app knows lives in one browser's IndexedDB. Clearing site
 * data, losing the device, or storage eviction destroys the entire training
 * history, and a log's whole value is that it's long-running. Manual export
 * only helps people who remember to do it.
 *
 * Where the File System Access API exists (Chrome/Edge, desktop and Android)
 * the user grants a folder once and we write to it silently thereafter. The
 * handle survives restarts because IndexedDB can structured-clone it.
 *
 * Safari and iOS don't implement the API. There, `isSupported()` is false and
 * the UI falls back to the existing manual JSON export — so this is strictly
 * additive and never the only line of defence.
 */

export const BACKUP_INTERVAL_DAYS = 3;

export const isSupported = () =>
  typeof window !== 'undefined' &&
  typeof window.showDirectoryPicker === 'function';

/** Prompt for a backup folder. Must be called from a user gesture. */
export const pickBackupFolder = async () => {
  if (!isSupported()) return null;
  try {
    return await window.showDirectoryPicker({
      id: 'hypertrophy-log-backups',
      mode: 'readwrite',
      startIn: 'documents'
    });
  } catch {
    // AbortError when the user dismisses the picker — not an error worth surfacing.
    return null;
  }
};

/**
 * Check (and optionally re-request) write permission on a stored handle.
 * Browsers drop the grant between sessions, and re-requesting requires a user
 * gesture — so pass `interactive: true` only from a click handler.
 */
export const ensureWritePermission = async (handle, { interactive = false } = {}) => {
  if (!handle?.queryPermission) return false;
  const opts = { mode: 'readwrite' };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (!interactive) return false;
    return (await handle.requestPermission(opts)) === 'granted';
  } catch {
    return false;
  }
};

const filenameFor = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `hypertrophy-log_${stamp}.json`;
};

/**
 * Write a backup into the folder. Returns the filename on success, null on
 * failure — callers treat failure as "not backed up" rather than throwing,
 * since this runs in the background after a workout.
 */
export const writeBackup = async (handle, payload, now = Date.now()) => {
  if (!handle) return null;
  if (!(await ensureWritePermission(handle))) return null;

  try {
    const name = filenameFor(new Date(now));
    const fileHandle = await handle.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    return name;
  } catch {
    return null;
  }
};

/**
 * Whether a backup is overdue. Never-backed-up counts as overdue, which is the
 * case that matters most — a brand new log with no safety net at all.
 */
export const isBackupDue = (lastBackupAt, now, intervalDays = BACKUP_INTERVAL_DAYS) => {
  if (!lastBackupAt) return true;
  return now - lastBackupAt > intervalDays * 86400000;
};

/** Whole days since the last backup, or null if there has never been one. */
export const daysSinceBackup = (lastBackupAt, now) => {
  if (!lastBackupAt) return null;
  return Math.max(0, Math.floor((now - lastBackupAt) / 86400000));
};
