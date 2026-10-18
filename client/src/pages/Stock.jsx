// Stock page: price header, SVG price chart with ranges, key metrics grid,
// Fair Value card (blended + 14-model table), AI rating card,
// add-to-watchlist and set-alert actions, peers.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getStock } from '../api.js';
import { useWatchlistActions } from '../state.jsx';
import { useMarket } from '../market.jsx';
import {
  fmtPrice, fmtPct, fmtNum, fmtCompact, signClass, ratingClass, titleCase,
} from '../format.js';
import LineChart from '../components/LineChart.jsx';
import { Spinner, ErrorBox } from '../components/UI.jsx';
import { BellIcon } from '../components/Icons.jsx';

const RANGES = [
  { key: '1M', days: 31 },
  { key: '6M', days: 183 },
  { key: '1Y', days: 366 },
  { key: '5Y', days: 1831 },
  { key: 'Max', days: null },
];

const METRIC_TILES = [
  ['pe', 'P/E Ratio', (v) => `${fmtNum(v, 1)}x`],
  ['pb', 'Price / Book', (v) => `${fmtNum(v, 1)}x`],
  ['ps', 'Price / Sales', (v) => `${fmtNum(v, 1)}x`],
  ['evEbitda', 'EV / EBITDA', (v) => `${fmtNum(v, 1)}x`],
  ['marketCap', 'Market Cap', (v) => fmtCompact(v)],
  ['dividendYield', 'Dividend Yield', (v) => `${fmtNum(v, 2)}%`],
  ['dividendPayout', 'Payout Ratio', (v) => `${fmtNum(v)}%`],
  ['freeCashFlowYield', 'FCF Yield', (v) => `${fmtNum(v, 1)}%`],
  ['roe', 'Return on Equity', (v) => `${fmtNum(v, 1)}%`],
  ['roa', 'Return on Assets', (v) => `${fmtNum(v, 1)}%`],
  ['netMargin', 'Net Margin', (v) => `${fmtNum(v, 1)}%`],
  ['grossMargin', 'Gross Margin', (v) => `${fmtNum(v, 1)}%`],
  ['opMargin', 'Operating Margin', (v) => `${fmtNum(v, 1)}%`],
  ['debtToEquity', 'Debt / Equity', (v) => fmtNum(v, 0)],
  ['currentRatio', 'Current Ratio', (v) => fmtNum(v, 2)],
  ['interestCoverage', 'Interest Coverage', (v) => `${fmtNum(v, 1)}x`],
  ['revenueGrowth', 'Revenue Growth', (v) => fmtPct(v)],
  ['epsGrowth', 'EPS Growth', (v) => fmtPct(v)],
  ['beta', 'Beta (1Y)', (v) => fmtNum(v, 2)],
  ['momentum3m', '3M Momentum', (v) => fmtPct(v)],
  ['momentum12m', '12M Momentum', (v) => fmtPct(v)],
  ['volatility12m', 'Volatility 1Y', (v) => `${fmtNum(v, 1)}%`],
  ['rsi', 'RSI (14)', (v) => fmtNum(v, 0)],
  ['avgVolume', 'Avg Volume', (v) => fmtCompact(v, '')],
  ['shortInterest', 'Short Interest', (v) => `${fmtNum(v, 1)}%`],
  ['insiderOwnership', 'Insider Ownership', (v) => `${fmtNum(v, 1)}%`],
  ['employees', 'Employees', (v) => fmtNum(v)],
  ['foundedYear', 'Founded', (v) => String(v)],
];
const SIGNED = new Set(['revenueGrowth', 'epsGrowth', 'momentum3m', 'momentum12m']);

