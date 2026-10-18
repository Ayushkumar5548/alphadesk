// Live market-data status pill for the top bar. Shows whether quotes and
// fundamentals come from Yahoo Finance and how complete the background fill
// is; clicking opens a small detail popover with a "Refresh now" action.
import { useEffect, useRef, useState } from 'react';
import { useMarket } from '../market.jsx';

function relTime(iso, now) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function localTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
}

export default function MarketStatus() {
  const { status, refresh } = useMarket();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef(null);

  // Keep the relative "updated Xs ago" ticking between polls.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const live = Boolean(status?.enabled && status?.online);
  const total = status?.totals?.stocks || 0;
  const priceDone = status?.coverage?.price ?? status?.quotes?.done ?? 0;
  const fundDone = status?.coverage?.fundamentals ?? status?.fundamentals?.done ?? 0;
  const histDone = status?.coverage?.history ?? status?.history?.done ?? 0;
  const complete = total > 0 && priceDone >= total;

  const tone = status == null ? 'filling' : (!live ? 'sim' : complete ? 'live' : 'filling');
  const label = status == null
    ? 'CONNECTING…'
    : !live
      ? 'SIMULATED'
      : complete
        ? `LIVE · ${status?.source || 'Yahoo Finance'}`
        : `LIVE · loading ${priceDone}/${total}`;

  const asOf = status?.quotes?.asOf || null;
  const rel = relTime(asOf, now);

  const onRefresh = async () => {
    setBusy(true);
    try { await refresh(); } finally { setBusy(false); }
  };

  return (
    <div className="mkt" ref={rootRef}>
      <button
        type="button"
        className={`mkt-pill ${tone}`}
        onClick={() => setOpen((o) => !o)}
        title="Market data status"
        aria-expanded={open}
      >
        <span className="mkt-dot" aria-hidden="true" />
        {label}
      </button>
      {rel && (
        <span className="mkt-updated muted" title={`Quotes as of ${localTime(asOf)}`}>updated {rel}</span>
      )}

      {open && (
        <div className="mkt-pop" role="dialog" aria-label="Market data status">
          <div className="mkt-pop-head">
            <span className={`mkt-dot ${tone}`} aria-hidden="true" />
            <b>{live ? (status?.source || 'Yahoo Finance') : 'Simulated baseline'}</b>
          </div>
          <dl className="mkt-rows">
            <div>
              <dt>Market state</dt>
              <dd>{status?.marketState || (live ? (complete ? 'Live feed · complete' : 'Live feed · filling') : 'Simulated baseline')}</dd>
            </div>
            <div>
              <dt>Price coverage</dt>
              <dd className="mono">{total ? `${priceDone} / ${total}` : '—'}</dd>
            </div>
            <div>
              <dt>Fundamentals</dt>
              <dd className="mono">{total ? `${fundDone} / ${total}` : '—'}</dd>
            </div>
            <div>
              <dt>History</dt>
              <dd className="mono">{total ? `${histDone} / ${total}` : '—'}</dd>
            </div>
            <div>
              <dt>Last refresh</dt>
              <dd>
                {status?.lastRefreshAt
                  ? `${localTime(status.lastRefreshAt)} · ${relTime(status.lastRefreshAt, now) || ''}`.trim()
                  : '—'}
              </dd>
            </div>
            {status?.lastError ? (
              <div>
                <dt className="neg">Last error</dt>
                <dd className="neg">{status.lastError}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mkt-note">
            Prices &amp; fundamentals: Yahoo Finance (may be delayed). Picks, ratings and
            fair-value models are AlphaDesk&rsquo;s own model output computed from this data.
          </p>
          <div className="mkt-actions">
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={onRefresh}>
              {busy ? 'Refreshing…' : 'Refresh now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
