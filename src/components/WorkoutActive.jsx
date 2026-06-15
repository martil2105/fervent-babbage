import { useState, useEffect } from 'react';
import { Play, Check, Trash2, Plus, X, Dumbbell, Clock } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getProgressionSuggestion } from '../utils/workoutHelpers';

export default function WorkoutActive({ 
  currentWorkout, 
  startWorkout, 
  cancelWorkout, 
  completeWorkout, 
  updateSet, 
  addSetToActive, 
  removeSetFromActive,
  addCustomExerciseToActive,
  history,
  preferences,
  restEndTime,
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

  // Rest timer countdown and vibration/auto-clear
  useEffect(() => {
    if (!restEndTime) return;

    let vibrated = false;

    const checkTimer = () => {
      const diff = restEndTime - Date.now();
      if (diff <= 0) {
        if (!vibrated) {
          if (navigator.vibrate) {
            navigator.vibrate([300, 100, 300]);
          }
          vibrated = true;
        }
        
        // Auto clear after 6 seconds of flashing
        const clearId = setTimeout(() => {
          clearRestTimer();
        }, 6000);
        return () => clearTimeout(clearId);
      }
    };

    checkTimer();
    const timerInterval = setInterval(() => {
      setNow(Date.now());
      checkTimer();
    }, 500);

    return () => clearInterval(timerInterval);
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
      <div className="tab-content" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="empty-state">
          <div style={{
            background: 'var(--accent-glow)',
            color: 'var(--accent)',
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
            Ready for your Push Hypertrophy session? Start a workout to track weights, reps, and volume in real-time.
          </p>
          <button className="btn btn-primary" onClick={startWorkout} style={{ width: '100%', maxWidth: '240px', marginTop: '10px' }}>
            <Play size={18} fill="currentColor" /> Start Workout Session
          </button>
        </div>
      </div>
    );
  }

  // Weight adjust helpers
  const handleWeightChange = (exId, setIdx, currentVal, change) => {
    const parsed = parseFloat(currentVal) || 0;
    const newVal = Math.max(0, parsed + change);
    const rounded = Math.round(newVal * 100) / 100;
    updateSet(exId, setIdx, 'weight', rounded);
  };

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
        colors: ['#6366f1', '#10b981', '#f59e0b', '#f43f5e']
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
    <div className="tab-content" style={{ paddingBottom: restEndTime ? '160px' : '90px' }}>
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
        const suggestion = getProgressionSuggestion(ex.exerciseId, history, mockDef);
        
        return (
          <div key={ex.exerciseId} className="card exercise-log-card" style={{
            borderLeftColor: ex.exerciseType === 'isolation' ? 'var(--warning)' : 'var(--accent)'
          }}>
            <div className="exercise-log-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="card-title" style={{ fontSize: '16px' }}>{ex.name}</h3>
                <span className="text-xs text-bold text-muted" style={{ 
                  backgroundColor: 'var(--bg-secondary)', 
                  padding: '2px 8px', 
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)'
                }}>
                  {ex.muscleGroup}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="rep-target-badge">
                  Target: {ex.targetRange.min}–{ex.targetRange.max} reps
                </span>
                {suggestion && suggestion.type !== 'initial' && (
                  <span className="text-xs text-bold" style={{
                    color: suggestion.type === 'weight' ? 'var(--success)' : suggestion.type === 'hold' ? 'var(--accent)' : 'var(--warning)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}>
                    • Hint: {suggestion.action}
                  </span>
                )}
              </div>
            </div>

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
                  backgroundColor: set.completed ? 'rgba(255, 255, 255, 0.01)' : 'transparent'
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
                      color: set.isWarmup ? 'var(--warning)' : 'var(--text-secondary)',
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
                      onClick={() => handleWeightChange(ex.exerciseId, idx, set.weight, -2.5)}
                      style={{ width: '20px' }}
                    >
                      -
                    </button>
                    <input 
                      type="number" 
                      step="0.5" 
                      value={set.weight}
                      onChange={(e) => updateSet(ex.exerciseId, idx, 'weight', e.target.value)}
                    />
                    <button 
                      type="button" 
                      className="input-btn"
                      onClick={() => handleWeightChange(ex.exerciseId, idx, set.weight, 2.5)}
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
                      color: set.completed ? 'var(--success)' : 'var(--text-secondary)',
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
          className={isFlashing ? 'rest-timer-flashing' : ''}
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
            padding: '10px 14px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 999
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={20} style={{
              color: isFlashing ? 'var(--warning)' : 'var(--accent)',
              animation: timerSeconds > 0 ? 'spin 10s linear infinite' : 'none'
            }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="text-xs text-bold" style={{ color: isFlashing ? 'var(--warning)' : 'var(--text-secondary)' }}>
                {isFlashing ? 'REST COMPLETE!' : 'RESTING'}
              </span>
              <span style={{ fontSize: '18px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                {isFlashing ? '00:00' : `${Math.floor(timerSeconds / 60)}:${String(timerSeconds % 60).padStart(2, '0')}`}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
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

      {/* Embedded PWA style animation rules */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .rest-timer-flashing {
          animation: borderFlash 1s infinite alternate;
        }
        @keyframes borderFlash {
          from { border-color: rgba(245, 158, 11, 0.3); box-shadow: 0 0 4px rgba(245, 158, 11, 0.2); }
          to { border-color: rgba(245, 158, 11, 1); box-shadow: 0 0 12px rgba(245, 158, 11, 0.6); }
        }
      `}</style>
    </div>
  );
}
