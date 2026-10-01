import { Fragment, useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceArea
} from 'recharts';
import { Flame, TrendingUp } from 'lucide-react';
import ChartTooltip from './ChartTooltip';
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
  orderExercisesByRoutines,
  MUSCLE_GROUPS
} from '../utils/workoutHelpers';
import { formatNumber } from '../utils/format';
import { chartAnimation } from '../utils/motion';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const HEATMAP_WEEKS = 12;

const shortDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const axisTick = { fill: 'var(--ink-3)', fontSize: 11 };

// Signed percentage with a real minus sign
const signedPct = (pct) => (pct > 0 ? `+${pct}%` : pct < 0 ? `−${Math.abs(pct)}%` : '0%');

export default function Analytics({ history, exercises, routines = [] }) {
  // Chips in session order (Push's exercises, then Legs'), history-only
  // exercises after them.
  const displayExercises = useMemo(
    () => getDisplayExercises(orderExercisesByRoutines(exercises, routines), history),
    [exercises, routines, history]
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
          <TrendingUp aria-hidden="true" />
          <h2>Progress shows up here</h2>
          <p className="text-muted">
            After a few workouts this page charts your strength on each lift,
            how consistently you train, how hard sessions feel, and your muscle balance.
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

  // --- Volume load chart data ----------------------------------------------
  // Volume load (Σ weight × reps over countable sets) is the work-done twin of
  // est. 1RM: it moves when back-off sets improve but the top set doesn't.
  // Deliberately its own panel with its own kg axis — plotting it as a second
  // y-axis on the strength chart would invent a correlation between two scales
  // that have nothing to do with each other.
  const volumeData = series.map((p) => ({
    label: shortDate(p.timestamp),
    volume: Math.round(p.volume)
  }));

  const bestVolume = series.reduce((max, p) => Math.max(max, p.volume), 0);
  const volumeChangePct =
    series.length >= 2 && first.volume > 0
      ? Math.round(((latest.volume - first.volume) / first.volume) * 100)
      : null;

  // --- Consistency heatmap (last 12 weeks, Mon–Sun columns) ----------------
  const dailyVolume = getDailyVolumeMap(history);
  const maxDayVolume = Math.max(0, ...Object.values(dailyVolume));
  const today = getStartOfDay(new Date()).getTime();
  const currentMonday = getMondayOfDate(new Date()).getTime();
  const heatmapStart = currentMonday - (HEATMAP_WEEKS - 1) * WEEK_MS;

  // One hue, light to dark: rest days are the empty step.
  const heatLevel = (volume) => {
    if (volume <= 0) return 0;
    const ratio = maxDayVolume > 0 ? volume / maxDayVolume : 1;
    if (ratio <= 0.33) return 1;
    if (ratio <= 0.66) return 2;
    return 3;
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

  const volumeValue = stats.totalVolume >= 10000
    ? (stats.totalVolume / 1000).toFixed(1)
    : formatNumber(stats.totalVolume);
  const volumeUnit = stats.totalVolume >= 10000 ? 't' : 'kg';

  return (
    <div className="tab-content">
      {/* 1. Lifetime */}
      <div className="analytics-summary-grid">
        <div className="metric-card">
          <span className="metric-label">Workouts</span>
          <div className="metric-value">{stats.sessionsCount}</div>
          <span className="metric-caption">{formatNumber(stats.totalSets)} sets, {formatNumber(stats.totalReps)} reps</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Week streak</span>
          <div className="metric-value">
            {streak}
            {streak > 0 && <Flame size={22} className="metric-flame" aria-hidden="true" />}
          </div>
          <span className="metric-caption">weeks in a row with training</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Lifetime volume</span>
          <div className="metric-value">{volumeValue}<span className="unit">{volumeUnit}</span></div>
          <span className="metric-caption">completed working sets</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Average session</span>
          <div className="metric-value">{stats.avgDuration}<span className="unit">min</span></div>
          <span className="metric-caption">across logged durations</span>
        </div>
      </div>

      {/* 2. Strength progression */}
      <div className="card chart-card">
        <div className="card-head">
          <h3 className="card-title">Strength</h3>
          <span className="card-sub">Heaviest set and estimated 1RM (Epley) per session</span>
        </div>

        {/* Exercise selector */}
        <div className="chart-chips" role="group" aria-label="Exercise">
          {displayExercises.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className="chip"
              aria-pressed={ex.id === activeId}
              onClick={() => setSelectedId(ex.id)}
            >
              {ex.name}
            </button>
          ))}
        </div>

        {chartData.length >= 2 ? (
          <>
            <div className="chart-legend">
              <span className="chart-legend-item">
                <span className="chart-swatch is-line" style={{ '--swatch': 'var(--series-1)' }} aria-hidden="true" />
                Top set
              </span>
              <span className="chart-legend-item">
                <span className="chart-swatch is-dashed" style={{ '--swatch': 'var(--series-2)' }} aria-hidden="true" />
                Estimated 1RM
              </span>
            </div>
            <div className="chart-box" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--hairline)" vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} domain={['auto', 'auto']} />
                  <Tooltip
                    cursor={{ stroke: 'var(--hairline-strong)', strokeWidth: 1 }}
                    content={(
                      <ChartTooltip
                        rows={(payload) => [
                          ...payload.filter((p) => p.dataKey === 'topWeight').map((p) => ({
                            key: 'top', name: 'Top set', value: `${p.value} kg`, color: 'var(--series-1)'
                          })),
                          ...payload.filter((p) => p.dataKey === 'est1RM').map((p) => ({
                            key: 'est', name: 'Est. 1RM', value: `${p.value} kg`, color: 'var(--series-2)', dashed: true
                          }))
                        ]}
                      />
                    )}
                  />
                  <Line {...chartAnimation} type="monotone" dataKey="est1RM" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
                  <Line {...chartAnimation} type="monotone" dataKey="topWeight" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3, fill: 'var(--series-1)', stroke: 'var(--surface)', strokeWidth: 1.5 }} activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="stat-row card-divider">
              <div className="stat">
                <span className="stat-label">Best est. 1RM</span>
                <span className="stat-value">{best1RM}<span className="unit">kg</span></span>
              </div>
              <div className="stat">
                <span className="stat-label">Latest top set</span>
                <span className="stat-value">{latest.topWeight}<span className="unit">kg</span></span>
              </div>
              {changePct !== null && (
                <div className="stat">
                  <span className="stat-label">Since first log</span>
                  <span className={`stat-value${changePct > 0 ? ' is-brass' : changePct < 0 ? ' is-danger' : ''}`}>
                    {signedPct(changePct)}
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="chart-empty">
            {activeExercise
              ? `Log ${activeExercise.name} in at least two sessions to see its progression.`
              : 'No exercises configured yet.'}
          </p>
        )}
      </div>

      {/* 3. Volume load (work-done twin of the strength panel above) */}
      {volumeData.length >= 2 && (
        <div className="card chart-card">
          <div className="card-head">
            <h3 className="card-title">Volume load{activeExercise ? `, ${activeExercise.name}` : ''}</h3>
            <span className="card-sub">
              Weight × reps over every working set, per session. Extra reps on
              back-off sets show up here even when the top set doesn&apos;t move.
            </span>
          </div>

          <div className="chart-box" style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid stroke="var(--hairline)" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : v)}
                />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={(
                    <ChartTooltip
                      rows={(payload) => [{ key: 'v', name: 'Volume load', value: `${formatNumber(payload[0].value)} kg`, color: 'var(--series-1)' }]}
                    />
                  )}
                />
                <Bar {...chartAnimation} dataKey="volume" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="stat-row card-divider">
            <div className="stat">
              <span className="stat-label">Best session</span>
              <span className="stat-value">{formatNumber(bestVolume)}<span className="unit">kg</span></span>
            </div>
            <div className="stat">
              <span className="stat-label">Latest</span>
              <span className="stat-value">{formatNumber(latest.volume)}<span className="unit">kg</span></span>
            </div>
            {volumeChangePct !== null && (
              <div className="stat">
                <span className="stat-label">Since first log</span>
                <span className={`stat-value${volumeChangePct > 0 ? ' is-brass' : volumeChangePct < 0 ? ' is-danger' : ''}`}>
                  {signedPct(volumeChangePct)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Consistency heatmap */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Consistency</h3>
          <span className="card-sub">The last {HEATMAP_WEEKS} weeks. Darker days moved more weight.</span>
        </div>
        <div className="heatmap" role="img" aria-label={`Training days over the last ${HEATMAP_WEEKS} weeks`}>
          <span aria-hidden="true" />
          {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => (
            <span key={`day-${i}`} className="heatmap-day" aria-hidden="true">{d}</span>
          ))}
          {heatmapWeeks.map((week) => (
            <Fragment key={week.weekStart}>
              <span className="heatmap-month" aria-hidden="true">{week.monthLabel || ''}</span>
              {week.days.map((day) => (
                <div
                  key={day.ts}
                  title={`${shortDate(day.ts)}: ${day.volume > 0 ? `${formatNumber(day.volume)} kg` : 'rest'}`}
                  className={`heat-cell${day.isFuture ? ' is-future' : ` l${heatLevel(day.volume)}`}`}
                />
              ))}
            </Fragment>
          ))}
        </div>
        <div className="heatmap-legend" aria-hidden="true">
          <span>Rest</span>
          {[0, 1, 2, 3].map((l) => <span key={l} className={`heat-cell l${l}`} />)}
          <span>Most</span>
        </div>
      </div>

      {/* 5. Effort trend */}
      <div className="card chart-card">
        <div className="card-head">
          <h3 className="card-title">Effort</h3>
          <span className="card-sub">
            Average RPE per session (RIR converted). The shaded band, RPE 7–9, is
            where most hypertrophy work lands.
          </span>
        </div>
        {rpeData.length >= 2 ? (
          <div className="chart-box" style={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rpeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--hairline)" vertical={false} />
                <ReferenceArea y1={7} y2={9} fill="var(--surface-2)" fillOpacity={1} ifOverflow="hidden" />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} domain={[5, 10]} tickCount={6} />
                <Tooltip
                  cursor={{ stroke: 'var(--hairline-strong)', strokeWidth: 1 }}
                  content={(
                    <ChartTooltip
                      rows={(payload) => [{ key: 'r', name: 'Session average', value: `RPE ${payload[0].value}`, color: 'var(--series-1)' }]}
                    />
                  )}
                />
                <Line {...chartAnimation} type="monotone" dataKey="avgRpe" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3, fill: 'var(--series-1)', stroke: 'var(--surface)', strokeWidth: 1.5 }} activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="chart-empty">
            Log RPE or RIR on your sets to track how hard your sessions feel over time.
          </p>
        )}
      </div>

      {/* 6. Muscle balance */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Muscle balance</h3>
          <span className="card-sub">Share of working sets over the last 4 weeks</span>
        </div>
        {balanceRows.length > 0 ? (
          <div className="balance-list">
            {balanceRows.map(({ mg, sets }) => {
              const pct = Math.round((sets / totalBalanceSets) * 100);
              return (
                <div key={mg} className="balance-row">
                  <div className="balance-row-head">
                    <span className="balance-name">{mg}</span>
                    <span className="balance-figures">
                      {sets} sets <strong>{pct}%</strong>
                    </span>
                  </div>
                  <div className="balance-track">
                    <div className="balance-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="chart-empty">No working sets logged in the last 4 weeks.</p>
        )}
      </div>
    </div>
  );
}
