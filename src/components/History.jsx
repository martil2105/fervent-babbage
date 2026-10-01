import { useState } from 'react';
import { CalendarDays, Trophy, ChevronDown, ChevronUp, Pencil, Plus, Trash2, Check, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import WeightInput from './WeightInput';
import ExercisePicker from './ExercisePicker';
import {
  formatDate,
  formatWeight,
  getSessionVolume,
  getExerciseVolume,
  getPersonalBests,
  getDisplayExercises,
  orderExercisesByRoutines
} from '../utils/workoutHelpers';
import { formatNumber, monthLabel, sessionDate } from '../utils/format';

// Convert a timestamp to the local "YYYY-MM-DDTHH:mm" string that
// <input type="datetime-local"> expects.
const toLocalInputValue = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Fresh set for exercises/sets added during a history edit. Added sets count
// as logged (completed: true) since the edit is describing what really happened.
const emptySet = () => ({ weight: 0, reps: 0, isWarmup: false, completed: true, rpe: null, rir: null });

export default function History({
  history,
  exercises,
  routines = [],
  catalog = [],
  updateHistorySession,
  deleteHistorySession,
  createExercise,
  onOpenExercise
}) {
  const [activeSubTab, setActiveSubTab] = useState('logs'); // 'logs' | 'pbs'
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Editing state: which session is in edit mode, plus a local draft the
  // inputs write into. Nothing touches the DB until Save.
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [now] = useState(() => Date.now());

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
  };

  const cancelEdit = () => {
    setEditingSessionId(null);
    setDraft(null);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId || !deleteHistorySession) return;
    setDeleting(true);
    try {
      await deleteHistorySession(confirmDeleteId);
      if (editingSessionId === confirmDeleteId) cancelEdit();
      if (expandedSessionId === confirmDeleteId) setExpandedSessionId(null);
      setConfirmDeleteId(null);
    } finally {
      setDeleting(false);
    }
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

  // Exercises added to a past session come from the same list as everywhere
  // else, so they join that exercise's history instead of starting a new one.
  const addDraftExercise = (entry) => {
    if (!entry) return;
    const row = {
      exerciseId: entry.id,
      name: entry.name,
      sets: [emptySet()],
      targetRange: { min: entry.minReps ?? 8, max: entry.maxReps ?? 12 },
      muscleGroup: entry.muscleGroup || 'Other',
      exerciseType: entry.exerciseType || 'compound',
      restDuration: entry.restDuration || 120,
      weightStep: entry.weightStep
    };
    setDraft((prev) => (
      prev.exercises.some((ex) => ex.exerciseId === row.exerciseId)
        ? prev
        : { ...prev, exercises: [...prev.exercises, row] }
    ));
    setShowPicker(false);
  };

  const createDraftExercise = async (fields) => {
    const record = await createExercise?.(fields);
    if (record) addDraftExercise(record);
  };

  const subTabs = (
    <div className="sub-tabs">
      <button
        type="button"
        className={`sub-tab-btn ${activeSubTab === 'logs' ? 'active' : ''}`}
        onClick={() => setActiveSubTab('logs')}
      >
        Sessions
      </button>
      <button
        type="button"
        className={`sub-tab-btn ${activeSubTab === 'pbs' ? 'active' : ''}`}
        onClick={() => setActiveSubTab('pbs')}
      >
        Personal bests
      </button>
    </div>
  );

  // 1. Check if history exists
  if (!history || history.length === 0) {
    return (
      <div className="tab-content">
        {subTabs}
        <div className="empty-state">
          <CalendarDays aria-hidden="true" />
          <h2>No sessions yet</h2>
          <p className="text-muted">
            Finished workouts land here, newest first. You can open any of them
            to check the sets, or edit one after the fact.
          </p>
        </div>
      </div>
    );
  }

  // 2. Fetch personal bests
  const pbs = getPersonalBests(history);

  // Library in session order (Push's exercises, then Legs') for the Personal
  // Bests list.
  const orderedExercises = orderExercisesByRoutines(exercises, routines);

  const sessionPendingDelete = confirmDeleteId
    ? history.find((s) => s.id === confirmDeleteId)
    : null;
  const draftHasSets = draft && draft.exercises.some((ex) => ex.sets.length > 0);

  // Month headings between sessions (history is newest first)
  const monthStarts = new Set(
    history
      .filter((session, i) => i === 0 || monthLabel(session.timestamp) !== monthLabel(history[i - 1].timestamp))
      .map((session) => session.id)
  );

  return (
    <div className="tab-content">
      {subTabs}

      {/* Sessions */}
      {activeSubTab === 'logs' && (
        <div className="history-list">
          {history.map((session) => {
            const isExpanded = expandedSessionId === session.id;
            const isEditing = editingSessionId === session.id && draft;
            const totalVol = getSessionVolume(session.exercises);
            const exSummary = session.exercises.map(ex => ex.name).join(', ');
            const showMonth = monthStarts.has(session.id);
            const date = new Date(session.timestamp);
            const exCount = session.exercises.length;

            return (
              <div key={session.id} className="history-entry">
                {showMonth && <h3 className="history-month">{monthLabel(session.timestamp)}</h3>}
                <div
                  className={`history-item${isExpanded ? ' is-open' : ''}`}
                  onClick={() => toggleExpandSession(session.id)}
                  style={isEditing ? { cursor: 'default' } : undefined}
                >
                  <div className="history-item-header">
                    <div className="history-date" aria-hidden="true">
                      <span className="history-date-day">{date.getDate()}</span>
                      <span className="history-date-weekday">
                        {date.toLocaleDateString(undefined, { weekday: 'short' })}
                      </span>
                    </div>
                    <div className="history-item-main">
                      <span className="history-item-date">
                        {/* Sessions logged before routines existed have no name */}
                        {session.routineName || 'Workout'}
                        <span className="visually-hidden">, {formatDate(session.timestamp)}</span>
                      </span>
                      <span className="history-item-sub">
                        {session.duration || 0} min, {exCount} exercise{exCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <span className="history-item-volume">
                      {formatNumber(totalVol)}<span className="unit">kg</span>
                    </span>
                    {isExpanded
                      ? <ChevronUp size={18} className="row-chevron" aria-hidden="true" />
                      : <ChevronDown size={18} className="row-chevron" aria-hidden="true" />}
                  </div>

                  {!isExpanded && (
                    <p className="history-item-exercises">{exSummary}</p>
                  )}

                  {/* Expanded read-only detail view */}
                  {isExpanded && !isEditing && (
                    <div className="history-details" onClick={(e) => e.stopPropagation()}>
                      {session.exercises.map((ex, idx) => {
                        const exVol = getExerciseVolume(ex.sets);
                        return (
                          <div key={idx} className="history-detail-exercise">
                            <div className="history-detail-head">
                              <button
                                type="button"
                                className="link-btn history-detail-exercise-name"
                                onClick={() => onOpenExercise?.(ex.exerciseId)}
                              >
                                {ex.name}
                              </button>
                              <span className="history-detail-volume">{formatNumber(exVol)} kg</span>
                            </div>
                            <div className="set-chips">
                              {ex.sets.map((set, sIdx) => {
                                const skipped = set.completed === false;
                                return (
                                  <span
                                    key={sIdx}
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

                      <div className="history-detail-actions">
                        <span className="text-xs">{sessionDate(session.timestamp, now)}</span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => startEdit(session)}
                        >
                          <Pencil size={13} /> Edit session
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expanded EDIT view */}
                  {isExpanded && isEditing && (
                    <div className="history-details" onClick={(e) => e.stopPropagation()}>
                      {/* Date & duration */}
                      <div className="edit-when">
                        <div className="form-group">
                          <label htmlFor={`edit-date-${session.id}`}>Date and time</label>
                          <input
                            id={`edit-date-${session.id}`}
                            type="datetime-local"
                            className="form-input"
                            value={draft.timestampLocal}
                            onChange={(e) => setDraft((prev) => ({ ...prev, timestampLocal: e.target.value }))}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`edit-duration-${session.id}`}>Minutes</label>
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
                        <div key={`${ex.exerciseId}-${exIdx}`} className="history-detail-exercise edit-exercise">
                          <div className="history-detail-head">
                            <span className="history-detail-exercise-name">{ex.name}</span>
                            <button
                              type="button"
                              className="icon-btn is-quiet is-danger"
                              title="Remove exercise from this session"
                              aria-label={`Remove ${ex.name} from this session`}
                              onClick={() => removeDraftExercise(exIdx)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>

                          {/* Column labels */}
                          <div className="edit-grid edit-grid-header" aria-hidden="true">
                            <span>Type</span>
                            <span>kg</span>
                            <span>Reps</span>
                            <span>Logged</span>
                            <span></span>
                          </div>

                          {ex.sets.map((set, setIdx) => (
                            <div key={setIdx} className="edit-grid">
                              {/* Warm-up toggle */}
                              <button
                                type="button"
                                className={`edit-type${set.isWarmup ? ' is-warmup' : ''}`}
                                onClick={() => updateDraftSet(exIdx, setIdx, 'isWarmup', !set.isWarmup)}
                                title={set.isWarmup ? 'Warm-up set (not counted) — tap for working set' : 'Working set — tap for warm-up'}
                              >
                                {set.isWarmup ? 'Warm' : 'Work'}
                              </button>

                              {/* Weight — accepts "27,5" as well as "27.5" */}
                              <WeightInput
                                className="form-input edit-input"
                                value={set.weight}
                                onChange={(value) => updateDraftSet(exIdx, setIdx, 'weight', value)}
                                aria-label={`${ex.name} set ${setIdx + 1} weight, kg`}
                              />

                              {/* Reps */}
                              <input
                                type="number"
                                inputMode="numeric"
                                min="0"
                                className="form-input edit-input"
                                value={set.reps}
                                onChange={(e) => updateDraftSet(exIdx, setIdx, 'reps', e.target.value)}
                                aria-label={`${ex.name} set ${setIdx + 1} reps`}
                              />

                              {/* Counted toggle */}
                              <button
                                type="button"
                                className={`edit-logged${set.completed ? ' is-done' : ''}`}
                                onClick={() => updateDraftSet(exIdx, setIdx, 'completed', !set.completed)}
                                title={set.completed ? 'Logged — tap to mark as skipped' : 'Skipped (not counted) — tap to log'}
                                aria-pressed={!!set.completed}
                                aria-label={`${ex.name} set ${setIdx + 1} ${set.completed ? 'logged' : 'skipped'}`}
                              >
                                {set.completed ? <Check size={15} strokeWidth={3} /> : <X size={15} />}
                              </button>

                              {/* Remove set */}
                              <button
                                type="button"
                                className="set-remove"
                                title="Remove set"
                                aria-label={`Remove ${ex.name} set ${setIdx + 1}`}
                                onClick={() => removeDraftSet(exIdx, setIdx)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}

                          <button
                            type="button"
                            className="btn btn-secondary btn-sm btn-block"
                            onClick={() => addDraftSet(exIdx)}
                          >
                            <Plus size={13} /> Add set
                          </button>
                        </div>
                      ))}

                      {/* Add exercise — from the shared list */}
                      <button
                        type="button"
                        className="btn btn-dashed btn-sm btn-block"
                        onClick={() => setShowPicker(true)}
                      >
                        <Plus size={14} /> Add exercise
                      </button>

                      {/* Delete / Cancel / Save */}
                      <div className="edit-actions">
                        {deleteHistorySession && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => setConfirmDeleteId(session.id)}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        )}
                        <span className="toolbar-spacer" />
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
                          <Check size={14} /> Save changes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Personal bests */}
      {activeSubTab === 'pbs' && (
        <div className="pb-list">
          {getDisplayExercises(orderedExercises, history).map((ex) => {
            const pb = pbs[ex.id] || { maxWeight: 0, maxSessionVolume: 0 };
            const has = pb.maxWeight > 0;
            return (
              <div key={ex.id} className="pb-item">
                <span className={`pb-medal${has ? ' is-on' : ''}`} aria-hidden="true">
                  <Trophy size={16} />
                </span>
                <div className="pb-main">
                  <button type="button" className="link-btn pb-exercise-name" onClick={() => onOpenExercise?.(ex.id)}>
                    {ex.name}
                  </button>
                  <span className="pb-sub">{ex.minReps}–{ex.maxReps} reps</span>
                </div>

                <div className="pb-values">
                  {has ? (
                    <>
                      <span className="pb-weight">
                        {formatWeight(pb.maxWeight)}<span className="unit">kg</span>
                      </span>
                      <span className="pb-volume">
                        Best session {formatNumber(pb.maxSessionVolume)} kg
                      </span>
                    </>
                  ) : (
                    <span className="pb-volume">Nothing logged</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showPicker && draft && (
        <ExercisePicker
          catalog={catalog}
          routines={routines}
          history={history}
          excludeIds={draft.exercises.map((ex) => ex.exerciseId)}
          onPick={addDraftExercise}
          onCreate={createDraftExercise}
          onClose={() => setShowPicker(false)}
        />
      )}

      {sessionPendingDelete && (
        <ConfirmDialog
          title="Delete this session?"
          confirmLabel="Delete session"
          busy={deleting}
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={confirmDelete}
        >
          {sessionPendingDelete.routineName ? `${sessionPendingDelete.routineName}, ` : 'The session on '}
          {formatDate(sessionPendingDelete.timestamp)}, will be removed from your history,
          records and progress charts. This can&apos;t be undone unless it&apos;s in a backup.
        </ConfirmDialog>
      )}
    </div>
  );
}
