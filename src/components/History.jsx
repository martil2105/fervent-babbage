import { useState } from 'react';
import { Calendar, Clock, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { 
  formatDate, 
  getSessionVolume, 
  getExerciseVolume, 
  getPersonalBests 
} from '../utils/workoutHelpers';

export default function History({ history, exercises }) {
  const [activeSubTab, setActiveSubTab] = useState('logs'); // 'logs' | 'pbs'
  const [expandedSessionId, setExpandedSessionId] = useState(null);

  const toggleExpandSession = (sessionId) => {
    setExpandedSessionId(prev => prev === sessionId ? null : sessionId);
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
            const totalVol = getSessionVolume(session.exercises);
            const exSummary = session.exercises.map(ex => ex.name).join(', ');

            return (
              <div key={session.id} className="history-item" onClick={() => toggleExpandSession(session.id)}>
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

                {/* Expanded set-by-set detail view */}
                {isExpanded && (
                  <div className="history-details" onClick={(e) => e.stopPropagation()}>
                    {session.exercises.map((ex, idx) => {
                      const exVol = getExerciseVolume(ex.sets);
                      return (
                        <div key={idx} className="history-detail-exercise">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span className="history-detail-exercise-name">{ex.name}</span>
                            <span className="text-xs text-bold" style={{ color: 'var(--accent)' }}>
                              {Math.round(exVol)} kg
                            </span>
                          </div>
                          <div className="history-detail-sets">
                            {ex.sets.map((set, sIdx) => (
                              <span key={sIdx} className="history-detail-set-badge">
                                S{sIdx + 1}: {set.weight}kg × {set.reps}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
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
          {exercises.map((ex) => {
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
