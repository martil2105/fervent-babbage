import { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, FileDown, FileUp, Trash, ShieldCheck, ShieldAlert, HardDrive, AlertTriangle } from 'lucide-react';
import { MUSCLE_GROUPS } from '../utils/workoutHelpers';
import { getStorageEstimate, formatBytes } from '../utils/storagePersistence';

export default function Settings({
  exercises,
  preferences,
  updatePreference,
  addExerciseToConfig,
  updateExerciseInConfig,
  deleteExerciseFromConfig,
  exportData,
  importData,
  clearAllData,
  storagePersisted,
  requestPersistentStorage
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

  // New exercise state
  const [newName, setNewName] = useState('');
  const [newSets, setNewSets] = useState(4);
  const [newMinReps, setNewMinReps] = useState(10);
  const [newMaxReps, setNewMaxReps] = useState(12);
  const [newMuscleGroup, setNewMuscleGroup] = useState('Shoulders');
  const [newExerciseType, setNewExerciseType] = useState('compound');
  const [newRestDuration, setNewRestDuration] = useState(120);
  const [newWeightStep, setNewWeightStep] = useState(2);
  const [showAddNew, setShowAddNew] = useState(false);

  // Whole-kg increment the +/- weight buttons jump by during a workout.
  const stepForType = (type) => (type === 'isolation' ? 1 : 2);

  // Import file ref
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState(null);

  // Danger zone confirm
  const [showResetConfirm, setShowResetConfirm] = useState(false);

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
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEditing = (id) => {
    updateExerciseInConfig(id, {
      name: editName,
      targetSets: parseInt(editSets) || 4,
      minReps: parseInt(editMinReps) || 10,
      maxReps: parseInt(editMaxReps) || 12,
      muscleGroup: editMuscleGroup,
      exerciseType: editExerciseType,
      restDuration: parseInt(editRestDuration) || 120,
      weightStep: Math.max(1, parseInt(editWeightStep) || stepForType(editExerciseType))
    });
    setEditingId(null);
  };

  const handleCreateExercise = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    addExerciseToConfig(
      newName,
      newSets,
      newMinReps,
      newMaxReps,
      newMuscleGroup,
      newExerciseType,
      newRestDuration,
      newWeightStep
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
    setShowAddNew(false);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        const success = await importData(result);
        if (success) {
          setImportStatus('success');
          setTimeout(() => setImportStatus(null), 3000);
        } else {
          setImportStatus('error');
          setTimeout(() => setImportStatus(null), 3000);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const currentPrefMode = preferences?.prefLoggingMode || 'RPE';

  return (
    <div className="tab-content">
      {/* 1. App Logging Preferences */}
      <div className="card">
        <h3 className="card-title">Logging Preferences</h3>
        <p className="text-xs text-muted" style={{ marginTop: '-4px' }}>
          Select whether you prefer logging set intensity using RPE (Rate of Perceived Exertion) or RIR (Reps in Reserve).
        </p>
        <div className="sub-tabs" style={{ marginTop: '4px' }}>
          <button 
            type="button"
            className={`sub-tab-btn ${currentPrefMode === 'RPE' ? 'active' : ''}`}
            onClick={() => updatePreference('prefLoggingMode', 'RPE')}
          >
            RPE (Scale 6-10)
          </button>
          <button 
            type="button"
            className={`sub-tab-btn ${currentPrefMode === 'RIR' ? 'active' : ''}`}
            onClick={() => updatePreference('prefLoggingMode', 'RIR')}
          >
            RIR (Scale 0-5)
          </button>
        </div>
      </div>

      {/* 2. Exercises Configuration */}
      <div className="card">
        <div className="card-title">
          <span>Workout Exercises</span>
          {!showAddNew && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddNew(true)}>
              <Plus size={14} /> Add
            </button>
          )}
        </div>
        
        {/* Add New Global Exercise Form */}
        {showAddNew && (
          <form onSubmit={handleCreateExercise} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', margin: '4px 0 10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-bold" style={{ fontSize: '13px' }}>Create Template Exercise</span>
              <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => setShowAddNew(false)}>
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
            </div>
            
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="global-ex-mg">Muscle Group</label>
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
                <label htmlFor="global-ex-type">Exercise Type</label>
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
                  <option value="compound">Compound (Multi-joint)</option>
                  <option value="isolation">Isolation (Single-joint)</option>
                </select>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="global-ex-sets">Default Sets</label>
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
                <label htmlFor="global-ex-rest">Rest Duration (seconds)</label>
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
                <label htmlFor="global-ex-min-reps">Min Target Reps</label>
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
                <label htmlFor="global-ex-max-reps">Max Target Reps</label>
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

            <div className="form-group">
              <label htmlFor="global-ex-step">Weight Step (kg)</label>
              <input
                type="number"
                id="global-ex-step"
                className="form-input"
                min="1"
                step="1"
                value={newWeightStep}
                onChange={(e) => setNewWeightStep(e.target.value)}
                required
              />
              <span className="text-xs text-muted" style={{ marginTop: '2px' }}>
                How much the +/- buttons change the weight during a workout. Whole kg only.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddNew(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Save Exercise
              </button>
            </div>
          </form>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {exercises.map((ex) => {
            const isEditing = editingId === ex.id;
            
            if (isEditing) {
              return (
                <div key={ex.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-secondary)' }}>
                  <div className="form-group">
                    <label>Exercise Name</label>
                    <input 
                      type="text" 
                      className="form-input"
                      value={editName} 
                      onChange={(e) => setEditName(e.target.value)} 
                    />
                  </div>

                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Muscle Group</label>
                      <select 
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
                      <label>Exercise Type</label>
                      <select 
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
                      <label>Default Sets</label>
                      <input 
                        type="number" 
                        className="form-input"
                        value={editSets} 
                        onChange={(e) => setEditSets(e.target.value)} 
                      />
                    </div>
                    <div className="form-group">
                      <label>Rest Duration (s)</label>
                      <input 
                        type="number" 
                        className="form-input"
                        value={editRestDuration} 
                        onChange={(e) => setEditRestDuration(e.target.value)} 
                      />
                    </div>
                  </div>

                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Min Reps</label>
                      <input 
                        type="number" 
                        className="form-input"
                        value={editMinReps} 
                        onChange={(e) => setEditMinReps(e.target.value)} 
                      />
                    </div>
                    <div className="form-group">
                      <label>Max Reps</label>
                      <input
                        type="number"
                        className="form-input"
                        value={editMaxReps}
                        onChange={(e) => setEditMaxReps(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Weight Step (kg)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="1"
                      step="1"
                      value={editWeightStep}
                      onChange={(e) => setEditWeightStep(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={cancelEditing}>
                      <X size={14} /> Cancel
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => saveEditing(ex.id)}>
                      <Check size={14} /> Save
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={ex.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="text-bold" style={{ fontSize: '14px' }}>{ex.name}</span>
                    <span className="text-xs" style={{ 
                      backgroundColor: 'var(--bg-card)', 
                      padding: '1px 6px', 
                      borderRadius: '8px', 
                      color: 'var(--text-secondary)',
                      fontSize: '9px',
                      border: '1px solid var(--border-color)',
                      fontWeight: 600
                    }}>
                      {ex.muscleGroup || 'Other'}
                    </span>
                  </div>
                  <span className="text-xs text-muted">
                    {ex.targetSets} sets • {ex.minReps}–{ex.maxReps} reps • Rest: {ex.restDuration || (ex.exerciseType === 'isolation' ? 90 : 120)}s • ±{ex.weightStep || stepForType(ex.exerciseType)}kg
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn btn-secondary btn-icon-only btn-sm" onClick={() => startEditing(ex)} style={{ border: 'none', background: 'none' }}>
                    <Edit2 size={14} style={{ color: 'var(--text-secondary)' }} />
                  </button>
                  <button className="btn btn-secondary btn-icon-only btn-sm" onClick={() => deleteExerciseFromConfig(ex.id)} style={{ border: 'none', background: 'none' }}>
                    <Trash2 size={14} style={{ color: 'var(--error)' }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Backup & Export */}
      <div className="card">
        <h3 className="card-title">Data & Backup</h3>
        <p className="text-xs text-muted" style={{ marginTop: '-4px' }}>
          Your training history is saved on this device in your browser (IndexedDB) — not in the cloud. Keep a backup so you don't lose it if you clear browsing data or switch devices.
        </p>

        {/* Storage durability status */}
        {storagePersisted !== null && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid',
            borderColor: storagePersisted ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)',
            backgroundColor: storagePersisted ? 'var(--success-glow)' : 'var(--warning-glow)'
          }}>
            {storagePersisted
              ? <ShieldCheck size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
              : <ShieldAlert size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span className="text-xs text-bold" style={{ color: storagePersisted ? 'var(--success)' : 'var(--warning)' }}>
                {storagePersisted ? 'Persistent storage on' : 'Best-effort storage'}
              </span>
              <span className="text-xs text-muted">
                {storagePersisted
                  ? 'Protected from automatic browser cleanup.'
                  : 'The browser may clear data if your disk runs low.'}
              </span>
            </div>
            {!storagePersisted && (
              <button className="btn btn-primary btn-sm" onClick={handleEnablePersistence} disabled={enabling}>
                {enabling ? '…' : 'Enable'}
              </button>
            )}
          </div>
        )}

        {/* Storage usage */}
        {estimate && estimate.usage > 0 && (
          <div className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <HardDrive size={13} /> Using {formatBytes(estimate.usage)}{estimate.quota ? ` of ${formatBytes(estimate.quota)} available` : ''}
          </div>
        )}

        {/* Backup freshness nudge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: backupStale ? 'var(--warning)' : 'var(--text-muted)' }}>
          {backupStale ? <AlertTriangle size={14} style={{ flexShrink: 0 }} /> : <Check size={14} style={{ flexShrink: 0 }} />}
          <span className={backupStale ? 'text-bold' : ''}>
            {backupLabel}{backupStale ? ' — export one to stay safe' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={exportData} style={{ justifyContent: 'flex-start' }}>
            <FileDown size={16} /> Export Backup (.json)
          </button>

          <button className="btn btn-secondary" onClick={handleImportClick} style={{ justifyContent: 'flex-start' }}>
            <FileUp size={16} /> Import Backup (.json)
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
            accept=".json"
          />

          {importStatus === 'success' && (
            <div className="text-xs text-bold" style={{ color: 'var(--success)', marginTop: '4px' }}>
              ✓ Data imported successfully!
            </div>
          )}
          {importStatus === 'error' && (
            <div className="text-xs text-bold" style={{ color: 'var(--error)', marginTop: '4px' }}>
              ✗ Error importing data. Make sure it's a valid backup file.
            </div>
          )}
        </div>
      </div>

      {/* 4. Danger Zone */}
      <div className="card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
        <h3 className="card-title" style={{ color: 'var(--error)' }}>Danger Zone</h3>
        <p className="text-xs text-muted" style={{ marginTop: '-4px' }}>
          Resetting the app will permanently delete all your custom exercises, set histories, and active workouts. This cannot be undone.
        </p>
        <button className="btn btn-danger" onClick={() => setShowResetConfirm(true)} style={{ justifyContent: 'center' }}>
          <Trash size={16} /> Reset All Data
        </button>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
            <h3 style={{ margin: 0, color: 'var(--error)' }}>Reset All Data?</h3>
            <p className="text-muted" style={{ margin: 0, fontSize: '14px', lineHeight: '1.4' }}>
              Are you absolutely sure you want to clear all data? This will erase your entire workout history and restore the default settings.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => {
                clearAllData();
                setShowResetConfirm(false);
              }}>
                Yes, Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
