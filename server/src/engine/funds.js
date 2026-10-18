'use strict';
// Mutual-fund data layer for the Warren AI assistant.
//
// Real NAV history comes from two free, key-less sources:
//   - Indian funds : mfapi.in  (https://api.mfapi.in/mf/{schemeCode})
//   - US funds     : Yahoo Finance (mutual-fund tickers, e.g. VFIAX)
// Metrics (1/3/5-year CAGR, volatility, max drawdown, latest NAV) are computed
// from the actual NAV series. If a source is unreachable the curated seed
// figures are served instead, labelled `sample` so the UI never shows a blank.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yahoo = require('../market/yahoo');
const { round } = require('./prng');

const CACHE_FILE = path.join(os.homedir(), '.alphadesk', 'funds.json');
const TTL_MS = 12 * 60 * 60 * 1000;
const MFHOST = 'https://api.mfapi.in';

// Curated coverage: the funds investors actually ask about. `code` is the
// mfapi.in scheme code (India) or the Yahoo ticker (US). `expense` is the
// published direct-plan/summary expense ratio (%), `seed` a fallback figure.
const CATALOG = [
  // ---- India: flexi cap ----
  { id: 'ppfcf', name: 'Parag Parikh Flexi Cap Fund', house: 'PPFAS', category: 'Flexi Cap', region: 'India', risk: 'Very High', benchmark: 'Nifty 500 TRI', code: 122639, expense: 0.63, seed: [17.5, 20.1, 22.4] },
  { id: 'hdfcflexi', name: 'HDFC Flexi Cap Fund', house: 'HDFC', category: 'Flexi Cap', region: 'India', risk: 'Very High', benchmark: 'Nifty 500 TRI', code: 118955, expense: 0.77, seed: [22.0, 24.5, 20.9] },
  // ---- India: large cap / index ----
  { id: 'miraelc', name: 'Mirae Asset Large Cap Fund', house: 'Mirae Asset', category: 'Large Cap', region: 'India', risk: 'High', benchmark: 'Nifty 100 TRI', code: 118825, expense: 0.59, seed: [13.2, 14.8, 15.6] },
  { id: 'icicilc', name: 'ICICI Prudential Large Cap Fund', house: 'ICICI Prudential', category: 'Large Cap', region: 'India', risk: 'High', benchmark: 'Nifty 100 TRI', code: 120586, expense: 0.67, seed: [14.1, 16.2, 16.8] },
  { id: 'sbinical', name: 'SBI Nifty Index Fund', house: 'SBI', category: 'Index (Large Cap)', region: 'India', risk: 'High', benchmark: 'Nifty 50 TRI', code: 119827, expense: 0.20, seed: [12.8, 13.9, 14.6] },
  { id: 'utinifty', name: 'UTI Nifty 50 Index Fund', house: 'UTI', category: 'Index (Large Cap)', region: 'India', risk: 'High', benchmark: 'Nifty 50 TRI', code: 120716, expense: 0.21, seed: [12.7, 13.8, 14.5] },
  { id: 'hdfcnifty', name: 'HDFC Nifty 50 Index Fund', house: 'HDFC', category: 'Index (Large Cap)', region: 'India', risk: 'High', benchmark: 'Nifty 50 TRI', code: 119063, expense: 0.20, seed: [12.6, 13.7, 14.4] },
  { id: 'icicinxt50', name: 'ICICI Prudential Nifty Next 50 Index Fund', house: 'ICICI Prudential', category: 'Index (Next 50)', region: 'India', risk: 'Very High', benchmark: 'Nifty Next 50 TRI', code: 120684, expense: 0.28, seed: [21.5, 18.9, 16.1] },
  // ---- India: mid cap ----
  { id: 'axismid', name: 'Axis Midcap Fund', house: 'Axis', category: 'Mid Cap', region: 'India', risk: 'Very High', benchmark: 'Nifty Midcap 150 TRI', code: 120505, expense: 0.58, seed: [20.4, 21.7, 22.9] },
  { id: 'motilalmid', name: 'Motilal Oswal Large and Midcap Fund', house: 'Motilal Oswal', category: 'Large & Mid Cap', region: 'India', risk: 'Very High', benchmark: 'Nifty LargeMidcap 250 TRI', code: 147704, expense: 0.61, seed: [24.1, 25.8, 22.2] },
  { id: 'motilaln150', name: 'Motilal Oswal Nifty Midcap 150 Index Fund', house: 'Motilal Oswal', category: 'Index (Mid Cap)', region: 'India', risk: 'Very High', benchmark: 'Nifty Midcap 150 TRI', code: 147622, expense: 0.30, seed: [22.8, 23.9, 21.4] },
  // ---- India: small cap ----
  { id: 'nipponsc', name: 'Nippon India Small Cap Fund', house: 'Nippon India', category: 'Small Cap', region: 'India', risk: 'Very High', benchmark: 'Nifty Smallcap 250 TRI', code: 118778, expense: 0.68, seed: [26.3, 28.7, 27.5] },
  { id: 'sbisc', name: 'SBI Small Cap Fund', house: 'SBI', category: 'Small Cap', region: 'India', risk: 'Very High', benchmark: 'BSE 250 SmallCap TRI', code: 125497, expense: 0.64, seed: [22.9, 24.4, 25.1] },
  { id: 'quantsc', name: 'Quant Small Cap Fund', house: 'Quant', category: 'Small Cap', region: 'India', risk: 'Very High', benchmark: 'Nifty Smallcap 250 TRI', code: 120828, expense: 0.64, seed: [28.6, 31.2, 30.4] },
  { id: 'hdfcsc', name: 'HDFC Small Cap Fund', house: 'HDFC', category: 'Small Cap', region: 'India', risk: 'Very High', benchmark: 'Nifty Smallcap 250 TRI', code: 130503, expense: 0.68, seed: [19.8, 23.6, 24.2] },
  { id: 'axissc', name: 'Axis Small Cap Fund', house: 'Axis', category: 'Small Cap', region: 'India', risk: 'Very High', benchmark: 'Nifty Smallcap 250 TRI', code: 125354, expense: 0.62, seed: [20.7, 22.1, 23.4] },
  // ---- India: value / hybrid / tax ----
  { id: 'icicivalue', name: 'ICICI Prudential Value Fund', house: 'ICICI Prudential', category: 'Value', region: 'India', risk: 'High', benchmark: 'Nifty 500 TRI', code: 120323, expense: 0.72, seed: [18.9, 21.3, 20.1] },
  { id: 'icicibadv', name: 'ICICI Prudential Balanced Advantage Fund', house: 'ICICI Prudential', category: 'Dynamic Asset Allocation', region: 'India', risk: 'Moderately High', benchmark: 'CRISIL Hybrid 50+50', code: 120377, expense: 0.72, seed: [12.4, 13.1, 12.8] },
  { id: 'miraetax', name: 'Mirae Asset ELSS Tax Saver Fund', house: 'Mirae Asset', category: 'ELSS (Tax Saver)', region: 'India', risk: 'Very High', benchmark: 'Nifty 500 TRI', code: 135781, expense: 0.60, seed: [19.2, 20.8, 19.9] },
  // ---- India: sectoral ----
  { id: 'tatadigital', name: 'Tata Digital India Fund', house: 'Tata', category: 'Sectoral (Technology)', region: 'India', risk: 'Very High', benchmark: 'BSE Teck TRI', code: 135800, expense: 0.55, seed: [24.7, 18.3, 21.6] },
  { id: 'icicitech', name: 'ICICI Prudential Technology Fund', house: 'ICICI Prudential', category: 'Sectoral (Technology)', region: 'India', risk: 'Very High', benchmark: 'BSE Teck TRI', code: 120594, expense: 0.68, seed: [22.1, 15.9, 19.4] },
  { id: 'nipponpharma', name: 'Nippon India Pharma Fund', house: 'Nippon India', category: 'Sectoral (Pharma)', region: 'India', risk: 'Very High', benchmark: 'Nifty Pharma TRI', code: 118759, expense: 0.65, seed: [16.8, 14.2, 15.7] },
  { id: 'icicicomm', name: 'ICICI Prudential Commodities Fund', house: 'ICICI Prudential', category: 'Sectoral (Commodities)', region: 'India', risk: 'Very High', benchmark: 'Nifty Commodities TRI', code: 147662, expense: 0.75, seed: [15.4, 17.6, null] },

  // ---- United States ----
  { id: 'vfiax', name: 'Vanguard 500 Index Fund Admiral', house: 'Vanguard', category: 'Index (S&P 500)', region: 'US', risk: 'High', benchmark: 'S&P 500', ticker: 'VFIAX', expense: 0.04, seed: [14.2, 11.8, 13.1] },
  { id: 'vtsax', name: 'Vanguard Total Stock Market Index Admiral', house: 'Vanguard', category: 'Index (Total Market)', region: 'US', risk: 'High', benchmark: 'CRSP US Total Market', ticker: 'VTSAX', expense: 0.04, seed: [15.1, 12.4, 13.5] },
  { id: 'swppx', name: 'Schwab S&P 500 Index Fund', house: 'Schwab', category: 'Index (S&P 500)', region: 'US', risk: 'High', benchmark: 'S&P 500', ticker: 'SWPPX', expense: 0.02, seed: [14.1, 11.7, 13.0] },
  { id: 'fcntx', name: 'Fidelity Contrafund', house: 'Fidelity', category: 'Large Growth', region: 'US', risk: 'High', benchmark: 'S&P 500', ticker: 'FCNTX', expense: 0.39, seed: [18.4, 13.9, 14.8] },
  { id: 'agthx', name: 'American Funds Growth Fund of America', house: 'Capital Group', category: 'Large Growth', region: 'US', risk: 'High', benchmark: 'S&P 500', ticker: 'AGTHX', expense: 0.61, seed: [19.7, 14.2, 15.3] },
  { id: 'vigax', name: 'Vanguard Growth Index Fund Admiral', house: 'Vanguard', category: 'Large Growth', region: 'US', risk: 'High', benchmark: 'CRSP US Large Cap Growth', ticker: 'VIGAX', expense: 0.05, seed: [21.3, 15.6, 16.9] },
  { id: 'vimax', name: 'Vanguard Mid-Cap Index Fund Admiral', house: 'Vanguard', category: 'Mid Cap Blend', region: 'US', risk: 'High', benchmark: 'CRSP US Mid Cap', ticker: 'VIMAX', expense: 0.05, seed: [13.6, 10.2, 11.4] },
  { id: 'vsmax', name: 'Vanguard Small-Cap Index Fund Admiral', house: 'Vanguard', category: 'Small Cap Blend', region: 'US', risk: 'Very High', benchmark: 'CRSP US Small Cap', ticker: 'VSMAX', expense: 0.05, seed: [11.8, 9.1, 10.6] },
  { id: 'vwelx', name: 'Vanguard Wellington Fund Investor', house: 'Vanguard', category: 'Allocation (60/40)', region: 'US', risk: 'Moderate', benchmark: 'S&P 500 / Bloomberg Agg', ticker: 'VWELX', expense: 0.25, seed: [11.2, 8.4, 9.3] },
  { id: 'prgfx', name: 'T. Rowe Price Growth Stock Fund', house: 'T. Rowe Price', category: 'Large Growth', region: 'US', risk: 'High', benchmark: 'Russell 1000 Growth', ticker: 'PRGFX', expense: 0.65, seed: [20.8, 14.7, 16.2] },
];

