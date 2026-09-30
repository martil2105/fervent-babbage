import { useState, useEffect, useMemo } from 'react';
import { Play, Check, Trash2, Plus, Dumbbell, Ghost, TrendingUp, Trophy, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
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

// Floating rest panel. Also ticks on its own (every 500 ms). The alert itself
// — vibration, notification, auto-clear — lives in useRestAlarm at the app
// root, so it still fires when you're on another tab.
function RestPanel({ restEndTime, restTotalMs, extendRestTimer, clearRestTimer }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const timeRemaining = restEndTime - now;
  const timerSeconds = timeRemaining > 0 ? Math.ceil(timeRemaining / 1000) : 0;
  const isFlashing = timeRemaining <= 0;
  // The interval is read by length before it is read as a number. Fraction of
  // the rest still owed, 1 -> 0; 0 when we have no denominator to divide by.
  const restRemaining = restTotalMs > 0
    ? Math.min(Math.max(timeRemaining / restTotalMs, 0), 1)
    : 0;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(75px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: '448px',
        backgroundColor: isFlashing ? 'var(--warning-glow)' : 'var(--bg-card)',
        borderColor: isFlashing ? 'var(--warning)' : 'var(--border-color)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 999
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', minWidth: 0 }} aria-live="polite">
          <span className="text-xs text-bold" style={{
            color: isFlashing ? 'var(--warning-strong)' : 'var(--text-secondary)',
            whiteSpace: 'nowrap'
          }}>
            {isFlashing ? 'REST COMPLETE' : 'RESTING'}
          </span>
          <span className="magnitude" style={{ fontSize: '26px' }}>
            {isFlashing ? '0:00' : `${Math.floor(timerSeconds / 60)}:${String(timerSeconds % 60).padStart(2, '0')}`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => extendRestTimer(30)}
            style={{ padding: '6px 10px', fontSize: '12px' }}
          >
            +30s
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={clearRestTimer}
            style={{ padding: '6px 10px', fontSize: '12px' }}
          >
            Skip
          </button>
        </div>
      </div>

      {/* The rule. It shortens; nothing rotates and nothing pulses. When the
          interval is over it fills out in fox rather than vanishing. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((isFlashing ? 1 : restRemaining) * 100)}
        aria-label="Rest remaining"
        style={{ height: '2px', backgroundColor: 'var(--bg-secondary)', overflow: 'hidden' }}
      >
        <div style={{
          height: '100%',
          width: `${(isFlashing ? 1 : restRemaining) * 100}%`,
          backgroundColor: isFlashing ? 'var(--warning)' : 'var(--text-primary)',
          transition: 'width 0.5s linear'
        }} />
      </div>
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
      <div className="tab-content" style={{ justifyContent: 'center', minHeight: '60vh' }}>
        <div className="empty-state" style={{ width: '100%' }}>
          <div style={{
            background: 'var(--accent-glow)',
            color: 'var(--accent-strong)',
            padding: '20px',
            borderRadius: '50%',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Dumbbell size={40} />
          </div>
          <h2>Start Training</h2>
          <p className="text-muted text-center" style={{ maxWidth: '300px' }}>
            Pick today&apos;s session. Weights, reps and volume are tracked in real time.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '340px', marginTop: '10px' }}>
            {routines.map((routine) => {
              const daysSince = getDaysSinceRoutine(history, routine.id, now);
              const count = routine.exerciseIds?.length || 0;

              const lastLabel =
                daysSince === null ? 'Not trained yet'
                  : daysSince === 0 ? 'Trained today'
                  : daysSince === 1 ? 'Trained yesterday'
                  : `${daysSince} days ago`;

              return (
                <button
                  key={routine.id}
                  className="btn"
                  onClick={() => startWorkout(routine.id)}
                  disabled={count === 0}
                  style={{
                    width: '100%',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 16px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--feather-200)',
                    borderRadius: '12px',
                    opacity: count === 0 ? 0.55 : 1,
                    cursor: count === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600 }}>{routine.name}</span>
                    <span className="text-xs text-muted">
                      {count === 0 ? 'No exercises yet' : `${count} exercise${count === 1 ? '' : 's'} · ${lastLabel}`}
                    </span>
                  </div>
                  <Play size={18} fill="currentColor" style={{ color: 'var(--accent-strong)', flexShrink: 0 }} />
                </button>
              );
            })}
          </div>

          {routines.length === 0 && (
            <button className="btn btn-primary" onClick={() => startWorkout()} style={{ width: '100%', maxWidth: '240px', marginTop: '10px' }}>
              <Play size={18} fill="currentColor" /> Start Workout Session
            </button>
          )}

          <button
            className="btn btn-secondary"
            onClick={startEmptyWorkout}
            style={{ width: '100%', maxWidth: '340px', borderStyle: 'dashed', background: 'transparent' }}
          >
            <Plus size={16} /> Empty workout — pick exercises as you go
          </button>
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
          colors: ['#58CC02', '#1CB0F6', '#FFC800', '#FF4B4B']
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
    <div className="tab-content" style={{ paddingBottom: restEndTime ? '172px' : '90px' }}>
      {/* 1. Timer Banner */}
      <div className="timer-banner">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="text-xs text-muted text-bold">DURATION</span>
          <ElapsedClock startTime={currentWorkout.startTime} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-danger btn-sm" onClick={() => setShowCancelConfirm(true)} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-success btn-sm" onClick={requestFinish} disabled={saving}>
            <Check size={14} /> {saving ? 'Saving…' : 'Finish'}
          </button>
        </div>
      </div>

      {saveError && (
        <div role="alert" className="text-xs text-bold" style={{
          color: 'var(--error-strong)',
          backgroundColor: 'var(--error-glow)',
          border: '1px solid var(--cardinal-200)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 12px',
          marginTop: '-6px'
        }}>
          {saveError}
        </div>
      )}

      {/* Progress, and reshaping today's workout. Changes here stay in this
          workout; the saved session is edited in Settings. */}
      <div className="workout-toolbar">
        <span className="text-xs text-muted" style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}>
          {completion.total > 0
            ? `${completion.logged} of ${completion.total} sets logged`
            : 'No exercises yet'}
        </span>
        {currentWorkout.exercises.length > 1 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowReorder(true)}>
            <ArrowUpDown size={14} /> Reorder
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPicker(true)}>
          <Plus size={14} /> Add
        </button>
      </div>

      {currentWorkout.exercises.length === 0 && (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: '28px 16px' }}>
          <Dumbbell size={28} style={{ color: 'var(--text-muted)' }} />
          <p className="text-muted" style={{ margin: 0 }}>
            Add exercises from your list as you go — each one remembers what you did last time.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setShowPicker(true)}>
            <Plus size={16} /> Add exercise
          </button>
        </div>
      )}

      {/* 2. Exercises Logging List */}
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
              <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>
          );
        }

        return (
          <div key={ex.exerciseId} id={`exercise-${ex.exerciseId}`} className="card">
            <div className="exercise-log-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="card-title" style={{ fontSize: '16px' }}>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onOpenExercise?.(ex.exerciseId)}
                    aria-label={`${ex.name} — show history`}
                  >
                    {ex.name}
                  </button>
                </h3>
                {/* Exercise type used to be a 4px colour bar down the whole
                    card. It is one word — and a word costs no pigment. */}
                <span className="text-xs text-bold text-muted" style={{
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  whiteSpace: 'nowrap'
                }}>
                  {ex.muscleGroup} · {ex.exerciseType === 'isolation' ? 'Isolation' : 'Compound'}
                </span>
                {isDone && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => toggleDone(ex.exerciseId, false)}
                    aria-label={`Fold ${ex.name} away`}
                    style={{ marginLeft: '6px', color: 'var(--text-muted)', display: 'flex' }}
                  >
                    <ChevronUp size={18} />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="rep-target-badge">
                  Target: {ex.targetRange.min}–{ex.targetRange.max} reps
                </span>
                {suggestion && suggestion.type !== 'initial' && (
                  <span className="text-xs text-bold" style={{
                    color: suggestion.type === 'weight' ? 'var(--success-strong)' : suggestion.type === 'hold' ? 'var(--accent-strong)' : 'var(--warning-strong)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}>
                    • Hint: {suggestion.action}
                  </span>
                )}
              </div>
            </div>

            {/* Last session reference — your only rival is your past self */}
            {last && last.sets.length > 0 && (
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 10px',
                marginBottom: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span className="text-xs text-bold" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)' }}>
                    <Ghost size={13} /> Last time · {formatDate(last.timestamp)}
                  </span>
                  <span className="text-xs text-bold" style={{ color: 'var(--success-strong)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <TrendingUp size={12} /> Beat it
                  </span>
                </div>

                {best && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <Trophy size={12} style={{ color: 'var(--warning-strong)', flexShrink: 0 }} />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      Best · {formatWeight(best.weight)} kg × {best.bestReps}
                    </span>
                    {belowBest && (
                      <span className="text-xs text-bold" style={{ color: 'var(--warning-strong)' }}>
                        · last session was under this
                      </span>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {last.sets.map((s, i) => {
                    const aim = repTarget(s.reps);
                    return (
                      <span key={i} style={{
                        fontSize: '11px',
                        fontVariantNumeric: 'tabular-nums',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '3px 7px',
                        color: 'var(--text-secondary)'
                      }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatWeight(s.weight)}</span>×{s.reps}
                        {aim
                          ? <span style={{ color: 'var(--success-strong)' }}> → aim {aim}</span>
                          : <span style={{ color: 'var(--warning-strong)' }}> → +{formatWeight(weightStep)}kg</span>}
                      </span>
                    );
                  })}
                </div>

                {/* Every session you have ever logged for this lift, as ticks.
                    The green one is where the record was set. */}
                {accretion && accretion.points.length >= 2 && (
                  <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                    <AccretionStrip
                      points={accretion.points}
                      height={22}
                      label={`${accretion.total} session${accretion.total === 1 ? '' : 's'}`}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Set Table header */}
            <div className="set-grid set-grid-header" aria-hidden="true">
              <span>SET</span>
              <span>KG</span>
              <span>REPS</span>
              <span>{effortMode}</span>
              <span>LOG</span>
              <span></span>
            </div>

            {/* Sets Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {ex.sets.map((set, idx) => {
                const label = setLabels[idx];
                const setName = set.isWarmup ? `Warm-up set` : `Set ${label}`;
                return (
                  <div key={idx} className="set-grid set-row" style={{
                    opacity: set.completed ? 0.6 : 1,
                    backgroundColor: set.completed ? 'var(--bg-secondary)' : 'transparent'
                  }}>
                    {/* 1. Set number — tap to toggle warm-up */}
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

                    {/* 2. Weight Control */}
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

                    {/* 3. Reps Control */}
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

                    {/* 4. RPE/RIR Select — the column header names the scale,
                        so an empty cell is just a dash. */}
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

                    {/* 5. Checkmark Log Button */}
                    <button
                      type="button"
                      className={`set-log${set.completed ? ' is-done' : ''}`}
                      onClick={() => updateSet(ex.exerciseId, idx, 'completed', !set.completed)}
                      aria-pressed={!!set.completed}
                      aria-label={set.completed ? `${setName} logged — tap to undo` : `Log ${setName.toLowerCase()}`}
                    >
                      <Check size={16} strokeWidth={3} />
                    </button>

                    {/* 6. Remove Set */}
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

            {/* Add Set button */}
            <div className="exercise-controls">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => addSetToActive(ex.exerciseId)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Plus size={14} /> Add Set
              </button>
            </div>
          </div>
        );
      })}

      {/* 3. Add an exercise from the list */}
      {currentWorkout.exercises.length > 0 && (
        <button
          className="btn btn-secondary"
          onClick={() => setShowPicker(true)}
          style={{ borderStyle: 'dashed', background: 'transparent' }}
        >
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
              className="btn btn-secondary"
              onClick={() => { setShowReorder(false); setShowPicker(true); }}
              style={{ borderStyle: 'dashed', background: 'transparent' }}
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
