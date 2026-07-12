import { useState } from 'react';
import { Calendar, Clock, Trophy, ChevronDown, ChevronUp, Pencil, Plus, Trash2, Check, X } from 'lucide-react';
import {
  formatDate,
  getSessionVolume,
  getExerciseVolume,
  getPersonalBests,
  getDisplayExercises
} from '../utils/workoutHelpers';

// Convert a timestamp to the local "YYYY-MM-DDTHH:mm" string that
// <input type="datetime-local"> expects.
const toLocalInputValue = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const MUSCLE_GROUPS = ['Chest', 'Shoulders', 'Triceps', 'Lats', 'Back', 'Legs', 'Abs', 'Other'];

// Fresh set for exercises/sets added during a history edit. Added sets count
// as logged (completed: true) since the edit is describing what really happened.
const emptySet = () => ({ weight: 0, reps: 0, isWarmup: false, completed: true, rpe: null, rir: null });

export default function History({ history, exercises, updateHistorySession }) {
  const [activeSubTab, setActiveSubTab] = useState('logs'); // 'logs' | 'pbs'
  const [expandedSessionId, setExpandedSessionId] = useState(null);

  // Editing state: which session is in edit mode, plus a local draft the
  // inputs write into. Nothing touches the DB until Save.
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [addExerciseChoice, setAddExerciseChoice] = useState('');
  const [customName, setCustomName] = useState('');
  const [customMG, setCustomMG] = useState('Other');

  const toggleExpandSession = (sessionId) => {
    if (editingSessionId === sessionId) return; // locked open while editing
    setExpandedSessionId(prev => prev === sessionId ? null : sessionId);
  };

  const startEdit = (session) => {
    setEditingSessionId(session.id);
    setExpandedSessionId(session.id);
    setDraft({
      timestampLocal: toLocalInputValue(session.timestamp),
      duration: session.duration ?? 0,
      // Deep copy so edits never mutate the live-query objects
      exercises: JSON.parse(JSON.stringify(session.exercises))
    });
    setAddExerciseChoice('');
    setCustomName('');
  };

  const cancelEdit = () => {
    setEditingSessionId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!draft) return;
    const ts = new Date(draft.timestampLocal).getTime();
    await updateHistorySession(editingSessionId, {
      exercises: draft.exercises,
      duration: draft.duration,
      ...(Number.isNaN(ts) ? {} : { timestamp: ts })
    });
    cancelEdit();
  };

  // --- Draft mutation helpers (all immutable) ---

  const updateDraftSet = (exIdx, setIdx, field, value) => {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) =>
        i !== exIdx ? ex : {
          ...ex,
          sets: ex.sets.map((s, j) => (j !== setIdx ? s : { ...s, [field]: value }))
        })
    }));
  };

  const addDraftSet = (exIdx) => {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) => {
        if (i !== exIdx) return ex;
        const last = ex.sets[ex.sets.length - 1];
        const newSet = last ? { ...last, completed: true } : emptySet();
        return { ...ex, sets: [...ex.sets, newSet] };
      })
    }));
  };

  const removeDraftSet = (exIdx, setIdx) => {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) =>
        i !== exIdx ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) })
    }));
  };

  const removeDraftExercise = (exIdx) => {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.filter((_, i) => i !== exIdx)
    }));
  };

  const addDraftExercise = () => {
    let entry;
    if (addExerciseChoice === '__custom__') {
      if (!customName.trim()) return;
      entry = {
        exerciseId: `custom-${Date.now()}`,
        name: customName.trim(),
        sets: [emptySet()],
        targetRange: { min: 8, max: 12 },
        muscleGroup: customMG,
        exerciseType: 'compound',
        restDuration: 120
      };
    } else {
      const cfg = exercises.find((e) => e.id === addExerciseChoice);
      if (!cfg) return;
      entry = {
        exerciseId: cfg.id,
        name: cfg.name,
        sets: [emptySet()],
        targetRange: { min: cfg.minReps, max: cfg.maxReps },
        muscleGroup: cfg.muscleGroup || 'Other',
        exerciseType: cfg.exerciseType || 'compound',
        restDuration: cfg.restDuration || 120,
        weightStep: cfg.weightStep
      };
    }
    setDraft((prev) => ({ ...prev, exercises: [...prev.exercises, entry] }));
    setAddExerciseChoice('');
    setCustomName('');
  };

  // 1. Check if history exists
  if (!history || history.length === 0) {
    return (
      <div className="tab-content">
        <div className="sub-tabs">
          <button
            className={`sub-tab-btn ${activeSubTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('logs')}
          >
            Workout Logs
          </button>
          <button
            className={`sub-tab-btn ${activeSubTab === 'pbs' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('pbs')}
          >
            Personal Bests
          </button>
        </div>

        <div className="empty-state">
          <Calendar />
          <h3>No History Yet</h3>
          <p className="text-muted text-center">
            Completed workout sessions will show up here. Start a session to build your training history!
          </p>
        </div>
      </div>
    );
  }

  // 2. Fetch personal bests
  const pbs = getPersonalBests(history);

  // Config exercises not already in the draft (for the "add exercise" picker)
  const addableExercises = draft
    ? exercises.filter((ex) => !draft.exercises.some((d) => d.exerciseId === ex.id))
    : [];
  const draftHasSets = draft && draft.exercises.some((ex) => ex.sets.length > 0);

  const compactInputStyle = {
    height: '34px',
    textAlign: 'center',
    padding: '0 4px',
    fontSize: '14px'
  };

  return (
    <div className="tab-content">
      {/* Sub-tab navigation */}
      <div className="sub-tabs">
        <button
          className={`sub-tab-btn ${activeSubTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('logs')}
        >
          Workout Logs
        </button>
        <button
          className={`sub-tab-btn ${activeSubTab === 'pbs' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('pbs')}
        >
          Personal Bests
        </button>
      </div>

      {/* SUB-TAB: Workout Logs */}
      {activeSubTab === 'logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {history.map((session) => {
            const isExpanded = expandedSessionId === session.id;
            const isEditing = editingSessionId === session.id && draft;
            const totalVol = getSessionVolume(session.exercises);
            const exSummary = session.exercises.map(ex => ex.name).join(', ');

            return (
              <div
                key={session.id}
                className="history-item"
                onClick={() => toggleExpandSession(session.id)}
                style={isEditing ? { cursor: 'default' } : undefined}
              >
                <div className="history-item-header">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="history-item-date">{formatDate(session.timestamp)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Clock size={12} /> {session.duration || 0}m
                      </span>
                      <span>•</span>
                      <span>{session.exercises.length} Exercises</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="history-item-volume">{Math.round(totalVol)} kg</span>
                    {isExpanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                  </div>
                </div>

                {!isExpanded && (
                  <p className="text-xs text-muted" style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: '2px'
                  }}>
                    {exSummary}
                  </p>
                )}

                {/* Expanded read-only detail view */}
                {isExpanded && !isEditing && (
                  <div className="history-details" onClick={(e) => e.stopPropagation()}>
                    {session.exercises.map((ex, idx) => {
                      const exVol = getExerciseVolume(ex.sets);
                      return (
                        <div key={idx} className="history-detail-exercise">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span className="history-detail-exercise-name">{ex.name}</span>
                            <span className="text-xs text-bold" style={{ color: 'var(--accent-strong)' }}>
                              {Math.round(exVol)} kg
                            </span>
                          </div>
                          <div className="history-detail-sets">
                            {ex.sets.map((set, sIdx) => {
                              const skipped = set.completed === false;
                              return (
                                <span
                                  key={sIdx}
                                  className="history-detail-set-badge"
                                  title={set.isWarmup ? 'Warm-up (not counted)' : skipped ? 'Not logged (not counted)' : undefined}
                                  style={set.isWarmup || skipped ? { opacity: 0.5, fontStyle: 'italic' } : undefined}
                                >
                                  S{sIdx + 1}: {set.weight}kg × {set.reps}
                                  {set.isWarmup ? ' · W' : skipped ? ' · skipped' : ''}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ alignSelf: 'flex-end', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}
                      onClick={() => startEdit(session)}
                    >
                      <Pencil size={13} /> Edit Session
                    </button>
                  </div>
                )}

                {/* Expanded EDIT view */}
                {isExpanded && isEditing && (
                  <div className="history-details" onClick={(e) => e.stopPropagation()}>
                    {/* Date & duration */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor={`edit-date-${session.id}`}>Date & Time</label>
                        <input
                          id={`edit-date-${session.id}`}
                          type="datetime-local"
                          className="form-input"
                          value={draft.timestampLocal}
                          onChange={(e) => setDraft((prev) => ({ ...prev, timestampLocal: e.target.value }))}
                        />
                      </div>
                      <div className="form-group" style={{ width: '90px' }}>
                        <label htmlFor={`edit-duration-${session.id}`}>Duration (m)</label>
                        <input
                          id={`edit-duration-${session.id}`}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          className="form-input"
                          value={draft.duration}
                          onChange={(e) => setDraft((prev) => ({ ...prev, duration: e.target.value }))}
                        />
                      </div>
                    </div>

                    {/* Exercises */}
                    {draft.exercises.map((ex, exIdx) => (
                      <div key={`${ex.exerciseId}-${exIdx}`} className="history-detail-exercise">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span className="history-detail-exercise-name">{ex.name}</span>
                          <button
                            type="button"
                            title="Remove exercise from this session"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                            onClick={() => removeDraftExercise(exIdx)}
                          >
                            <Trash2 size={15} style={{ color: 'var(--danger)' }} />
                          </button>
                        </div>

                        {/* Column labels */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '44px 1fr 1fr 34px 24px',
                          gap: '6px',
                          fontSize: '10px',
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          textAlign: 'center',
                          marginBottom: '4px'
                        }}>
                          <span style={{ textAlign: 'left' }}>TYPE</span>
                          <span>WEIGHT (KG)</span>
                          <span>REPS</span>
                          <span>LOG</span>
                          <span></span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {ex.sets.map((set, setIdx) => (
                            <div key={setIdx} style={{
                              display: 'grid',
                              gridTemplateColumns: '44px 1fr 1fr 34px 24px',
                              gap: '6px',
                              alignItems: 'center'
                            }}>
                              {/* Warm-up toggle */}
                              <button
                                type="button"
                                onClick={() => updateDraftSet(exIdx, setIdx, 'isWarmup', !set.isWarmup)}
                                title={set.isWarmup ? 'Warm-up set (not counted) — tap for working set' : 'Working set — tap for warm-up'}
                                style={{
                                  fontSize: '10px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border-color)',
                                  backgroundColor: set.isWarmup ? 'var(--warning-glow)' : 'transparent',
                                  color: set.isWarmup ? 'var(--warning-strong)' : 'var(--text-secondary)',
                                  cursor: 'pointer',
                                  height: '34px',
                                  fontWeight: 700,
                                  padding: 0
                                }}
                              >
                                {set.isWarmup ? 'WARM' : 'WORK'}
                              </button>

                              {/* Weight */}
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.5"
                                className="form-input"
                                style={compactInputStyle}
                                value={set.weight}
                                onChange={(e) => updateDraftSet(exIdx, setIdx, 'weight', e.target.value)}
                              />

                              {/* Reps */}
                              <input
                                type="number"
                                inputMode="numeric"
                                min="0"
                                className="form-input"
                                style={compactInputStyle}
                                value={set.reps}
                                onChange={(e) => updateDraftSet(exIdx, setIdx, 'reps', e.target.value)}
                              />

                              {/* Counted toggle */}
                              <button
                                type="button"
                                onClick={() => updateDraftSet(exIdx, setIdx, 'completed', !set.completed)}
                                title={set.completed ? 'Logged — tap to mark as skipped' : 'Skipped (not counted) — tap to log'}
                                style={{
                                  height: '34px',
                                  borderRadius: '6px',
                                  border: '1px solid',
                                  borderColor: set.completed ? 'var(--success)' : 'var(--border-color)',
                                  backgroundColor: set.completed ? 'var(--success-glow)' : 'transparent',
                                  color: set.completed ? 'var(--success-strong)' : 'var(--text-muted)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: 0
                                }}
                              >
                                {set.completed ? <Check size={15} strokeWidth={3} /> : <X size={15} />}
                              </button>

                              {/* Remove set */}
                              <button
                                type="button"
                                title="Remove set"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', justifyContent: 'center' }}
                                onClick={() => removeDraftSet(exIdx, setIdx)}
                              >
                                <Trash2 size={14} style={{ color: 'var(--text-muted)' }} />
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ width: '100%', marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onClick={() => addDraftSet(exIdx)}
                        >
                          <Plus size={13} /> Add Set
                        </button>
                      </div>
                    ))}

                    {/* Add exercise */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select
                          className="form-input"
                          style={{ flex: 1 }}
                          value={addExerciseChoice}
                          onChange={(e) => setAddExerciseChoice(e.target.value)}
                        >
                          <option value="">Add exercise…</option>
                          {addableExercises.map((ex) => (
                            <option key={ex.id} value={ex.id}>{ex.name}</option>
                          ))}
                          <option value="__custom__">Custom exercise…</option>
                        </select>
                        {addExerciseChoice !== '__custom__' && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={!addExerciseChoice}
                            onClick={addDraftExercise}
                          >
                            <Plus size={14} />
                          </button>
                        )}
                      </div>
                      {addExerciseChoice === '__custom__' && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{ flex: 1 }}
                            placeholder="Exercise name"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                          />
                          <select
                            className="form-input"
                            style={{ width: '110px' }}
                            value={customMG}
                            onChange={(e) => setCustomMG(e.target.value)}
                          >
                            {MUSCLE_GROUPS.map((mg) => (
                              <option key={mg} value={mg}>{mg}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={!customName.trim()}
                            onClick={addDraftExercise}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Save / Cancel */}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!draftHasSets}
                        title={!draftHasSets ? 'A session needs at least one set' : undefined}
                        onClick={saveEdit}
                      >
                        <Check size={14} /> Save Changes
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SUB-TAB: Personal Bests */}
      {activeSubTab === 'pbs' && (
        <div className="pb-list">
          {getDisplayExercises(exercises, history).map((ex) => {
            const pb = pbs[ex.id] || { maxWeight: 0, maxSessionVolume: 0 };
            return (
              <div key={ex.id} className="pb-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    background: pb.maxWeight > 0 ? 'var(--success-glow)' : 'var(--bg-card)',
                    color: pb.maxWeight > 0 ? 'var(--success)' : 'var(--text-muted)',
                    padding: '8px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Trophy size={18} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="pb-exercise-name">{ex.name}</span>
                    <span className="text-xs text-muted">
                      Target Reps: {ex.minReps}–{ex.maxReps}
                    </span>
                  </div>
                </div>

                <div className="pb-values">
                  {pb.maxWeight > 0 ? (
                    <>
                      <span className="pb-weight">
                        {pb.maxWeight} kg
                      </span>
                      <span className="pb-volume">
                        Max Vol: {Math.round(pb.maxSessionVolume)} kg
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted" style={{ fontStyle: 'italic' }}>
                      No data logged
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