let cache = { funds: null, asOf: null, live: 0, sample: 0 };
let loading = null;

function readCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (raw && raw.funds && raw.asOf && Date.now() - Date.parse(raw.asOf) < TTL_MS) {
      cache = raw;
      return true;
    }
  } catch { /* no cache */ }
  return false;
}

function writeCache() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch { /* non-fatal */ }
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// ---- metric computation from a real monthly NAV series -------------------
function cagrFrom(ymToNav, months, lookback) {
  if (months.length <= lookback) return null;
  const a = ymToNav.get(months[months.length - 1 - lookback]);
  const b = ymToNav.get(months[months.length - 1]);
  if (!a || !b || a <= 0) return null;
  const yrs = lookback / 12;
  return round((Math.pow(b / a, 1 / yrs) - 1) * 100, 1);
}

function metricsFromSeries(ymToNav, months) {
  if (months.length < 13) return null;
  const nav = months.map((m) => ymToNav.get(m)).filter((v) => v != null && v > 0);
  const last = nav[nav.length - 1];
  // monthly returns over the last 36 months -> annualised volatility
  const rets = [];
  for (let i = Math.max(1, nav.length - 36); i < nav.length; i++) rets.push(nav[i] / nav[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const varc = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1);
  const vol = round(Math.sqrt(varc) * Math.sqrt(12) * 100, 1);
  // max drawdown over the whole available series
  let peak = nav[0]; let mdd = 0;
  for (const v of nav) { if (v > peak) peak = v; const dd = v / peak - 1; if (dd < mdd) mdd = dd; }
  const yrs = (months.length - 1) / 12;
  return {
    latestNav: round(last, 2),
    return1y: cagrFrom(ymToNav, months, 12),
    return3y: cagrFrom(ymToNav, months, 36),
    return5y: cagrFrom(ymToNav, months, 60),
    sinceInceptionCagr: months.length > 13 ? round((Math.pow(last / nav[0], 1 / yrs) - 1) * 100, 1) : null,
    volatilityPct: vol,
    maxDrawdownPct: round(mdd * 100, 1),
    monthsTracked: months.length,
  };
}

// ---- per-fund fetch -------------------------------------------------------
async function fetchIndia(f) {
  const res = await fetch(`${MFHOST}/mf/${f.code}`, { headers: { 'user-agent': 'Mozilla/5.0 AlphaDesk' } });
  if (!res.ok) throw new Error(`mfapi HTTP ${res.status}`);
  const json = await res.json();
  if (!json || !Array.isArray(json.data) || json.data.length < 12) throw new Error('mfapi empty');
  // mfapi returns newest first; last write per month wins, so iterate in file
  // order and overwrite -> the newest NAV for each month is kept.
  const ymToNav = new Map();
  for (const row of json.data) {
    const parts = String(row.date).split('-');
    if (parts.length !== 3) continue;
    const ym = `${parts[2]}-${parts[1]}`;
    const nav = num(row.nav);
    if (nav != null && nav > 0) ymToNav.set(ym, nav);
  }
  const months = [...ymToNav.keys()].sort();
  const metrics = metricsFromSeries(ymToNav, months);
  if (!metrics) throw new Error('mfapi too short');
  return { metrics, months, ymToNav, metaHouse: json.meta && json.meta.fund_house };
}

async function fetchUS(f) {
  const h = await yahoo.history(f.ticker);
  if (!h || !Array.isArray(h.closes) || h.closes.length < 250) throw new Error('yahoo short');
  const ymToNav = new Map();
  for (let i = 0; i < h.dates.length; i++) {
    const c = h.closes[i];
    if (typeof c === 'number' && c > 0) ymToNav.set(h.dates[i].slice(0, 7), c);
  }
  const months = [...ymToNav.keys()].sort();
  const metrics = metricsFromSeries(ymToNav, months);
  if (!metrics) throw new Error('yahoo too short');
  return { metrics, months, ymToNav };
}

function sparkFrom(ymToNav, months, points = 60) {
  const take = months.slice(-points);
  return take.map((m) => ({ d: m, v: round(ymToNav.get(m), 2) }));
}

function withFallback(f) {
  const [r1, r3, r5] = f.seed || [null, null, null];
  return {
    ...base(f),
    source: 'sample',
    latestNav: null,
    return1y: r1,
    return3y: r3,
    return5y: r5,
    volatility12m: null,
    maxDrawdown: null,
    monthsTracked: 0,
    asOf: null,
    spark: [],
  };
}

function base(f) {
  return {
    id: f.id, name: f.name, house: f.house, category: f.category, region: f.region,
    risk: f.risk, benchmark: f.benchmark, expense: f.expense,
  };
}

// ---- public API -----------------------------------------------------------
async function refresh(force = false) {
  if (!force && cache.funds && cache.asOf && Date.now() - Date.parse(cache.asOf) < TTL_MS) return cache;
  if (loading) return loading;
  loading = (async () => {
    const out = [];
    let live = 0;
    // small concurrency pool so we don't hammer the free endpoints
    const queue = [...CATALOG];
    const workers = Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const f = queue.shift();
        try {
          const got = f.region === 'India' ? await fetchIndia(f) : await fetchUS(f);
          const m = got.metrics;
          out.push({
            ...base(f),
            source: 'live',
            latestNav: m.latestNav,
            return1y: m.return1y,
            return3y: m.return3y,
            return5y: m.return5y,
            volatility12m: m.volatilityPct,
            maxDrawdown: m.maxDrawdownPct,
            monthsTracked: m.monthsTracked,
            asOf: new Date().toISOString(),
            spark: sparkFrom(got.ymToNav, got.months),
          });
          live += 1;
        } catch (e) {
          out.push(withFallback(f));
        }
      }
    });
    await Promise.all(workers);
    // keep catalogue order
    out.sort((a, b) => CATALOG.findIndex((x) => x.id === a.id) - CATALOG.findIndex((x) => x.id === b.id));
    cache = { funds: out, asOf: new Date().toISOString(), live, sample: out.length - live };
    writeCache();
    return cache;
  })().finally(() => { loading = null; });
  return loading;
}

