import { useState, useEffect, useRef } from 'react';
import { Gauge, Dumbbell, CalendarDays, Settings as SettingsIcon, TrendingUp } from 'lucide-react';
import { useWorkoutState, CURRENT_WORKOUT_KEY } from './hooks/useWorkoutState';
import { useRestAlarm } from './hooks/useRestAlarm';
import Dashboard from './components/Dashboard';
import WorkoutActive from './components/WorkoutActive';
import History from './components/History';
import Settings from './components/Settings';
import Analytics from './components/Analytics';
import ExerciseDetail from './components/ExerciseDetail';

// iOS routinely kills a backgrounded home-screen app — between sets, while you
// were in your music app. Reopening should land back in the workout, not on
// the dashboard with the session one tap away.
const initialTab = () => {
  try {
    return localStorage.getItem(CURRENT_WORKOUT_KEY) ? 'workout' : 'dashboard';
  } catch {
    return 'dashboard';
  }
};

// Header pill shown on other tabs while a session is open. During rest it
// counts down, so the rest timer is still visible from Progress or History.
// It ticks on its own so the open tab isn't re-rendered twice a second.
function ActiveSessionBadge({ restEndTime, onClick }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!restEndTime) return undefined;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [restEndTime]);

  const remaining = restEndTime ? Math.ceil((restEndTime - now) / 1000) : null;
  const resting = remaining !== null && remaining > 0;
  const restDone = remaining !== null && remaining <= 0;

  const label = resting
    ? `Rest ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
    : restDone ? 'Rest over' : 'Back to workout';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}. Open the workout`}
      className={`session-pill${restDone ? ' is-done' : ''}`}
    >
      <span className="dot" aria-hidden="true" />
      {label}
    </button>
  );
}

// Today's date for the Summary header. Re-read when the app comes back to the
// foreground, so a home-screen app left open overnight doesn't show yesterday.
const todayLabel = () =>
  new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

function useTodayLabel() {
  const [label, setLabel] = useState(todayLabel);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setLabel(todayLabel());
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);
  return label;
}

const TABS = [
  { id: 'dashboard', label: 'Summary', Icon: Gauge },
  { id: 'workout', label: 'Workout', Icon: Dumbbell },
  { id: 'analytics', label: 'Progress', Icon: TrendingUp },
  { id: 'history', label: 'History', Icon: CalendarDays },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon }
];

