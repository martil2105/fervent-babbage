/**
 * The one tooltip every chart uses: a small surface card, the label in
 * secondary ink and each value in primary ink next to a swatch of its series.
 * Text wears text colours; the swatch carries the series identity.
 *
 * rows: (payload) => [{ key, name, value, color, dashed }]
 */
export default function ChartTooltip({ active, payload, label, rows, labelFormatter }) {
  if (!active || !payload || payload.length === 0) return null;
  const items = rows
    ? rows(payload)
    : payload.map((p) => ({ key: p.dataKey, name: p.name, value: p.value, color: p.color }));

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{labelFormatter ? labelFormatter(label, payload) : label}</div>
      {items.map((item) => (
        <div key={item.key} className="chart-tooltip-row">
          {item.color && (
            <span
              className={`chart-swatch${item.dashed ? ' is-dashed' : ''}`}
              style={{ '--swatch': item.color }}
              aria-hidden="true"
            />
          )}
          <span className="chart-tooltip-name">{item.name}</span>
          <span className="chart-tooltip-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
