import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Flame, Activity, Scale } from 'lucide-react';
import {
  getExerciseProgression,
  getSessionAvgRpe,
  getLifetimeStats,
  getWeeklyStreak,
  getDailyVolumeMap,
  getDisplayExercises,
  groupSessionsByWeek,
  getMondayOfDate,
  getStartOfDay,
  MUSCLE_GROUPS
} from '../utils/workoutHelpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const HEATMAP_WEEKS = 12;

const shortDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const tooltipStyle = {
  backgroundColor: 'var(--bg-card)',
  borderColor: 'var(--border-color)',
  borderRadius: 'var(--radius-sm)',
  fontSize: '12px'
};

export default function Analytics({ history, exercises }) {
  const displayExercises = useMemo(
    () => getDisplayExercises(exercises, history),
    [exercises, history]
  );

  // Per-exercise progression series, keyed by id (computed once per history change)
  const progressionById = useMemo(() => {
    const map = {};
    displayExercises.forEach((ex) => {
      map[ex.id] = getExerciseProgression(ex.id, history || []);
    });
    return map;
  }, [displayExercises, history]);

  // Default to the exercise with the most logged sessions
  const defaultExerciseId = useMemo(() => {
    let best = displayExercises[0]?.id || null;
    let bestCount = -1;
    displayExercises.forEach((ex) => {
      const count = progressionById[ex.id]?.length || 0;
      if (count > bestCount) {
        best = ex.id;
        bestCount = count;
      }
    });
    return best;
  }, [displayExercises, progressionById]);

  const [selectedId, setSelectedId] = useState(null);
  const activeId = selectedId || defaultExerciseId;

  if (!history || history.length === 0) {
    return (
      <div className="tab-content">
        <div className="empty-state">
          <Activity />
          <h3>No Analytics Yet</h3>
          <p className="text-muted text-center">
            Complete a few workouts and this page will chart your strength progression,
            training consistency, effort levels, and muscle balance.
          </p>
        </div>
      </div>
    );
  }

  const stats = getLifetimeStats(history);
  const streak = getWeeklyStreak(history);
  const activeExercise = displayExercises.find((ex) => ex.id === activeId);
  const series = progressionById[activeId] || [];

  // --- Strength progression chart data -------------------------------------
  const chartData = series.map((p) => ({
    label: shortDate(p.timestamp),
    topWeight: p.topWeight,
    est1RM: p.est1RM
  }));

  const first = series[0];
  const latest = series[series.length - 1];
  const best1RM = series.reduce((max, p) => Math.max(max, p.est1RM), 0);
  const changePct =
    series.length >= 2 && first.est1RM > 0
      ? Math.round(((latest.est1RM - first.est1RM) / first.est1RM) * 100)
      : null;

  // --- Consistency heatmap (last 12 weeks, Mon–Sun columns) ----------------
  const dailyVolume = getDailyVolumeMap(history);
  const maxDayVolume = Math.max(0, ...Object.values(dailyVolume));
  const today = getStartOfDay(new Date()).getTime();
  const currentMonday = getMondayOfDate(new Date()).getTime();
  const heatmapStart = currentMonday - (HEATMAP_WEEKS - 1) * WEEK_MS;

  const cellColor = (volume) => {
    if (volume <= 0) return 'var(--bg-secondary)';
    const ratio = maxDayVolume > 0 ? volume / maxDayVolume : 1;
    if (ratio <= 0.33) return 'var(--feather-200)';
    if (ratio <= 0.66) return 'var(--feather-400)';
    return 'var(--feather-600)';
  };

  const heatmapWeeks = [];
  for (let w = 0; w < HEATMAP_WEEKS; w++) {
    const weekStart = heatmapStart + w * WEEK_MS;
    const prevMonth = w > 0 ? new Date(weekStart - WEEK_MS).getMonth() : null;
    const month = new Date(weekStart).getMonth();
    heatmapWeeks.push({
      weekStart,
      monthLabel:
        w === 0 || month !== prevMonth
          ? new Date(weekStart).toLocaleDateString(undefined, { month: 'short' })
          : null,
      days: Array.from({ length: 7 }, (_, d) => {
        // Re-derive the day via Date to stay correct across DST shifts
        const date = new Date(weekStart);
        date.setDate(date.getDate() + d);
        date.setHours(0, 0, 0, 0);
        const ts = date.getTime();
        return { ts, volume: dailyVolume[ts] || 0, isFuture: ts > today };
      })
    });
  }

  // --- Effort trend (avg session RPE, last 15 sessions with data) ----------
  const rpeData = [...history]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((s) => ({ label: shortDate(s.timestamp), avgRpe: getSessionAvgRpe(s) }))
    .filter((p) => p.avgRpe !== null)
    .slice(-15);

  // --- Muscle balance (last 4 weeks share of working sets) -----------------
  const weeklyData = groupSessionsByWeek(history, exercises);
  const fourWeeksAgo = currentMonday - 3 * WEEK_MS;
  const balanceSets = {};
  weeklyData
    .filter((w) => w.weekStart >= fourWeeksAgo)
    .forEach((w) => {
      MUSCLE_GROUPS.forEach((mg) => {
        balanceSets[mg] = (balanceSets[mg] || 0) + (w.muscleGroupSets?.[mg] || 0);
      });
    });
  const totalBalanceSets = Object.values(balanceSets).reduce((a, b) => a + b, 0);
  const balanceRows = MUSCLE_GROUPS.map((mg) => ({ mg, sets: balanceSets[mg] || 0 }))
    .filter((r) => r.sets > 0)
    .sort((a, b) => b.sets - a.sets);

  return (
    <div className="tab-content">
      {/* 1. Lifetime stats */}
      <div className="analytics-summary-grid">
        <div className="metric-card">
          <span className="text-xs text-muted text-bold">TOTAL WORKOUTS</span>
          <div className="metric-value">{stats.sessionsCount}</div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '8px' }}>
            {stats.totalSets} sets · {stats.totalReps} reps
          </span>
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted text-bold">WEEK STREAK</span>
          <div className="metric-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <Flame size={22} style={{ color: streak > 0 ? 'var(--sun-600)' : 'var(--text-muted)' }} />
            {streak}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '8px' }}>
            consecutive training weeks
          </span>
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted text-bold">LIFETIME VOLUME</span>
          <div className="metric-value">
            {stats.totalVolume >= 10000
              ? (stats.totalVolume / 1000).toFixed(1)
              : Math.round(stats.totalVolume)}
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {' '}{stats.totalVolume >= 10000 ? 't' : 'kg'}
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '8px' }}>
            completed working sets
          </span>
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted text-bold">AVG SESSION</span>
          <div className="metric-value">
            {stats.avgDuration}
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}> min</span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '8px' }}>
            across logged durations
          </span>
        </div>
      </div>

      {/* 2. Strength progression */}
      <div className="card" style={{ padding: '16px 8px 12px 8px' }}>
        <h4 className="chart-title" style={{ margin: '0 0 4px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <TrendingUp size={16} style={{ color: 'var(--accent-strong)' }} />
          Strength Progression
        </h4>
        <p className="text-xs text-muted" style={{ margin: '0 0 10px 16px' }}>
          Heaviest set and estimated 1RM (Epley) per session.
        </p>

        {/* Exercise selector chips */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '0 8px 10px 8px', WebkitOverflowScrolling: 'touch' }}>
          {displayExercises.map((ex) => {
            const isActive = ex.id === activeId;
            return (
              <button
                key={ex.id}
                onClick={() => setSelectedId(ex.id)}
                style={{
                  flexShrink: 0,
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-color)'}`,
                  backgroundColor: isActive ? 'var(--accent-glow)' : 'var(--bg-card)',
                  color: isActive ? 'var(--accent-strong)' : 'var(--text-secondary)'
                }}
              >
                {ex.name}
              </button>
            );
          })}
        </div>

        {chartData.length >= 2 ? (
          <>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--text-secondary)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-secondary)" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600 }}
                    itemStyle={{ fontWeight: 600 }}
                    formatter={(value, name) => [
                      `${value} kg`,
                      name === 'topWeight' ? 'Top Set' : 'Est. 1RM'
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px' }}
                    formatter={(value) => (value === 'topWeight' ? 'Top set weight' : 'Estimated 1RM')}
                  />
                  <Line type="monotone" dataKey="est1RM" stroke="var(--macaw-500)" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                  <Line type="monotone" dataKey="topWeight" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Progress summary row */}
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '10px', padding: '10px 8px 4px 8px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ textAlign: 'center' }}>
                <span className="text-xs text-muted text-bold">BEST EST. 1RM</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{best1RM} kg</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span className="text-xs text-muted text-bold">LATEST TOP SET</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{latest.topWeight} kg</div>
              </div>
              {changePct !== null && (
                <div style={{ textAlign: 'center' }}>
                  <span className="text-xs text-muted text-bold">SINCE FIRST LOG</span>
                  <div style={{
                    fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                    color: changePct > 0 ? 'var(--success-strong)' : changePct < 0 ? 'var(--error-strong)' : 'var(--text-secondary)'
                  }}>
                    {changePct > 0 ? <TrendingUp size={15} /> : changePct < 0 ? <TrendingDown size={15} /> : null}
                    {changePct > 0 ? '+' : ''}{changePct}%
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center text-muted" style={{ padding: '32px 16px', fontSize: '13px' }}>
            {activeExercise
              ? `Log ${activeExercise.name} in at least two sessions to see its progression.`
              : 'No exercises configured yet.'}
          </div>
        )}
      </div>

      {/* 3. Consistency heatmap */}
      <div className="card">
        <h4 className="chart-title" style={{ margin: '0 0 4px 0', paddingLeft: 0 }}>Training Consistency</h4>
        <p className="text-xs text-muted" style={{ margin: '0 0 12px 0' }}>
          Last {HEATMAP_WEEKS} weeks · darker = more volume that day.
        </p>
        <div style={{ display: 'flex', gap: '3px', justifyContent: 'space-between' }}>
          {heatmapWeeks.map((week) => (
            <div key={week.weekStart} style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', height: '12px', overflow: 'visible', whiteSpace: 'nowrap' }}>
                {week.monthLabel || ''}
              </span>
              {week.days.map((day) => (
                <div
                  key={day.ts}
                  title={`${shortDate(day.ts)} · ${day.volume > 0 ? `${Math.round(day.volume)} kg` : 'rest'}`}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: '3px',
                    backgroundColor: day.isFuture ? 'transparent' : cellColor(day.volume),
                    border: day.isFuture ? '1px dashed var(--border-color)' : 'none',
                    boxSizing: 'border-box'
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '10px' }}>
          <span className="text-xs text-muted">Less</span>
          {['var(--bg-secondary)', 'var(--feather-200)', 'var(--feather-400)', 'var(--feather-600)'].map((c) => (
            <span key={c} style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: c, display: 'inline-block' }} />
          ))}
          <span className="text-xs text-muted">More</span>
        </div>
      </div>

      {/* 4. Effort trend */}
      <div className="card" style={{ padding: '16px 8px 12px 8px' }}>
        <h4 className="chart-title" style={{ margin: '0 0 4px 8px' }}>Effort Trend</h4>
        <p className="text-xs text-muted" style={{ margin: '0 0 10px 16px' }}>
          Average RPE per session (RIR converted). Most hypertrophy work lands around RPE 7–9.
        </p>
        {rpeData.length >= 2 ? (
          <div style={{ width: '100%', height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rpeData} margin={{ top: 10, right: 12, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--text-secondary)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-secondary)" fontSize={10} tickLine={false} axisLine={false} domain={[5, 10]} tickCount={6} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600 }}
                  itemStyle={{ color: 'var(--warning-strong)', fontWeight: 600 }}
                  formatter={(value) => [`RPE ${value}`, 'Session avg']}
                />
                <Line type="monotone" dataKey="avgRpe" stroke="var(--warning)" strokeWidth={2} dot={{ r: 3, fill: 'var(--warning)' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center text-muted" style={{ padding: '24px 16px', fontSize: '13px' }}>
            Log RPE or RIR on your sets to track how hard your sessions feel over time.
          </div>
        )}
      </div>

      {/* 5. Muscle balance */}
      <div className="card">
        <h4 className="chart-title" style={{ margin: '0 0 4px 0', paddingLeft: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Scale size={16} style={{ color: 'var(--accent-strong)' }} />
          Muscle Balance
        </h4>
        <p className="text-xs text-muted" style={{ margin: '0 0 12px 0' }}>
          Share of working sets over the last 4 weeks.
        </p>
        {balanceRows.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {balanceRows.map(({ mg, sets }) => {
              const pct = Math.round((sets / totalBalanceSets) * 100);
              return (
                <div key={mg}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{mg}</span>
                    <span className="text-xs text-muted">{sets} sets · {pct}%</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--accent)', borderRadius: '3px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-muted" style={{ padding: '16px', fontSize: '13px' }}>
            No working sets logged in the last 4 weeks.
          </div>
        )}
      </div>
    </div>
  );
}
