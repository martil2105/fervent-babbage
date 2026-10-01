import { useEffect, useId } from 'react';

/**
 * One confirm dialog for every "are you sure?" in the app, so they all look,
 * read and behave the same: the safe choice is on the left and takes focus,
 * Escape and a tap on the scrim both back out, and the destructive action is
 * named for what it does ("Delete session", not "OK").
 */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger', // 'danger' | 'primary'
  busy = false,
  onConfirm,
  onCancel
}) {
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel?.();
      }}
    >
      <div
        className="modal-content"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
      >
        <h3 id={titleId} className="modal-title">
          {title}
        </h3>
        {children && (
          <div id={bodyId} className="modal-body">
            {children}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
