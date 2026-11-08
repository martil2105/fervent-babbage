import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import {
  getDisplayExercises,
  orderExercisesByRoutines,
  hasLoggedSets,
  resolveChartedIds,
  normalizeChartedChoice
} from '../utils/workoutHelpers';

/**
 * Choose which exercises get charts on Progress, and a row in the Summary's
 * exercise list. It lists everything Progress could chart, grouped the way
 * you train: each session's exercises in order, then library exercises in no
 * session, then ones that only exist in history.
 *
 * The ticks are a draft until the sheet closes. Done and a tap outside both
 * save, so unticking everything on the way to a short list never leaves a
 * half-made choice behind. Everything or nothing ticked saves as "show all".
 */
export default function ChartedExercisesSheet({
  exercises = [],
  routines = [],
  history = [],
  chosenIds,
  onSave, // (string[] | null) => void
  onClose
}) {
  const shown = useMemo(
    () => getDisplayExercises(orderExercisesByRoutines(exercises, routines), history),
    [exercises, routines, history]
  );
  const allIds = useMemo(() => shown.map((ex) => ex.id), [shown]);

  // No choice yet means everything is charted, so everything starts ticked.
  const [ticked, setTicked] = useState(
    () => resolveChartedIds(allIds, chosenIds) || new Set(allIds)
  );

  const sessionCounts = useMemo(() => {
    const counts = {};
    (history || []).forEach((s) => (s.exercises || []).forEach((e) => {
      if (e.exerciseId && hasLoggedSets(e)) counts[e.exerciseId] = (counts[e.exerciseId] || 0) + 1;
    }));
    return counts;
  }, [history]);

  const groups = useMemo(() => {
    const byId = new Map(shown.map((ex) => [ex.id, ex]));
    const placed = new Set();
    const out = [];
    [...routines]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((r) => {
        const items = (r.exerciseIds || [])
          .filter((id) => byId.has(id) && !placed.has(id))
          .map((id) => byId.get(id));
        items.forEach((ex) => placed.add(ex.id));
        if (items.length) out.push({ key: r.id, label: r.name, items });
      });
    const loose = shown.filter((ex) => !placed.has(ex.id) && !ex.isHistorical);
    if (loose.length) out.push({ key: 'loose', label: 'Not in a session', items: loose });
    const past = shown.filter((ex) => !placed.has(ex.id) && ex.isHistorical);
    if (past.length) out.push({ key: 'past', label: 'Only in history', items: past });
    return out;
  }, [shown, routines]);

  const tickedCount = allIds.filter((id) => ticked.has(id)).length;
  const allTicked = tickedCount === allIds.length;
  const noneTicked = tickedCount === 0;

  const toggle = (id) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const close = () => {
    const next = normalizeChartedChoice([...ticked], allIds);
    const before = Array.isArray(chosenIds) ? normalizeChartedChoice(chosenIds, allIds) : null;
    if (JSON.stringify(next) !== JSON.stringify(before)) onSave?.(next);
    onClose?.();
  };

  const countLabel = allTicked
    ? `All ${allIds.length} ticked`
    : noneTicked ? 'None ticked' : `${tickedCount} of ${allIds.length} ticked`;

  const footnote = allTicked
    ? 'Exercises you add later show up too. Untick any you don’t want charts for.'
    : noneTicked
      ? 'With nothing ticked, every exercise shows.'
      : 'Exercises you add later stay off until you tick them here.';

  const row = (ex) => {
    const on = ticked.has(ex.id);
    const count = sessionCounts[ex.id] || 0;
    return (
      <button
        key={ex.id}
        type="button"
        role="checkbox"
        aria-checked={on}
        className="pick-row choice-row"
        onClick={() => toggle(ex.id)}
      >
        <span className="pick-row-main">
          <span className="pick-row-name">{ex.name}</span>
          <span className="pick-row-meta">
            <span className="meta-quiet">{ex.muscleGroup || 'Other'}</span>{' '}
            {count > 0 ? `${count} session${count === 1 ? '' : 's'}` : 'Not logged yet'}
          </span>
        </span>
        <span className={`choice-box${on ? ' is-on' : ''}`} aria-hidden="true">
          {on && <Check size={14} strokeWidth={3} />}
        </span>
      </button>
    );
  };

  return (
    <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Exercises to chart">
        <div className="sheet-header">
          <h2 className="sheet-title">Exercises to chart</h2>
          <button type="button" className="btn btn-primary btn-sm" onClick={close}>
            Done
          </button>
        </div>

        <div className="sheet-body">
          <p className="sheet-lead">
            Only ticked exercises get Strength and Volume load charts on Progress,
            and a row in the Summary&apos;s exercise list. Totals, consistency,
            effort and muscle balance still count every exercise.
          </p>

          {allIds.length > 0 ? (
            <>
              <div className="choice-toolbar">
                <span aria-live="polite">{countLabel}</span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setTicked(allTicked ? new Set() : new Set(allIds))}
                >
                  {allTicked ? 'Untick all' : 'Tick all'}
                </button>
              </div>

              {groups.map((g) => (
                <section key={g.key} className="list-section">
                  <h3 className="list-section-label">{g.label}</h3>
                  <div className="pick-list">{g.items.map(row)}</div>
                </section>
              ))}

              <p className="text-xs" style={{ margin: '0 4px' }}>{footnote}</p>
            </>
          ) : (
            <p className="text-xs text-center">No exercises yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
