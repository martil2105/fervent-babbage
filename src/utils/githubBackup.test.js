import { describe, it, expect } from 'vitest';
import {
  parseRepo,
  toBase64,
  backupFingerprint,
  commitMessage,
  pushBackup,
  fetchRemoteBackup,
  checkRepo,
  GithubBackupError,
  BACKUP_PATH,
} from './githubBackup.js';

const config = { owner: 'martin', repo: 'hyplog-backups', token: 'github_pat_test' };

const session = (id, iso) => ({ id, timestamp: new Date(iso).getTime(), exercises: [] });
const payload = (ids = ['a', 'b']) => ({
  exercises: [{ id: 'leg-press', name: 'Leg Press' }],
  history: ids.map((id, i) => session(id, `2026-09-0${i + 1}`)),
  preferences: { prefLoggingMode: 'RPE' },
  routines: [{ id: 'routine-legs', name: 'Legs', exerciseIds: ['leg-press'], order: 0 }],
});

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/**
 * A tiny in-memory stand-in for the GitHub contents API: one file, with a sha
 * that changes on every write. `failNext` injects one response for the next
 * call of a given method.
 */
const fakeGithub = ({ text = null, repoPrivate = true } = {}) => {
  const state = { text, sha: text === null ? null : 'sha-0', writes: 0, calls: [], failNext: {} };
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const accept = opts.headers?.Accept;
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    state.calls.push({ url, method, accept, body, auth: opts.headers?.Authorization, cache: opts.cache });

    if (state.failNext[method]) {
      const res = state.failNext[method];
      delete state.failNext[method];
      if (res instanceof Error) throw res;
      return res;
    }

    if (!url.includes('/contents/')) return json(200, { full_name: `${config.owner}/${config.repo}`, private: repoPrivate });

    if (method === 'GET') {
      if (state.text === null) return json(404, { message: 'Not Found' });
      if (accept === 'application/vnd.github.raw+json') return new Response(state.text, { status: 200 });
      return json(200, { sha: state.sha, content: '' });
    }

    if (method === 'PUT') {
      if (state.text !== null && body.sha !== state.sha) return json(409, { message: 'sha mismatch' });
      if (state.text === null && body.sha) return json(409, { message: 'no such file' });
      state.text = fromBase64(body.content);
      state.writes += 1;
      state.sha = `sha-${state.writes}`;
      return json(state.text === null ? 201 : 200, { content: { sha: state.sha } });
    }
    return json(405, {});
  };
  return { state, fetchImpl };
};

describe('parseRepo', () => {
  it('accepts owner/repo, github.com paths and full URLs', () => {
    const want = { owner: 'martil2105', repo: 'hyplog-backups' };
    expect(parseRepo('martil2105/hyplog-backups')).toEqual(want);
    expect(parseRepo('  github.com/martil2105/hyplog-backups/ ')).toEqual(want);
    expect(parseRepo('https://github.com/martil2105/hyplog-backups.git')).toEqual(want);
    expect(parseRepo('https://www.github.com/martil2105/hyplog-backups')).toEqual(want);
  });

  it('rejects anything that is not a single owner/repo', () => {
    expect(parseRepo('')).toBeNull();
    expect(parseRepo('hyplog-backups')).toBeNull();
    expect(parseRepo('a/b/c')).toBeNull();
    expect(parseRepo('-bad/repo')).toBeNull();
    expect(parseRepo('owner/..')).toBeNull();
    expect(parseRepo(null)).toBeNull();
  });
});

describe('toBase64', () => {
  it('round-trips non-ASCII text as UTF-8', () => {
    const text = 'Bulgarian split squat – “slow” ø æ å 💪';
    expect(fromBase64(toBase64(text))).toBe(text);
  });

  it('handles text larger than one chunk', () => {
    const text = 'x'.repeat(100000) + 'é';
    expect(fromBase64(toBase64(text))).toBe(text);
  });
});

describe('backupFingerprint', () => {
  it('ignores the last-backup timestamp but sees real changes', () => {
    const p = payload();
    const stamped = { ...p, preferences: { ...p.preferences, lastBackupAt: 123 } };
    expect(backupFingerprint(stamped)).toBe(backupFingerprint(p));
    expect(backupFingerprint(payload(['a', 'b', 'c']))).not.toBe(backupFingerprint(p));
    expect(backupFingerprint({ ...p, preferences: { prefLoggingMode: 'RIR' } })).not.toBe(backupFingerprint(p));
  });
});

describe('commitMessage', () => {
  it('names the count and the latest workout', () => {
    expect(commitMessage(payload())).toBe('Backup: 2 workouts, latest 2026-09-02');
    expect(commitMessage(payload(['a']))).toBe('Backup: 1 workout, latest 2026-09-01');
    expect(commitMessage({ history: [] })).toBe('Backup: 0 workouts');
  });
});

