import { useMemo, useState } from 'react';
import { X, Trophy, GitMerge } from 'lucide-react';
import AccretionStrip from './AccretionStrip';
import ExercisePicker from './ExercisePicker';
import ConfirmDialog from './ConfirmDialog';
import {
  formatWeight,
  getAllTimeBest,
  getAccretionSeries,
  getEstimated1RM,
  getExerciseHistory
} from '../utils/workoutHelpers';
import { sessionDate, formatNumber } from '../utils/format';

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
  const [now] = useState(() => Date.now());

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
    ? `In ${routineNames.join(' and ')}`
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
          <div className="sheet-heading">
            <h2 className="sheet-title is-wrapping">{entry.name}</h2>
            <div className="sheet-sub">
              <span className="tag">{entry.muscleGroup || 'Other'}</span>
              <span className="tag">{entry.exerciseType === 'isolation' ? 'Isolation' : 'Compound'}</span>
              <span>{where}</span>
            </div>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="sheet-body">
          <div className="card">
            <div className="stat-row">
              <div className="stat">
                <span className="stat-label">Best set</span>
                <span className="stat-value">
                  {best ? formatWeight(best.weight) : '–'}
                  {best && <span className="unit">kg × {best.bestReps}</span>}
                </span>
                <span className="stat-caption">{best ? sessionDate(best.timestamp, now) : 'Nothing logged yet'}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Est. 1RM</span>
                <span className="stat-value">
                  {best1RM > 0 ? formatWeight(best1RM) : '–'}
                  {best1RM > 0 && <span className="unit">kg</span>}
                </span>
                <span className="stat-caption">All-time best</span>
              </div>
              <div className="stat">
                <span className="stat-label">Sessions</span>
                <span className="stat-value">{loggedCount}</span>
                <span className="stat-caption">logged</span>
              </div>
            </div>
            {accretion.points.length >= 2 && (
              <div className="card-divider">
                <AccretionStrip points={accretion.points} height={24} label="Top set by session" />
              </div>
            )}
          </div>

          <section className="list-section">
            <h3 className="list-section-label">Sessions</h3>
            {sessions.length === 0 ? (
              <p className="text-xs text-center">No sessions yet.</p>
            ) : (
              <div className="pick-list">
                {sessions.map((s) => {
                  const isBestSession = best && s.timestamp === best.timestamp;
                  return (
                    <div key={s.sessionId} className={`detail-row${s.logged ? '' : ' is-skipped'}`}>
                      <div className="detail-row-head">
                        <span className="detail-row-date">{sessionDate(s.timestamp, now)}</span>
                        {s.routineName && <span className="detail-row-routine">{s.routineName}</span>}
                        {isBestSession && (
                          <span className="tag is-brass">
                            <Trophy size={11} aria-hidden="true" /> Best
                          </span>
                        )}
                        <span className="detail-row-volume">
                          {s.logged ? `${formatNumber(s.volume)} kg` : 'Skipped'}
                        </span>
                      </div>
                      <div className="set-chips">
                        {s.sets.map((set, i) => {
                          const skipped = set.completed === false;
                          return (
                            <span
                              key={i}
                              className={`set-chip${set.isWarmup ? ' is-warmup' : ''}${skipped ? ' is-skipped' : ''}`}
                              title={set.isWarmup ? 'Warm-up (not counted)' : skipped ? 'Not logged (not counted)' : undefined}
                            >
                              {set.isWarmup && <span className="set-chip-w" aria-hidden="true">W</span>}
                              {set.isWarmup && <span className="visually-hidden">Warm-up, </span>}
                              {formatWeight(set.weight)} × {set.reps}
                              {skipped && <span className="visually-hidden">, skipped</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {onMerge && (
            <div className="merge-block">
              <button type="button" className="btn btn-secondary btn-block btn-start" onClick={() => setPicking(true)}>
                <GitMerge size={16} /> Merge into another exercise
              </button>
              <p className="text-xs" style={{ margin: 0 }}>
                For a duplicate: moves this exercise&apos;s history onto the one you
                pick, so they count as one lift.
              </p>
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