// Real per-share metrics from Yahoo Finance. Rendered even when null so the
// grid stays stable and missing values read as an honest "—".
const LIVE_TILES = [
  { key: 'eps', label: 'EPS (TTM)', fmt: (v, s) => fmtPrice(v, s.currency) },
  { key: 'forwardPE', label: 'Forward P/E', fmt: (v) => `${fmtNum(v, 1)}x` },
  { key: 'dividendRate', label: 'Dividend Rate', fmt: (v, s) => fmtPrice(v, s.currency) },
  { key: 'sharesOutstanding', label: 'Shares Outstanding', fmt: (v) => fmtCompact(v, '') },
  { key: 'volume', label: 'Volume', fmt: (v) => fmtCompact(v, '') },
  {
    key: 'week52Low',
    label: '52-Week Range',
    fmt: (v, s) => (s.week52Low == null && s.week52High == null
      ? '—'
      : `${fmtPrice(s.week52Low, s.currency)} – ${fmtPrice(s.week52High, s.currency)}`),
  },
  { key: 'ma50Quote', label: '50-Day MA', fmt: (v, s) => fmtPrice(v, s.currency) },
  { key: 'ma200Quote', label: '200-Day MA', fmt: (v, s) => fmtPrice(v, s.currency) },
];

function ProvenancePill({ label, value }) {
  const live = value === 'Yahoo Finance';
  return (
    <span
      className={`prov-pill ${live ? 'live' : 'sim'}`}
      title={`${label}: ${live ? 'Yahoo Finance (may be delayed)' : 'AlphaDesk baseline estimate'}`}
    >
      {live ? 'LIVE' : 'SIMULATED'}
    </span>
  );
}

function recClass(r) {
  const v = String(r || '').toLowerCase();
  if (v.includes('buy')) return 'pos';
  if (v.includes('sell') || v.includes('underperform')) return 'neg';
  return 'amber';
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
}

function verdictOf(upside) {
  if (upside > 10) return { cls: 'good', label: 'Undervalued' };
  if (upside < -10) return { cls: 'bad', label: 'Overvalued' };
  return { cls: 'warn', label: 'Fairly Valued' };
}

function modelRows(stock) {
  const m = stock.fairValueModels;
  if (Array.isArray(m)) {
    return m.map((row) => ({
      name: row.model || row.name || 'Model',
      value: row.value,
      upside: row.upsidePct != null ? row.upsidePct : ((row.value - stock.price) / stock.price) * 100,
    }));
  }
  if (m && typeof m === 'object') {
    return Object.entries(m).map(([name, value]) => ({
      name, value, upside: ((value - stock.price) / stock.price) * 100,
    }));
  }
  return [];
}

