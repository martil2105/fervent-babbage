import { useState } from 'react';
import { BarChart2, Dumbbell, Calendar, Settings as SettingsIcon, Swords } from 'lucide-react';
import { useWorkoutState } from './hooks/useWorkoutState';
import Dashboard from './components/Dashboard';
import WorkoutActive from './components/WorkoutActive';
import History from './components/History';
import Settings from './components/Settings';
import PushQuest from './components/pushquest/PushQuest';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'workout' | 'quest' | 'history' | 'settings'
  const workoutState = useWorkoutState();

  const { currentWorkout } = workoutState;

  // Render the current active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard history={workoutState.history} exercises={workoutState.exercises} />;
      case 'workout':
        return (
          <WorkoutActive 
            currentWorkout={workoutState.currentWorkout}
            startWorkout={workoutState.startWorkout}
            cancelWorkout={workoutState.cancelWorkout}
            completeWorkout={workoutState.completeWorkout}
            updateSet={workoutState.updateSet}
            addSetToActive={workoutState.addSetToActive}
            removeSetFromActive={workoutState.removeSetFromActive}
            addCustomExerciseToActive={workoutState.addCustomExerciseToActive}
            history={workoutState.history}
            preferences={workoutState.preferences}
            restEndTime={workoutState.restEndTime}
            extendRestTimer={workoutState.extendRestTimer}
            clearRestTimer={workoutState.clearRestTimer}
          />
        );
      case 'quest':
        return <PushQuest history={workoutState.history} exercises={workoutState.exercises} />;
      case 'history':
        return <History history={workoutState.history} exercises={workoutState.exercises} />;
      case 'settings':
        return (
          <Settings 
            exercises={workoutState.exercises}
            preferences={workoutState.preferences}
            updatePreference={workoutState.updatePreference}
            addExerciseToConfig={workoutState.addExerciseToConfig}
            updateExerciseInConfig={workoutState.updateExerciseInConfig}
            deleteExerciseFromConfig={workoutState.deleteExerciseFromConfig}
            exportData={workoutState.exportData}
            importData={workoutState.importData}
            clearAllData={workoutState.clearAllData}
            storagePersisted={workoutState.storagePersisted}
            requestPersistentStorage={workoutState.requestPersistentStorage}
          />
        );
      default:
        return <Dashboard history={workoutState.history} exercises={workoutState.exercises} />;
    }
  };

  return (
    <>
      {/* App Header */}
      <header className="app-header">
        <h1 className="app-title">
          <Dumbbell size={24} style={{ transform: 'rotate(-45deg)' }} />
          PUSH.HYPERTROPHY
        </h1>
        {currentWorkout && activeTab !== 'workout' && (
          <div 
            onClick={() => setActiveTab('workout')}
            style={{ 
              backgroundColor: 'var(--success-glow)', 
              color: 'var(--success-strong)',
              fontSize: '11px', 
              fontWeight: 600, 
              padding: '4px 10px', 
              borderRadius: '20px', 
              border: '1px solid var(--feather-200)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span style={{ 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%', 
              backgroundColor: 'var(--success)',
              display: 'inline-block',
              animation: 'pulse 1.5s infinite'
            }}></span>
            ACTIVE SESSION
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="app-content">
        {renderTabContent()}
      </main>

      {/* Bottom Tab Navigation */}
      <nav className="app-navigation">
        <button 
          className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <BarChart2 />
          <span>Dashboard</span>
        </button>

        <button 
          className={`nav-tab ${activeTab === 'workout' ? 'active' : ''}`}
          onClick={() => setActiveTab('workout')}
          style={{ position: 'relative' }}
        >
          <Dumbbell />
          <span>Workout</span>
          {currentWorkout && (
            <span style={{ 
              position: 'absolute', 
              top: '6px', 
              right: 'calc(50% - 14px)', 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: 'var(--success)',
              border: '2px solid var(--bg-secondary)',
              boxSizing: 'content-box'
            }} />
          )}
        </button>

        <button
          className={`nav-tab ${activeTab === 'quest' ? 'active' : ''}`}
          onClick={() => setActiveTab('quest')}
        >
          <Swords />
          <span>Quest</span>
        </button>

        <button
          className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <Calendar />
          <span>History</span>
        </button>

        <button 
          className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <SettingsIcon />
          <span>Settings</span>
        </button>
      </nav>

      {/* Styles for pulsing badge */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.9); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.6; }
        }
      `}</style>
    </>
  );
}
