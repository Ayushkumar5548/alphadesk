// Small shared UI states: loading spinner, empty state, error box.

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" aria-hidden="true" />
      <span className="muted" style={{ marginTop: 12 }}>{label}</span>
    </div>
  );
}

export function EmptyState({ icon = '◎', title, hint, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {hint && <p className="muted" style={{ margin: 0 }}>{hint}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  const msg = typeof error === 'string' ? error : (error.message || 'Something went wrong.');
  return (
    <div className="error-box">
      {msg}
      {onRetry && (
        <>
          {' '}
          <button className="linklike" onClick={onRetry}>Retry</button>
        </>
      )}
    </div>
  );
}
