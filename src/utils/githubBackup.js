/**
 * Automatic backups to a private GitHub repository.
 *
 * On an iPhone a web app can't write a file anywhere by itself: Safari has no
 * File System Access API, so the only way out is the share sheet, which asks
 * where to send the file every single time. A backup you have to remember (and
 * then decide where to put) mostly doesn't happen.
 *
 * GitHub's REST API answers cross-origin requests, so the app can save the log
 * straight into a repo the person owns with no server of its own. They make a
 * private repo and a fine-grained token that can only touch that repo, paste
 * both into Settings once, and from then on every workout is saved silently.
 * One file is overwritten each time; the repo's commit history keeps every
 * earlier version, so any past backup can still be recovered.
 *
 * The one real danger is overwriting a good backup with less data — a fresh
 * install, a reset, or a second phone pushing its empty log over the real one.
 * So before replacing a copy this device didn't write itself, the remote file
 * is read and the push is refused if it would drop workouts. The person then
 * chooses: restore from GitHub, or replace GitHub's copy on purpose.
 */

import { parseBackup, countSessionsLostByRestore } from './backupFile.js';

/** Preferences key holding { owner, repo, token }. Device config, never exported. */
export const GITHUB_CONFIG_KEY = 'githubBackup';

/** Preferences key holding sync bookkeeping. Device state, never exported. */
export const GITHUB_STATUS_KEY = 'githubBackupStatus';

/** The single file each backup overwrites. */
export const BACKUP_PATH = 'hypertrophy-log-backup.json';

const API = 'https://api.github.com';
const TIMEOUT_MS = 20000;

// Preferences that change on every backup. Left out of the fingerprint, or
// recording a backup would itself make the data look changed.
const VOLATILE_PREFS = ['lastBackupAt'];

