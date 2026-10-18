// Strategy card for the "Explore Different Strategies" section, with a
// "copy strategy to watchlist" dropdown wired to POST /api/watchlists/:id/copy-strategy.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWatchlistActions } from '../state.jsx';
import { copyStrategyToWatchlist } from '../api.js';
import { fmtPct } from '../format.js';

function CopyStrategySelect({ slug, name }) {
  const { state } = useWatchlistActions();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const onChange = async (e) => {
    const id = e.target.value;
    e.target.value = '';
    if (!id) return;
    setBusy(true);
    try {
      await copyStrategyToWatchlist(id, slug);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* state API unreachable; ignore */ }
    setBusy(false);
  };

  return (
    <select className="select copy-select" defaultValue="" disabled={busy} onChange={onChange}
      title={`Copy the ${name} picks into a watchlist`}>
      <option value="" disabled>
        {copied ? 'Copied ✓' : 'Copy to watchlist…'}
      </option>
      {state.watchlists.length === 0 && (
        <option value="" disabled>Create a watchlist first</option>
      )}
      {state.watchlists.map((w) => (
        <option key={w.id} value={w.id}>{w.name}</option>
      ))}
    </select>
  );
}

export default function StrategyCard({ strategy }) {
  const s = strategy;
  return (
    <div className="strat-card">
      <div className="head">
        <span className="code-badge">{s.code}</span>
        <span className="nm">{s.name}</span>
      </div>
      <div className="strat-meta">
        <span className="tag tag-1">{s.market}</span>
        <span>vs {s.benchmark}</span>
        <span>·</span>
        <span>{s.yearStart}–{new Date().getFullYear()}</span>
        <span>·</span>
        <span>Monthly</span>
        {s.dataSource && (
          <span className={`tag ${s.dataSource === 'real' ? 'tag-live' : 'tag-sim'}`}
            title={s.dataSource === 'real'
              ? 'Backtested on real historical market prices'
              : 'Offline: simulated price history (no real data available)'}>
            {s.dataSource === 'real' ? 'REAL MARKET DATA' : 'SIMULATED'}
          </span>
        )}
      </div>
      <p className="desc">{s.description}</p>
      <div className="strat-returns">
        <div className="r">
          <div className="k">1Y</div>
          <div className={s.return1y >= 0 ? 'pos' : 'neg'}>{fmtPct(s.return1y)}</div>
        </div>
        <div className="r">
          <div className="k">5Y</div>
          <div className={s.return5y >= 0 ? 'pos' : 'neg'}>{fmtPct(s.return5y)}</div>
        </div>
        <div className="r">
          <div className="k">Max</div>
          <div className={s.returnMax >= 0 ? 'pos' : 'neg'}>{fmtPct(s.returnMax)}</div>
        </div>
      </div>
      <div className="foot">
        <Link className="btn btn-primary btn-sm" to={`/propicks/${s.slug}`}>View stocks</Link>
        <CopyStrategySelect slug={s.slug} name={s.name} />
      </div>
    </div>
  );
}
