import { useMemo, useState } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Info, Gauge, ShieldAlert, X } from 'lucide-react';
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
import ChartTooltip from './ChartTooltip';
import { isBackupDue, daysSinceBackup } from '../utils/autoBackup';
import { formatNumber, sentenceCase } from '../utils/format';
import { chartAnimation } from '../utils/motion';

const formatKg = (kg) => `${formatNumber(kg)} kg`;

// Hard sets per muscle group per week: the scale runs to 24, and 10–20 is the
// band most hypertrophy guidance lands on.
const SCALE_MAX = 24;
const BAND_LO = 10;
const BAND_HI = 20;

function SetScale({ count }) {
  const tone = count === 0 ? '' : count < BAND_LO ? ' is-under' : count <= BAND_HI ? ' is-optimal' : ' is-over';
  return (
    <div className={`set-scale${tone}`} aria-hidden="true">
      {Array.from({ length: SCALE_MAX }, (_, i) => (
        <span
          key={i}
          className={`tick${i < count ? ' is-on' : ''}${i >= BAND_LO - 1 && i < BAND_HI ? ' in-band' : ''}`}
        />
      ))}
    </div>
  );
}

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
    <div className="notice is-ember" role="status">
      <ShieldAlert size={18} className="notice-icon" aria-hidden="true" />
      <div className="notice-body">
        <span className="notice-title">
          {backupAgeDays === null ? 'Your log has never been backed up' : `No backup in ${backupAgeDays} days`}
        </span>
        <span className="notice-text">
          Everything is stored only in this browser. Clearing site data would erase it.
        </span>
        <button type="button" className="btn btn-secondary btn-sm notice-action" onClick={exportData}>
          Back up now
        </button>
      </div>
      <button
        type="button"
        className="notice-dismiss"
        onClick={() => setBackupDismissed(true)}
        aria-label="Dismiss backup warning"
      >
        <X size={15} />
      </button>
    </div>
  ) : null;

  if (!history || history.length === 0) {
    return (
      <div className="tab-content">
        <div className="empty-state">
          <Gauge aria-hidden="true" />
          <h2>Your week starts here</h2>
          <p className="text-muted">
            Log a session in Workout and this page fills in: the week&apos;s volume,
            sets per muscle group, and what to aim for next time.
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

  // Trend line under the week's volume
  const renderTrendBadge = () => {
    // Nothing logged yet this week: not a decline, just early. Say where
    // last week ended up instead of scoring a week that has barely started.
    if (weekToDate.thisWeek.sessions === 0) {
      return (
        <span className="metric-trend-badge flat">
          <Info size={14} aria-hidden="true" />
          {weekToDate.lastWeekTotal.sessions > 0
            ? `Last week ended at ${formatKg(weekToDate.lastWeekTotal.volume)}`
            : 'No sessions yet this week'}
        </span>
      );
    }
    const title = 'Compared with last week up to the same day and time';
    if (trend.direction === 'up') {
      return (
        <span className="metric-trend-badge up" title={title}>
          <TrendingUp size={14} aria-hidden="true" /> {trend.percentChange}% ahead of this point last week
        </span>
      );
    } else if (trend.direction === 'down') {
      return (
        <span className="metric-trend-badge down" title={title}>
          <TrendingDown size={14} aria-hidden="true" /> {trend.percentChange}% behind this point last week
        </span>
      );
    } else if (trend.direction === 'flat') {
      return (
        <span className="metric-trend-badge flat" title={title}>
          <Minus size={14} aria-hidden="true" /> Level with this point last week
        </span>
      );
    }
    // Trained this week, but nothing by this point last week to compare with
    return (
      <span className="metric-trend-badge flat">
        <Info size={14} aria-hidden="true" />
        {weekToDate.lastWeekTotal.sessions > 0
          ? `Last week ended at ${formatKg(weekToDate.lastWeekTotal.volume)}`
          : 'No previous week to compare with'}
      </span>
    );
  };

  // 2. The last 8 weeks for the chart; the week in progress is the brass bar.
  const chartData = weeklyData.slice(-8).map((w) => ({
    weekLabel: w.weekLabel.split(' - ')[0], // just the start date, to save space
    totalVolume: Math.round(w.totalVolume),
    rawLabel: w.weekLabel,
    isCurrent: w.weekStart === currentWeekMonday
  }));

  const statusLabel = (count) => {
    if (count === 0) return 'No sets yet';
    if (count < BAND_LO) return `${BAND_LO - count} under the ${BAND_LO}–${BAND_HI} range`;
    if (count <= BAND_HI) return 'In the range';
    return `${count - BAND_HI} over ${BAND_HI}`;
  };

  const sessionsThisWeek = currentWeekData.sessionsCount;

  // The week as seven marks, Monday first: brass where you trained, today
  // outlined, days still to come faint.
  const todayStart = new Date(nowTs);
  todayStart.setHours(0, 0, 0, 0);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekMonday);
    d.setDate(d.getDate() + i);
    const start = d.getTime();
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    return {
      key: start,
      letter: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      name: d.toLocaleDateString(undefined, { weekday: 'long' }),
      trained: history.some((s) => s.timestamp >= start && s.timestamp < next.getTime()),
      isToday: start === todayStart.getTime(),
      isFuture: start > todayStart.getTime()
    };
  });
  const trainedDays = weekDays.filter((d) => d.trained).map((d) => d.name);

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

      {/* 1. The week so far */}
      <section className="week-hero" aria-label="This week">
        <div className="week-hero-row">
          <div className="week-hero-main">
            <span className="metric-label">Working volume this week</span>
            <span className="week-hero-value">
              {formatNumber(currentWeekData.totalVolume)}<span className="unit">kg</span>
            </span>
            {renderTrendBadge()}
          </div>
        </div>
        <div className="week-strip">
          <div
            className="week-days"
            role="img"
            aria-label={trainedDays.length ? `Trained on ${trainedDays.join(', ')}` : 'No training days yet this week'}
          >
            {weekDays.map((d) => (
              <span
                key={d.key}
                className={`week-day${d.trained ? ' is-on' : ''}${d.isToday ? ' is-today' : ''}${d.isFuture ? ' is-future' : ''}`}
              >
                <span className="week-day-mark" />
                <span className="week-day-letter">{d.letter}</span>
              </span>
            ))}
          </div>
          <div className="week-count">
            <span className="week-sessions-count">
              {sessionsThisWeek} workout{sessionsThisWeek === 1 ? '' : 's'}
            </span>
            <span className="metric-caption">Target 2–3</span>
          </div>
        </div>
      </section>

      {/* 2. Weekly volume, last 8 weeks */}
      <div className="card chart-card">
        <div className="card-head">
          <h3 className="card-title">Weekly volume</h3>
          <span className="card-sub">Working sets, last {chartData.length} week{chartData.length === 1 ? '' : 's'}</span>
        </div>
        <div className="chart-box" style={{ height: 170 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis
                dataKey="weekLabel"
                tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
              />
              <Tooltip
                cursor={{ fill: 'var(--surface-2)' }}
                content={(
                  <ChartTooltip
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.rawLabel || label}
                    rows={(payload) => [{
                      key: 'v',
                      name: payload[0].payload.isCurrent ? 'So far' : 'Volume',
                      value: formatKg(payload[0].value),
                      color: payload[0].payload.isCurrent ? 'var(--series-1)' : 'var(--data-muted)'
                    }]}
                  />
                )}
              />
              <Bar dataKey="totalVolume" radius={[4, 4, 0, 0]} maxBarSize={28} {...chartAnimation}>
                {chartData.map((d) => (
                  <Cell key={d.rawLabel} fill={d.isCurrent ? 'var(--series-1)' : 'var(--data-muted)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. This week, per muscle group or per exercise */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Hard sets this week</h3>
          <span className="card-sub">Most growth happens between {BAND_LO} and {BAND_HI} a week per muscle</span>
        </div>
        <div className="sub-tabs">
          <button
            type="button"
            className={`sub-tab-btn ${breakdownView === 'muscleGroups' ? 'active' : ''}`}
            onClick={() => setBreakdownView('muscleGroups')}
          >
            Muscle groups
          </button>
          <button
            type="button"
            className={`sub-tab-btn ${breakdownView === 'exercises' ? 'active' : ''}`}
            onClick={() => setBreakdownView('exercises')}
          >
            Exercises
          </button>
        </div>

        {breakdownView === 'muscleGroups' ? (
          <div className="mg-list">
            {MUSCLE_GROUPS.map((mg) => {
              const count = currentWeekData.muscleGroupSets?.[mg] || 0;
              const vol = currentWeekData.muscleGroupVolume?.[mg] || 0;

              // Only render if sets are logged or the library trains this group
              if (count === 0 && !trainedGroups.has(mg)) return null;

              return (
                <div key={mg} className="mg-row">
                  <div className="mg-row-head">
                    <div className="mg-row-titles">
                      <span className="mg-name">{mg}</span>
                      <span className={`mg-status${count > BAND_HI ? ' is-over' : count >= BAND_LO ? ' is-optimal' : ''}`}>
                        {statusLabel(count)}
                      </span>
                    </div>
                    <div className="mg-figures">
                      <span className="mg-count">{count}<span className="unit">set{count === 1 ? '' : 's'}</span></span>
                      <span className="mg-volume">{formatKg(vol)}</span>
                    </div>
                  </div>
                  <SetScale count={count} />
                </div>
              );
            })}
            <div className="set-scale-labels" aria-hidden="true">
              <span style={{ left: 0 }}>0</span>
              <span style={{ left: `${((BAND_LO - 0.5) / SCALE_MAX) * 100}%` }}>{BAND_LO}</span>
              <span style={{ left: `${((BAND_HI - 0.5) / SCALE_MAX) * 100}%` }}>{BAND_HI}</span>
            </div>
          </div>
        ) : (
          <div className="mg-list">
            {getDisplayExercises(orderedExercises, history).map((ex) => {
              const vol = currentWeekData.exerciseVolume[ex.id] || 0;
              const sets = currentWeekData.exerciseSets[ex.id] || 0;
              // Hide history-only exercises with no activity this week to avoid clutter
              if (ex.isHistorical && sets === 0 && vol === 0) return null;
              return (
                <div key={ex.id} className="mg-row">
                  <div className="mg-row-head">
                    <div className="mg-row-titles">
                      <span className="mg-name">{ex.name}</span>
                      <span className="mg-status">{sets} hard set{sets !== 1 ? 's' : ''} logged</span>
                    </div>
                    <span className="mg-volume is-strong">{formatKg(vol)}</span>
                  </div>
                  <AccretionStrip points={accretionByExercise[ex.id]?.points} height={18} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. What to do next time, per exercise */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Next time</h3>
          <span className="card-sub">From your last session of each exercise</span>
        </div>
        <div className="hint-list">
          {orderedExercises.map((ex) => {
            // Same clock as the workout screen passes, so after a layoff both
            // judge against the same session instead of disagreeing.
            const suggestion = getProgressionSuggestion(ex.id, history, ex, nowTs);
            return (
              <div key={ex.id} className="hint-row">
                <div className="hint-row-head">
                  <span className="hint-row-name">{ex.name}</span>
                  {suggestion.action && (
                    <span className={`hint-row-action${suggestion.type === 'weight' ? ' is-brass' : ''}`}>
                      {suggestion.type === 'weight' && <TrendingUp size={14} aria-hidden="true" />}
                      {sentenceCase(suggestion.action)}
                    </span>
                  )}
                </div>
                <p className="hint-row-text">{suggestion.text}</p>
              </div>
            );
          })}
        </div>
        <p className="footnote">
          Weight goes up only when every working set reached the top of its rep
          range at a manageable effort (last set RPE 9 or less, or at least 1 rep
          in reserve).
        </p>
      </div>
    </div>
  );
}
