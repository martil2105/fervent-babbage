import { useState, useEffect, useMemo } from 'react';
import { Play, Check, Trash2, Plus, Minus, TrendingUp, Trophy, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import confetti from 'canvas-confetti';
import AccretionStrip from './AccretionStrip';
import ConfirmDialog from './ConfirmDialog';
import WeightInput from './WeightInput';
import ExercisePicker from './ExercisePicker';
import ReorderSheet from './ReorderSheet';
import {
  getProgressionSuggestion,
  getLastSessionSets,
  formatDate,
  getDaysSinceRoutine,
  getAllTimeBest,
  getAccretionSeries,
  getWorkoutCompletion,
  roundWeight,
  formatWeight,
  summarizeSets
} from '../utils/workoutHelpers';
import { daysAgo, sentenceCase } from '../utils/format';

// Format seconds to MM:SS (or H:MM:SS past the hour)
const formatDuration = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (val) => String(val).padStart(2, '0');
  if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
};

// The session clock ticks on its own, so the once-a-second update repaints
// one number instead of every set row on the page.
function ElapsedClock({ startTime }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  return <span className="timer-text">{formatDuration(elapsed)}</span>;
}

// Floating rest bar. Also ticks on its own (every 500 ms). The alert itself
// — vibration, notification, auto-clear — lives in useRestAlarm at the app
// root, so it still fires when you're on another tab.
//
// The rest is drawn as a row of graduations that go out one by one from the
// right: the interval is read by length before it is read as a number. When
// it is over the whole bar turns brass — the next set is due.
const REST_TICKS = 40;

function RestPanel({ restEndTime, restTotalMs, extendRestTimer, clearRestTimer }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const timeRemaining = restEndTime - now;
  const timerSeconds = timeRemaining > 0 ? Math.ceil(timeRemaining / 1000) : 0;
  const isOver = timeRemaining <= 0;
  // Fraction of the rest still owed, 1 -> 0; 0 when we have no denominator.
  const restRemaining = restTotalMs > 0
    ? Math.min(Math.max(timeRemaining / restTotalMs, 0), 1)
    : 0;
  const lit = isOver ? REST_TICKS : Math.ceil(restRemaining * REST_TICKS);

  return (
    <div className={`rest-bar${isOver ? ' is-done' : ''}`}>
      <div className="rest-bar-top">
        <div className="rest-readout">
          <span className="rest-time">
            {isOver ? '0:00' : `${Math.floor(timerSeconds / 60)}:${String(timerSeconds % 60).padStart(2, '0')}`}
          </span>
          <span className="rest-label" aria-live="polite">
            {isOver ? 'Rest over, next set' : 'Resting'}
          </span>
        </div>
        <div className="rest-actions">
          <button type="button" className="rest-btn" onClick={() => extendRestTimer(30)}>
            +30 s
          </button>
          <button type="button" className="rest-btn" onClick={clearRestTimer}>
            {isOver ? 'Dismiss' : 'Skip'}
          </button>
        </div>
      </div>
      <div
        className="ticks rest-ticks"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((isOver ? 1 : restRemaining) * 100)}
        aria-label="Rest remaining"
      >
        {Array.from({ length: REST_TICKS }, (_, i) => (
          <span key={i} className={`tick${i < lit ? ' is-on' : ''}`} />
        ))}
      </div>
    </div>
  );
}

// One graduation per set, grouped by exercise: a ruler of the whole session.
// Ticked sets turn brass; warm-ups are the short marks.
function SessionTicks({ exercises }) {
  return (
    <div className="session-ticks" aria-hidden="true">
      {exercises.filter((ex) => ex.sets.length > 0).map((ex) => (
        <span key={ex.exerciseId} className="session-ticks-group" style={{ flexGrow: ex.sets.length }}>
          {ex.sets.map((s, i) => (
            <span
              key={i}
              className={`tick${s.completed ? ' is-on' : ''}${s.isWarmup ? ' is-warmup' : ''}`}
            />
          ))}
        </span>
      ))}
    </div>
  );
}

