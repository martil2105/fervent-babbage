import { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, FileDown, FileUp, Trash, ShieldCheck, ShieldAlert, HardDrive, AlertTriangle, ArrowUpDown, GitMerge } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import ReorderSheet from './ReorderSheet';
import { findMatchingExercise, findDuplicateExerciseGroups } from '../utils/exerciseLibrary';
import {
  SELECTABLE_MUSCLE_GROUPS as MUSCLE_GROUPS,
  formatWeight,
  formatDate,
  roundWeight,
  orderExercisesByRoutines
} from '../utils/workoutHelpers';
import { isSupported as backupFolderSupported } from '../utils/autoBackup';
import { parseBackup, summarizeSessions, countSessionsLostByRestore } from '../utils/backupFile';
import {
  notificationsSupported,
  notificationPermission,
  requestNotificationPermission
} from '../utils/restNotification';
import { getStorageEstimate, formatBytes } from '../utils/storagePersistence';

export default function Settings({
  exercises,
  routines = [],
  history = [],
  preferences,
  updatePreference,
  addExerciseToConfig,
  updateExerciseInConfig,
  deleteExerciseFromConfig,
  addRoutine,
  renameRoutine,
  deleteRoutine,
  setExerciseInRoutine,
  exportData,
  importData,
  clearAllData,
  storagePersisted,
  requestPersistentStorage,
  chooseBackupFolder,
  forgetBackupFolder,
  backupFolderName,
  catalog = [],
  ensureInLibrary,
  mergeExercises,
  moveExerciseInRoutine,
  onOpenExercise
}) {
  const [editingId, setEditingId] = useState(null);
  
  // Inline edit state
  const [editName, setEditName] = useState('');
  const [editSets, setEditSets] = useState(4);
  const [editMinReps, setEditMinReps] = useState(10);
  const [editMaxReps, setEditMaxReps] = useState(12);
  const [editMuscleGroup, setEditMuscleGroup] = useState('Other');
  const [editExerciseType, setEditExerciseType] = useState('compound');
  const [editRestDuration, setEditRestDuration] = useState(120);
  const [editWeightStep, setEditWeightStep] = useState(2);
  const [editStartingWeight, setEditStartingWeight] = useState('');

  // New exercise state
  const [newName, setNewName] = useState('');
  const [newSets, setNewSets] = useState(4);
  const [newMinReps, setNewMinReps] = useState(10);
  const [newMaxReps, setNewMaxReps] = useState(12);
  const [newMuscleGroup, setNewMuscleGroup] = useState('Shoulders');
  const [newExerciseType, setNewExerciseType] = useState('compound');
  const [newRestDuration, setNewRestDuration] = useState(120);
  const [newWeightStep, setNewWeightStep] = useState(2);
  const [newRoutineId, setNewRoutineId] = useState('');
  const [newStartingWeight, setNewStartingWeight] = useState('');
  const [showAddNew, setShowAddNew] = useState(false);

  // Routine management
  const [reorderRoutineId, setReorderRoutineId] = useState(null);
  const [pendingMerge, setPendingMerge] = useState(null); // a duplicate group
  const [merging, setMerging] = useState(false);
  const [renamingRoutineId, setRenamingRoutineId] = useState(null);
  const [routineDraftName, setRoutineDraftName] = useState('');
  const [newRoutineName, setNewRoutineName] = useState('');
  const [choosingFolder, setChoosingFolder] = useState(false);

  // Permission is read once into state: Notification.permission is a live
  // browser value, and reading it during render would be impure.
  const [notifyPermission, setNotifyPermission] = useState(() => notificationPermission());

  // Which routine(s) each exercise belongs to, for the library list.
  const routinesByExerciseId = {};
  routines.forEach((r) => {
    (r.exerciseIds || []).forEach((id) => {
      routinesByExerciseId[id] = [...(routinesByExerciseId[id] || []), r.name];
    });
  });

  // Whole-kg increment the +/- weight buttons jump by during a workout.
  const stepForType = (type) => (type === 'isolation' ? 1 : 2);

  // Import file ref
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState(null); // null | 'success' | 'error'
  const [importError, setImportError] = useState(null);
  // A checked backup waiting for the person to confirm the replace
  const [pendingImport, setPendingImport] = useState(null); // { data, summary, fileName }
  const [importing, setImporting] = useState(false);

  // Danger zone confirm
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Delete confirmations: { kind: 'exercise' | 'routine', id, name }
  const [pendingDelete, setPendingDelete] = useState(null);

  // Session order for the exercise list, so it reads like the workouts do.
  const orderedExercises = orderExercisesByRoutines(exercises, routines);

  // Storage durability + backup freshness
  const [nowTs] = useState(() => Date.now()); // stable clock read (avoids impure render)
  const [estimate, setEstimate] = useState(null);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    let active = true;
    getStorageEstimate().then((e) => { if (active) setEstimate(e); });
    return () => { active = false; };
  }, [storagePersisted]);

  const handleEnablePersistence = async () => {
    setEnabling(true);
    await requestPersistentStorage?.();
    setEnabling(false);
  };

  const lastBackupAt = preferences?.lastBackupAt || null;
  const backupAgeDays = lastBackupAt ? Math.floor((nowTs - lastBackupAt) / 86400000) : null;
  const backupStale = backupAgeDays === null || backupAgeDays >= 7;
  const backupLabel = lastBackupAt
    ? backupAgeDays === 0 ? 'Last backup: today' : `Last backup: ${backupAgeDays} day${backupAgeDays === 1 ? '' : 's'} ago`
    : 'No backup yet';

  const startEditing = (ex) => {
    setEditingId(ex.id);
    setEditName(ex.name);
    setEditSets(ex.targetSets);
    setEditMinReps(ex.minReps);
    setEditMaxReps(ex.maxReps);
    setEditMuscleGroup(ex.muscleGroup || 'Other');
    setEditExerciseType(ex.exerciseType || 'compound');
    setEditRestDuration(ex.restDuration || 120);
    setEditWeightStep(ex.weightStep || stepForType(ex.exerciseType));
    setEditStartingWeight(
      typeof ex.startingWeight === 'number' && ex.startingWeight > 0 ? ex.startingWeight : ''
    );
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEditing = (ex) => {
    // A cleared name would leave a blank row everywhere; keep the old one.
    const name = editName.trim() || ex.name;
    // Accept the rep range in either order rather than storing min > max,
    // which would make "top of the range" unreachable for the progression hint.
    const lo = parseInt(editMinReps) || 10;
    const hi = parseInt(editMaxReps) || 12;
    updateExerciseInConfig(ex.id, {
      name,
      targetSets: parseInt(editSets) || 4,
      minReps: Math.min(lo, hi),
      maxReps: Math.max(lo, hi),
      muscleGroup: editMuscleGroup,
      exerciseType: editExerciseType,
      restDuration: parseInt(editRestDuration) || 120,
      weightStep: Math.max(0.5, roundWeight(editWeightStep) || stepForType(editExerciseType)),
      // null (not 0) so "no starting weight set" stays distinguishable from
      // "starts at bodyweight" and the prefill can leave the field blank.
      startingWeight: roundWeight(editStartingWeight) || null
    });
    setEditingId(null);
  };

  // A name the app already knows (under any spelling) adds that exercise to
  // the chosen session instead of creating a second copy of it.
  const newNameMatch = findMatchingExercise(newName, catalog);

  const handleCreateExercise = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const targetRoutineId = newRoutineId || routines[0]?.id;
    if (newNameMatch.exact) {
      const record = await ensureInLibrary?.(newNameMatch.exact);
      if (record && targetRoutineId) await setExerciseInRoutine(targetRoutineId, record.id, true);
      setNewName('');
      setShowAddNew(false);
      return;
    }
    addExerciseToConfig(
      newName,
      newSets,
      newMinReps,
      newMaxReps,
      newMuscleGroup,
      newExerciseType,
      newRestDuration,
      newWeightStep,
      newRoutineId || routines[0]?.id,
      newStartingWeight
    );

    // Reset state
    setNewName('');
    setNewSets(4);
    setNewMinReps(10);
    setNewMaxReps(12);
    setNewMuscleGroup('Shoulders');
    setNewExerciseType('compound');
    setNewRestDuration(120);
    setNewWeightStep(2);
    setNewRoutineId('');
    setNewStartingWeight('');
    setShowAddNew(false);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const flashImportStatus = (status, error = null) => {
    setImportStatus(status);
    setImportError(error);
    setTimeout(() => {
      setImportStatus(null);
      setImportError(null);
    }, status === 'error' ? 6000 : 3000);
  };

  // Step 1: read and check the file, then ask. Nothing is written yet —
  // importing replaces the whole log, so the person sees what's in the file
  // (and what would be lost) before anything happens.
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const checked = parseBackup(event.target?.result ?? '');
      if (!checked.ok) {
        flashImportStatus('error', checked.error);
        return;
      }
      setPendingImport({ data: checked.data, summary: checked.summary, fileName: file.name });
    };
    reader.onerror = () => flashImportStatus('error', 'That file couldn’t be read.');
    reader.readAsText(file);
  };

  // Step 2: confirmed — replace the data.
  const confirmImport = async () => {
    if (!pendingImport) return;
    setImporting(true);
    const success = await importData(pendingImport.data);
    setImporting(false);
    setPendingImport(null);
    if (success) flashImportStatus('success');
    else flashImportStatus('error', 'Nothing was changed — the backup couldn’t be written. Your current data is untouched.');
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'exercise') deleteExerciseFromConfig(pendingDelete.id);
    else deleteRoutine(pendingDelete.id);
    setPendingDelete(null);
  };

  const duplicateGroups = findDuplicateExerciseGroups(catalog);

  const confirmMerge = async () => {
    if (!pendingMerge) return;
    setMerging(true);
    try {
      await mergeExercises?.(pendingMerge.others.map((e) => e.id), pendingMerge.target);
      setPendingMerge(null);
    } finally {
      setMerging(false);
    }
  };

  const reorderRoutine = routines.find((r) => r.id === reorderRoutineId);
  const catalogById = new Map(catalog.map((e) => [e.id, e]));

  const importSummary = pendingImport?.summary;
  const currentSpan = summarizeSessions(history);
  // A backup without a history key leaves the device's history alone (import
  // only replaces what the file contains), so nothing would be lost there.
  const sessionsLost = pendingImport && Array.isArray(pendingImport.data.history)
    ? countSessionsLostByRestore(history, pendingImport.data.history)
    : 0;
  const formatSpan = (first, last) =>
    first === null ? 'no workouts'
      : first === last || formatDate(first) === formatDate(last) ? formatDate(last)
        : `${formatDate(first)} – ${formatDate(last)}`;

  const currentPrefMode = preferences?.prefLoggingMode || 'RPE';

  const pickFolder = async () => {
    setChoosingFolder(true);
    await chooseBackupFolder();
    setChoosingFolder(false);
  };

  return (
    <div className="tab-content settings">
      {/* 1. Logging */}
      <section className="settings-section">
        <h2 className="section-label">Logging</h2>
        <div className="card">
          <div className="settings-block">
            <div className="settings-row-main">
              <span className="settings-row-title">Effort scale</span>
              <span className="settings-row-sub">
                Rate each set by RPE, how hard it felt, or by RIR, the reps you
                had left.
              </span>
            </div>
            <div className="sub-tabs">
              <button
                type="button"
                className={`sub-tab-btn ${currentPrefMode === 'RPE' ? 'active' : ''}`}
                onClick={() => updatePreference('prefLoggingMode', 'RPE')}
                aria-pressed={currentPrefMode === 'RPE'}
              >
                RPE 6–10
              </button>
              <button
                type="button"
                className={`sub-tab-btn ${currentPrefMode === 'RIR' ? 'active' : ''}`}
                onClick={() => updatePreference('prefLoggingMode', 'RIR')}
                aria-pressed={currentPrefMode === 'RIR'}
              >
                RIR 0–5
              </button>
            </div>
          </div>

          {/* Rest timer notifications */}
          {notificationsSupported() && (
            <div className="settings-row has-rule">
              <div className="settings-row-main">
                <span className="settings-row-title">Rest timer alerts</span>
                <span className="settings-row-sub">
                  {notifyPermission === 'granted'
                    ? 'You’ll get a notification when rest ends while you’re in another app.'
                    : notifyPermission === 'denied'
                      ? 'Blocked in your browser settings. The timer still vibrates.'
                      : 'The timer vibrates, which you’ll miss if you’ve switched apps.'}
                </span>
              </div>
              {notifyPermission === 'default' && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={async () => setNotifyPermission(await requestNotificationPermission())}
                >
                  Turn on
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 2. Sessions (routines) */}
      <section className="settings-section">
        <h2 className="section-label">Sessions</h2>
        <div className="card">
          <p className="card-sub">
            Each session is a workout you can start. An exercise appears only in
            the sessions it&apos;s added to.
          </p>

          <div className="settings-list">
            {routines.map((routine) => {
              const isRenaming = renamingRoutineId === routine.id;
              const count = routine.exerciseIds?.length || 0;

              return (
                <div key={routine.id} className="settings-row">
                  {isRenaming ? (
                    <form
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        renameRoutine(routine.id, routineDraftName);
                        setRenamingRoutineId(null);
                      }}
                    >
                      <input
                        className="form-input"
                        value={routineDraftName}
                        onChange={(e) => setRoutineDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setRenamingRoutineId(null);
                        }}
                        aria-label="Session name"
                        enterKeyHint="done"
                        autoFocus
                      />
                      <button type="submit" className="icon-btn" aria-label="Save name">
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn is-quiet"
                        onClick={() => setRenamingRoutineId(null)}
                        aria-label="Cancel rename"
                      >
                        <X size={16} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="settings-row-main">
                        <span className="settings-row-title">{routine.name}</span>
                        <span className="settings-row-sub">
                          {count} exercise{count === 1 ? '' : 's'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="icon-btn is-quiet"
                        onClick={() => setReorderRoutineId(routine.id)}
                        disabled={count === 0}
                        aria-label={`Change the order of ${routine.name}`}
                        title="Exercise order"
                      >
                        <ArrowUpDown size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn is-quiet"
                        onClick={() => {
                          setRenamingRoutineId(routine.id);
                          setRoutineDraftName(routine.name);
                        }}
                        aria-label={`Rename ${routine.name}`}
                      >
                        <Edit2 size={15} />
                      </button>
                      {/* Deleting the last session would leave nothing to start */}
                      <button
                        type="button"
                        className="icon-btn is-quiet is-danger"
                        disabled={routines.length <= 1}
                        title={routines.length <= 1 ? 'Keep at least one session' : undefined}
                        onClick={() => setPendingDelete({ kind: 'routine', id: routine.id, name: routine.name, count })}
                        aria-label={`Delete ${routine.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              addRoutine(newRoutineName);
              setNewRoutineName('');
            }}
          >
            <input
              className="form-input"
              placeholder="New session, e.g. Pull"
              value={newRoutineName}
              onChange={(e) => setNewRoutineName(e.target.value)}
              aria-label="New session name"
            />
            <button className="btn btn-secondary" type="submit" disabled={!newRoutineName.trim()}>
              <Plus size={15} /> Add
            </button>
          </form>
        </div>
      </section>

      {/* Duplicates: the same lift logged under different spellings */}
      {duplicateGroups.length > 0 && (
        <section className="settings-section">
          <h2 className="section-label">Possible duplicates</h2>
          <div className="card is-attention">
            <p className="card-sub">
              These look like one exercise under different names, so their
              history is split. Merging moves it all onto one name.
            </p>
            {duplicateGroups.map((group) => (
              <div key={group.key} className="dup-group">
                {[group.target, ...group.others].map((e, i) => (
                  <div key={e.id} className="dup-row">
                    <button type="button" className="link-btn dup-name" onClick={() => onOpenExercise?.(e.id)}>
                      {e.name}
                    </button>
                    <span className="dup-meta">
                      {e.sessionCount} session{e.sessionCount === 1 ? '' : 's'}
                    </span>
                    {i === 0 && <span className="tag is-brass">Keeps its name</span>}
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPendingMerge(group)}>
                  <GitMerge size={14} /> Merge into {group.target.name}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Exercise library */}
      <section className="settings-section">
        <div className="section-head">
          <h2 className="section-label">Exercise library</h2>
          {!showAddNew && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddNew(true)}>
              <Plus size={14} /> New exercise
            </button>
          )}
        </div>

        {/* New exercise */}
        {showAddNew && (
          <form onSubmit={handleCreateExercise} className="card form-card">
            <div className="form-card-head">
              <h3 className="card-title">New exercise</h3>
              <button type="button" className="sheet-close" onClick={() => setShowAddNew(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="global-ex-name">Name</label>
              <input
                type="text"
                id="global-ex-name"
                className="form-input"
                placeholder="e.g. Incline Bench Press"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
              {newNameMatch.exact ? (
                <span className="field-note is-ember">
                  You already have “{newNameMatch.exact.name}”. Saving adds that one to the
                  session instead of creating a copy.
                </span>
              ) : newNameMatch.similar.length > 0 ? (
                <span className="field-note">
                  Similar: {newNameMatch.similar.map((e) => `“${e.name}”`).join(', ')}
                </span>
              ) : null}
            </div>

            {routines.length > 0 && (
              <div className="form-group">
                <label htmlFor="global-ex-routine">Add to session</label>
                <select
                  id="global-ex-routine"
                  className="form-input"
                  value={newRoutineId || routines[0]?.id || ''}
                  onChange={(e) => setNewRoutineId(e.target.value)}
                >
                  {routines.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <span className="field-note">An exercise only appears in the session you add it to.</span>
              </div>
            )}

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="global-ex-mg">Muscle group</label>
                <select
                  id="global-ex-mg"
                  className="form-input"
                  value={newMuscleGroup}
                  onChange={(e) => setNewMuscleGroup(e.target.value)}
                >
                  {MUSCLE_GROUPS.map(mg => (
                    <option key={mg} value={mg}>{mg}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="global-ex-type">Type</label>
                <select
                  id="global-ex-type"
                  className="form-input"
                  value={newExerciseType}
                  onChange={(e) => {
                    setNewExerciseType(e.target.value);
                    // Autofill rest + weight-step defaults for the chosen type
                    setNewRestDuration(e.target.value === 'isolation' ? 90 : 120);
                    setNewWeightStep(stepForType(e.target.value));
                  }}
                >
                  <option value="compound">Compound</option>
                  <option value="isolation">Isolation</option>
                </select>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="global-ex-sets">Sets</label>
                <input
                  type="number"
                  id="global-ex-sets"
                  className="form-input"
                  min="1"
                  max="10"
                  value={newSets}
                  onChange={(e) => setNewSets(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="global-ex-rest">Rest (seconds)</label>
                <input
                  type="number"
                  id="global-ex-rest"
                  className="form-input"
                  min="10"
                  step="5"
                  value={newRestDuration}
                  onChange={(e) => setNewRestDuration(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="global-ex-min-reps">Min reps</label>
                <input
                  type="number"
                  id="global-ex-min-reps"
                  className="form-input"
                  min="1"
                  value={newMinReps}
                  onChange={(e) => setNewMinReps(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="global-ex-max-reps">Max reps</label>
                <input
                  type="number"
                  id="global-ex-max-reps"
                  className="form-input"
                  min="1"
                  value={newMaxReps}
                  onChange={(e) => setNewMaxReps(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="global-ex-step">Weight step (kg)</label>
                <input
                  type="number"
                  id="global-ex-step"
                  className="form-input"
                  min="0.5"
                  step="0.5"
                  value={newWeightStep}
                  onChange={(e) => setNewWeightStep(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="global-ex-start">Starting weight (kg)</label>
                <input
                  type="number"
                  id="global-ex-start"
                  className="form-input"
                  min="0"
                  step="0.5"
                  placeholder="Ask me"
                  value={newStartingWeight}
                  onChange={(e) => setNewStartingWeight(e.target.value)}
                />
              </div>
            </div>
            <span className="field-note">
              The weight step is how much − and + change the weight during a
              workout. Half kilos work, for 2.5 kg dumbbells and microplates.
            </span>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddNew(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save exercise
              </button>
            </div>
          </form>
        )}

        <div className="pick-list library-list">
          {orderedExercises.map((ex) => {
            const isEditing = editingId === ex.id;

            if (isEditing) {
              return (
                <div key={ex.id} className="library-edit">
                  <div className="form-group">
                    <label htmlFor={`edit-name-${ex.id}`}>Name</label>
                    <input
                      id={`edit-name-${ex.id}`}
                      type="text"
                      className="form-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>

                  <div className="form-row-2">
                    <div className="form-group">
                      <label htmlFor={`edit-mg-${ex.id}`}>Muscle group</label>
                      <select
                        id={`edit-mg-${ex.id}`}
                        className="form-input"
                        value={editMuscleGroup}
                        onChange={(e) => setEditMuscleGroup(e.target.value)}
                      >
                        {MUSCLE_GROUPS.map(mg => (
                          <option key={mg} value={mg}>{mg}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor={`edit-type-${ex.id}`}>Type</label>
                      <select
                        id={`edit-type-${ex.id}`}
                        className="form-input"
                        value={editExerciseType}
                        onChange={(e) => {
                          setEditExerciseType(e.target.value);
                          setEditRestDuration(e.target.value === 'isolation' ? 90 : 120);
                          setEditWeightStep(stepForType(e.target.value));
                        }}
                      >
                        <option value="compound">Compound</option>
                        <option value="isolation">Isolation</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row-2">
                    <div className="form-group">
                      <label htmlFor={`edit-sets-${ex.id}`}>Sets</label>
                      <input
                        id={`edit-sets-${ex.id}`}
                        type="number"
                        className="form-input"
                        value={editSets}
                        onChange={(e) => setEditSets(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`edit-rest-${ex.id}`}>Rest (seconds)</label>
                      <input
                        id={`edit-rest-${ex.id}`}
                        type="number"
                        className="form-input"
                        value={editRestDuration}
                        onChange={(e) => setEditRestDuration(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-row-2">
                    <div className="form-group">
                      <label htmlFor={`edit-min-${ex.id}`}>Min reps</label>
                      <input
                        id={`edit-min-${ex.id}`}
                        type="number"
                        className="form-input"
                        value={editMinReps}
                        onChange={(e) => setEditMinReps(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`edit-max-${ex.id}`}>Max reps</label>
                      <input
                        id={`edit-max-${ex.id}`}
                        type="number"
                        className="form-input"
                        value={editMaxReps}
                        onChange={(e) => setEditMaxReps(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-row-2">
                    <div className="form-group">
                      <label htmlFor={`edit-step-${ex.id}`}>Weight step (kg)</label>
                      <input
                        id={`edit-step-${ex.id}`}
                        type="number"
                        className="form-input"
                        min="0.5"
                        step="0.5"
                        value={editWeightStep}
                        onChange={(e) => setEditWeightStep(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`edit-start-${ex.id}`}>Starting weight (kg)</label>
                      <input
                        id={`edit-start-${ex.id}`}
                        type="number"
                        className="form-input"
                        min="0"
                        step="0.5"
                        placeholder="Ask me"
                        value={editStartingWeight}
                        onChange={(e) => setEditStartingWeight(e.target.value)}
                      />
                    </div>
                  </div>
                  <span className="field-note">
                    The starting weight is used only for the very first session,
                    before there&apos;s any history. Leave it blank to start with an
                    empty field.
                  </span>

                  <div className="form-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEditing}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => saveEditing(ex)}>
                      <Check size={14} /> Save
                    </button>
                  </div>
                </div>
              );
            }

            const rest = ex.restDuration || (ex.exerciseType === 'isolation' ? 90 : 120);
            const step = formatWeight(ex.weightStep || stepForType(ex.exerciseType));
            return (
              <div key={ex.id} className="library-row">
                <div className="library-row-main">
                  <button type="button" className="link-btn library-row-name" onClick={() => onOpenExercise?.(ex.id)}>
                    {ex.name}
                  </button>
                  <span className="library-row-meta">
                    <span className="meta-quiet">{ex.muscleGroup || 'Other'}</span>{' '}
                    {ex.targetSets} × {ex.minReps}–{ex.maxReps}, {rest} s rest, ±{step} kg
                  </span>

                  {/* Tap a session to add or remove this exercise from it */}
                  {routines.length > 0 && (
                    <div className="chip-row" role="group" aria-label={`Sessions with ${ex.name}`}>
                      {routines.map((r) => {
                        const member = (r.exerciseIds || []).includes(ex.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            className="chip is-small"
                            onClick={() => setExerciseInRoutine(r.id, ex.id, !member)}
                            aria-pressed={member}
                          >
                            {member && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                            {r.name}
                          </button>
                        );
                      })}
                      {!routinesByExerciseId[ex.id] && (
                        <span className="chip-note">Not in a session</span>
                      )}
                    </div>
                  )}
                  {routines.length === 0 && (
                    <span className="chip-note">Not in a session</span>
                  )}
                </div>
                <div className="library-row-actions">
                  <button
                    type="button"
                    className="icon-btn is-quiet"
                    onClick={() => startEditing(ex)}
                    aria-label={`Edit ${ex.name}`}
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn is-quiet is-danger"
                    onClick={() => setPendingDelete({ kind: 'exercise', id: ex.id, name: ex.name })}
                    aria-label={`Delete ${ex.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Data and backup */}
      <section className="settings-section">
        <h2 className="section-label">Data and backup</h2>
        <div className="card">
          <p className="card-sub">
            Your training history lives on this device, in this browser, not in
            the cloud. Keep a backup so clearing browser data or changing phones
            can&apos;t take it with it.
          </p>

          {/* Backup freshness */}
          <div className={`backup-status${backupStale ? ' is-stale' : ''}`}>
            {backupStale
              ? <AlertTriangle size={16} aria-hidden="true" />
              : <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
            <span>
              {backupLabel}{backupStale ? '. Export one to stay safe.' : ''}
            </span>
          </div>

          <div className="button-stack">
            <button type="button" className="btn btn-secondary btn-block btn-start" onClick={exportData}>
              <FileDown size={17} /> Export backup
              <span className="btn-aside">.json</span>
            </button>
            <button type="button" className="btn btn-secondary btn-block btn-start" onClick={handleImportClick}>
              <FileUp size={17} /> Import backup
              <span className="btn-aside">.json</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              accept=".json,application/json"
            />
          </div>

          {importStatus === 'success' && (
            <div role="status" className="inline-status is-brass">
              <Check size={15} strokeWidth={2.5} aria-hidden="true" /> Backup restored.
            </div>
          )}
          {importStatus === 'error' && (
            <div role="alert" className="inline-status is-danger">
              <X size={15} strokeWidth={2.5} aria-hidden="true" />
              {importError || 'That file couldn’t be imported. Make sure it’s a backup exported from this app.'}
            </div>
          )}

          {/* Automatic backups to a folder on disk */}
          <div className="settings-row has-rule">
            <HardDrive size={18} className="settings-row-icon" aria-hidden="true" />
            <div className="settings-row-main">
              <span className="settings-row-title">Automatic backups</span>
              <span className="settings-row-sub">
                {!backupFolderSupported()
                  ? 'This browser can’t write backups to a folder (Safari and iOS don’t support it). Use Export and save the file somewhere safe.'
                  : backupFolderName
                    ? <>Saving to <strong>{backupFolderName}</strong> after a workout, at most once every few days.</>
                    : 'Pick a folder once and a backup is written after your workouts, with nothing to remember.'}
              </span>
              {backupFolderSupported() && (
                <div className="settings-row-buttons">
                  {backupFolderName ? (
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={choosingFolder} onClick={pickFolder}>
                        Change folder
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={forgetBackupFolder}>
                        Turn off
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-primary btn-sm" disabled={choosingFolder} onClick={pickFolder}>
                      Choose backup folder
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Storage use, when the browser can't say whether it's persistent */}
          {storagePersisted === null && estimate && estimate.usage > 0 && (
            <div className="settings-row has-rule">
              <HardDrive size={18} className="settings-row-icon" aria-hidden="true" />
              <div className="settings-row-main">
                <span className="settings-row-sub">
                  Using {formatBytes(estimate.usage)}{estimate.quota ? ` of ${formatBytes(estimate.quota)} available` : ''}.
                </span>
              </div>
            </div>
          )}

          {/* Storage durability status */}
          {storagePersisted !== null && (
            <div className="settings-row has-rule">
              {storagePersisted
                ? <ShieldCheck size={18} className="settings-row-icon is-brass" aria-hidden="true" />
                : <ShieldAlert size={18} className="settings-row-icon is-ember" aria-hidden="true" />}
              <div className="settings-row-main">
                <span className="settings-row-title">
                  {storagePersisted ? 'Persistent storage is on' : 'Best-effort storage'}
                </span>
                <span className="settings-row-sub">
                  {storagePersisted
                    ? 'Protected from automatic browser cleanup.'
                    : 'The browser may clear data if your storage runs low.'}
                  {estimate && estimate.usage > 0
                    ? ` Using ${formatBytes(estimate.usage)}${estimate.quota ? ` of ${formatBytes(estimate.quota)}` : ''}.`
                    : ''}
                </span>
              </div>
              {!storagePersisted && (
                <button type="button" className="btn btn-primary btn-sm" onClick={handleEnablePersistence} disabled={enabling}>
                  {enabling ? '…' : 'Turn on'}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 5. Reset */}
      <section className="settings-section">
        <h2 className="section-label">Reset</h2>
        <div className="card">
          <p className="card-sub">
            Deletes every exercise, session and logged workout on this device and
            restores the defaults. This can&apos;t be undone.
          </p>
          <button type="button" className="btn btn-danger btn-block" onClick={() => setShowResetConfirm(true)}>
            <Trash size={16} /> Reset all data
          </button>
        </div>
      </section>

      <p className="colophon">
        Hypertrophy Log. Everything you log stays on this device.
      </p>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <ConfirmDialog
          title="Reset all data?"
          confirmLabel="Yes, reset everything"
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={() => {
            clearAllData();
            setShowResetConfirm(false);
          }}
        >
          This erases your whole workout history, every exercise and session, and
          restores the default settings. Export a backup first if you might want
          any of it back.
        </ConfirmDialog>
      )}

      {/* Import confirmation — shows what the file holds before it replaces anything */}
      {pendingImport && importSummary && (
        <ConfirmDialog
          title="Replace your data with this backup?"
          confirmLabel="Replace my data"
          busy={importing}
          onCancel={() => setPendingImport(null)}
          onConfirm={confirmImport}
        >
          <p style={{ margin: '0 0 8px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Backup:</strong>{' '}
            {importSummary.sessions} workout{importSummary.sessions === 1 ? '' : 's'}
            {importSummary.sessions > 0 ? ` (${formatSpan(importSummary.firstAt, importSummary.lastAt)})` : ''},{' '}
            {importSummary.exercises} exercise{importSummary.exercises === 1 ? '' : 's'}.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>This device:</strong>{' '}
            {currentSpan.count} workout{currentSpan.count === 1 ? '' : 's'}
            {currentSpan.count > 0 ? ` (latest ${formatDate(currentSpan.lastAt)})` : ''}.
          </p>
          {sessionsLost > 0 && (
            <p style={{ margin: '0 0 8px', color: 'var(--error-strong)', fontWeight: 600 }}>
              {sessionsLost} workout{sessionsLost === 1 ? '' : 's'} on this device {sessionsLost === 1 ? 'isn’t' : 'aren’t'} in
              the backup and will be lost. Export a backup first if you want to keep {sessionsLost === 1 ? 'it' : 'them'}.
            </p>
          )}
          <p style={{ margin: 0 }}>
            Everything on this device is replaced by the backup.
          </p>
        </ConfirmDialog>
      )}

      {reorderRoutine && (
        <ReorderSheet
          title={`${reorderRoutine.name} order`}
          subtitle="The order this session starts in. You can still reorder inside a workout — that only changes that workout."
          items={(reorderRoutine.exerciseIds || []).map((id) => ({
            id,
            name: catalogById.get(id)?.name || 'Unknown exercise',
            meta: catalogById.get(id)?.muscleGroup
          }))}
          onMove={(id, delta) => moveExerciseInRoutine?.(reorderRoutine.id, id, delta)}
          onRemove={(id) => setExerciseInRoutine(reorderRoutine.id, id, false)}
          removeLabel="Remove from session"
          onClose={() => setReorderRoutineId(null)}
        />
      )}

      {pendingMerge && (
        <ConfirmDialog
          title={`Merge into ${pendingMerge.target.name}?`}
          confirmLabel="Merge"
          busy={merging}
          onCancel={() => setPendingMerge(null)}
          onConfirm={confirmMerge}
        >
          {pendingMerge.others.map((e) => `“${e.name}”`).join(', ')}{' '}
          ({pendingMerge.others.reduce((n, e) => n + e.sessionCount, 0)} session
          {pendingMerge.others.reduce((n, e) => n + e.sessionCount, 0) === 1 ? '' : 's'}) will be
          logged as “{pendingMerge.target.name}” from now on. This rewrites history and can&apos;t
          be undone — export a backup first if you&apos;re unsure.
        </ConfirmDialog>
      )}

      {/* Delete exercise / session confirmation */}
      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.kind === 'exercise' ? `Delete ${pendingDelete.name}?` : `Delete the ${pendingDelete.name} session?`}
          confirmLabel={pendingDelete.kind === 'exercise' ? 'Delete exercise' : 'Delete session'}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        >
          {pendingDelete.kind === 'exercise'
            ? 'It will be removed from your library and from every session it’s in. Workouts you’ve already logged keep it.'
            : `Your ${pendingDelete.count || 0} exercise${pendingDelete.count === 1 ? '' : 's'} in it stay in the library, and logged workouts are kept — only the session and its exercise order go.`}
        </ConfirmDialog>
      )}
    </div>
  );
}
