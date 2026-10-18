// Performance simulator: strategy vs benchmark cumulative-return chart.
// Controls: 1Y/5Y/Max, invested-amount spinbutton, $/% toggle, year chips.
import { useEffect, useMemo, useState } from 'react';
import { getSimulator } from '../api.js';
import { fmtPct, fmtMoney, fmtCompact } from '../format.js';
import LineChart from './LineChart.jsx';
import { Spinner } from './UI.jsx';

const COLORS = { strategy: '#818cf8', benchmark: '#7e8ba6' };

export default function SimulatorCard({ slug, yearStart = 2019, benchmarkName = 'Benchmark', strategyName = 'Strategy' }) {
  const [amountText, setAmountText] = useState('10000');
  const [rangeKey, setRangeKey] = useState('max'); // '1y' | '5y' | 'max' | null (year chip active)
  const [startYear, setStartYear] = useState(null);
  const [pctMode, setPctMode] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const amount = Math.max(1, Number(amountText) || 10000);
  const years = startYear != null
    ? new Date().getFullYear() - startYear + 1
    : rangeKey === '1y' ? 1 : rangeKey === '5y' ? 5 : undefined;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      getSimulator({ slug, amount, years })
        .then((d) => { if (alive) { setData(d); setLoading(false); } })
        .catch((e) => { if (alive) { setError(e); setLoading(false); } });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [slug, amount, years]);

  const currentYear = new Date().getFullYear();
  const yearChips = useMemo(() => {
    const from = Math.max(yearStart, currentYear - 9);
    const chips = [];
    for (let y = from; y <= currentYear; y++) chips.push(y);
    return chips;
  }, [yearStart, currentYear]);

  const chartSeries = useMemo(() => {
    if (!data || !data.points?.length) return [];
    return [
      { name: strategyName, color: COLORS.strategy, data: data.points.map((p) => p.value) },
      { name: benchmarkName, color: COLORS.benchmark, data: data.points.map((p) => p.benchmarkValue) },
    ];
  }, [data, strategyName, benchmarkName]);

  const dates = data?.points?.map((p) => p.date) || [];

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Performance Simulator</h2>
        <span className="muted">strategy vs benchmark · rebased to your investment</span>
      </div>

      <div className="sim-controls">
        <div className="seg">
          {[['1y', '1Y'], ['5y', '5Y'], ['max', 'Max']].map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`seg-btn ${rangeKey === k && startYear == null ? 'on' : ''}`}
              onClick={() => { setRangeKey(k); setStartYear(null); }}
            >
              {label}
            </button>
          ))}
        </div>
        <label htmlFor={`amt-${slug}`}>Invested amount</label>
        <input
          id={`amt-${slug}`}
          className="input num amount-input"
          type="number"
          min="1"
          step="100"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
        />
        <div className="seg">
          <button type="button" className={`seg-btn ${pctMode ? 'on' : ''}`} onClick={() => setPctMode(true)}>%</button>
          <button type="button" className={`seg-btn ${!pctMode ? 'on' : ''}`} onClick={() => setPctMode(false)}>$</button>
        </div>
        <div className="year-chips">
          {yearChips.map((y) => (
            <button
              key={y}
              type="button"
              className={`year-chip ${startYear === y ? 'on' : ''}`}
              title={`From January ${y}`}
              onClick={() => { setStartYear(startYear === y ? null : y); if (startYear !== y) setRangeKey(null); }}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {loading && <Spinner label="Simulating…" />}
      {!loading && error && (
        <div className="error-box">Could not load simulation data.</div>
      )}
      {!loading && !error && data && (
        <>
          <div className="legend" style={{ marginBottom: 8 }}>
            <span className="lg"><span className="dot" style={{ background: COLORS.strategy }} />{strategyName}</span>
            <span className="lg"><span className="dot" style={{ background: COLORS.benchmark }} />{benchmarkName}</span>
          </div>
          <LineChart
            dates={dates}
            series={chartSeries}
            mode={pctMode ? 'pct' : 'value'}
            height={320}
            valueFormat={pctMode ? null : (v) => fmtMoney(v)}
          />
          <div className="sim-summary">
            <div className="item">
              <div className="k">{strategyName}</div>
              <div className={`v ${data.strategyTotalPct >= 0 ? 'pos' : 'neg'}`}>{fmtPct(data.strategyTotalPct)}</div>
            </div>
            <div className="item">
              <div className="k">{benchmarkName}</div>
              <div className={`v ${data.benchmarkTotalPct >= 0 ? 'pos' : 'neg'}`}>{fmtPct(data.benchmarkTotalPct)}</div>
            </div>
            <div className="item">
              <div className="k">Grew to</div>
              <div className="v">{fmtCompact(data.endAmount)}</div>
            </div>
            <div className="item">
              <div className="k">Benchmark would be</div>
              <div className="v muted">{fmtCompact(data.endBenchmark)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