function ensureLoaded() {
  if (cache.funds) return cache;
  if (readCache()) return cache;
  cache = { funds: CATALOG.map(withFallback), asOf: null, live: 0, sample: CATALOG.length };
  return cache;
}

function list() {
  const c = ensureLoaded();
  return c.funds.map((f) => ({ ...f }));
}

function get(id) {
  const q = String(id || '').toLowerCase();
  const f = ensureLoaded().funds.find((x) => x.id === q || (x.ticker && x.ticker.toLowerCase() === q) || String(x.code) === q);
  return f ? { ...f } : null;
}

// Free-text fund search over name / house / category.
function search(q, limit = 8) {
  const query = String(q || '').toLowerCase().trim();
  const funds = ensureLoaded().funds;
  if (!query) return funds.slice(0, limit).map((f) => ({ ...f }));
  const terms = query.split(/\s+/).filter((w) => w.length > 2);
  const scored = funds.map((f) => {
    const hay = `${f.name} ${f.house} ${f.category} ${f.benchmark} ${f.region}`.toLowerCase();
    let s = 0;
    for (const t of terms) if (hay.includes(t)) s += t.length;
    if (hay.includes(query)) s += 20;
    return { f, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit);
  return scored.map((x) => ({ ...x.f }));
}

function status() {
  const c = ensureLoaded();
  return { loaded: Boolean(c.funds), live: c.live, sample: c.sample, asOf: c.asOf, total: c.funds.length };
}

function start() {
  // Non-blocking warm-up; also seeds the cache from disk immediately.
  ensureLoaded();
  return refresh().catch(() => null);
}

module.exports = { list, get, search, refresh, status, start, CATALOG };
