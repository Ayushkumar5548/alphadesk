// Monthly backtest ledger: chart + month-by-month table of portfolio returns,
// entries and exits, compared with the benchmark index.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LineChart from './LineChart.jsx';
import { fmtPct } from '../format.js';

function monthTitle(d) {
  const dt = new Date(d + 'T00:00:00');
  if (!dt.getTime()) return d;
  return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function scoreChip(s) {
  if (s == null) return null;
  const cls = s >= 80 ? 'pos' : s < 60 ? 'neg' : 'muted';
  return <span className={cls}>{s.toFixed(1)}</span>;
}

export default function MonthlyBacktest({ history, monthly = [], benchmarkName = 'Benchmark' }) {
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    const list = Array.isArray(monthly) ? monthly.slice() : [];
    return list.sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [monthly]);
  const visible = showAll ? rows : rows.slice(-48); // last 4 years default

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const withBench = rows.filter((r) => r.benchmarkReturnPct != null);
    const avg = (arr, f) => (arr.length ? arr.reduce((a, r) => a + f(r), 0) / arr.length : 0);
    const last = rows[rows.length - 1];
    const beat = withBench.filter((r) => r.portfolioReturnPct > r.benchmarkReturnPct).length;
    return {
      months: rows.length,
      total: last.totalReturnPct,
      benchTotal: last.benchTotalReturnPct,
      avgMonth: avg(rows, (r) => r.portfolioReturnPct),
      avgBenchMonth: avg(withBench, (r) => r.benchmarkReturnPct),
      beat,
      comparable: withBench.length,
      entries: rows.reduce((a, r) => a + (r.entries ? r.entries.length : 0), 0),
      exits: rows.reduce((a, r) => a + (r.exits ? r.exits.length : 0), 0),
    };
  }, [rows]);

  if ((!rows || rows.length === 0) && (!history || !history.dates || history.dates.length < 2)) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Monthly Backtest Data</h2>
        </div>
        <div className="empty">No monthly backtest data available.</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Monthly Backtest Data</h2>
        <span className="muted">every month: portfolio vs {benchmarkName}, entries/exits, average returns</span>
      </div>

      {stats && (
        <div className="stat-grid" style={{ marginBottom: 14 }}>
          <div className="stat-card">
            <div className="label">Months tracked</div>
            <div className="value">{stats.months}</div>
          </div>
          <div className="stat-card">
            <div className="label">Portfolio total return</div>
            <div className={`value ${stats.total >= 0 ? 'pos' : 'neg'}`}>{fmtPct(stats.total)}</div>
            <div className="hint">cumulative, after every entry &amp; exit</div>
          </div>
          <div className="stat-card">
            <div className="label">{benchmarkName} total</div>
            <div className={`value ${stats.benchTotal >= 0 ? 'pos' : 'neg'}`}>{fmtPct(stats.benchTotal)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Avg return / month</div>
            <div className={`value ${stats.avgMonth >= 0 ? 'pos' : 'neg'}`}>{fmtPct(stats.avgMonth)}</div>
            <div className="hint">basket {fmtPct(stats.avgBenchMonth)} vs index</div>
          </div>
          <div className="stat-card">
            <div className="label">Months beat index</div>
            <div className="value">{stats.beat}<span className="muted" style={{ fontSize: 15 }}> / {stats.comparable}</span></div>
          </div>
          <div className="stat-card">
            <div className="label">Entries / exits</div>
            <div className="value">{stats.entries}<span className="muted" style={{ fontSize: 15 }}> in · {stats.exits} out</span></div>
          </div>
        </div>
      )}

      <div className="legend" style={{ marginBottom: 8 }}>
        <span className="lg"><span className="dot" style={{ background: '#818cf8' }} />Basket NAV</span>
        <span className="lg"><span className="dot" style={{ background: '#7e8ba6' }} />{benchmarkName}</span>
      </div>
      <LineChart
        dates={history?.dates || rows.map((r) => r.date)}
        mode="pct"
        height={260}
        series={[
          { name: 'Basket NAV', color: '#818cf8', data: history?.strategyNav || rows.map((r) => r.nav || 1) },
          { name: benchmarkName, color: '#7e8ba6', data: history?.benchmarkNav || rows.map((r) => r.benchNav || 1) },
        ]}
      />

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">Portfolio ret (mo)</th>
              <th className="num">Portfolio total</th>
              <th className="num">{benchmarkName} (mo)</th>
              <th className="num">{benchmarkName} total</th>
              <th className="num">Excess</th>
              <th className="num">Avg holding ret</th>
              <th className="num">Holdings</th>
              <th>Entered</th>
              <th>Exited</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.date || r.ym}>
                <td>{monthTitle(r.date || `${r.ym}-01`)}</td>
                <td className={`num ${r.portfolioReturnPct >= 0 ? 'pos' : 'neg'}`}>{fmtPct(r.portfolioReturnPct)}</td>
                <td className={`num ${r.totalReturnPct >= 0 ? 'pos' : 'neg'}`}><b>{fmtPct(r.totalReturnPct)}</b></td>
                <td className={`num ${r.benchmarkReturnPct == null ? 'muted' : (r.benchmarkReturnPct >= 0 ? 'pos' : 'neg')}`}>
                  {r.benchmarkReturnPct == null ? '—' : fmtPct(r.benchmarkReturnPct)}
                </td>
                <td className={`num ${r.benchTotalReturnPct == null ? 'muted' : (r.benchTotalReturnPct >= 0 ? 'pos' : 'neg')}`}>
                  {r.benchTotalReturnPct == null ? '—' : fmtPct(r.benchTotalReturnPct)}
                </td>
                <td className={`num ${r.excessPct == null ? 'muted' : (r.excessPct >= 0 ? 'pos' : 'neg')}`}>
                  {r.excessPct == null ? '—' : fmtPct(r.excessPct)}
                </td>
                <td className={`num ${r.avgHoldingReturnPct >= 0 ? 'pos' : 'neg'}`}>
                  {fmtPct(r.avgHoldingReturnPct)}
                </td>
                <td className="num">{r.holdings ?? 0}</td>
                <td style={{ maxWidth: 240 }}>
                  {r.entries && r.entries.length > 0 ? (
                    <div className="flex-wrap">
                      {r.entries.map((e) => (
                        <Link key={`${r.ym}-${e.ticker}-in`} to={`/stock/${encodeURIComponent(e.ticker)}`} className="chip" title={`Score at entry ${e.score}`}>
                          {e.ticker}{scoreChip(e.score)}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td style={{ maxWidth: 320 }}>
                  {r.exits && r.exits.length > 0 ? (
                    <div className="flex-wrap">
                      {r.exits.map((e) => (
                        <Link key={`${r.ym}-${e.ticker}-out`} to={`/stock/${encodeURIComponent(e.ticker)}`} className="chip" title={`Booked while held ${e.bookedReturnPct}%`}>
                          {e.ticker}
                          <span className={e.bookedReturnPct >= 0 ? 'pos' : 'neg'}> {fmtPct(e.bookedReturnPct)}</span>
                          {e.holdingMonths != null && <span className="muted"> ({e.holdingMonths}mo)</span>}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 48 && (
        <div className="text-right" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show last 48 months' : `Show all ${rows.length} months`}
          </button>
        </div>
      )}
    </div>
  );
}