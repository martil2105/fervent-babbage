import { useMemo, useState } from 'react';
import { X, Trophy, GitMerge } from 'lucide-react';
import AccretionStrip from './AccretionStrip';
import ExercisePicker from './ExercisePicker';
import ConfirmDialog from './ConfirmDialog';
import {
  formatDate,
  formatWeight,
  getAllTimeBest,
  getAccretionSeries,
  getEstimated1RM,
  getExerciseHistory
} from '../utils/workoutHelpers';

/**
 * Everything logged for one exercise: best, trend strip, and every session
 * that included it, newest first — "what did I do on incline press two weeks
 * ago" without leaving the workout.
 *
 * It is also where a stray duplicate gets folded into the right exercise
 * ("Merge into…"), since this is the page where you notice one.
 */
export default function ExerciseDetail({
  exerciseId,
  catalog = [],
  routines = [],
  history = [],
  onClose,
  onMerge, // async (sourceIds, targetEntry) => boolean
  onOpenExercise
}) {
  const entry = catalog.find((e) => e.id === exerciseId);
  const [picking, setPicking] = useState(false);
  const [mergeTarget, setMergeTarget] = useState(null);
  const [merging, setMerging] = useState(false);

  const sessions = useMemo(() => getExerciseHistory(exerciseId, history), [exerciseId, history]);
  const best = useMemo(() => getAllTimeBest(exerciseId, history), [exerciseId, history]);
  const accretion = useMemo(() => getAccretionSeries(exerciseId, history), [exerciseId, history]);
  const best1RM = useMemo(() => {
    let max = 0;
    history.forEach((s) => (s.exercises || []).forEach((e) => {
      if (e.exerciseId !== exerciseId) return;
      (e.sets || []).forEach((set) => {
        if (set.isWarmup || set.completed === false) return;
        max = Math.max(max, getEstimated1RM(set.weight, set.reps));
      });
    }));
    return Math.round(max * 10) / 10;
  }, [exerciseId, history]);

  if (!entry) return null;

  const routineNames = routines.filter((r) => (r.exerciseIds || []).includes(entry.id)).map((r) => r.name);
  const where = routineNames.length
    ? `In ${routineNames.join(' & ')}`
    : entry.inLibrary ? 'Not in a session' : 'Only in history';
  const loggedCount = sessions.filter((s) => s.logged).length;

  const confirmMerge = async () => {
    if (!mergeTarget) return;
    setMerging(true);
    try {
      const ok = await onMerge?.([entry.id], mergeTarget);
      setMergeTarget(null);
      if (ok) onOpenExercise?.(mergeTarget.id);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={entry.name}>
        <div className="sheet-header">
          <div style={{ minWidth: 0 }}>
            <h2 className="sheet-title">{entry.name}</h2>
            <span className="text-xs text-muted">
              {entry.muscleGroup || 'Other'} · {entry.exerciseType === 'isolation' ? 'Isolation' : 'Compound'} · {where}
            </span>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="sheet-body">
          <div className="analytics-summary-grid">
            <div className="metric-card" style={{ padding: '12px' }}>
              <span className="text-xs text-muted text-bold">BEST SET</span>
              <div className="metric-value" style={{ fontSize: '26px' }}>
                {best ? formatWeight(best.weight) : '–'}
                {best && <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}> kg × {best.bestReps}</span>}
              </div>
              <span className="text-xs text-muted" style={{ display: 'block', marginTop: '6px' }}>
                {best ? formatDate(best.timestamp) : 'nothing logged yet'}
              </span>
            </div>
            <div className="metric-card" style={{ padding: '12px' }}>
              <span className="text-xs text-muted text-bold">SESSIONS</span>
              <div className="metric-value" style={{ fontSize: '26px' }}>{loggedCount}</div>
              <span className="text-xs text-muted" style={{ display: 'block', marginTop: '6px' }}>
                {best1RM > 0 ? `est. 1RM ${formatWeight(best1RM)} kg` : '—'}
              </span>
            </div>
          </div>

          {accretion.points.length >= 2 && (
            <div className="card" style={{ padding: '12px 14px' }}>
              <AccretionStrip points={accretion.points} height={26} label="Top set, recent sessions" />
            </div>
          )}

          <div className="list-section-label">History</div>
          {sessions.length === 0 ? (
            <p className="text-xs text-muted text-center">No sessions yet.</p>
          ) : (
            <div className="pick-list">
              {sessions.map((s) => {
                const isBestSession = best && s.timestamp === best.timestamp;
                return (
                  <div key={s.sessionId} className="pick-row" style={{ cursor: 'default', alignItems: 'flex-start', flexDirection: 'column', gap: '6px', opacity: s.logged ? 1 : 0.55 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      <span className="text-bold" style={{ fontSize: '13px' }}>{formatDate(s.timestamp)}</span>
                      {s.routineName && <span className="text-xs text-muted">{s.routineName}</span>}
                      {isBestSession && (
                        <span className="text-xs text-bold" style={{ color: 'var(--success-strong)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Trophy size={12} /> best
                        </span>
                      )}
                      <span className="text-xs text-muted" style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                        {s.logged ? `${Math.round(s.volume).toLocaleString()} kg` : 'skipped'}
                      </span>
                    </div>
                    <div className="history-detail-sets">
                      {s.sets.map((set, i) => {
                        const skipped = set.completed === false;
                        return (
                          <span
                            key={i}
                            className="history-detail-set-badge"
                            style={set.isWarmup || skipped ? { opacity: 0.5, fontStyle: 'italic' } : undefined}
                          >
                            {formatWeight(set.weight)}×{set.reps}{set.isWarmup ? ' W' : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {onMerge && (
            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPicking(true)} style={{ justifyContent: 'flex-start' }}>
                <GitMerge size={16} /> Merge into another exercise…
              </button>
              <span className="text-xs text-muted">
                For a duplicate: moves this exercise&apos;s history onto the one you pick,
                so they count as one lift.
              </span>
            </div>
          )}
        </div>
      </div>

      {picking && (
        <ExercisePicker
          title={`Merge “${entry.name}” into…`}
          catalog={catalog}
          routines={routines}
          history={history}
          hideIds={[entry.id]}
          allowCreate={false}
          onClose={() => setPicking(false)}
          onPick={(target) => {
            setPicking(false);
            setMergeTarget(target);
          }}
        />
      )}

      {mergeTarget && (
        <ConfirmDialog
          title={`Merge into ${mergeTarget.name}?`}
          confirmLabel="Merge"
          busy={merging}
          onCancel={() => setMergeTarget(null)}
          onConfirm={confirmMerge}
        >
          All {sessions.length} session{sessions.length === 1 ? '' : 's'} of “{entry.name}” will be
          logged as “{mergeTarget.name}”{entry.inLibrary ? `, and “${entry.name}” leaves your exercise list` : ''}.
          This rewrites history and can&apos;t be undone — export a backup first if you&apos;re unsure.
        </ConfirmDialog>
      )}
    </div>
  );
}
