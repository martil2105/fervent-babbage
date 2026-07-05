/**
 * PUSH Quest — design-system primitives.
 *
 * Faithful React recreations of the handoff's reference components
 * (Card, Button, Badge, Stepper, ProgressBar) plus a themed SubNav segmented
 * control. All colour/spacing comes from CSS variables defined on the
 * `.push-quest` scope (see pushquest.css), so these render in the Duolingo tone
 * inside the game and never depend on the base app's tokens.
 */

/* -------------------------------------------------------------------------- */
/* Card — primary content surface.                                            */
/* -------------------------------------------------------------------------- */
export function Card({ title, action, children, style = {}, bodyStyle = {}, ...rest }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        transition: 'var(--transition)',
        ...style,
      }}
      {...rest}
    >
      {(title || action) && (
        <div
          style={{
            margin: 0,
            fontSize: 'var(--text-h3)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-primary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{title}</span>
          {action}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', ...bodyStyle }}>
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Button — pill action with a colored "lift" shadow and press-scale.         */
/* -------------------------------------------------------------------------- */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  style = {},
  ...rest
}) {
  const base = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--weight-semibold)',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'var(--transition)',
    opacity: disabled ? 0.5 : 1,
    lineHeight: 1,
  };
  const sizes = {
    md: { fontSize: 'var(--text-body)', padding: '10px 16px', borderRadius: 'var(--radius-md)' },
    sm: { fontSize: 'var(--text-xs)', padding: '6px 12px', borderRadius: 'var(--radius-sm)' },
  };
  const variants = {
    primary: { backgroundColor: 'var(--accent)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-accent)' },
    secondary: { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' },
    success: { backgroundColor: 'var(--success)', color: '#ffffff', boxShadow: 'var(--shadow-success)' },
    danger: { backgroundColor: 'var(--error-glow)', color: 'var(--error)', border: '1px solid rgba(255, 75, 75, 0.25)' },
    ghost: { background: 'transparent', color: 'var(--text-secondary)' },
  };
  const press = (v) => (e) => { if (!disabled) e.currentTarget.style.transform = v; };
  return (
    <button
      type="button"
      disabled={disabled}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      onMouseDown={press('scale(var(--press-scale))')}
      onMouseUp={press('scale(1)')}
      onMouseLeave={press('scale(1)')}
      onTouchStart={press('scale(var(--press-scale))')}
      onTouchEnd={press('scale(1)')}
      {...rest}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge — small pill label tinted by tone.                                   */
/* -------------------------------------------------------------------------- */
export function Badge({ children, tone = 'neutral', style = {}, ...rest }) {
  const tones = {
    neutral: { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' },
    accent: { backgroundColor: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--border-accent)' },
    success: { backgroundColor: 'var(--success-glow)', color: 'var(--success)', border: '1px solid var(--border-accent)' },
    warning: { backgroundColor: 'var(--warning-glow)', color: 'var(--warning)', border: '1px solid rgba(255, 200, 0, 0.3)' },
    error: { backgroundColor: 'var(--error-glow)', color: 'var(--error)', border: '1px solid rgba(255, 75, 75, 0.3)' },
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: 'var(--text-2xs)',
        fontWeight: 'var(--weight-semibold)',
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        width: 'fit-content',
        lineHeight: 1.4,
        ...tones[tone],
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Stepper — −/+ flanked value field. Whole numbers only (no decimals).       */
/* -------------------------------------------------------------------------- */
export function Stepper({ value, onChange, step = 1, min = 0, unit, style = {}, ...rest }) {
  const commit = (next) => onChange && onChange(Math.max(min, Math.round(next)));
  const onType = (raw) => {
    if (raw === '') return onChange && onChange('');
    const n = Math.round(parseFloat(raw));
    onChange && onChange(Number.isNaN(n) ? 0 : Math.max(min, n));
  };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        height: '38px',
        ...style,
      }}
      {...rest}
    >
      <button type="button" onClick={() => commit((parseFloat(value) || 0) - step)} style={stepBtn}>−</button>
      <input
        type="number"
        inputMode="numeric"
        step={step}
        value={value}
        onChange={(e) => onType(e.target.value)}
        style={{
          width: '100%',
          minWidth: 0,
          background: 'none',
          border: 'none',
          color: 'var(--text-primary)',
          textAlign: 'center',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-body-lg)',
          fontWeight: 'var(--weight-semibold)',
          fontVariantNumeric: 'tabular-nums',
          padding: 0,
          outline: 'none',
        }}
      />
      {unit && <span style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)', fontWeight: 500, marginRight: '4px' }}>{unit}</span>}
      <button type="button" onClick={() => commit((parseFloat(value) || 0) + step)} style={stepBtn}>+</button>
    </div>
  );
}

const stepBtn = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-body-lg)',
  fontWeight: 'var(--weight-semibold)',
  width: '28px',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
};

/* -------------------------------------------------------------------------- */
/* ProgressBar — thin fill indicator.                                         */
/* -------------------------------------------------------------------------- */
export function ProgressBar({ value = 0, max = 100, tone = 'accent', height = 4, style = {}, ...rest }) {
  const tones = {
    accent: 'var(--accent)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    error: 'var(--error)',
    muted: 'var(--text-muted)',
  };
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      style={{
        height: `${height}px`,
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '2px',
        overflow: 'hidden',
        display: 'flex',
        ...style,
      }}
      {...rest}
    >
      <div
        style={{
          width: `${pct}%`,
          backgroundColor: tones[tone] || tones.accent,
          borderRadius: '2px',
          transition: 'width var(--duration-med) var(--ease-spring)',
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SubNav — themed 3-tab segmented control for Quest / Duel / League.         */
/* -------------------------------------------------------------------------- */
export function SubNav({ items = [], active, onChange, style = {} }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '6px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        padding: '4px',
        ...style,
      }}
    >
      {items.map((item) => {
        const on = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange && onChange(item.id)}
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '9px 6px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-2xs)',
              fontWeight: 'var(--weight-semibold)',
              backgroundColor: on ? 'var(--accent-glow)' : 'transparent',
              color: on ? 'var(--accent)' : 'var(--text-secondary)',
              transition: 'var(--transition)',
            }}
          >
            <span style={{ display: 'flex', transform: on ? 'translateY(-1px)' : 'none', transition: 'var(--transition)' }}>
              {item.icon}
            </span>
            <span>{item.label}</span>
            {item.dot && (
              <span
                style={{
                  position: 'absolute',
                  top: '5px',
                  right: 'calc(50% - 26px)',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--warning)',
                  border: '2px solid var(--bg-secondary)',
                  boxSizing: 'content-box',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
