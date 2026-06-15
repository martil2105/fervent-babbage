import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Info, BarChart2, Zap } from 'lucide-react';
import { 
  groupSessionsByWeek,
  calculateTrend,
  getProgressionSuggestion,
  getMondayOfDate,
  getDisplayExercises,
  MUSCLE_GROUPS
} from '../utils/workoutHelpers';

export default function Dashboard({ history, exercises }) {
  const [breakdownView, setBreakdownView] = useState('muscleGroups'); // 'muscleGroups' | 'exercises'

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
  
  // Get current week and previous week data
  const currentWeekMonday = getMondayOfDate(new Date()).getTime();
  const currentWeekData = weeklyData.find(w => w.weekStart === currentWeekMonday) || {
    totalVolume: 0,
    sessionsCount: 0,
    exerciseVolume: {},
    exerciseSets: {},
    muscleGroupVolume: {},
    muscleGroupSets: {}
  };
  
  // Previous week Monday
  const prevWeekMonday = currentWeekMonday - 7 * 24 * 60 * 60 * 1000;
  const prevWeekData = weeklyData.find(w => w.weekStart === prevWeekMonday);
  
  const trend = calculateTrend(currentWeekData.totalVolume, prevWeekData?.totalVolume || 0);

  // Render trend badge
  const renderTrendBadge = () => {
    if (trend.direction === 'up') {
      return (
        <span className="metric-trend-badge up">
          <TrendingUp size={14} /> +{trend.percentChange}% vs last week
        </span>
      );
    } else if (trend.direction === 'down') {
      return (
        <span className="metric-trend-badge down">
          <TrendingDown size={14} /> -{trend.percentChange}% vs last week
        </span>
      );
    } else if (trend.direction === 'flat') {
      return (
        <span className="metric-trend-badge flat">
          <Minus size={14} /> Flat vs last week
        </span>
      );
    }
    return (
      <span className="metric-trend-badge flat">
        <Info size={14} /> No previous week data
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

  return (
    <div className="tab-content">
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
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
              
              // Only render if sets are logged or if it's a core muscle group
              const isCore = ['Chest', 'Shoulders', 'Triceps'].includes(mg);
              if (count === 0 && !isCore) return null;

              return (
                <div key={mg} className="weekly-breakdown-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="weekly-breakdown-name" style={{ fontSize: '14px', fontWeight: 600 }}>{mg}</span>
                      <span className="text-xs text-muted">{getSetCountStatusLabel(count)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      <span className="weekly-breakdown-vol" style={{ fontSize: '14px' }}>{Math.round(vol)} kg</span>
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
            {getDisplayExercises(exercises, history).map((ex) => {
              const vol = currentWeekData.exerciseVolume[ex.id] || 0;
              const sets = currentWeekData.exerciseSets[ex.id] || 0;
              // Hide history-only exercises with no activity this week to avoid clutter
              if (ex.isHistorical && sets === 0 && vol === 0) return null;
              return (
                <div key={ex.id} className="weekly-breakdown-row">
                  <div className="weekly-breakdown-info">
                    <span className="weekly-breakdown-name">{ex.name}</span>
                    <span className="weekly-breakdown-sets">{sets} hard set{sets !== 1 ? 's' : ''} logged</span>
                  </div>
                  <span className="weekly-breakdown-vol">{Math.round(vol)} kg</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Progression Helper Suggestions */}
      <div className="card">
        <h3 className="card-title" style={{ gap: '6px', display: 'flex', alignItems: 'center' }}>
          <Zap size={18} style={{ color: 'var(--warning)' }} />
          Progression Helper
        </h3>
        <p className="text-xs text-muted" style={{ marginTop: '-4px' }}>
          Suggests weight increases only if you completed all working sets at the top rep range AND difficulty was moderate (last-set RPE ≤ 9 / RIR ≥ 1).
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          {exercises.map((ex) => {
            const suggestion = getProgressionSuggestion(ex.id, history, ex);
            return (
              <div key={ex.id} className="progression-hint-banner" style={{
                borderColor: suggestion.type === 'weight' ? 'rgba(16, 185, 129, 0.25)' : suggestion.type === 'hold' ? 'rgba(99, 102, 241, 0.25)' : suggestion.type === 'reps' ? 'rgba(245, 158, 11, 0.25)' : 'var(--border-color)',
                backgroundColor: suggestion.type === 'weight' ? 'var(--success-glow)' : suggestion.type === 'hold' ? 'var(--accent-glow)' : suggestion.type === 'reps' ? 'var(--warning-glow)' : 'var(--bg-secondary)'
              }}>
                <Info size={16} className="progression-hint-icon" style={{
                  color: suggestion.type === 'weight' ? 'var(--success)' : suggestion.type === 'hold' ? 'var(--accent)' : suggestion.type === 'reps' ? 'var(--warning)' : 'var(--text-secondary)'
                }} />
                <div className="progression-hint-text">
                  <strong style={{
                    color: suggestion.type === 'weight' ? 'var(--success)' : suggestion.type === 'hold' ? 'var(--accent)' : suggestion.type === 'reps' ? 'var(--warning)' : 'var(--text-secondary)'
                  }}>{ex.name}: </strong>
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
