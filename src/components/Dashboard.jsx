import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Info, BarChart2, Zap, ShieldAlert, X } from 'lucide-react';
import {
  groupSessionsByWeek,
  getProgressionSuggestion,
  getMondayOfDate,
  getDisplayExercises,
  getAccretionSeries,
  getWeekToDateComparison,
  orderExercisesByRoutines,
  resolveMuscleGroup,
  MUSCLE_GROUPS
} from '../utils/workoutHelpers';
import AccretionStrip from './AccretionStrip';
import { isBackupDue, daysSinceBackup } from '../utils/autoBackup';

const formatKg = (kg) => `${Math.round(kg).toLocaleString()} kg`;

// Text colour for each hint type. Text uses the -strong steps, which are the
// ones that stay legible on the pale tints (Verdant: 500s are for fills and
// icons only).
const HINT_STYLE = {
  weight: { border: 'var(--feather-200)', background: 'var(--success-glow)', icon: 'var(--success)', text: 'var(--success-strong)' },
  hold: { border: 'var(--feather-200)', background: 'var(--accent-glow)', icon: 'var(--accent)', text: 'var(--accent-strong)' },
  reps: { border: 'var(--fox-200)', background: 'var(--warning-glow)', icon: 'var(--warning)', text: 'var(--warning-strong)' },
  initial: { border: 'var(--border-color)', background: 'var(--bg-secondary)', icon: 'var(--text-secondary)', text: 'var(--text-secondary)' }
};