describe('pushBackup', () => {
  it('creates the file when the repo has none', async () => {
    const gh = fakeGithub();
    const r = await pushBackup({ config, payload: payload(), fetchImpl: gh.fetchImpl });
    expect(r).toEqual({ status: 'pushed', sha: 'sha-1' });
    expect(JSON.parse(gh.state.text)).toEqual(payload());
    const put = gh.state.calls.find((c) => c.method === 'PUT');
    expect(put.url).toBe(`https://api.github.com/repos/martin/hyplog-backups/contents/${BACKUP_PATH}`);
    expect(put.body.sha).toBeUndefined();
    expect(put.body.message).toBe('Backup: 2 workouts, latest 2026-09-02');
    expect(put.auth).toBe('Bearer github_pat_test');
    expect(gh.state.calls.every((c) => c.cache === 'no-store')).toBe(true);
  });

  it('overwrites its own last copy without reading it back', async () => {
    const gh = fakeGithub({ text: JSON.stringify(payload(['a'])) });
    const r = await pushBackup({ config, payload: payload(['a', 'b']), syncedSha: 'sha-0', fetchImpl: gh.fetchImpl });
    expect(r.status).toBe('pushed');
    expect(gh.state.calls.some((c) => c.accept === 'application/vnd.github.raw+json')).toBe(false);
    expect(JSON.parse(gh.state.text).history).toHaveLength(2);
  });

  it('allows deleting a workout on this device when it wrote the last copy', async () => {
    const gh = fakeGithub({ text: JSON.stringify(payload(['a', 'b'])) });
    const r = await pushBackup({ config, payload: payload(['a']), syncedSha: 'sha-0', fetchImpl: gh.fetchImpl });
    expect(r.status).toBe('pushed');
    expect(JSON.parse(gh.state.text).history).toHaveLength(1);
  });

  it('refuses to replace a copy it did not write when that would lose workouts', async () => {
    const remote = JSON.stringify(payload(['a', 'b', 'c']));
    const gh = fakeGithub({ text: remote });
    const r = await pushBackup({ config, payload: payload([]), syncedSha: null, fetchImpl: gh.fetchImpl });
    expect(r.status).toBe('conflict');
    expect(r.lost).toBe(3);
    expect(r.remoteSummary.sessions).toBe(3);
    expect(gh.state.text).toBe(remote);
    expect(gh.state.calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('replaces a copy it did not write when nothing would be lost', async () => {
    const gh = fakeGithub({ text: JSON.stringify(payload(['a'])) });
    const r = await pushBackup({ config, payload: payload(['a', 'b']), syncedSha: 'sha-other', fetchImpl: gh.fetchImpl });
    expect(r.status).toBe('pushed');
    expect(JSON.parse(gh.state.text).history).toHaveLength(2);
  });

  it('replaces anything when told to overwrite', async () => {
    const gh = fakeGithub({ text: JSON.stringify(payload(['a', 'b', 'c'])) });
    const r = await pushBackup({ config, payload: payload(['z']), overwrite: true, fetchImpl: gh.fetchImpl });
    expect(r.status).toBe('pushed');
    expect(JSON.parse(gh.state.text).history.map((s) => s.id)).toEqual(['z']);
  });

  it('replaces a file in the repo that is not a backup', async () => {
    const gh = fakeGithub({ text: 'hello' });
    const r = await pushBackup({ config, payload: payload(), fetchImpl: gh.fetchImpl });
    expect(r.status).toBe('pushed');
  });

  it('retries once when the file changed between read and write', async () => {
    const gh = fakeGithub({ text: JSON.stringify(payload(['a'])) });
    gh.state.failNext.PUT = json(409, { message: 'sha mismatch' });
    const r = await pushBackup({ config, payload: payload(['a', 'b']), syncedSha: 'sha-0', fetchImpl: gh.fetchImpl });
    expect(r.status).toBe('pushed');
    expect(gh.state.calls.filter((c) => c.method === 'PUT')).toHaveLength(2);
  });

  it('reports an expired token, a read-only token, rate limits and no network', async () => {
    const expect401 = fakeGithub();
    expect401.state.failNext.GET = json(401, { message: 'Bad credentials' });
    await expect(pushBackup({ config, payload: payload(), fetchImpl: expect401.fetchImpl }))
      .rejects.toMatchObject({ code: 'bad-token' });

    const readOnly = fakeGithub();
    readOnly.state.failNext.PUT = json(403, { message: 'Resource not accessible by personal access token' });
    await expect(pushBackup({ config, payload: payload(), fetchImpl: readOnly.fetchImpl }))
      .rejects.toMatchObject({ code: 'read-only' });

    const limited = fakeGithub();
    limited.state.failNext.GET = json(403, { message: 'rate limit' }, { 'x-ratelimit-remaining': '0' });
    await expect(pushBackup({ config, payload: payload(), fetchImpl: limited.fetchImpl }))
      .rejects.toMatchObject({ code: 'rate-limited' });

    const offline = fakeGithub();
    offline.state.failNext.GET = new TypeError('Load failed');
    const err = await pushBackup({ config, payload: payload(), fetchImpl: offline.fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(GithubBackupError);
    expect(err.code).toBe('offline');
  });
});

describe('fetchRemoteBackup', () => {
  it('returns the checked backup with its sha', async () => {
    const gh = fakeGithub({ text: JSON.stringify(payload(['a', 'b'])) });
    const r = await fetchRemoteBackup(config, gh.fetchImpl);
    expect(r.sha).toBe('sha-0');
    expect(r.summary.sessions).toBe(2);
    expect(r.data.history).toHaveLength(2);
  });

  it('says so when there is nothing to restore', async () => {
    await expect(fetchRemoteBackup(config, fakeGithub().fetchImpl)).rejects.toMatchObject({ code: 'no-backup' });
    await expect(fetchRemoteBackup(config, fakeGithub({ text: '{}' }).fetchImpl)).rejects.toMatchObject({ code: 'not-a-backup' });
  });
});

describe('checkRepo', () => {
  it('reports whether the repo is private', async () => {
    expect(await checkRepo(config, fakeGithub().fetchImpl)).toEqual({ fullName: 'martin/hyplog-backups', isPrivate: true });
    expect((await checkRepo(config, fakeGithub({ repoPrivate: false }).fetchImpl)).isPrivate).toBe(false);
  });

  it('treats a 404 as no access (wrong name or token not granted the repo)', async () => {
    const gh = fakeGithub();
    gh.state.failNext.GET = json(404, { message: 'Not Found' });
    await expect(checkRepo(config, gh.fetchImpl)).rejects.toMatchObject({ code: 'no-access' });
  });
});