export default function Stock() {
  const { ticker } = useParams();
  const upper = String(ticker || '').toUpperCase();
  const { state, update, addTicker } = useWatchlistActions();
  const { revision } = useMarket();
  const [stock, setStock] = useState(null);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('1Y');
  const [wlChoice, setWlChoice] = useState('');
  const [wlMsg, setWlMsg] = useState('');
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertCond, setAlertCond] = useState('above');
  const [alertValue, setAlertValue] = useState('');
  const [aboutOpen, setAboutOpen] = useState(false);
  const loadedTicker = useRef(null);

  useEffect(() => {
    let alive = true;
    // Reset view only when the ticker changes; a market re-score (revision)
    // refetches in place so the page doesn't flash back to a spinner.
    if (loadedTicker.current !== upper) {
      setStock(null);
      setRange('1Y');
      setAboutOpen(false);
      loadedTicker.current = upper;
    }
    setError(null);
    getStock(upper)
      .then((s) => { if (alive) setStock(s); })
      .catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [upper, revision]);

  const chart = useMemo(() => {
    if (!stock?.history) return null;
    const { dates, closes } = stock.history;
    const def = RANGES.find((r) => r.key === range);
    if (!def || !def.days) return { dates, closes };
    const end = new Date(`${dates[dates.length - 1]}T00:00:00`);
    const cutoff = new Date(end.getTime() - def.days * 864e5);
    const cutIso = iso(cutoff);
    let startIdx = dates.findIndex((d) => d >= cutIso);
    if (startIdx < 0) startIdx = 0;
    return { dates: dates.slice(startIdx), closes: closes.slice(startIdx) };
    function iso(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }, [stock, range]);

  const changePct = useMemo(() => {
    if (!stock) return null;
    if (stock.changePct != null) return stock.changePct;
    const c = stock.history?.closes;
    if (c && c.length > 1) return ((c[c.length - 1] / c[c.length - 2]) - 1) * 100;
    return null;
  }, [stock]);

  if (error) {
    return (
      <>
        <ErrorBox error={`Could not load ${upper}. It may not exist in the AlphaDesk universe.`} />
        <Link to="/propicks">← Back to AlphaPicks AI</Link>
      </>
    );
  }
  if (!stock || !chart) return <Spinner label={`Loading ${upper}…`} />;

  const models = modelRows(stock);
  const verdict = verdictOf(stock.upsidePct);
  const myAlerts = state.alerts.filter((a) => a.ticker === stock.ticker);
  const inWatchlists = state.watchlists.filter((w) => w.tickers.includes(stock.ticker));

  const addToWatchlist = () => {
    const id = wlChoice || state.watchlists[0]?.id;
    if (!id) return;
    addTicker(id, stock.ticker);
    const name = state.watchlists.find((w) => w.id === id)?.name;
    setWlMsg(`Added to ${name} ✓`);
    setTimeout(() => setWlMsg(''), 2200);
  };

  const setAlert = () => {
    const v = Number(alertValue);
    if (!v) return;
    update((s) => ({
      ...s,
      alerts: [...s.alerts, {
        id: `al-${Date.now()}`, ticker: stock.ticker, type: 'price',
        condition: alertCond, value: v, createdAt: new Date().toISOString(), active: true,
      }],
    }));
    setAlertOpen(false);
    setAlertValue('');
  };

  const why = stock.rationaleText
    || `Composite of quality (ROE ${stock.roe.toFixed(0)}%), growth (revenue ${fmtPct(stock.revenueGrowth)}), `
      + `momentum (6M ${fmtPct(stock.momentum6m)}) and valuation (P/E ${stock.pe.toFixed(1)}x). `
      + `Top-quartile composites are rated outperform; bottom-quartile underperform.`;

  const prov = stock.provenance || null;
  const analyst = stock.analyst || null;
  const analystUpside = analyst && analyst.targetMean != null && stock.price
    ? ((analyst.targetMean - stock.price) / stock.price) * 100
    : null;
  const liveInputs = Boolean(prov && (prov.price === 'Yahoo Finance' || prov.fundamentals === 'Yahoo Finance'));

  return (
    <>
      <div className="stock-head" style={{ marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ marginBottom: 2 }}>{stock.name}</h1>
          <div className="stock-ticker">
            {stock.ticker} · {stock.exchange} · {stock.country} · {stock.sector} / {stock.industry}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="stock-price">{fmtPrice(stock.price, stock.currency)}</div>
          {changePct != null && (
            <span className={`change-chip ${signClass(changePct)}`}>{fmtPct(changePct)} today</span>
          )}
          {prov && (
            <div className="prov-row">
              <ProvenancePill label="Price" value={prov.price} />
              <ProvenancePill label="Fundamentals" value={prov.fundamentals} />
              <ProvenancePill label="History" value={prov.history} />
              {prov.quoteAsOf && (
                <span className="muted" style={{ fontSize: 11.5 }}>as of {fmtTime(prov.quoteAsOf)}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {stock.dataSource === 'simulated' && (
        <div className="warn-bar">
          Live data unavailable for this symbol — showing the AlphaDesk baseline estimate.
        </div>
      )}

      <div className="toolbar">
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r.key} type="button" className={`seg-btn ${range === r.key ? 'on' : ''}`} onClick={() => setRange(r.key)}>
              {r.key}
            </button>
          ))}
        </div>
        <div className="spacer" />
        {state.watchlists.length > 0 ? (
          <span className="inline-form">
            <select className="select" value={wlChoice} onChange={(e) => setWlChoice(e.target.value)} style={{ padding: '6px 8px' }}>
              <option value="">{state.watchlists[0]?.name || 'Watchlist'}</option>
              {state.watchlists.slice(1).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button type="button" className="btn btn-sm btn-primary" onClick={addToWatchlist}>
              {inWatchlists.length ? 'Add again' : 'Add to watchlist'}
            </button>
            {wlMsg && <span className="pos" style={{ fontSize: 12.5 }}>{wlMsg}</span>}
          </span>
        ) : null}
        <button type="button" className="btn btn-sm" onClick={() => setAlertOpen((v) => !v)}>
          <BellIcon /> Set alert
        </button>
      </div>

      {alertOpen && (
        <div className="panel" style={{ padding: '12px 16px' }}>
          <span className="inline-form">
            <b>{stock.ticker}</b> price
            <select className="select" value={alertCond} onChange={(e) => setAlertCond(e.target.value)} style={{ padding: '6px 8px' }}>
              <option value="above">rises above</option>
              <option value="below">falls below</option>
            </select>
            <input
              className="input num"
              type="number"
              style={{ width: 130 }}
              placeholder={String(stock.price)}
              value={alertValue}
              onChange={(e) => setAlertValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setAlert(); }}
            />
            <button type="button" className="btn btn-sm btn-primary" disabled={!alertValue} onClick={setAlert}>Create alert</button>
          </span>
          {myAlerts.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {myAlerts.map((a) => (
                <span key={a.id} className={`alert-chip ${a.active ? '' : 'off'}`}>
                  {a.condition === 'above' ? '▲ above' : '▼ below'} {a.value}
                  <button
                    type="button"
                    className="linklike"
                    style={{ color: 'inherit' }}
                    onClick={() => update((s) => ({ ...s, alerts: s.alerts.filter((x) => x.id !== a.id) }))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="two-col">
        <div>
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Price · {range}</h2>
              <span className="muted">
                {chart.dates.length} points · {prov?.history === 'Yahoo Finance' ? 'Yahoo Finance closes' : 'AlphaDesk baseline closes'}
              </span>
            </div>
            <LineChart
              dates={chart.dates}
              series={[{ name: stock.ticker, color: '#818cf8', data: chart.closes }]}
              mode="value"
              height={320}
              valueFormat={(v) => fmtPrice(v, stock.currency)}
            />
          </div>

          <div className="panel">
            <div className="panel-head"><h2 className="panel-title">Key Metrics</h2></div>
            <div className="metric-grid">
              {METRIC_TILES.map(([key, label, fmt]) => {
                const v = stock[key];
                if (v == null) return null;
                return (
                  <div className="metric-tile" key={key}>
                    <div className="k">{label}</div>
                    <div className={`v ${SIGNED.has(key) ? signClass(v) : ''}`}>{fmt(v)}</div>
                  </div>
                );
              })}
              {LIVE_TILES.map(({ key, label, fmt }) => (
                <div className="metric-tile" key={key}>
                  <div className="k">{label}</div>
                  <div className="v">{fmt(stock[key], stock)}</div>
                </div>
              ))}
            </div>
          </div>

          {stock.about && (
            <div className="panel">
              <div className="panel-head"><h2 className="panel-title">About</h2></div>
              <p className={`about-text ${aboutOpen ? 'open' : ''}`}>{stock.about}</p>
              <div className="flex">
                <button type="button" className="linklike" onClick={() => setAboutOpen((v) => !v)}>
                  {aboutOpen ? 'Show less' : 'Show more'}
                </button>
                {stock.website && (
                  <a href={stock.website} target="_blank" rel="noopener noreferrer">Website ↗</a>
                )}
              </div>
            </div>
          )}

          {stock.peers?.length > 0 && (
            <div className="panel">
              <div className="panel-head"><h2 className="panel-title">Peers</h2></div>
              <div className="peers">
                {stock.peers.map((p) => (
                  <Link key={p.ticker} to={`/stock/${p.ticker}`} className="chip">
                    {p.ticker}
                    <span className="muted" style={{ fontWeight: 400 }}>{p.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="panel">
            <div className="panel-head"><h2 className="panel-title">Fair Value</h2></div>
            <div className="fv-main">
              <div>
                <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', fontWeight: 600 }}>Blended estimate</div>
                <div className="fv-value">{fmtPrice(stock.fairValue, stock.currency)}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', fontWeight: 600 }}>Implied upside</div>
                <div className={`fv-value ${signClass(stock.upsidePct)}`}>{fmtPct(stock.upsidePct)}</div>
              </div>
              <span className={`verdict ${verdict.cls}`}>{verdict.label}</span>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
              Blend of {models.length || 'fourteen'} independent valuation models versus a market price of {fmtPrice(stock.price, stock.currency)}.
              {liveInputs && ' Model estimate derived from the live inputs above.'}
            </p>
            {models.length > 0 && (
              <div className="table-wrap" style={{ maxHeight: 330, overflowY: 'auto' }}>
                <table className="tbl models-tbl">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="num">Value</th>
                      <th className="num">Upside</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => (
                      <tr key={m.name}>
                        <td>{m.name}</td>
                        <td className="num mono">{fmtPrice(m.value, stock.currency)}</td>
                        <td className={`num mono ${signClass(m.upside)}`}>{fmtPct(m.upside)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {analyst && (
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Analyst consensus</h2>
                {stock.analystRatingText && <span className="muted">{stock.analystRatingText}</span>}
              </div>
              <div className="flex" style={{ marginBottom: 10 }}>
                {analyst.recommendation
                  ? <span className={`rpill ${recClass(analyst.recommendation)}`}>{titleCase(analyst.recommendation)}</span>
                  : <span className="muted">No recommendation</span>}
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {analyst.count != null ? `${fmtNum(analyst.count)} analysts` : 'analyst count n/a'}
                </span>
              </div>
              <div className="analyst-grid">
                <div className="analyst-cell">
                  <div className="k">Mean target</div>
                  <div className="v mono">{fmtPrice(analyst.targetMean, stock.currency)}</div>
                  <div className={analystUpside == null ? 'muted' : signClass(analystUpside)} style={{ fontSize: 12 }}>
                    {analystUpside == null ? '—' : `${fmtPct(analystUpside)} vs price`}
                  </div>
                </div>
                <div className="analyst-cell">
                  <div className="k">High</div>
                  <div className="v mono">{fmtPrice(analyst.targetHigh, stock.currency)}</div>
                </div>
                <div className="analyst-cell">
                  <div className="k">Low</div>
                  <div className="v mono">{fmtPrice(analyst.targetLow, stock.currency)}</div>
                </div>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
                Consensus targets are denominated in {stock.currency}.
              </p>
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><h2 className="panel-title">AlphaDesk AI Rating</h2></div>
            <div className="flex">
              <span className={`rpill ${ratingClass(stock.rating)}`} style={{ fontSize: 15, padding: '5px 14px' }}>{stock.rating}</span>
              <span className="text-2">based on the monthly AI composite</span>
            </div>
            <div className="score-wrap">
              <div className="score-label">
                <span>AlphaScore</span>
                <b className="mono">{stock.score} / 100</b>
              </div>
              <div className="score-bar">
                <div className="score-fill" style={{ width: `${stock.score}%` }} />
              </div>
            </div>
            <p className="text-2" style={{ fontSize: 13, marginBottom: 0 }}>Why: {why}</p>
          </div>

          {inWatchlists.length > 0 && (
            <div className="panel" style={{ padding: '10px 16px' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>
                In watchlists: {inWatchlists.map((w) => w.name).join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