export default function Dashboard({ history, exercises, routines = [], lastBackupAt, exportData, hasBackupFolder }) {
  const [breakdownView, setBreakdownView] = useState('muscleGroups'); // 'muscleGroups' | 'exercises'
  const [backupDismissed, setBackupDismissed] = useState(false);

  // Session order (Push's exercises, then Legs'), not the library's id order.
  const orderedExercises = useMemo(
    () => orderExercisesByRoutines(exercises, routines),
    [exercises, routines]
  );

  // One walk of history per exercise, not one per render — the breakdown
  // toggles views often and each series re-sorts every session.
  const accretionByExercise = useMemo(() => {
    const map = {};
    getDisplayExercises(orderedExercises, history).forEach((ex) => {
      map[ex.id] = getAccretionSeries(ex.id, history);
    });
    return map;
  }, [orderedExercises, history]);

  // Stable clock read — react-compiler rejects Date.now() during render.
  const [nowTs] = useState(() => Date.now());

  // The warning used to live in Settings, which is precisely where someone who
  // has never thought about backups will never look. An unbacked-up log is the
  // only unrecoverable state in the app, so it earns space on the main screen.
  const backupOverdue =
    !hasBackupFolder && !backupDismissed && isBackupDue(lastBackupAt, nowTs, 7);
  const backupAgeDays = daysSinceBackup(lastBackupAt, nowTs);

  const backupBanner = backupOverdue ? (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      padding: '12px 14px',
      marginBottom: '14px',
      backgroundColor: 'var(--warning-glow)',
      border: '1px solid var(--warning)',
      borderRadius: 'var(--radius-sm)'
    }}>
      <ShieldAlert size={18} style={{ color: 'var(--warning-strong)', flexShrink: 0, marginTop: '1px' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="text-bold" style={{ fontSize: '13px', color: 'var(--warning-strong)' }}>
          {backupAgeDays === null ? 'Your log has never been backed up' : `No backup in ${backupAgeDays} days`}
        </div>
        <div className="text-xs text-muted" style={{ marginTop: '2px' }}>
          Everything is stored only in this browser. Clearing site data would erase it.
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={exportData}
          style={{ marginTop: '8px' }}
        >
          Back up now
        </button>
      </div>
      <button
        onClick={() => setBackupDismissed(true)}
        aria-label="Dismiss backup warning"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0 }}
      >
        <X size={14} style={{ color: 'var(--text-muted)' }} />
      </button>
    </div>
  ) : null;

  if (!history || history.length === 0) {
    return (
      <div className="tab-content">
        <div className="empty-state">
          <BarChart2 />
          <h3>No Workout Data Yet</h3>
          <p className="text-muted text-center">
            Tap the "Workout" tab below and log your first training session to view volume analytics and progression tips.
          </p>
        </div>
      </div>
    );
  }

  // 1. Group sessions by week
  const weeklyData = groupSessionsByWeek(history, exercises);

  // Get current week data
  const currentWeekMonday = getMondayOfDate(nowTs).getTime();
  const currentWeekData = weeklyData.find(w => w.weekStart === currentWeekMonday) || {
    totalVolume: 0,
    sessionsCount: 0,
    exerciseVolume: {},
    exerciseSets: {},
    muscleGroupVolume: {},
    muscleGroupSets: {}
  };

  // Like-for-like: this week so far against last week *up to the same point*.
  // Against last week's finished total, every Monday read "-100%" in red.
  const weekToDate = getWeekToDateComparison(history, nowTs);
  const trend = weekToDate.trend;

  // Render trend badge
  const renderTrendBadge = () => {
    // Nothing logged yet this week: not a decline, just early. Say where
    // last week ended up instead of scoring a week that has barely started.
    if (weekToDate.thisWeek.sessions === 0) {
      return (
        <span className="metric-trend-badge flat">
          <Info size={14} />
          {weekToDate.lastWeekTotal.sessions > 0
            ? `Last week ${formatKg(weekToDate.lastWeekTotal.volume)}`
            : 'No sessions yet this week'}
        </span>
      );
    }
    if (trend.direction === 'up') {
      return (
        <span className="metric-trend-badge up" title="Compared with last week up to the same day and time">
          <TrendingUp size={14} /> +{trend.percentChange}% vs this point last week
        </span>
      );
    } else if (trend.direction === 'down') {
      return (
        <span className="metric-trend-badge down" title="Compared with last week up to the same day and time">
          <TrendingDown size={14} /> -{trend.percentChange}% vs this point last week
        </span>
      );
    } else if (trend.direction === 'flat') {
      return (
        <span className="metric-trend-badge flat" title="Compared with last week up to the same day and time">
          <Minus size={14} /> Level with this point last week
        </span>
      );
    }
    // Trained this week, but nothing by this point last week to compare with
    return (
      <span className="metric-trend-badge flat">
        <Info size={14} />
        {weekToDate.lastWeekTotal.sessions > 0
          ? `Last week ${formatKg(weekToDate.lastWeekTotal.volume)}`
          : 'No previous week data'}
      </span>
    );
  };

  // 2. Format weeklyData for the chart (take last 8 weeks for readability)
  const chartData = weeklyData.slice(-8).map(w => ({
    weekLabel: w.weekLabel.split(' - ')[0], // just use start date to save space
    totalVolume: Math.round(w.totalVolume),
    rawLabel: w.weekLabel
  }));

  // Target checker for muscle group set counts
  const getSetCountTargetClass = (count) => {
    if (count === 0) return 'flat';
    if (count < 10) return 'down'; // amber style
    if (count <= 20) return 'up'; // green style
    return 'danger'; // red style (too high)
  };

  const getSetCountStatusLabel = (count) => {
    if (count === 0) return 'No Sets Logged';
    if (count < 10) return 'Below Target (Under 10)';
    if (count <= 20) return 'Optimal Range (10-20)';
    return 'Excessive (Over 20)';
  };

  // Groups your library actually trains stay listed even at zero sets, so an
  // untouched one shows up as a gap; anything else appears once it has sets.
  // (This used to be a fixed Chest/Shoulders/Triceps list from the push-only
  // days, which hid Quads and Hamstrings at zero and kept an empty Triceps row.)
  const trainedGroups = new Set(
    exercises.map((ex) => resolveMuscleGroup(ex.muscleGroup, ex.name, ex.id))
  );

  return (
    <div className="tab-content">
      {backupBanner}
      {/* 1. Metric summary cards */}
      <div className="analytics-summary-grid">
        <div className="metric-card">
          <span className="text-xs text-muted text-bold">WEEKLY WORKING VOLUME</span>
          <div className="metric-value">{Math.round(currentWeekData.totalVolume)}<span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}> kg</span></div>
          {renderTrendBadge()}
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted text-bold">WORKOUTS THIS WEEK</span>
          <div className="metric-value">{currentWeekData.sessionsCount}</div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '8px' }}>
            Target: 2–3x per week
          </span>
        </div>
      </div>

      {/* 2. Chart section */}
      <div className="card" style={{ padding: '16px 8px 12px 8px' }}>
        <h4 className="chart-title" style={{ margin: '0 0 8px 8px' }}>Working Volume Trend (kg)</h4>
        <div style={{ width: '100%', height: 180 }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border-color)" vertical={false} />
                <XAxis 
                  dataKey="weekLabel" 
                  stroke="var(--text-secondary)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <YAxis 
                  stroke="var(--text-secondary)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--bg-card)', 
                    borderColor: 'var(--border-color)', 
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px'
                  }}
                  labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600 }}
                  itemStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
                  formatter={(value) => [`${value} kg`, 'Working Volume']}
                />
                <Area 
                  type="monotone" 
                  dataKey="totalVolume" 
                  stroke="var(--accent)" 
                  strokeWidth={2} 
                  fillOpacity={1} 
                  fill="url(#colorVolume)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-muted" style={{ lineHeight: '180px' }}>
              Not enough data for trend chart.
            </div>
          )}
        </div>
      </div>

      {/* 3. Weekly Volume & Set Breakdown */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 className="card-title" style={{ margin: 0 }}>This Week's Breakdown</h3>
          <div className="sub-tabs" style={{ padding: '2px', scale: '0.9' }}>
            <button 
              className={`sub-tab-btn ${breakdownView === 'muscleGroups' ? 'active' : ''}`}
              onClick={() => setBreakdownView('muscleGroups')}
              style={{ padding: '4px 8px', fontSize: '11px' }}
            >
              Muscle Groups
            </button>
            <button 
              className={`sub-tab-btn ${breakdownView === 'exercises' ? 'active' : ''}`}
              onClick={() => setBreakdownView('exercises')}
              style={{ padding: '4px 8px', fontSize: '11px' }}
            >
              Exercises
            </button>
          </div>
        </div>

        {breakdownView === 'muscleGroups' ? (
          <div className="weekly-breakdown-table">
            {MUSCLE_GROUPS.map((mg) => {
              const count = currentWeekData.muscleGroupSets?.[mg] || 0;
              const vol = currentWeekData.muscleGroupVolume?.[mg] || 0;
              const targetClass = getSetCountTargetClass(count);
              
              // Only render if sets are logged or the library trains this group
              if (count === 0 && !trainedGroups.has(mg)) return null;

              return (
                <div key={mg} className="weekly-breakdown-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="weekly-breakdown-name" style={{ fontSize: '14px', fontWeight: 600 }}>{mg}</span>
                      <span className="text-xs text-muted">{getSetCountStatusLabel(count)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      <span className="weekly-breakdown-vol" style={{ fontSize: '14px' }}>{formatKg(vol)}</span>
                      <span className={`metric-trend-badge ${targetClass}`} style={{ marginTop: 0, fontSize: '10px', padding: '1px 6px' }}>
                        {count} hard set{count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  
                  {/* Progress bar visual indicator */}
                  {count > 0 && (
                    <div style={{ height: '4px', backgroundColor: 'var(--bg-primary)', borderRadius: '2px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ 
                        width: `${Math.min(100, (count / 20) * 100)}%`, 
                        backgroundColor: targetClass === 'up' ? 'var(--success)' : targetClass === 'down' ? 'var(--warning)' : targetClass === 'danger' ? 'var(--error)' : 'var(--text-muted)',
                        borderRadius: '2px'
                      }}></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="weekly-breakdown-table">
            {getDisplayExercises(orderedExercises, history).map((ex) => {
              const vol = currentWeekData.exerciseVolume[ex.id] || 0;
              const sets = currentWeekData.exerciseSets[ex.id] || 0;
              // Hide history-only exercises with no activity this week to avoid clutter
              if (ex.isHistorical && sets === 0 && vol === 0) return null;
              return (
                <div key={ex.id} className="weekly-breakdown-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="weekly-breakdown-info">
                      <span className="weekly-breakdown-name">{ex.name}</span>
                      <span className="weekly-breakdown-sets">{sets} hard set{sets !== 1 ? 's' : ''} logged</span>
                    </div>
                    <span className="weekly-breakdown-vol">{formatKg(vol)}</span>
                  </div>
                  <AccretionStrip points={accretionByExercise[ex.id]?.points} height={18} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Progression Helper Suggestions */}
      <div className="card">
        <h3 className="card-title" style={{ gap: '6px', justifyContent: 'flex-start' }}>
          <Zap size={18} style={{ color: 'var(--warning-strong)' }} />
          Progression Helper
        </h3>
        <p className="text-xs text-muted" style={{ marginTop: '-4px' }}>
          Suggests weight increases only if you completed all working sets at the top rep range AND difficulty was moderate (last-set RPE ≤ 9 / RIR ≥ 1).
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          {orderedExercises.map((ex) => {
            // Same clock as the workout screen passes, so after a layoff both
            // judge against the same session instead of disagreeing.
            const suggestion = getProgressionSuggestion(ex.id, history, ex, nowTs);
            const tone = HINT_STYLE[suggestion.type] || HINT_STYLE.initial;
            return (
              <div key={ex.id} className="progression-hint-banner" style={{
                borderColor: tone.border,
                backgroundColor: tone.background
              }}>
                <Info size={16} className="progression-hint-icon" style={{ color: tone.icon }} />
                <div className="progression-hint-text" style={{ color: tone.text }}>
                  <strong style={{ color: tone.text }}>{ex.name}: </strong>
                  {suggestion.text}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
