/**
 * Accretion strip — one hairline tick per session, oldest at the left, tick
 * height standing for the top set of that session.
 *
 * It is ambient: never interactive, never labelled per-tick. The point is that
 * a year of training is legible in 100px without anyone having to open a chart,
 * and that the only mark carrying colour is the one where a record was set.
 *
 * Ticks sit in a fixed number of slots with the newest at the right, so a
 * lifter with four sessions gets four marks and three-quarters of empty rather
 * than a sparse strip stretched to fill the width — and so strips in a list
 * line up with each other and can be compared at a glance.
 *
 * Drawn with a stretched viewBox so it fills whatever box it is given, with
 * non-scaling strokes so the ticks stay hairlines at any width.
 */
export default function AccretionStrip({ points, height = 22, label, className, slots = 12 }) {
  // One tick is a dot, not a history.
  if (!points || points.length < 2) return null;

  const n = points.length;
  const lanes = Math.max(n, slots);
  const pitch = 100 / lanes;
  const latest = points[n - 1];
  const records = points.filter((p) => p.isRecord).length;

  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', minWidth: 0 }}
    >
      {label && (
        <span
          className="text-xs text-muted"
          style={{ whiteSpace: 'nowrap', lineHeight: 1, paddingBottom: '1px' }}
        >
          {label}
        </span>
      )}
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        aria-label={
          `${n} session${n === 1 ? '' : 's'}, most recent top set ${latest.weight} kg` +
          (records ? ', personal best marked' : '')
        }
        style={{ display: 'block', overflow: 'visible', flex: 1, minWidth: 0 }}
      >
        {points.map((p, i) => {
          // Right-aligned: the newest session always lands in the last slot.
          const x = (lanes - n + i + 0.5) * pitch;
          const h = Math.max(2, p.level * (height - 3));
          return (
            <line
              key={p.timestamp ?? i}
              x1={x}
              y1={height - 1}
              x2={x}
              y2={height - 1 - h}
              stroke={p.isRecord ? 'var(--accent)' : 'var(--text-disabled)'}
              strokeWidth={p.isRecord ? 1.75 : 1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        <line
          x1="0"
          y1={height - 0.5}
          x2="100"
          y2={height - 0.5}
          stroke="var(--border-color)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
