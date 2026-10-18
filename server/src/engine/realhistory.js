'use strict';
// Real-history layer for the point-in-time backtest.
//
// The engine already stores REAL daily price history (from Yahoo) on each stock
// as s.history.{dates,closes}. This module distills that into month-end close
// series and fetches REAL benchmark index history, so strategy backtests can be
// driven by actual market returns instead of the seeded-noise simulation.
//
// Everything degrades gracefully: with no real history (offline / ALPHADESK_LIVE=0)
// the caller falls back to the simulated engine and labels it SIMULATED.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const yahoo = require('../market/yahoo');
const { round } = require('./prng');

const DATA_DIR = path.join(os.homedir(), '.alphadesk');
const BENCH_FILE = path.join(DATA_DIR, 'benchmarks.json');
const BENCH_TTL_MS = 12 * 60 * 60 * 1000; // 12h

// Yahoo index symbols per engine benchmark id. Each basket is compared with
// the index it actually sources stocks from (India small caps vs an India
// small-cap index, US tech vs the Nasdaq 100, Europe vs the Euro Stoxx 50...).
const BENCH_SYMBOLS = {
  nifty50: '^NSEI',
  nifty500: '^CRSLDX',
  indiaSmallcap: 'SMIN', // iShares MSCI India Small-Cap ETF (tracks the index)
  sp500: '^SP500TR',
  nasdaq100: '^NDX',
  dow: '^DJI',
  sp400: '^SP400',
  eurostoxx50: '^STOXX50E',
  ftse100: '^FTSE',
};

// ---- month-end close series from a stock's real daily history ----
// Returns { ymToClose: Map<'YYYY-MM', close>, months: string[] } sorted ascending.
function monthlySeries(stock) {
  const h = stock && stock.history;
  if (!h || !Array.isArray(h.closes) || !Array.isArray(h.dates)) return null;
  const n = h.closes.length;
  if (n < 60) return null; // need a usable span; < ~3 months is too thin
  const ymToClose = new Map();
  for (let i = 0; i < n; i++) {
    const d = h.dates[i];
    const c = h.closes[i];
    if (!d || typeof c !== 'number' || !Number.isFinite(c) || c <= 0) continue;
    ymToClose.set(d.slice(0, 7), c); // overwrite -> last (month-end) close wins
  }
  const months = [...ymToClose.keys()].sort();
  if (months.length < 6) return null;
  return { ymToClose, months };
}

// ---- real benchmark monthly returns ----
function readBenchCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(BENCH_FILE, 'utf8'));
    if (raw && raw.fetchedAt && Date.now() - Date.parse(raw.fetchedAt) < BENCH_TTL_MS) return raw;
  } catch (e) { /* no/invalid cache */ }
  return null;
}

function writeBenchCache(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BENCH_FILE, JSON.stringify(data));
  } catch (e) { /* non-fatal */ }
}

// Fetch (or read cached) real monthly close series for each benchmark.
// Returns { benchId: { ymToClose: Map, months: [] } }.
async function loadBenchmarks() {
  const cached = readBenchCache();
  if (cached && cached.series) return normalize(hydrate(cached.series));

  const series = {};
  const jobs = Object.entries(BENCH_SYMBOLS).map(async ([id, sym]) => {
    try {
      // NB: Yahoo downsamples 'max' + 1mo to quarterly bars. A bounded range
      // ('6y') returns true monthly bars, which the backtest timeline needs.
      const h = await yahoo.chartRaw(sym, '6y', '1mo');
      if (!h || !Array.isArray(h.closes) || h.closes.length < 24) return;
      const raw = new Map();
      for (let i = 0; i < h.dates.length; i++) {
        const c = h.closes[i];
        if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
          raw.set(h.dates[i].slice(0, 7), c); // last bar of a duplicate month wins
        }
      }
      const filled = fillShortGaps(raw, 2);
      if (filled.months.length >= 24) {
        series[id] = { ymToClose: filled.ymToClose, months: filled.months, symbol: sym };
      }
    } catch (e) { /* skip this benchmark */ }
  });
  await Promise.all(jobs);

  const normalized = normalize(series);
  if (Object.keys(normalized).length) {
    writeBenchCache({ fetchedAt: new Date().toISOString(), series: serializable(normalized) });
  }
  return normalized;
}

// Forward-fill gaps of at most `maxGap` months with the previous close. Some
// indices (e.g. Yahoo's ^FTSE) ship with a missing month bar or duplicate
// month-ends; a short hole carried forward keeps the monthly timeline whole
// with zero return for the missing bar, which is far closer to truth than
// dropping the series or computing 3-month "monthly" returns. Longer gaps are
// left in place (normalize() will then cut the series there).
function fillShortGaps(rawMap, maxGap) {
  const months = [...rawMap.keys()].sort();
  const ymToClose = new Map();
  let prev = null;
  let prevYmStr = null;
  for (const m of months) {
    if (prev != null) {
      let cursor = prevYmStr;
      let gap = 0;
      while (nextYm(cursor) !== m && gap < maxGap) {
        cursor = nextYm(cursor);
        ymToClose.set(cursor, prev); // carried forward
        gap++;
      }
    }
    const c = rawMap.get(m);
    ymToClose.set(m, c);
    prev = c;
    prevYmStr = m;
  }
  return { ymToClose, months: [...ymToClose.keys()].sort() };
}

function nextYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

// Trim each series to its trailing CONSECUTIVE monthly run. The backtest
// timeline indexes months as an unbroken monthly sequence (k, k-1, k-2...);
// a stray quarterly/duplicate bar would silently turn "monthly" returns into
// 3-month returns and misalign the whole NAV. Anything not strictly
// month-continuous is cut off.
function normalize(series) {
  const out = {};
  for (const [id, s] of Object.entries(series)) {
    const months = s.months;
    // Walk back from the newest bar while months stay strictly consecutive;
    // the run we keep starts just after the last break we find.
    let start = months.length - 1;
    while (start > 0 && prevYm(months[start]) === months[start - 1]) start--;
    const run = months.slice(start);
    if (run.length < 24) continue; // need at least two consecutive years of monthly bars
    const ymToClose = new Map();
    for (const m of run) ymToClose.set(m, s.ymToClose.get(m));
    out[id] = { ymToClose, months: run, symbol: s.symbol };
  }
  return out;
}

function prevYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// Map/serialize helpers (Maps don't survive JSON round-trip).
function serializable(series) {
  const out = {};
  for (const [id, s] of Object.entries(series)) {
    out[id] = { symbol: s.symbol, months: s.months, closes: s.months.map((m) => s.ymToClose.get(m)) };
  }
  return out;
}

function hydrate(serialized) {
  const out = {};
  for (const [id, s] of Object.entries(serialized || {})) {
    const ymToClose = new Map();
    s.months.forEach((m, i) => ymToClose.set(m, s.closes[i]));
    out[id] = { ymToClose, months: s.months, symbol: s.symbol };
  }
  return out;
}

// Convenience: monthly return of a benchmark for a given 'YYYY-MM' (vs prior month).
function benchMonthlyReturn(series, benchId, ym) {
  const s = series[benchId];
  if (!s) return null;
  const i = s.months.indexOf(ym);
  if (i <= 0) return null;
  const prev = s.ymToClose.get(s.months[i - 1]);
  const cur = s.ymToClose.get(ym);
  if (!prev || !cur) return null;
  return cur / prev - 1;
}

module.exports = {
  monthlySeries, loadBenchmarks, hydrate, serializable,
  benchMonthlyReturn, BENCH_SYMBOLS,
};