export default function App() {
  const [activeTab, setActiveTab] = useState(initialTab); // 'dashboard' | 'workout' | 'analytics' | 'history' | 'settings'
  const workoutState = useWorkoutState();

  const { currentWorkout } = workoutState;
  const today = useTodayLabel();

  // The exercise page opens over whatever tab you're on — from the workout,
  // History or Settings — and closing it puts you back where you were.
  const [openExerciseId, setOpenExerciseId] = useState(null);

  // Every tab shares one scrolling <main>, so without this a tab opened
  // halfway down wherever the previous one was left.
  const contentRef = useRef(null);
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [activeTab]);

  // The header gets a hairline once content scrolls beneath it.
  const [scrolled, setScrolled] = useState(false);

  // End-of-rest alert, mounted here so it fires whichever tab is open.
  useRestAlarm({
    restEndTime: workoutState.restEndTime,
    clearRestTimer: workoutState.clearRestTimer,
    currentWorkout
  });

  // Render the current active tab
  const renderTabContent = () => {
    switch (activeTab) {
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
            addExerciseToActive={workoutState.addExerciseToActive}
            moveActiveExercise={workoutState.moveActiveExercise}
            removeActiveExercise={workoutState.removeActiveExercise}
            startEmptyWorkout={workoutState.startEmptyWorkout}
            createExercise={workoutState.createExercise}
            catalog={workoutState.catalog}
            onOpenExercise={setOpenExerciseId}
            routines={workoutState.routines}
            history={workoutState.history}
            preferences={workoutState.preferences}
            restEndTime={workoutState.restEndTime}
            restTotalMs={workoutState.restTotalMs}
            extendRestTimer={workoutState.extendRestTimer}
            clearRestTimer={workoutState.clearRestTimer}
          />
        );
      case 'analytics':
        return (
          <Analytics
            history={workoutState.history}
            exercises={workoutState.exercises}
            routines={workoutState.routines}
          />
        );
      case 'history':
        return (
          <History
            history={workoutState.history}
            exercises={workoutState.exercises}
            routines={workoutState.routines}
            updateHistorySession={workoutState.updateHistorySession}
            deleteHistorySession={workoutState.deleteHistorySession}
            catalog={workoutState.catalog}
            createExercise={workoutState.createExercise}
            onOpenExercise={setOpenExerciseId}
          />
        );
      case 'settings':
        return (
          <Settings
            exercises={workoutState.exercises}
            routines={workoutState.routines}
            history={workoutState.history}
            preferences={workoutState.preferences}
            updatePreference={workoutState.updatePreference}
            addExerciseToConfig={workoutState.addExerciseToConfig}
            updateExerciseInConfig={workoutState.updateExerciseInConfig}
            deleteExerciseFromConfig={workoutState.deleteExerciseFromConfig}
            addRoutine={workoutState.addRoutine}
            renameRoutine={workoutState.renameRoutine}
            deleteRoutine={workoutState.deleteRoutine}
            setExerciseInRoutine={workoutState.setExerciseInRoutine}
            moveExerciseInRoutine={workoutState.moveExerciseInRoutine}
            catalog={workoutState.catalog}
            ensureInLibrary={workoutState.ensureInLibrary}
            mergeExercises={workoutState.mergeExercises}
            onOpenExercise={setOpenExerciseId}
            chooseBackupFolder={workoutState.chooseBackupFolder}
            forgetBackupFolder={workoutState.forgetBackupFolder}
            backupFolderName={workoutState.backupFolderName}
            exportData={workoutState.exportData}
            importData={workoutState.importData}
            clearAllData={workoutState.clearAllData}
            storagePersisted={workoutState.storagePersisted}
            requestPersistentStorage={workoutState.requestPersistentStorage}
          />
        );
      case 'dashboard':
      default:
        return (
          <Dashboard
            history={workoutState.history}
            exercises={workoutState.exercises}
            routines={workoutState.routines}
            lastBackupAt={workoutState.preferences?.lastBackupAt || null}
            hasBackupFolder={!!workoutState.backupFolderName}
            exportData={workoutState.exportData}
          />
        );
    }
  };

  return (
    <>
      {/* Header: the page title, large and left-aligned. During a workout the
          title is the session you're doing. */}
      <header className={`app-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="app-header-titles">
          {activeTab === 'dashboard' && <span className="app-eyebrow">{today}</span>}
          <h1 className="app-title">
            {activeTab === 'workout' && currentWorkout
              ? currentWorkout.routineName || 'Workout'
              : TABS.find((t) => t.id === activeTab)?.label}
          </h1>
        </div>
        {currentWorkout && activeTab !== 'workout' && (
          <ActiveSessionBadge
            restEndTime={workoutState.restEndTime}
            onClick={() => setActiveTab('workout')}
          />
        )}
      </header>

      {/* Main Content Area */}
      <main
        className="app-content"
        ref={contentRef}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}
      >
        {renderTabContent()}
      </main>

      {openExerciseId && (
        <ExerciseDetail
          exerciseId={openExerciseId}
          catalog={workoutState.catalog}
          routines={workoutState.routines}
          history={workoutState.history}
          onClose={() => setOpenExerciseId(null)}
          onMerge={workoutState.mergeExercises}
          onOpenExercise={setOpenExerciseId}
        />
      )}

      {/* Bottom Tab Navigation */}
      <nav className="app-navigation" aria-label="Main">
        {TABS.map((tab) => {
          const { id, label, Icon } = tab;
          return (
            <button
              key={id}
              type="button"
              className={`nav-tab ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {id === 'workout' && currentWorkout && (
                <span className="nav-dot" aria-label="session in progress" />
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