export class GithubBackupError extends Error {
  constructor(code, httpStatus = null) {
    super(code);
    this.name = 'GithubBackupError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * Errors that won't fix themselves: the person has to do something. These are
 * worth a warning on the Dashboard; the rest are retried quietly.
 */
export const PERSISTENT_ERRORS = ['bad-token', 'no-access', 'read-only', 'conflict'];

export const describeGithubError = (code, httpStatus = null) => {
  switch (code) {
    case 'bad-repo':
      return 'Enter the repo as owner/name, like your-name/hyplog-backups.';
    case 'no-token':
      return 'Paste the token from GitHub.';
    case 'bad-token':
      return 'GitHub didn’t accept the token. It may have expired. Make a new one and connect again.';
    case 'no-access':
      return 'This token can’t see that repo. Check the name, and that the token was given access to it.';
    case 'read-only':
      return 'The token can’t write to the repo. Give it Contents: Read and write.';
    case 'rate-limited':
      return 'GitHub is limiting requests right now. It’ll try again later.';
    case 'offline':
      return 'Couldn’t reach GitHub. It’ll try again when you’re online.';
    case 'conflict':
      return 'GitHub has workouts that aren’t on this phone, so the backup there wasn’t replaced.';
    case 'not-a-backup':
      return 'The file in the repo isn’t a HYPERTROPHY.LOG backup.';
    case 'no-backup':
      return 'There’s no backup in the repo yet.';
    default:
      return `GitHub returned an error${httpStatus ? ` (${httpStatus})` : ''}. It’ll try again after your next workout.`;
  }
};

/**
 * Accepts "owner/repo", "github.com/owner/repo" or a full https URL (with or
 * without .git). Returns { owner, repo } or null.
 */
export const parseRepo = (input) => {
  if (typeof input !== 'string') return null;
  const trimmed = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  const match = trimmed.match(/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/);
  if (!match || match[2] === '.' || match[2] === '..') return null;
  return { owner: match[1], repo: match[2] };
};

/** UTF-8 safe base64 (exercise names can hold curly quotes, accents, …). */
export const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

/**
 * A cheap content hash (cyrb53) of the backup minus the bookkeeping that
 * changes every time. Lets the app skip a push when nothing has changed, so
 * checking on every app open costs nothing.
 */
export const backupFingerprint = (payload) => {
  const prefs = { ...(payload?.preferences || {}) };
  VOLATILE_PREFS.forEach((key) => delete prefs[key]);
  const text = JSON.stringify({ ...payload, preferences: prefs });

  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

// The phone's own calendar day, not UTC: a late-evening workout in Oslo
// shouldn't be labelled with the day before.
const isoDay = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const commitMessage = (payload) => {
  const sessions = Array.isArray(payload?.history) ? payload.history : [];
  const latest = sessions.reduce((max, s) => (Number.isFinite(s?.timestamp) && s.timestamp > max ? s.timestamp : max), 0);
  const count = `${sessions.length} workout${sessions.length === 1 ? '' : 's'}`;
  return latest ? `Backup: ${count}, latest ${isoDay(latest)}` : `Backup: ${count}`;
};

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

const contentsUrl = ({ owner, repo }) =>
  `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(BACKUP_PATH)}`;

const isRateLimited = (res) =>
  res.status === 429 || (res.status === 403 && res.headers?.get?.('x-ratelimit-remaining') === '0');

/**
 * One API call. Network failures become 'offline'; HTTP errors are returned
 * (not thrown) so each caller can decide what a 404 or 403 means for it.
 */
const call = async (config, url, { method = 'GET', accept = 'application/vnd.github+json', body, fetchImpl = fetch } = {}) => {
  const headers = {
    Accept: accept,
    Authorization: `Bearer ${config.token}`
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(TIMEOUT_MS)
    : undefined;

  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // GitHub sends Cache-Control: max-age=60. A cached read of the file's
      // sha right after writing it would make the next write fail.
      cache: 'no-store',
      signal
    });
  } catch {
    throw new GithubBackupError('offline');
  }
  if (res.status === 401) throw new GithubBackupError('bad-token', 401);
  if (isRateLimited(res)) throw new GithubBackupError('rate-limited', res.status);
  return res;
};

/** Check the token can see the repo. Returns { fullName, isPrivate }. */
export const checkRepo = async (config, fetchImpl) => {
  const res = await call(config, `${API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`, { fetchImpl });
  if (res.status === 404 || res.status === 403) throw new GithubBackupError('no-access', res.status);
  if (!res.ok) throw new GithubBackupError('http', res.status);
  const info = await res.json();
  return { fullName: info.full_name, isPrivate: !!info.private };
};

/** The backup file's current blob sha, or null when there isn't one yet. */
export const getRemoteSha = async (config, fetchImpl) => {
  // The "object" media type returns the sha even for files over 1 MB, where
  // the default one refuses.
  const res = await call(config, contentsUrl(config), { accept: 'application/vnd.github.object+json', fetchImpl });
  if (res.status === 404) return null; // no file yet, or an empty repo
  if (res.status === 403) throw new GithubBackupError('no-access', 403);
  if (!res.ok) throw new GithubBackupError('http', res.status);
  const info = await res.json();
  return info.sha || null;
};

/** The backup file's text, or null when there isn't one. */
export const fetchRemoteText = async (config, fetchImpl) => {
  const res = await call(config, contentsUrl(config), { accept: 'application/vnd.github.raw+json', fetchImpl });
  if (res.status === 404) return null;
  if (res.status === 403) throw new GithubBackupError('no-access', 403);
  if (!res.ok) throw new GithubBackupError('http', res.status);
  return res.text();
};

/** Write the file. Returns the new blob sha. */
export const putBackupFile = async (config, text, sha, message, fetchImpl) => {
  const body = { message, content: toBase64(text) };
  if (sha) body.sha = sha;
  const res = await call(config, contentsUrl(config), { method: 'PUT', body, fetchImpl });
  // 409: the sha is out of date. 422: no sha sent but the file now exists.
  if (res.status === 409 || res.status === 422) throw new GithubBackupError('stale-sha', res.status);
  if (res.status === 403 || res.status === 404) throw new GithubBackupError('read-only', res.status);
  if (!res.ok) throw new GithubBackupError('http', res.status);
  const info = await res.json();
  return info?.content?.sha || null;
};

/**
 * Fetch and check the backup in the repo. Returns { data, summary, sha }.
 * Throws 'no-backup' or 'not-a-backup' when there's nothing to restore.
 */
export const fetchRemoteBackup = async (config, fetchImpl) => {
  const sha = await getRemoteSha(config, fetchImpl);
  if (!sha) throw new GithubBackupError('no-backup');
  const text = await fetchRemoteText(config, fetchImpl);
  if (text === null) throw new GithubBackupError('no-backup');
  const checked = parseBackup(text);
  if (!checked.ok) throw new GithubBackupError('not-a-backup');
  return { data: checked.data, summary: checked.summary, sha };
};

/**
 * Save `payload` to the repo.
 *
 * `syncedSha` is the sha of the copy this device last wrote or restored. When
 * the repo still holds exactly that, this device's data is the newer story and
 * is written straight over it. When it holds something else (another device
 * wrote it, or this device never synced), the remote copy is read first and
 * the push is refused if it would drop workouts — unless `overwrite` is set,
 * which is the person explicitly choosing to replace it.
 *
 * Returns { status: 'pushed', sha } or
 *         { status: 'conflict', lost, remoteSummary }.
 */
export const pushBackup = async ({ config, payload, syncedSha = null, overwrite = false, fetchImpl }) => {
  const text = JSON.stringify(payload, null, 2);
  const message = commitMessage(payload);

  for (let attempt = 0; ; attempt++) {
    const remoteSha = await getRemoteSha(config, fetchImpl);

    if (remoteSha && remoteSha !== syncedSha && !overwrite) {
      const remoteText = await fetchRemoteText(config, fetchImpl);
      const remote = remoteText === null ? null : parseBackup(remoteText);
      // A file that isn't a backup is just replaced — the commit history
      // still has it if it mattered.
      if (remote?.ok) {
        const lost = countSessionsLostByRestore(remote.data.history, payload.history);
        if (lost > 0) return { status: 'conflict', lost, remoteSummary: remote.summary };
      }
    }

    try {
      const sha = await putBackupFile(config, text, remoteSha, message, fetchImpl);
      return { status: 'pushed', sha };
    } catch (err) {
      // Someone wrote between our read and write. Go round once more, which
      // re-runs the safety check against what's there now.
      if (err?.code === 'stale-sha' && attempt === 0) continue;
      if (err?.code === 'stale-sha') throw new GithubBackupError('http', err.httpStatus);
      throw err;
    }
  }
};
