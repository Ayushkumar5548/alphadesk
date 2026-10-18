// Screener: filter builder rows with Any/All combine, match counter,
// sortable columns, column chooser, saved screeners and share-links
// (state encoded as base64 JSON in the URL ?q= parameter).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getScreenerFilters, runScreener } from '../api.js';
import { useAppState } from '../state.jsx';
import {
  fmtNum, fmtPct, fmtCompact, fmtPrice, ratingClass, titleCase,
} from '../format.js';
import { Spinner, EmptyState } from '../components/UI.jsx';
import { PlusIcon, TrashIcon, LinkIcon } from '../components/Icons.jsx';

const DEFAULT_COLUMNS = [
  'ticker', 'name', 'sector', 'price', 'changePct', 'marketCap', 'pe',
  'dividendYield', 'roe', 'revenueGrowth', 'momentum3m', 'fairValue',
  'upsidePct', 'beta', 'score', 'rating',
];
const FALLBACK_FILTERS = [
  { slug: 'marketCap', label: 'Market Cap', type: 'number', ops: ['is greater than', 'is less than', 'is between'], units: ['USD'], choices: [] },
  { slug: 'pe', label: 'P/E Ratio', type: 'number', ops: ['is greater than', 'is less than'], units: ['x'], choices: [] },
  { slug: 'dividendYield', label: 'Dividend Yield', type: 'percent', ops: ['is greater than', 'is less than'], units: ['percent'], choices: [] },
  { slug: 'roe', label: 'Return on Equity', type: 'percent', ops: ['is greater than', 'is less than'], units: ['percent'], choices: [] },
  { slug: 'revenueGrowth', label: 'Revenue Growth', type: 'percent', ops: ['is greater than', 'is less than'], units: ['percent'], choices: [] },
  { slug: 'momentum3m', label: '3-Month Momentum', type: 'percent', ops: ['is greater than', 'is less than'], units: ['percent'], choices: [] },
  { slug: 'sector', label: 'Sector', type: 'select', ops: ['is', 'is not'], units: [], choices: ['Technology', 'Healthcare', 'Financial Services', 'Energy', 'Consumer Defensive', 'Consumer Cyclical', 'Industrials', 'Basic Materials', 'Communication Services', 'Utilities'] },
  { slug: 'rating', label: 'AI Rating', type: 'select', ops: ['is', 'is not'], units: [], choices: ['outperform', 'neutral', 'underperform'] },
];
const PCT_COLS = new Set(['changePct', 'dividendYield', 'roe', 'roa', 'netMargin', 'grossMargin', 'opMargin',
  'revenueGrowth', 'epsGrowth', 'momentum1m', 'momentum3m', 'momentum6m', 'momentum12m', 'upsidePct']);
const MONEY_COLS = new Set(['price', 'fairValue']);
const COMPACT_COLS = new Set(['marketCap']);
const PAGE_SIZE = 25;

let uid = 0;
const newRow = () => ({ id: ++uid });

// Canonical API op codes -> human labels for the dropdown.
const OP_LABELS = {
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  eq: 'equals',
  between: 'is between',
  in: 'is one of',
  notIn: 'is not one of',
  is: 'is',
  isNot: 'is not',
};

// Editable display row -> canonical filter payload (numbers, arrays, units).
function toPayload(row) {
  const { slug, op } = row;
  const value = row.value;
  if (op === 'in' || op === 'notIn') {
    const arr = Array.isArray(value) ? value : String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return { slug, op, value: arr };
  }
  if (op === 'between') {
    const arr = Array.isArray(value) ? value : String(value ?? '').split(/[,\s]+/).filter(Boolean);
    return { slug, op, value: arr.slice(0, 2).map(Number) };
  }
  if (op === 'is' || op === 'isNot') return { slug, op, value };
  const out = { slug, op, value: Number(value) };
  if (row.unit) out.unit = row.unit;
  return out;
}

// Canonical filter payload -> editable display row.
function toRow(f) {
  const row = { ...newRow(), slug: f.slug, op: f.op, unit: f.unit };
  row.value = Array.isArray(f.value) ? f.value.join(', ') : f.value;
  return row;
}

