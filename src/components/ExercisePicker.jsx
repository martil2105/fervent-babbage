import { useMemo, useState } from 'react';
import { Plus, Search, X, ChevronRight } from 'lucide-react';
import {
  searchExercises,
  findMatchingExercise,
  dedupeByKey,
  tidyExerciseName,
  guessMuscleGroup,
  guessExerciseType
} from '../utils/exerciseLibrary';
import { getLastSessionSets, summarizeSets, SELECTABLE_MUSCLE_GROUPS } from '../utils/workoutHelpers';

const DAY_MS = 86400000;

const ago = (ts, now) => {
  if (!ts) return null;
  const days = Math.max(0, Math.floor((now - ts) / DAY_MS));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
};

/**
 * Pick an exercise from everything the app knows — so a lift is always the
 * same exercise, with its history, however you'd have typed it.
 *
 * With an empty search it lists the library grouped by session, then every
 * other exercise (library-only or history-only), most recent first. Typing
 * filters with the forgiving matcher in exerciseLibrary: case, spaces, plurals
 * and abbreviations don't matter, and a near-miss typo shows up as "Did you
 * mean". A new exercise can only be created when nothing already matches.
 */
export default function ExercisePicker({
  title = 'Add exercise',
  catalog = [],
  routines = [],
  history = [],
  excludeIds = [],
  hideIds = [],
  allowCreate = true,
  onPick,
  onCreate,
  onClose
}) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null); // { name, muscleGroup, exerciseType } while creating
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const hidden = useMemo(() => new Set(hideIds), [hideIds]);
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);
  const visible = useMemo(() => catalog.filter((e) => !hidden.has(e.id)), [catalog, hidden]);

  const trimmed = query.trim();
  const results = useMemo(() => (trimmed ? searchExercises(trimmed, visible) : []), [trimmed, visible]);
  const match = useMemo(() => (trimmed ? findMatchingExercise(trimmed, visible) : { exact: null, similar: [] }), [trimmed, visible]);

  // Grouped browse list for an empty search.
  const groups = useMemo(() => {
    if (trimmed) return [];
    const byId = new Map(visible.map((e) => [e.id, e]));
    const shown = new Set();
    const out = [];
    [...routines]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((r) => {
        const items = (r.exerciseIds || []).map((id) => byId.get(id)).filter(Boolean);
        items.forEach((e) => shown.add(e.id));
        if (items.length) out.push({ label: r.name, items });
      });
    const others = dedupeByKey(visible.filter((e) => !shown.has(e.id)))
      .sort((a, b) => ((b.lastUsedAt || 0) - (a.lastUsedAt || 0)) || a.name.localeCompare(b.name));
    if (others.length) out.push({ label: out.length ? 'Other exercises' : 'Exercises', items: others });
    return out;
  }, [trimmed, visible, routines]);

  const lastText = (entry) => {
    const last = getLastSessionSets(entry.id, history);
    if (!last) return 'Not logged yet';
    return `${summarizeSets(last.sets)} · ${ago(last.timestamp, now)}`;
  };

  const pick = async (entry) => {
    if (busy || excluded.has(entry.id)) return;
    setBusy(true);
    try {
      await onPick?.(entry);
    } finally {
      setBusy(false);
    }
  };

  const startCreate = () => {
    const name = tidyExerciseName(trimmed);
    setDraft({ name, muscleGroup: guessMuscleGroup(name), exerciseType: guessExerciseType(name) });
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    const name = tidyExerciseName(draft?.name);
    if (!name || busy) return;
    // The name may have been edited in the form: check it again.
    const again = findMatchingExercise(name, visible);
    if (again.exact) {
      await pick(again.exact);
      return;
    }
    setBusy(true);
    try {
      await onCreate?.({ ...draft, name });
    } finally {
      setBusy(false);
    }
  };

  const row = (entry, { note } = {}) => {
    const inWorkout = excluded.has(entry.id);
    return (
      <button
        key={entry.id}
        type="button"
        className="pick-row"
        onClick={() => pick(entry)}
        disabled={inWorkout || busy}
      >
        <span className="pick-row-main">
          <span className="pick-row-name">{entry.name}</span>
          <span className="pick-row-meta">
            {note ? `${note} · ` : ''}{entry.muscleGroup || 'Other'} · {lastText(entry)}
          </span>
        </span>
        {inWorkout
          ? <span className="text-xs text-muted" style={{ flexShrink: 0 }}>In workout</span>
          : <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
      </button>
    );
  };

  const similarIds = new Set(match.similar.map((e) => e.id));
  const otherResults = results.filter((e) => !similarIds.has(e.id));
  const canCreate = allowCreate && !!trimmed && !match.exact;

  return (
    <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-header">
          <h2 className="sheet-title">{draft ? 'New exercise' : title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="sheet-body">
          {draft ? (
            <form onSubmit={submitCreate} className="card" style={{ gap: '14px' }}>
              <div className="form-group">
                <label htmlFor="new-ex-name">Name</label>
                <input
                  id="new-ex-name"
                  className="form-input"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  autoFocus
                  required
                />
                {(() => {
                  const m = findMatchingExercise(draft.name, visible);
                  if (m.exact) {
                    return (
                      <span className="text-xs" style={{ color: 'var(--warning-strong)' }}>
                        You already have “{m.exact.name}” — saving picks that one.
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="new-ex-mg">Muscle group</label>
                  <select
                    id="new-ex-mg"
                    className="form-input"
                    value={draft.muscleGroup}
                    onChange={(e) => setDraft((d) => ({ ...d, muscleGroup: e.target.value }))}
                  >
                    {SELECTABLE_MUSCLE_GROUPS.map((mg) => <option key={mg} value={mg}>{mg}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="new-ex-type">Type</label>
                  <select
                    id="new-ex-type"
                    className="form-input"
                    value={draft.exerciseType}
                    onChange={(e) => setDraft((d) => ({ ...d, exerciseType: e.target.value }))}
                  >
                    <option value="compound">Compound</option>
                    <option value="isolation">Isolation</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                It goes into your exercise list, so next time you can pick it and it
                remembers what you did. Sets, reps and rest can be changed in Settings.
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(null)} disabled={busy}>
                  Back
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !draft.name.trim()}>
                  {busy ? 'Adding…' : 'Create & add'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="input-search" style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="search"
                  className="form-input"
                  placeholder={allowCreate ? 'Search, or type a new name' : 'Search'}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  enterKeyHint="search"
                  aria-label="Search exercises"
                  style={{ width: '100%', paddingLeft: '36px' }}
                />
              </div>

              {trimmed ? (
                <>
                  {match.similar.length > 0 && (
                    <>
                      <div className="list-section-label">Did you mean</div>
                      <div className="pick-list">{match.similar.map((e) => row(e))}</div>
                    </>
                  )}
                  {otherResults.length > 0 && (
                    <>
                      {match.similar.length > 0 && <div className="list-section-label">Matches</div>}
                      <div className="pick-list">
                        {otherResults.map((e) => row(e, { note: match.exact?.id === e.id ? 'Same exercise' : null }))}
                      </div>
                    </>
                  )}
                  {canCreate && (
                    <button type="button" className="btn btn-secondary" onClick={startCreate} style={{ justifyContent: 'flex-start' }}>
                      <Plus size={16} />
                      {results.length ? `None of these — create “${tidyExerciseName(trimmed)}”` : `Create “${tidyExerciseName(trimmed)}”`}
                    </button>
                  )}
                  {!canCreate && results.length === 0 && (
                    <p className="text-xs text-muted text-center">No exercise matches “{trimmed}”.</p>
                  )}
                </>
              ) : (
                groups.length > 0 ? groups.map((g) => (
                  <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div className="list-section-label">{g.label}</div>
                    <div className="pick-list">{g.items.map((e) => row(e))}</div>
                  </div>
                )) : (
                  <p className="text-xs text-muted text-center">
                    No exercises yet — type a name above to create your first.
                  </p>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
