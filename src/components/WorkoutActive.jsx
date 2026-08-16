import { useState, useEffect, useRef } from 'react';
import { notifyRestComplete } from '../utils/restNotification';
import { Play, Check, Trash2, Plus, X, Dumbbell, Ghost, TrendingUp, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import AccretionStrip from './AccretionStrip';
import {
  getProgressionSuggestion,
  getLastSessionSets,
  formatDate,
  getDaysSinceRoutine,
  getAllTimeBest,
  getAccretionSeries,
  roundWeight,
  formatWeight
} from '../utils/workoutHelpers';

export default function WorkoutActive({
  currentWorkout,
  startWorkout,
  cancelWorkout,
  completeWorkout,
  updateSet,
  addSetToActive,
  removeSetFromActive,
  addCustomExerciseToActive,
  routines = [],
  history,
  preferences,
  restEndTime,
  restTotalMs = 0,
  extendRestTimer,
  clearRestTimer
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [customExerciseName, setCustomExerciseName] = useState('');
  const [customExerciseMG, setCustomExerciseMG] = useState('Shoulders');
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Pure state for clock ticks to prevent calling impure Date.now() during render
  const [now, setNow] = useState(() => Date.now());

  // Derive rest timer values dynamically using pure state
  const timeRemaining = restEndTime ? restEndTime - now : 0;
  const timerSeconds = timeRemaining > 0 ? Math.ceil(timeRemaining / 1000) : 0;
  const isFlashing = restEndTime !== null && timeRemaining <= 0;
  // The interval is read by length before it is read as a number. Fraction of
  // the rest still owed, 1 -> 0; 0 when we have no denominator to divide by.
  const restRemaining = restTotalMs > 0
    ? Math.min(Math.max(timeRemaining / restTotalMs, 0), 1)
    : 0;

  // Active workout duration timer
  useEffect(() => {
    if (!currentWorkout) return;

    const calculateElapsed = () => {
      const elapsed = Math.floor((Date.now() - currentWorkout.startTime) / 1000);
      setElapsedSeconds(elapsed >= 0 ? elapsed : 0);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 1000);

    return () => clearInterval(interval);
  }, [currentWorkout]);

  // Mirrored in a ref so the rest-timer effect can name the exercise without
  // taking currentWorkout as a dependency — that would restart the effect on
  // every keystroke and re-arm the already-fired alert.
  const workoutRef = useRef(currentWorkout);
  useEffect(() => {
    workoutRef.current = currentWorkout;
  }, [currentWorkout]);

  // Rest timer countdown and vibration/auto-clear
  useEffect(() => {
    if (!restEndTime) return;

    let vibrated = false;
    let autoClearId = null;

    // The exercise you were resting from: whichever holds the most recently
    // completed set.
    const restingFrom = () => {
      const exercises = workoutRef.current?.exercises || [];
      let name = null;
      let latest = -Infinity;
      exercises.forEach((ex) => {
        (ex.sets || []).forEach((s) => {
          if (s.completedAt && s.completedAt > latest) {
            latest = s.completedAt;
            name = ex.name;
          }
        });
      });
      return name;
    };

    const checkTimer = () => {
      setNow(Date.now());
      const diff = restEndTime - Date.now();
      if (diff <= 0 && !vibrated) {
        vibrated = true;
        if (navigator.vibrate) {
          navigator.vibrate([300, 100, 300]);
        }
        // No-ops unless permission was granted and the app is backgrounded.
        notifyRestComplete({ exerciseName: restingFrom() });
        // Auto clear after 6 seconds of flashing (scheduled once)
        autoClearId = setTimeout(() => {
          clearRestTimer();
        }, 6000);
      }
    };

    checkTimer();
    const timerInterval = setInterval(checkTimer, 500);

    return () => {
      clearInterval(timerInterval);
      if (autoClearId) clearTimeout(autoClearId);
    };
  }, [restEndTime, clearRestTimer]);

  // Format seconds to MM:SS
  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (val) => String(val).padStart(2, '0');
    
    if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(secs)}`;
    return `${pad(mins)}:${pad(secs)}`;
  };

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

  const handleWeightInput = (exId, setIdx, raw) => {
    if (raw === '') {
      updateSet(exId, setIdx, 'weight', '');
      return;
    }
    updateSet(exId, setIdx, 'weight', roundWeight(raw));
  };

  // Fallback increment for active sessions started before weightStep existed.
  const stepFor = (ex) => ex.weightStep || (ex.exerciseType === 'isolation' ? 1 : 2);

  // Reps adjust helpers
  const handleRepsChange = (exId, setIdx, currentVal, change) => {
    const parsed = parseInt(currentVal) || 0;
    const newVal = Math.max(0, parsed + change);
    updateSet(exId, setIdx, 'reps', newVal);
  };

  // Handle workout completion
  const handleFinishWorkout = () => {
    const completedSession = completeWorkout();
    if (completedSession) {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.75 },
        colors: ['#58CC02', '#1CB0F6', '#FFC800', '#FF4B4B']
      });
    }
  };

  const handleAddCustomExercise = (e) => {
    e.preventDefault();
    if (!customExerciseName.trim()) return;
    addCustomExerciseToActive(customExerciseName, customExerciseMG);
    setCustomExerciseName('');
    setShowAddCustom(false);
  };

  return (
    <div className="tab-content" style={{ paddingBottom: restEndTime ? '172px' : '90px' }}>
      {/* 1. Timer Banner */}
      <div className="timer-banner">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="text-xs text-muted text-bold">DURATION</span>
          <span className="timer-text">{formatDuration(elapsedSeconds)}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-danger btn-sm" onClick={() => setShowCancelConfirm(true)}>
            Cancel
          </button>
          <button className="btn btn-success btn-sm" onClick={handleFinishWorkout}>
            <Check size={14} /> Finish
          </button>
        </div>
      </div>

      {/* 2. Exercises Logging List */}
      {currentWorkout.exercises.map((ex) => {
        const mockDef = { maxReps: ex.targetRange.max };
        // `now` keeps the hint reading the same session the prefill anchored to,
        // including the staleness fallback after a layoff.
        const suggestion = getProgressionSuggestion(ex.exerciseId, history, mockDef, now);
        const weightStep = stepFor(ex);
        const last = getLastSessionSets(ex.exerciseId, history);
        // Per-set target: beat last time's reps by one, or if you already hit the
        // top of the rep range last time, the goal becomes adding weight.
        const repTarget = (prevReps) =>
          prevReps >= ex.targetRange.max ? null : prevReps + 1;

        // All-time best is what the prefill anchors to, so show it — and say so
        // when the last session came in under it, which is the one case where
        // the prefilled weight won't match what you last actually lifted.
        const best = getAllTimeBest(ex.exerciseId, history);
        const accretion = getAccretionSeries(ex.exerciseId, history);
        const lastTopWeight = last && last.sets.length > 0
          ? Math.max(...last.sets.map((s) => s.weight))
          : 0;
        const belowBest = best !== null && lastTopWeight < best.weight;

        return (
          <div key={ex.exerciseId} className="card">
            <div className="exercise-log-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="card-title" style={{ fontSize: '16px' }}>{ex.name}</h3>
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
                {accretion.points.length >= 2 && (
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
            <div style={{
              display: 'grid',
              gridTemplateColumns: '44px 1fr 1fr 60px 36px 24px',
              gap: '8px',
              fontSize: '11px', 
              color: 'var(--text-secondary)',
              fontWeight: 600,
              paddingBottom: '4px',
              borderBottom: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <span style={{ textAlign: 'left' }}>TYPE</span>
              <span>WEIGHT</span>
              <span>REPS</span>
              <span>{preferences.prefLoggingMode}</span>
              <span>LOG</span>
              <span></span>
            </div>

            {/* Sets Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {ex.sets.map((set, idx) => (
                <div key={idx} className="set-row" style={{ 
                  opacity: set.completed ? 0.6 : 1,
                  backgroundColor: set.completed ? 'var(--bg-secondary)' : 'transparent'
                }}>
                  {/* 1. Warmup Toggle */}
                  <button 
                    type="button"
                    onClick={() => updateSet(ex.exerciseId, idx, 'isWarmup', !set.isWarmup)}
                    style={{ 
                      fontSize: '10px', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-color)',
                      backgroundColor: set.isWarmup ? 'var(--warning-glow)' : 'transparent',
                      color: set.isWarmup ? 'var(--warning-strong)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      height: '38px',
                      fontWeight: 700,
                      padding: '0',
                      transition: 'var(--transition)'
                    }}
                  >
                    {set.isWarmup ? 'WARM' : 'WORK'}
                  </button>
                  
                  {/* 2. Weight Control */}
                  <div className="input-control">
                    <button
                      type="button"
                      className="input-btn"
                      onClick={() => handleWeightChange(ex.exerciseId, idx, set.weight, -weightStep)}
                      style={{ width: '20px' }}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      step={weightStep}
                      min="0"
                      value={set.weight}
                      onChange={(e) => handleWeightInput(ex.exerciseId, idx, e.target.value)}
                    />
                    <button
                      type="button"
                      className="input-btn"
                      onClick={() => handleWeightChange(ex.exerciseId, idx, set.weight, weightStep)}
                      style={{ width: '20px' }}
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
                      style={{ width: '20px' }}
                    >
                      -
                    </button>
                    <input 
                      type="number" 
                      value={set.reps}
                      onChange={(e) => updateSet(ex.exerciseId, idx, 'reps', e.target.value)}
                    />
                    <button 
                      type="button" 
                      className="input-btn"
                      onClick={() => handleRepsChange(ex.exerciseId, idx, set.reps, 1)}
                      style={{ width: '20px' }}
                    >
                      +
                    </button>
                  </div>

                  {/* 4. RPE/RIR Select */}
                  {preferences.prefLoggingMode === 'RPE' ? (
                    <select 
                      value={set.rpe} 
                      onChange={(e) => updateSet(ex.exerciseId, idx, 'rpe', e.target.value)}
                      className="form-input"
                      style={{ 
                        padding: '0 2px', 
                        height: '38px', 
                        fontSize: '16px', 
                        textAlign: 'center', 
                        borderRadius: '6px', 
                        backgroundColor: 'var(--bg-secondary)', 
                        border: '1px solid var(--border-color)', 
                        color: 'var(--text-primary)' 
                      }}
                    >
                      <option value="">RPE</option>
                      <option value="10">10</option>
                      <option value="9.5">9.5</option>
                      <option value="9">9.0</option>
                      <option value="8.5">8.5</option>
                      <option value="8">8.0</option>
                      <option value="7.5">7.5</option>
                      <option value="7">7.0</option>
                      <option value="6.5">6.5</option>
                      <option value="6">6.0</option>
                    </select>
                  ) : (
                    <select 
                      value={set.rir} 
                      onChange={(e) => updateSet(ex.exerciseId, idx, 'rir', e.target.value)}
                      className="form-input"
                      style={{ 
                        padding: '0 2px', 
                        height: '38px', 
                        fontSize: '16px', 
                        textAlign: 'center', 
                        borderRadius: '6px', 
                        backgroundColor: 'var(--bg-secondary)', 
                        border: '1px solid var(--border-color)', 
                        color: 'var(--text-primary)' 
                      }}
                    >
                      <option value="">RIR</option>
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
                    onClick={() => updateSet(ex.exerciseId, idx, 'completed', !set.completed)}
                    style={{
                      height: '38px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: set.completed ? 'var(--success)' : 'var(--border-color)',
                      backgroundColor: set.completed ? 'var(--success-glow)' : 'transparent',
                      color: set.completed ? 'var(--success-strong)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'var(--transition)'
                    }}
                  >
                    <Check size={16} strokeWidth={3} />
                  </button>

                  {/* 6. Remove Set */}
                  <button 
                    type="button"
                    className="btn btn-secondary btn-icon-only btn-sm"
                    style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: 'transparent', background: 'none', padding: 0 }}
                    onClick={() => removeSetFromActive(ex.exerciseId, idx)}
                  >
                    <Trash2 size={14} style={{ color: 'var(--text-muted)' }} />
                  </button>
                </div>
              ))}
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

      {/* 3. Add Custom Exercise Card */}
      {showAddCustom ? (
        <form onSubmit={handleAddCustomExercise} className="card" style={{ gap: '14px' }}>
          <div className="card-title">
            <span>Add Custom Exercise</span>
            <button 
              type="button" 
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              onClick={() => setShowAddCustom(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="form-group">
            <label htmlFor="custom-exercise-name">Exercise Name</label>
            <input 
              type="text" 
              id="custom-exercise-name"
              className="form-input" 
              placeholder="e.g. Incline DB Flyes"
              value={customExerciseName} 
              onChange={(e) => setCustomExerciseName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="custom-exercise-mg">Muscle Group</label>
            <select 
              id="custom-exercise-mg"
              className="form-input"
              value={customExerciseMG}
              onChange={(e) => setCustomExerciseMG(e.target.value)}
            >
              <option value="Chest">Chest</option>
              <option value="Shoulders">Shoulders</option>
              <option value="Triceps">Triceps</option>
              <option value="Lats">Lats</option>
              <option value="Back">Back</option>
              <option value="Legs">Legs</option>
              <option value="Abs">Abs</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddCustom(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              Add to Workout
            </button>
          </div>
        </form>
      ) : (
        <button 
          className="btn btn-secondary" 
          onClick={() => setShowAddCustom(true)} 
          style={{ borderStyle: 'dashed', background: 'transparent' }}
        >
          <Plus size={16} /> Add Custom Exercise on the Fly
        </button>
      )}

      {/* Floating Rest Timer countdown panel */}
      {restEndTime && (timerSeconds > 0 || isFlashing) && (
        <div
          style={{
            position: 'fixed',
            bottom: '75px',
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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', minWidth: 0 }}>
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
      )}

      {/* Confirm Workout Cancel Modal */}
      {showCancelConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ margin: 0 }}>Discard Workout?</h3>
            <p className="text-muted" style={{ margin: 0, fontSize: '14px', lineHeight: '1.4' }}>
              Are you sure you want to discard this workout session? Your sets and logged weights will be permanently deleted.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCancelConfirm(false)}>
                No, Keep Training
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => {
                cancelWorkout();
                setShowCancelConfirm(false);
              }}>
                Yes, Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
