// Mutual Funds — real NAV metrics for a curated set of Indian and US funds.
// Data comes from mfapi.in (India) and Yahoo Finance (US) via the server.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFunds } from '../api.js';
import LineChart from '../components/LineChart.jsx';

function pct(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`;
}
function num(v, suffix = '') {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return `${Number(v).toFixed(1)}${suffix}`;
}

export default function Funds() {
  const [funds, setFunds] = useState([]);
  const [status, setStatus] = useState(null);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('All');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    getFunds()
      .then((r) => { if (alive) { setFunds(r.funds || []); setStatus(r.status || null); } })
      .catch((e) => { if (alive) setError(e.message || 'Could not load funds'); });
    return () => { alive = false; };
  }, []);

  const categories = useMemo(
    () => ['All', ...[...new Set(funds.map((f) => f.category))].sort()],
    [funds],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return funds.filter((f) => {
      if (region !== 'All' && f.region !== region) return false;
      if (category !== 'All' && f.category !== category) return false;
      if (q && !`${f.name} ${f.house} ${f.category} ${f.benchmark}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => (b.return3y ?? -99) - (a.return3y ?? -99));
  }, [funds, query, region, category]);

  const active = selected || rows[0] || null;

  return (
    <>
      <h1>Mutual Funds</h1>
      <p className="page-sub">
        Real NAV history for {funds.length} curated funds — returns, risk and cost, with the
        {' '}<Link to="/assistant">Warren AI</Link> assistant able to analyse and compare any of them.
        {status && (
          <span className="muted">
            {' '}· {status.live ?? 0} live, {status.sample ?? 0} sample
            {status.asOf ? ` · updated ${new Date(status.asOf).toLocaleString()}` : ''}
          </span>
        )}
      </p>

      {error && <div className="panel"><p className="muted">Fund data unavailable: {error}</p></div>}

      <div className="panel">
        <div className="bc-toolbar" style={{ marginBottom: 14 }}>
          <input
            className="input"
            placeholder="Search funds…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <label className="bc-tool">
            <span className="muted">Region</span>
            <select className="select" value={region} onChange={(e) => setRegion(e.target.value)}>
              {['All', 'India', 'US'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label className="bc-tool">
            <span className="muted">Category</span>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <span className="muted" style={{ fontSize: 12 }}>{rows.length} shown</span>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Fund</th>
                <th>Category</th>
                <th className="num">1Y</th>
                <th className="num">3Y CAGR</th>
                <th className="num">5Y CAGR</th>
                <th className="num">Volatility</th>
                <th className="num">Max DD</th>
                <th className="num">Expense</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr
                  key={f.id}
                  onClick={() => setSelected(f)}
                  style={{ cursor: 'pointer', background: active && active.id === f.id ? 'var(--panel-2)' : undefined }}
                >
                  <td>
                    <div style={{ fontWeight: 700 }}>{f.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{f.house} · {f.region}</div>
                  </td>
                  <td className="muted">{f.category}</td>
                  <td className={`num ${f.return1y >= 0 ? 'pos' : 'neg'}`}>{pct(f.return1y)}</td>
                  <td className={`num ${f.return3y >= 0 ? 'pos' : 'neg'}`}><b>{pct(f.return3y)}</b></td>
                  <td className={`num ${f.return5y >= 0 ? 'pos' : 'neg'}`}>{pct(f.return5y)}</td>
                  <td className="num">{num(f.volatility12m, '%')}</td>
                  <td className="num neg">{num(f.maxDrawdown, '%')}</td>
                  <td className="num">{num(f.expense, '%')}</td>
                  <td>
                    <span className={`tag ${f.source === 'live' ? 'tag-live' : ''}`} style={{ fontSize: 11 }}>
                      {f.source === 'live' ? 'LIVE' : 'SAMPLE'}
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={9} className="muted">No funds match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {active && (
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">{active.name}</h2>
            <div className="spacer" />
            <Link className="btn btn-sm" to={`/assistant`}>Ask Warren AI</Link>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            {active.category} · benchmark {active.benchmark} · risk {active.risk} · expense {num(active.expense, '%')}
          </p>
          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <div className="stat-card"><div className="label">1Y return</div><div className={`value ${active.return1y >= 0 ? 'pos' : 'neg'}`}>{pct(active.return1y)}</div></div>
            <div className="stat-card"><div className="label">3Y CAGR</div><div className={`value ${active.return3y >= 0 ? 'pos' : 'neg'}`}>{pct(active.return3y)}</div></div>
            <div className="stat-card"><div className="label">5Y CAGR</div><div className={`value ${active.return5y >= 0 ? 'pos' : 'neg'}`}>{pct(active.return5y)}</div></div>
            <div className="stat-card"><div className="label">Volatility</div><div className="value">{num(active.volatility12m, '%')}</div></div>
            <div className="stat-card"><div className="label">Max drawdown</div><div className="value neg">{num(active.maxDrawdown, '%')}</div></div>
            <div className="stat-card"><div className="label">Latest NAV</div><div className="value">{num(active.latestNav, '')}</div></div>
          </div>
          {active.spark && active.spark.length > 6 ? (
            <LineChart
              dates={active.spark.map((p) => p.d)}
              mode="pct"
              height={240}
              series={[{ name: active.name, color: '#818cf8', data: active.spark.map((p) => p.v) }]}
            />
          ) : (
            <p className="muted">Live NAV series unavailable for this fund (showing seeded figures).</p>
          )}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            Source: {active.source === 'live' ? 'real NAV history (mfapi.in / Yahoo Finance)' : 'illustrative sample'}. Past performance is not a guarantee of future returns.
          </p>
        </div>
      )}
    </>
  );
}
