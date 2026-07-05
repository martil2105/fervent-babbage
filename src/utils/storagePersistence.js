/**
 * Storage durability helpers.
 *
 * By default browsers keep IndexedDB in "best-effort" mode, which can be
 * cleared automatically when the disk gets low. Requesting persistent storage
 * moves this origin to durable mode so the browser won't evict it under
 * pressure (in Chrome the grant is based on engagement / install signals).
 * All calls are guarded so they no-op safely where the API is unavailable.
 */

// Ask the browser to keep our data durable. Returns the resulting state.
export async function ensurePersistentStorage() {
  try {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
      return { supported: false, persisted: false };
    }
    if (typeof navigator.storage.persisted === 'function') {
      const already = await navigator.storage.persisted();
      if (already) return { supported: true, persisted: true };
    }
    const persisted = await navigator.storage.persist();
    return { supported: true, persisted };
  } catch {
    return { supported: false, persisted: false };
  }
}

// Report how much the origin is currently using, for a reassuring readout.
export async function getStorageEstimate() {
  try {
    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
      return null;
    }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

// Human-friendly byte formatter (e.g. "142 KB", "3.1 MB").
export function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}