export default function WorkoutActive({
  currentWorkout,
  startWorkout,
  cancelWorkout,
  completeWorkout,
  updateSet,
  addSetToActive,
  removeSetFromActive,
  addExerciseToActive,
  moveActiveExercise,
  removeActiveExercise,
  startEmptyWorkout,
  createExercise,
  catalog = [],
  onOpenExercise,
  routines = [],
  history,
  preferences,
  restEndTime,
  restTotalMs = 0,
  extendRestTimer,
  clearRestTimer
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  // Exercise whose removal (with ticked sets) is awaiting confirmation
  const [pendingRemoval, setPendingRemoval] = useState(null);
  // Finished exercises fold to one line; these are the ones opened back up.
  const [openedDone, setOpenedDone] = useState(() => new Set());
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // 'empty' | 'partial' while the finish dialog is open
  const [finishPrompt, setFinishPrompt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Stable clock read for the start screen — react-compiler rejects
  // Date.now() during render.
  const [now] = useState(() => Date.now());

  // Everything each exercise card derives from history, computed when the
  // workout or the history changes — not on every clock tick.
  const workoutExercises = currentWorkout?.exercises;
  const workoutStart = currentWorkout?.startTime;
  const insights = useMemo(() => {
    const map = {};
    (workoutExercises || []).forEach((ex) => {
      // The hint reads the same session the prefill anchored to — same clock
      // reading (the session start), same staleness fallback after a layoff.
      const suggestion = getProgressionSuggestion(
        ex.exerciseId,
        history,
        { maxReps: ex.targetRange.max, weightStep: ex.weightStep },
        workoutStart
      );
      const last = getLastSessionSets(ex.exerciseId, history);
      const best = getAllTimeBest(ex.exerciseId, history);
      const lastTopWeight = last && last.sets.length > 0
        ? Math.max(...last.sets.map((s) => s.weight))
        : 0;
      map[ex.exerciseId] = {
        suggestion,
        last,
        best,
        accretion: getAccretionSeries(ex.exerciseId, history),
        // All-time best is what the prefill anchors to, so show it — and say
        // so when the last session came in under it, which is the one case
        // where the prefilled weight won't match what you last lifted.
        belowBest: best !== null && last !== null && lastTopWeight < best.weight
      };
    });
    return map;
  }, [history, workoutExercises, workoutStart]);

  if (!currentWorkout) {
    return (
      <div className="tab-content">
        <p className="lead">
          Pick a session. Every set is filled in from your best lifts, so you
          only change what you beat.
        </p>

        {routines.length > 0 && (
          <div className="pick-list">
            {routines.map((routine) => {
              const daysSince = getDaysSinceRoutine(history, routine.id, now);
              const count = routine.exerciseIds?.length || 0;
              const lastLabel =
                daysSince === null ? 'Not trained yet'
                  : daysSince === 0 ? 'Today'
                  : daysSince === 1 ? 'Yesterday'
                  : `${daysSince} days ago`;

              return (
                <button
                  key={routine.id}
                  type="button"
                  className="pick-row routine-row"
                  onClick={() => startWorkout(routine.id)}
                  disabled={count === 0}
                  aria-label={`Start ${routine.name}: ${count === 0 ? 'no exercises yet' : `${count} exercise${count === 1 ? '' : 's'}`}, ${lastLabel.toLowerCase()}`}
                >
                  <span className="pick-row-main">
                    <span className="pick-row-name">{routine.name}</span>
                    <span className="pick-row-meta">
                      {count === 0 ? 'No exercises yet' : `${count} exercise${count === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  <span className="pick-row-aside">{lastLabel}</span>
                  <span className="start-dot" aria-hidden="true">
                    <Play size={13} fill="currentColor" />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {routines.length === 0 && (
          <button type="button" className="btn btn-primary btn-block" onClick={() => startWorkout()}>
            <Play size={16} fill="currentColor" /> Start workout
          </button>
        )}

        <div className="empty-start">
          <button type="button" className="btn btn-dashed btn-block" onClick={startEmptyWorkout}>
            <Plus size={16} /> Empty workout
          </button>
          <p className="text-xs text-center">Start with nothing and add exercises as you go.</p>
        </div>
      </div>
    );
  }

  // Weight adjust helpers — half-kilogram granularity. The +/- buttons jump by
  // the exercise's own weightStep and typed values snap to the nearest 0.5, so
  // 2.5 kg dumbbells and 1.25 kg microplates are expressible while arbitrary
  // decimals (and their float noise) are not.
  const handleWeightChange = (exId, setIdx, currentVal, delta) => {
    const base = roundWeight(currentVal);
    updateSet(exId, setIdx, 'weight', Math.max(0, roundWeight(base + delta)));
  };

  // Fallback increment for active sessions started before weightStep existed.
  const stepFor = (ex) => ex.weightStep || (ex.exerciseType === 'isolation' ? 1 : 2);

  // Reps adjust helpers
  const handleRepsChange = (exId, setIdx, currentVal, change) => {
    const parsed = parseInt(currentVal) || 0;
    const newVal = Math.max(0, parsed + change);
    updateSet(exId, setIdx, 'reps', newVal);
  };

  const finishWorkout = async () => {
    setFinishPrompt(null);
    setSaving(true);
    setSaveError(null);
    try {
      const completedSession = await completeWorkout();
      if (completedSession) {
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.75 },
          colors: ['#DBB066', '#C9A04F', '#AF8433', '#F0DDB0', '#8B641A']
        });
      }
    } catch (err) {
      console.error('Saving the workout failed:', err);
      setSaveError('Couldn’t save this workout. Nothing is lost — it’s still open here, so try Finish again.');
    } finally {
      setSaving(false);
    }
  };

  // Finishing with every set ticked goes straight through. Anything else asks
  // first: unticked sets don't count, and a session with nothing ticked would
  // only add an empty entry to history (and a fake "trained today").
  const requestFinish = () => {
    const { total, logged } = getWorkoutCompletion(currentWorkout);
    if (logged === 0) setFinishPrompt('empty');
    else if (logged < total) setFinishPrompt('partial');
    else finishWorkout();
  };

  const completion = getWorkoutCompletion(currentWorkout);

  // New exercises land at the end of the list; bring the card into view.
  const revealExercise = (exerciseId) => {
    requestAnimationFrame(() => {
      document.getElementById(`exercise-${exerciseId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handlePick = async (entry) => {
    await addExerciseToActive(entry);
    setShowPicker(false);
    revealExercise(entry.id);
  };

  const handleCreate = async (fields) => {
    const record = await createExercise(fields);
    if (!record) return;
    await addExerciseToActive(record);
    setShowPicker(false);
    revealExercise(record.id);
  };

  // Removing an exercise you haven't touched is instant; one with ticked sets
  // asks first, since those sets go with it.
  const requestRemove = (exerciseId) => {
    const ex = currentWorkout.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) return;
    if (ex.sets.some((s) => s.completed)) setPendingRemoval(ex);
    else removeActiveExercise(exerciseId);
  };

  const toggleDone = (exerciseId, open) => {
    setOpenedDone((prev) => {
      const next = new Set(prev);
      if (open) next.add(exerciseId);
      else next.delete(exerciseId);
      return next;
    });
  };

  const effortMode = preferences.prefLoggingMode === 'RIR' ? 'RIR' : 'RPE';

  return (
    <div className="tab-content" style={restEndTime ? { paddingBottom: '104px' } : undefined}>
      {/* Session head: the clock, the whole session as a ruler, and Finish */}
      <section className="session-head" aria-label="Session">
        <div className="session-head-top">
          <div className="session-clock">
            <ElapsedClock startTime={currentWorkout.startTime} />
            <span className="session-sub">
              {completion.total > 0
                ? `${completion.logged} of ${completion.total} sets logged`
                : 'No exercises yet'}
            </span>
          </div>
          <button type="button" className="btn btn-success" onClick={requestFinish} disabled={saving}>
            <Check size={16} strokeWidth={2.5} /> {saving ? 'Saving…' : 'Finish'}
          </button>
        </div>
        {completion.total > 0 && <SessionTicks exercises={currentWorkout.exercises} />}
      </section>

      {saveError && (
        <div role="alert" className="notice is-danger">
          <span className="notice-text">{saveError}</span>
        </div>
      )}

      {/* Reshaping today's workout. Changes here stay in this workout; the
          saved session is edited in Settings. */}
      <div className="workout-toolbar">
        {currentWorkout.exercises.length > 1 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowReorder(true)}>
            <ArrowUpDown size={14} /> Reorder
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPicker(true)}>
          <Plus size={14} /> Add exercise
        </button>
        <span className="toolbar-spacer" />
        <button
          type="button"
          className="btn btn-quiet btn-sm is-danger"
          onClick={() => setShowCancelConfirm(true)}
          disabled={saving}
        >
          Discard
        </button>
      </div>

      {currentWorkout.exercises.length === 0 && (
        <div className="card empty-card">
          <p className="text-muted" style={{ margin: 0 }}>
            Add exercises from your list as you go. Each one remembers what you
            did last time.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setShowPicker(true)}>
            <Plus size={16} /> Add exercise
          </button>
        </div>
      )}

      {currentWorkout.exercises.map((ex) => {
        const { suggestion, last, best, accretion, belowBest } = insights[ex.exerciseId] || {};
        const weightStep = stepFor(ex);
        // Per-set target: beat last time's reps by one, or if you already hit the
        // top of the rep range last time, the goal becomes adding weight.
        const repTarget = (prevReps) =>
          prevReps >= ex.targetRange.max ? null : prevReps + 1;

        // Working sets are numbered 1, 2, 3…; warm-ups show "W" and don't
        // take a number — the convention most logging apps use.
        let workingCount = 0;
        const setLabels = ex.sets.map((s) => (s.isWarmup ? 'W' : String(++workingCount)));

        // Every set ticked: fold to one line so the next exercise moves up.
        const isDone = ex.sets.length > 0 && ex.sets.every((s) => s.completed);
        if (isDone && !openedDone.has(ex.exerciseId)) {
          return (
            <button
              key={ex.exerciseId}
              id={`exercise-${ex.exerciseId}`}
              type="button"
              className="exercise-done"
              onClick={() => toggleDone(ex.exerciseId, true)}
              aria-expanded="false"
              aria-label={`${ex.name}, done: ${summarizeSets(ex.sets)}. Show sets`}
            >
              <span className="exercise-done-check"><Check size={15} strokeWidth={3} /></span>
              <span className="pick-row-main">
                <span className="pick-row-name">{ex.name}</span>
                <span className="pick-row-meta">{summarizeSets(ex.sets)}</span>
              </span>
              <ChevronDown size={18} className="row-chevron" />
            </button>
          );
        }

        const hint = suggestion && suggestion.type !== 'initial' && suggestion.action
          ? sentenceCase(suggestion.action)
          : null;

        return (
          <div key={ex.exerciseId} id={`exercise-${ex.exerciseId}`} className="card exercise-card">
            <div className="exercise-log-header">
              <div className="exercise-title-row">
                <h3 className="exercise-title">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onOpenExercise?.(ex.exerciseId)}
                    aria-label={`${ex.name} — show history`}
                  >
                    {ex.name}
                  </button>
                </h3>
                {isDone && (
                  <button
                    type="button"
                    className="icon-btn is-quiet"
                    onClick={() => toggleDone(ex.exerciseId, false)}
                    aria-label={`Fold ${ex.name} away`}
                  >
                    <ChevronUp size={18} />
                  </button>
                )}
              </div>
              <div className="exercise-meta">
                <span className="tag">{ex.muscleGroup}</span>
                <span className="tag">{ex.exerciseType === 'isolation' ? 'Isolation' : 'Compound'}</span>
                <span className="rep-target-badge">
                  {ex.targetRange.min}–{ex.targetRange.max} reps
                </span>
              </div>
              {hint && (
                <div className={`hint${suggestion.type === 'weight' ? ' is-brass' : ''}`}>
                  {suggestion.type === 'hold'
                    ? <Minus size={14} aria-hidden="true" />
                    : <TrendingUp size={14} aria-hidden="true" />}
                  {hint}
                </div>
              )}
            </div>

            {/* Last session — your only rival is your past self */}
            {last && last.sets.length > 0 && (
              <div className="last-time">
                <div className="last-time-head">
                  <span title={formatDate(last.timestamp)}>
                    Last time, <strong>{daysAgo(last.timestamp, now)}</strong>
                  </span>
                  {best && (
                    <span className="last-best">
                      <Trophy size={12} aria-hidden="true" />
                      Best <strong>{formatWeight(best.weight)} kg × {best.bestReps}</strong>
                    </span>
                  )}
                </div>

                <div className="last-sets">
                  {last.sets.map((s, i) => {
                    const aim = repTarget(s.reps);
                    return (
                      <div key={i} className="last-set">
                        <span className="last-set-value">{formatWeight(s.weight)} × {s.reps}</span>
                        {aim
                          ? <span className="last-set-aim">Aim {aim}</span>
                          : <span className="last-set-aim is-brass">+{formatWeight(weightStep)} kg</span>}
                      </div>
                    );
                  })}
                </div>

                {belowBest && (
                  <span className="text-xs">Last session was under your best.</span>
                )}

                {/* Every session you have ever logged for this lift, as ticks.
                    The brass one is where the record was set. */}
                {accretion && accretion.points.length >= 2 && (
                  <AccretionStrip
                    points={accretion.points}
                    height={20}
                    label={`${accretion.total} session${accretion.total === 1 ? '' : 's'}`}
                  />
                )}
              </div>
            )}

            {/* Set table */}
            <div>
              <div className="set-grid set-grid-header" aria-hidden="true">
                <span>Set</span>
                <span>kg</span>
                <span>Reps</span>
                <span>{effortMode}</span>
                <span></span>
                <span></span>
              </div>

              {ex.sets.map((set, idx) => {
                const label = setLabels[idx];
                const setName = set.isWarmup ? `Warm-up set` : `Set ${label}`;
                return (
                  <div key={idx} className={`set-grid set-row${set.completed ? ' is-done' : ''}`}>
                    {/* Set number — tap to toggle warm-up */}
                    <button
                      type="button"
                      className={`set-badge${set.isWarmup ? ' is-warmup' : ''}`}
                      onClick={() => updateSet(ex.exerciseId, idx, 'isWarmup', !set.isWarmup)}
                      aria-pressed={!!set.isWarmup}
                      aria-label={`${setName}. ${set.isWarmup ? 'Tap to make it a working set' : 'Tap to mark as warm-up'}`}
                      title={set.isWarmup ? 'Warm-up (not counted) — tap for a working set' : 'Working set — tap to mark as warm-up'}
                    >
                      {label}
                    </button>

                    {/* Weight */}
                    <div className="input-control">
                      <button
                        type="button"
                        className="input-btn"
                        onClick={() => handleWeightChange(ex.exerciseId, idx, set.weight, -weightStep)}
                        aria-label={`${setName}: ${formatWeight(weightStep)} kg lighter`}
                      >
                        −
                      </button>
                      <WeightInput
                        value={set.weight}
                        onChange={(value) => updateSet(ex.exerciseId, idx, 'weight', value)}
                        aria-label={`${setName} weight, kg`}
                      />
                      <button
                        type="button"
                        className="input-btn"
                        onClick={() => handleWeightChange(ex.exerciseId, idx, set.weight, weightStep)}
                        aria-label={`${setName}: ${formatWeight(weightStep)} kg heavier`}
                      >
                        +
                      </button>
                    </div>

                    {/* Reps */}
                    <div className="input-control">
                      <button
                        type="button"
                        className="input-btn"
                        onClick={() => handleRepsChange(ex.exerciseId, idx, set.reps, -1)}
                        aria-label={`${setName}: one rep fewer`}
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        enterKeyHint="done"
                        value={set.reps}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateSet(ex.exerciseId, idx, 'reps', e.target.value.replace(/\D/g, ''))}
                        aria-label={`${setName} reps`}
                      />
                      <button
                        type="button"
                        className="input-btn"
                        onClick={() => handleRepsChange(ex.exerciseId, idx, set.reps, 1)}
                        aria-label={`${setName}: one rep more`}
                      >
                        +
                      </button>
                    </div>

                    {/* RPE / RIR — the column header names the scale, so an
                        empty cell is just a dash. */}
                    {effortMode === 'RPE' ? (
                      <select
                        value={set.rpe}
                        onChange={(e) => updateSet(ex.exerciseId, idx, 'rpe', e.target.value)}
                        className="set-effort"
                        aria-label={`${setName} RPE`}
                      >
                        <option value="">–</option>
                        <option value="10">10</option>
                        <option value="9.5">9.5</option>
                        <option value="9">9</option>
                        <option value="8.5">8.5</option>
                        <option value="8">8</option>
                        <option value="7.5">7.5</option>
                        <option value="7">7</option>
                        <option value="6.5">6.5</option>
                        <option value="6">6</option>
                      </select>
                    ) : (
                      <select
                        value={set.rir}
                        onChange={(e) => updateSet(ex.exerciseId, idx, 'rir', e.target.value)}
                        className="set-effort"
                        aria-label={`${setName} reps in reserve`}
                      >
                        <option value="">–</option>
                        <option value="0">0</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                      </select>
                    )}

                    {/* Log the set: the one round control, brass when ticked */}
                    <button
                      type="button"
                      className={`set-log${set.completed ? ' is-done' : ''}`}
                      onClick={() => updateSet(ex.exerciseId, idx, 'completed', !set.completed)}
                      aria-pressed={!!set.completed}
                      aria-label={set.completed ? `${setName} logged — tap to undo` : `Log ${setName.toLowerCase()}`}
                    >
                      <Check size={17} strokeWidth={3} />
                    </button>

                    {/* Remove set */}
                    <button
                      type="button"
                      className="set-remove"
                      onClick={() => removeSetFromActive(ex.exerciseId, idx)}
                      aria-label={`Remove ${setName.toLowerCase()}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="exercise-controls">
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-block"
                onClick={() => addSetToActive(ex.exerciseId)}
              >
                <Plus size={14} /> Add set
              </button>
            </div>
          </div>
        );
      })}

      {currentWorkout.exercises.length > 0 && (
        <button type="button" className="btn btn-dashed btn-block" onClick={() => setShowPicker(true)}>
          <Plus size={16} /> Add exercise
        </button>
      )}

      {/* Floating Rest Timer countdown panel */}
      {restEndTime && (
        <RestPanel
          restEndTime={restEndTime}
          restTotalMs={restTotalMs}
          extendRestTimer={extendRestTimer}
          clearRestTimer={clearRestTimer}
        />
      )}

      {/* Confirm Workout Cancel */}
      {showCancelConfirm && (
        <ConfirmDialog
          title="Discard workout?"
          confirmLabel="Yes, discard"
          cancelLabel="Keep training"
          onCancel={() => setShowCancelConfirm(false)}
          onConfirm={() => {
            cancelWorkout();
            setShowCancelConfirm(false);
          }}
        >
          Your sets and logged weights from this session will be permanently deleted.
        </ConfirmDialog>
      )}

      {/* Finish with nothing ticked: there is nothing to save */}
      {finishPrompt === 'empty' && (
        <ConfirmDialog
          title="Nothing logged yet"
          confirmLabel="Discard workout"
          cancelLabel="Keep training"
          onCancel={() => setFinishPrompt(null)}
          onConfirm={() => {
            setFinishPrompt(null);
            cancelWorkout();
          }}
        >
          None of the sets are ticked, so there&apos;s nothing to save. Tap ✓ on
          each set as you finish it — only ticked sets count toward your log.
        </ConfirmDialog>
      )}

      {showPicker && (
        <ExercisePicker
          catalog={catalog}
          routines={routines}
          history={history}
          excludeIds={currentWorkout.exercises.map((ex) => ex.exerciseId)}
          onPick={handlePick}
          onCreate={handleCreate}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showReorder && (
        <ReorderSheet
          title="Today's order"
          subtitle="Only changes this workout — your saved session stays as it is."
          items={currentWorkout.exercises.map((ex) => {
            const ticked = ex.sets.filter((s) => s.completed).length;
            return { id: ex.exerciseId, name: ex.name, meta: `${ticked} of ${ex.sets.length} sets logged` };
          })}
          onMove={moveActiveExercise}
          onRemove={requestRemove}
          onClose={() => setShowReorder(false)}
          footer={(
            <button
              type="button"
              className="btn btn-dashed btn-block"
              onClick={() => { setShowReorder(false); setShowPicker(true); }}
            >
              <Plus size={16} /> Add exercise
            </button>
          )}
        />
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title={`Remove ${pendingRemoval.name} from today?`}
          confirmLabel="Remove"
          cancelLabel="Keep it"
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            removeActiveExercise(pendingRemoval.exerciseId);
            setPendingRemoval(null);
          }}
        >
          Its {pendingRemoval.sets.filter((s) => s.completed).length} ticked set
          {pendingRemoval.sets.filter((s) => s.completed).length === 1 ? '' : 's'} won&apos;t be saved.
          Your saved session isn&apos;t changed.
        </ConfirmDialog>
      )}

      {/* Finish with some sets still open */}
      {finishPrompt === 'partial' && (
        <ConfirmDialog
          title={`Finish with ${completion.unlogged} ${completion.unlogged === 1 ? 'set' : 'sets'} unticked?`}
          confirmLabel="Finish workout"
          cancelLabel="Keep training"
          tone="primary"
          onCancel={() => setFinishPrompt(null)}
          onConfirm={finishWorkout}
        >
          {completion.logged} of {completion.total} sets are ticked. Unticked sets are
          kept as skipped and don&apos;t count toward volume, records or next
          session&apos;s targets.
        </ConfirmDialog>
      )}
    </div>
  );
}
