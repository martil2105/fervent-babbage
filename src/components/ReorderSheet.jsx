import { ChevronUp, ChevronDown, X, Trash2 } from 'lucide-react';

/**
 * A short list you can put in order: up/down per row, optional remove, and
 * room for an action at the bottom. Used for today's workout (changes stay in
 * that workout) and for a session's saved order in Settings.
 *
 * Arrows rather than drag handles on purpose: dragging inside a scrolling
 * sheet on a phone fights the scroll, and a tap is exact.
 */
export default function ReorderSheet({
  title,
  subtitle,
  items = [], // [{ id, name, meta }]
  onMove,
  onRemove,
  removeLabel = 'Remove',
  onClose,
  footer
}) {
  return (
    <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-header">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="sheet-body">
          {subtitle && <p className="sheet-lead">{subtitle}</p>}

          {items.length > 0 ? (
            <div className="pick-list">
              {items.map((item, i) => (
                <div key={item.id} className="pick-row reorder-row">
                  <span className="reorder-index" aria-hidden="true">{i + 1}</span>
                  <span className="pick-row-main">
                    <span className="pick-row-name">{item.name}</span>
                    {item.meta && <span className="pick-row-meta">{item.meta}</span>}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => onMove(item.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${item.name} up`}
                  >
                    <ChevronUp size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => onMove(item.id, 1)}
                    disabled={i === items.length - 1}
                    aria-label={`Move ${item.name} down`}
                  >
                    <ChevronDown size={18} />
                  </button>
                  {onRemove && (
                    <button
                      type="button"
                      className="icon-btn is-danger"
                      onClick={() => onRemove(item.id)}
                      aria-label={`${removeLabel} ${item.name}`}
                    >
                      {removeLabel === 'Remove' ? <X size={16} /> : <Trash2 size={15} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-center">Nothing here yet.</p>
          )}

          {footer}
        </div>
      </div>
    </div>
  );
}
