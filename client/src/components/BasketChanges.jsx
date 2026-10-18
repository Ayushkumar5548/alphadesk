// Monthly basket-changes feed: what the AI added and removed at each rebalance,
// why, and — for sells — the profit/loss booked while held plus how the stock
// performed after it left the basket (was the exit smart or costly?).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtPct } from '../format.js';

function monthLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const REASON_TONE = {
  'score-collapse': 'tag-2',
  'relative-fade': 'tag-1',
  'rank-fade': 'tag-1',
  'trend-break': 'tag-5',
  breakdown: 'tag-5',
  'short-tenure': 'tag-5',
  'data-gap': 'tag-3',
  'rebalance-floor': 'tag-3',
  rotation: 'tag-0',
  opening: 'tag-4',
};

function ChangeRow({ c, kind }) {
  const code = c.code || c.reasonCode || 'change';
  const tone = REASON_TONE[code] || 'tag-1';
  const linkTo = `/stock/${encodeURIComponent(c.ticker)}`;
  return (
    <div className="bc-row">
      <div className="bc-head">
        <Link to={linkTo} className="bc-ticker">{c.ticker}</Link>
        <span className="bc-name">{c.name}</span>
        <span className={`tag ${tone}`}>
          {kind === 'add' ? 'Added' : 'Removed'} · {code.replace(/-/g, ' ')}
        </span>
      </div>
      <p className="bc-reason">{c.reason}</p>
      {kind === 'remove' && (
        <div className="bc-stats">
          <span className="bc-stat">
            <span className="bc-k">Held</span>
            <span className="bc-v">{c.holdingMonths} mo</span>
          </span>
          <span className="bc-stat">
            <span className="bc-k">Return while held</span>
            <span className={`bc-v ${c.totalReturnPct >= 0 ? 'pos' : 'neg'}`}>{fmtPct(c.totalReturnPct)}</span>
          </span>
          {c.postExitReturnPct != null && (
            <>
              {c.relativeExitPct != null && (
                <>
                  <span className="bc-stat">
                    <span className="bc-k">vs basket after exit</span>
                    <span className={`bc-v ${c.relativeExitPct > 0 ? 'neg' : 'pos'}`}>{fmtPct(c.relativeExitPct)}</span>
                  </span>
                  <span className={`bc-verdict ${c.relativeVerdict === 'good-exit' ? 'pos' : 'neg'}`}>
                    {c.relativeVerdict === 'good-exit' ? '✓ Value-adding exit' : '✗ Costly exit'}
                  </span>
                </>
              )}
              <span className="bc-stat">
                <span className="bc-k">Would be now</span>
                <span className={`bc-v ${c.heldValuePct >= 0 ? 'pos' : 'neg'}`}>{fmtPct(c.heldValuePct)}</span>
              </span>
              <span className="bc-stat">
                <span className="bc-k">Booked vs held</span>
                <span className={`bc-v ${c.postExitReturnPct >= 0 ? 'pos' : 'neg'}`}>{fmtPct(c.postExitReturnPct)}</span>
              </span>
            </>
          )}
        </div>
      )}
      {kind === 'add' && (
        <div className="bc-stats">
          <span className="bc-stat">
            <span className="bc-k">AI score at entry</span>
            <span className="bc-v">{c.score}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export default function BasketChanges({ additions = [], removals = [], exitPnL }) {
  const [filter, setFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);

  const months = useMemo(() => {
    const map = new Map();
    const put = (iso, kind, item) => {
      if (!map.has(iso)) map.set(iso, { month: iso, adds: [], removes: [] });
      map.get(iso)[kind].push(item);
    };
    for (const a of additions) put(a.dateAdded, 'adds', a);
    for (const r of removals) put(r.dateRemoved, 'removes', r);
    return [...map.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
  }, [additions, removals]);

  const q = search.trim().toLowerCase();
  const matches = (it) => !q || it.ticker.toLowerCase().includes(q) || (it.name || '').toLowerCase().includes(q);

  // Restrict by month when one is picked, otherwise show the newest 6 until
  // the user expands (keeps the panel short by default).
  const base = monthFilter === 'all'
    ? (expanded ? months : months.slice(0, 6))
    : months.filter((m) => m.month === monthFilter);

  const filtered = base
    .map((m) => ({
      ...m,
      adds: (filter === 'remove' ? [] : m.adds).filter(matches),
      removes: (filter === 'add' ? [] : m.removes).filter(matches),
    }))
    .filter((m) => m.adds.length || m.removes.length);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Monthly Basket Changes</h2>
        {exitPnL && (
          <span className="muted" style={{ fontSize: 12.5 }}>
            {exitPnL.relGood != null || exitPnL.relCostly != null ? (
              <>
                value-adding exits <span className="pos">{exitPnL.relGood || 0}</span>
                {' · '}
                costly exits <span className="neg">{exitPnL.relCostly || 0}</span>
                {` (vs the basket we rotated into; booked-vs-held ${exitPnL.good || 0}/${exitPnL.costly || 0})`}
              </>
            ) : (
              <>
                booked-vs-held exits <span className="pos">{exitPnL.good || 0} good</span>
                {' · '}
                <span className="neg">{exitPnL.costly || 0} costly</span>
              </>
            )}
          </span>
        )}
        <div className="spacer" />
        <div className="bc-filters">
          {[['all', 'All'], ['add', 'Additions'], ['remove', 'Removals']].map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`bc-filter ${filter === k ? 'on' : ''}`}
              onClick={() => setFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bc-toolbar">
        <label className="bc-tool">
          <span className="muted">Month</span>
          <select className="select" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            <option value="all">All months ({months.length})</option>
            {months.map((m) => <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>)}
          </select>
        </label>
        <input
          className="input"
          placeholder="Filter by ticker or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 180 }}
        />
        {(monthFilter !== 'all' || q || filter !== 'all') && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setMonthFilter('all'); setSearch(''); setFilter('all'); }}
          >
            Clear
          </button>
        )}
        <span className="muted" style={{ fontSize: 12 }}>
          showing {filtered.length} of {months.length} month{months.length === 1 ? '' : 's'}
        </span>
      </div>

      {filtered.length === 0 && <p className="muted">No basket changes match this filter.</p>}

      {filtered.map((m) => (
        <div className="bc-month" key={m.month}>
          <div className="bc-month-head">
            <span className="bc-month-title">{monthLabel(m.month)}</span>
            <span className="muted">
              {m.adds.length} added · {m.removes.length} removed
            </span>
          </div>
          <div className="bc-list">
            {m.removes.map((r, i) => <ChangeRow key={`r-${r.ticker}-${i}`} c={r} kind="remove" />)}
            {m.adds.map((a, i) => <ChangeRow key={`a-${a.ticker}-${i}`} c={a} kind="add" />)}
          </div>
        </div>
      ))}

      {monthFilter === 'all' && months.length > 6 && (
        <button type="button" className="btn btn-sm bc-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show recent only' : `Show all ${months.length} rebalance months`}
        </button>
      )}
    </div>
  );
}