function b64encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function b64decode(str) {
  const bin = atob(str);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function cellFormat(slug, v, currency) {
  if (v == null || v === '') return <span className="muted">—</span>;
  if (slug === 'ticker') return <span className="mono" style={{ fontWeight: 700 }}>{v}</span>;
  if (slug === 'rating') return <span className={`rpill ${ratingClass(v)}`}>{v}</span>;
  if (PCT_COLS.has(slug)) return <span className={v > 0 ? 'pos' : v < 0 ? 'neg' : ''}>{fmtPct(v)}</span>;
  if (MONEY_COLS.has(slug)) return <span className="mono">{fmtPrice(v, currency)}</span>;
  if (COMPACT_COLS.has(slug)) return <span className="mono">{fmtCompact(v)}</span>;
  if (typeof v === 'number') return <span className="mono">{fmtNum(v)}</span>;
  return v;
}

export default function Screener() {
  const location = useLocation();
  const { state: appState, update } = useAppState();

  const [catalog, setCatalog] = useState(null); // {filters, columns}
  const [filters, setFilters] = useState([{ ...newRow(), slug: 'marketCap', op: 'gt', value: '' }]);
  const [combine, setCombine] = useState('and');
  const [sort, setSort] = useState({ slug: 'score', direction: 'desc' });
  const [visibleCols, setVisibleCols] = useState(DEFAULT_COLUMNS);
  const [saveName, setSaveName] = useState(null);
  const [rows, setRows] = useState([]);
  const [matched, setMatched] = useState(0);
  const [universeTotal, setUniverseTotal] = useState(0);
  const [counterText, setCounterText] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [status, setStatus] = useState(null); // transient messages
  const colMenuRef = useRef(null);

  // Load filter catalog (+ apply shared / saved screener state from the URL).
  useEffect(() => {
    let alive = true;
    getScreenerFilters()
      .then((r) => {
        if (!alive) return;
        const filtersCat = Array.isArray(r) ? r : (r.filters || FALLBACK_FILTERS);
        setCatalog({ filters: filtersCat.length ? filtersCat : FALLBACK_FILTERS, columns: r.columns || DEFAULT_COLUMNS });
      })
      .catch(() => { if (alive) setCatalog({ filters: FALLBACK_FILTERS, columns: DEFAULT_COLUMNS }); });

    const shared = new URLSearchParams(location.search).get('q');
    if (shared) {
      try {
        applySharedState(b64decode(shared));
      } catch { /* malformed link: fall through to defaults */ }
    } else if (location.state?.loadScreener) {
      applySharedState(location.state.loadScreener);
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applySharedState(s) {
    if (Array.isArray(s.filters) && s.filters.length) {
      setFilters(s.filters.map(toRow));
    }
    if (s.combine) setCombine(s.combine);
    if (s.sort) setSort(s.sort);
    if (Array.isArray(s.columns) && s.columns.length) setVisibleCols(s.columns);
    setStatus('Loaded shared screener state');
  }

  // Close the column menu on outside click.
  useEffect(() => {
    const onDown = (e) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setColMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Run the screen whenever criteria change (debounced).
  const activeFilters = useMemo(
    () => filters
      .filter((f) => f.slug && (Array.isArray(f.value) ? f.value.length > 0 : String(f.value ?? '') !== ''))
      .map(toPayload),
    [filters],
  );
  useEffect(() => {
    if (!catalog) return undefined;
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      runScreener({
        combine,
        filters: activeFilters,
        sort: sort && sort.slug ? [{ slug: sort.slug, direction: sort.direction }] : [],
        columns: visibleCols,
        page,
        pageSize: PAGE_SIZE,
      })
        .then((r) => {
          if (!alive) return;
          const rs = r.rows || [];
          setRows(rs);
          const m = typeof r.matchedOfTotal === 'number'
            ? r.matchedOfTotal
            : (typeof r.total === 'number' ? r.total : rs.length);
          const t = typeof r.total === 'number' ? r.total : m;
          setMatched(m);
          setUniverseTotal(t);
          setCounterText(typeof r.matchedOfTotal === 'string'
            ? r.matchedOfTotal
            : `${fmtNum(m)} / ${fmtNum(t)}`);
        })
        .catch(() => { if (alive) { setRows([]); setCounterText('—'); } })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [catalog, combine, activeFilters, sort, visibleCols, page]);

  const filterDef = (slug) => catalog?.filters.find((f) => f.slug === slug);

  const setRow = (id, patch) => {
    setFilters((rowsPrev) => rowsPrev.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      const def = filterDef(next.slug);
      if (patch.slug && def) {
        next.op = def.ops[0];
        next.value = '';
        next.unit = (def.units || [])[0];
      }
      return next;
    }));
    setPage(1);
  };

  const share = async () => {
    const payload = {
      combine,
      filters: activeFilters,
      sort: sort && sort.slug ? sort : null,
      columns: visibleCols,
    };
    const url = `${window.location.origin}/screener?q=${encodeURIComponent(b64encode(payload))}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Share link copied to clipboard');
    } catch {
      window.location.href = url;
      setStatus('Share link loaded in the address bar');
    }
  };

  const saveScreener = () => {
    const name = (saveName || '').trim();
    if (!name) return;
    const entry = {
      id: `scr-${Date.now()}`,
      name,
      state: { combine, filters: activeFilters, sort, columns: visibleCols },
      createdAt: new Date().toISOString(),
    };
    update((s) => ({ ...s, savedScreeners: [...s.savedScreeners, entry] }));
    setSaveName(null);
    setStatus(`Saved "${name}" to Saved Work`);
  };

  const toggleSort = (slug) => {
    setSort((prev) => {
      if (prev && prev.slug === slug) {
        return prev.direction === 'asc' ? { slug, direction: 'desc' } : null;
      }
      return { slug, direction: 'asc' };
    });
    setPage(1);
  };

  const pages = Math.max(1, Math.ceil(matched / PAGE_SIZE));

  if (!catalog) return <Spinner label="Loading filter catalog…" />;

  return (
    <>
      <h1>Stock Screener</h1>
      <p className="page-sub">
        Build criteria from {catalog.filters.length} fundamental and technical fields, then sort the matches.
        Every feature is unlocked.
      </p>

      {status && (
        <div className="panel" style={{ padding: '10px 16px' }}>
          <span className="pos" style={{ fontSize: 13 }}>✓ {status}</span>
          <button className="linklike muted" style={{ marginLeft: 10 }} onClick={() => setStatus(null)}>dismiss</button>
        </div>
      )}

      <div className="panel">
        <div className="toolbar">
          <div className="seg" title="Combine filters">
            <button type="button" className={`seg-btn ${combine === 'and' ? 'on' : ''}`} onClick={() => { setCombine('and'); setPage(1); }}>Match all</button>
            <button type="button" className={`seg-btn ${combine === 'or' ? 'on' : ''}`} onClick={() => { setCombine('or'); setPage(1); }}>Match any</button>
          </div>
          <span className="match-count">
            {loading ? '…' : counterText}
          </span>
          <div className="spacer" />
          <div className="col-picker" ref={colMenuRef}>
            <button type="button" className="btn btn-sm" onClick={() => setColMenuOpen((v) => !v)}>
              Columns ({visibleCols.length})
            </button>
            {colMenuOpen && (
              <div className="col-menu">
                {(catalog.columns || DEFAULT_COLUMNS).map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={visibleCols.includes(c)}
                      onChange={() => setVisibleCols((prev) => (prev.includes(c)
                        ? (prev.length > 1 ? prev.filter((x) => x !== c) : prev)
                        : [...prev, c]))}
                    />
                    {titleCase(c)}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-sm" onClick={share}><LinkIcon /> Share link</button>
          <button type="button" className="btn btn-sm" onClick={() => setSaveName(`Screen ${new Date().toLocaleDateString()}`)}>Save screener</button>
          <button type="button" className="btn btn-sm" onClick={() => { setFilters([{ ...newRow(), slug: catalog.filters[0].slug, op: catalog.filters[0].ops[0], value: '' }]); setSort(null); setPage(1); }}>New</button>
        </div>

        {saveName !== null && (
          <div className="filter-row" style={{ marginTop: 8 }}>
            <input
              className="input"
              autoFocus
              value={saveName}
              placeholder="Screener name"
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveScreener();
                if (e.key === 'Escape') setSaveName(null);
              }}
            />
            <button type="button" className="btn btn-sm" onClick={saveScreener}>Save</button>
            <button type="button" className="linklike muted" onClick={() => setSaveName(null)}>Cancel</button>
          </div>
        )}

        {filters.map((row) => {
          const def = filterDef(row.slug) || catalog.filters[0];
          return (
            <div className="filter-row" key={row.id}>
              <select className="select" value={row.slug} onChange={(e) => setRow(row.id, { slug: e.target.value })}>
                {catalog.filters.map((f) => <option key={f.slug} value={f.slug}>{f.label}</option>)}
              </select>
              <select className="select" value={row.op} onChange={(e) => setRow(row.id, { op: e.target.value })}>
                {(def.ops || []).map((op) => <option key={op} value={op}>{OP_LABELS[op] || op}</option>)}
              </select>
              {def.type === 'select' || def.type === 'multiselect' ? (
                <select className="select" value={row.value ?? ''} onChange={(e) => setRow(row.id, { value: e.target.value })}>
                  <option value="">Choose…</option>
                  {(def.choices || []).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <input
                  className="input num"
                  type={row.op === 'between' ? 'text' : 'number'}
                  placeholder={row.op === 'between' ? 'min, max' : 'value'}
                  value={row.value}
                  onChange={(e) => setRow(row.id, { value: e.target.value })}
                />
              )}
              <span className="muted" style={{ fontSize: 12 }}>
                {(def.units || []).length > 1
                  ? (
                    <select
                      className="select"
                      style={{ padding: '5px 6px', fontSize: 12 }}
                      value={row.unit || def.units[0]}
                      onChange={(e) => setRow(row.id, { unit: e.target.value })}
                    >
                      {def.units.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  )
                  : ((def.units || [])[0] || '')}
              </span>
              <button
                type="button"
                className="icon-btn danger"
                title="Remove filter"
                onClick={() => { setFilters((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== row.id) : prev)); setPage(1); }}
              >
                <TrashIcon />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className="btn btn-sm mt"
          onClick={() => {
            const next = catalog.filters.find((f) => !filters.some((r) => r.slug === f.slug)) || catalog.filters[0];
            setFilters((prev) => [...prev, { ...newRow(), slug: next.slug, op: next.ops[0], value: '' }]);
          }}
        >
          <PlusIcon /> Add filter
        </button>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Results</h2>
          <span className="muted">
            {loading ? 'Screening…' : `${rows.length} shown · ${fmtNum(matched)} of ${fmtNum(universeTotal)} match`}
          </span>
        </div>
        {loading && <Spinner label="Running screen…" />}
        {!loading && rows.length === 0 && (
          <EmptyState title="No stocks match" hint="Loosen a filter, switch Match any/All, or raise the value thresholds." />
        )}
        {!loading && rows.length > 0 && (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    {visibleCols.map((c) => (
                      <th
                        key={c}
                        className={`sortable ${['price', 'changePct', 'marketCap', 'pe', 'roe', 'dividendYield', 'revenueGrowth', 'momentum3m', 'fairValue', 'upsidePct', 'score', 'beta'].includes(c) ? 'num' : ''}`}
                        onClick={() => toggleSort(c)}
                        title="Click to sort"
                      >
                        {titleCase(c)}
                        {sort && sort.slug === c && <span className="sort-ind">{sort.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.ticker}>
                      {visibleCols.map((c) => (
                        <td key={c} className={['price', 'changePct', 'marketCap', 'pe', 'roe', 'dividendYield', 'revenueGrowth', 'momentum3m', 'fairValue', 'upsidePct', 'score', 'beta'].includes(c) ? 'num' : ''}>
                          {c === 'ticker'
                            ? (
                              <span className="mono" style={{ fontWeight: 700 }}>
                                {r.ticker}
                                {r.live === true && <span className="live-dot" title="Live price from Yahoo Finance" />}
                              </span>
                            )
                            : c === 'name'
                              ? <span className="text-2">{r.name}</span>
                              : c === 'sector'
                                ? <span className="sector-badge">{r.sector}</span>
                                : cellFormat(c, r[c], r.currency)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span>Page {page} of {pages}</span>
              <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</button>
              <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          </>
        )}
      </div>

      {appState.savedScreeners.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h2 className="panel-title">Saved Screeners</h2></div>
          <div className="saved-screener-bar">
            {appState.savedScreeners.map((s) => (
              <span className="chip" key={s.id} style={{ cursor: 'default' }}>
                {s.name}
                <button
                  type="button"
                  className="linklike"
                  onClick={() => { applySharedState(s.state); window.scrollTo({ top: 0 }); }}
                >
                  load
                </button>
                <button
                  type="button"
                  className="linklike"
                  style={{ color: 'var(--red)' }}
                  onClick={() => update((st) => ({ ...st, savedScreeners: st.savedScreeners.filter((x) => x.id !== s.id) }))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
