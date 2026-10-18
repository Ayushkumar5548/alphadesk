'use strict';
// Engine facade: builds the deterministic universe once, caches strategy
// payloads, and exposes the operations the API layer needs.
const { buildUniverse, monthlyScore, rationaleFor } = require('./universe');
const {
  STRATEGIES, FEATURED_SLUG, strategyPayload, strategyListRow, simulator,
} = require('./picks');
const backtest = require('./backtest');
const realhistory = require('./realhistory');
const screener = require('./screener');
const calendar = require('./calendar');
const assistant = require('./assistant');
const funds = require('./funds');
const live = require('../market/live');
const { clamp, round, ymIndex, indexToYm, todayYm } = require('./prng');

let universe = null;
const payloadCache = new Map();
const listCache = new Map();
const monthStatsCache = new Map();
const stockDetailCache = new Map();

// Real-market backtest inputs: per-stock monthly close series (from real daily
// history) + real benchmark index series. Built lazily; when either is missing
// the engine serves the seeded simulation (labelled SIMULATED) instead.
let poolSeriesCache = null; // Map<ticker, {ymToClose, months}>
let benchSeries = null;     // {benchId: {ymToClose, months}}
let benchPromise = null;

function buildPoolSeries(u) {
  const map = new Map();
  for (const s of u.stocks) {
    if (s.live && s.live.history) {
      const ms = realhistory.monthlySeries(s);
      if (ms) map.set(s.ticker, ms);
    }
  }
  return map;
}

function poolSeries() {
  if (!poolSeriesCache) poolSeriesCache = buildPoolSeries(ensure());
  return poolSeriesCache;
}

// Async benchmark load (disk-cached 12h). Once it lands, drop the payload
// caches so the next request serves REAL backtests instead of simulations.
function loadBenchmarksAsync() {
  if (benchPromise) return benchPromise;
  benchPromise = realhistory.loadBenchmarks()
    .then((series) => {
      benchSeries = series;
      poolSeriesCache = null; // rebuild from any history that arrived meanwhile
      invalidateCaches();
      return series;
    })
    .catch(() => ({}));
  return benchPromise;
}

// Real point-in-time backtest for one strategy, or null when the data isn't
// there yet (benchmarks not loaded, pool too thin, history too short).
function tryRealReplay(def) {
  if (!benchSeries) return null;
  try {
    return backtest.realReplay(def, ensure(), benchSeries, poolSeries());
  } catch (e) {
    return null;
  }
}

// Called whenever the live overlay changes universe inputs: every derived
// payload has to be rebuilt from the new prices/metrics.
function invalidateCaches() {
  payloadCache.clear();
  listCache.clear();
  monthStatsCache.clear();
  stockDetailCache.clear();
  poolSeriesCache = null;
}

function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function ensure() {
  if (!universe) universe = buildUniverse();
  return universe;
}

function warmup() {
  const u = ensure();
  for (const def of STRATEGIES) payloadFor(def);
  loadBenchmarksAsync(); // upgrade payloads to REAL backtests once loaded
  funds.start();         // non-blocking: warm the mutual-fund (Warren AI) data
  return u;
}

// Starts the live market-data overlay (Yahoo Finance). Non-blocking; the
// engine keeps serving the simulated baseline until real data arrives.
function startMarket(options) {
  return live.start(ensure(), { onRescore: invalidateCaches, ...options });
}

function getMarketStatus() {
  return live.getStatus();
}

function refreshMarket() {
  return live.refreshNow();
}

function probeMarket() {
  return live.probe();
}

function payloadFor(def) {
  if (!payloadCache.has(def.slug)) {
    const real = tryRealReplay(def);
    payloadCache.set(def.slug, strategyPayload(def, ensure(), real || undefined));
  }
  return payloadCache.get(def.slug);
}

function listStrategies(favoriteSlugs) {
  const key = [...favoriteSlugs].sort().join(',');
  if (!listCache.has(key)) {
    const fav = new Set(favoriteSlugs);
    listCache.set(key, STRATEGIES.map((d) => strategyListRow(d, ensure(), fav.has(d.slug), tryRealReplay(d) || undefined)));
  }
  return listCache.get(key);
}

function getStrategy(slug) {
  const def = STRATEGIES.find((d) => d.slug === slug);
  if (!def) throw httpError(404, 'UNKNOWN_STRATEGY', `No strategy with slug "${slug}"`);
  return payloadFor(def);
}

function getFeatured() {
  return payloadFor(STRATEGIES.find((d) => d.slug === FEATURED_SLUG));
}

function getSimulator({ slug, amount, years }) {
  const def = STRATEGIES.find((d) => d.slug === slug);
  if (!def) throw httpError(404, 'UNKNOWN_STRATEGY', `No strategy with slug "${slug}"`);
  let amt = amount == null || amount === '' ? 10000 : Number(amount);
  if (!Number.isFinite(amt)) throw httpError(400, 'BAD_AMOUNT', 'amount must be a number');
  amt = clamp(amt, 100, 1e9);
  let yrs = 0;
  if (years != null && years !== '' && String(years).toLowerCase() !== 'max') {
    yrs = Number(years);
    if (!Number.isFinite(yrs) || yrs <= 0) throw httpError(400, 'BAD_YEARS', 'years must be a positive number or "max"');
    yrs = clamp(Math.floor(yrs), 1, 15);
  }
  return simulator(def, ensure(), round(amt, 2), yrs, tryRealReplay(def) || undefined);
}

function searchStocks(q, limit) {
  const u = ensure();
  const query = String(q || '').trim().toLowerCase();
  let list = u.stocks;
  if (query) {
    const scored = [];
    for (const s of u.stocks) {
      const t = s.ticker.toLowerCase();
      const n = s.name.toLowerCase();
      let rank = -1;
      if (t === query) rank = 0;
      else if (t.startsWith(query)) rank = 1;
      else if (t.includes(query)) rank = 2;
      else if (n.startsWith(query)) rank = 3;
      else if (n.includes(query)) rank = 4;
      else if (s.industry.toLowerCase().includes(query) || s.sector.toLowerCase().includes(query)) rank = 5;
      if (rank >= 0) scored.push({ s, rank });
    }
    scored.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : b.s.marketCap - a.s.marketCap));
    list = scored.map((x) => x.s);
  } else {
    list = [...u.stocks].sort((a, b) => b.marketCap - a.marketCap);
  }
  return list.slice(0, limit).map((s) => ({
    ticker: s.ticker,
    name: s.name,
    country: s.country,
    region: s.region,
    sector: s.sector,
    exchange: s.exchange,
    currency: s.currency,
    price: s.price,
    changePct: s.changePct,
    marketCap: s.marketCap,
    rating: s.rating,
    score: s.score,
    live: Boolean(s.live && s.live.price),
  }));
}

// Universe-wide score distribution for a given month (for rating history).
function monthStats(ym) {
  if (!monthStatsCache.has(ym)) {
    const u = ensure();
    const scores = u.stocks.map((s) => monthlyScore(s, ym)).sort((a, b) => b - a);
    monthStatsCache.set(ym, scores);
  }
  return monthStatsCache.get(ym);
}

function ratingAt(score, ym) {
  const sorted = monthStats(ym);
  const idx = sorted.findIndex((v) => v <= score);
  const pctile = (idx < 0 ? sorted.length : idx) / sorted.length;
  const cut = 0.25;
  return pctile <= cut ? 'outperform' : pctile >= 1 - cut ? 'underperform' : 'neutral';
}

const RANGES = { '1M': 22, '6M': 126, '1Y': 252, '5Y': 1260, 'MAX': 1500 };

function getStock(ticker, range) {
  const u = ensure();
  const s = u.byTicker.get(String(ticker || '').toUpperCase());
  if (!s) throw httpError(404, 'UNKNOWN_TICKER', `No stock with ticker "${ticker}"`);

  // Kick off on-demand enrichment; results land on a later request (the client
  // re-fetches when the market revision moves).
  live.requestFundamentals(s.ticker);
  live.requestHistory(s.ticker);

  const key = `${s.ticker}|${range || '5Y'}`;
  if (stockDetailCache.has(key)) return stockDetailCache.get(key);

  const n = s.history.closes.length;
  const take = RANGES[String(range || '5Y').toUpperCase()] || RANGES['5Y'];
  const from = Math.max(n - take, 0);

  // rating history for the last 13 months
  const cur = ymIndex(todayYm());
  const ratings = [];
  for (let i = cur - 12; i <= cur; i++) {
    const ym = indexToYm(i);
    const sc = monthlyScore(s, ym);
    ratings.push({ month: ym, score: sc, rating: ratingAt(sc, ym) });
  }

  // peers: same industry (fallback sector), largest first
  let peers = u.stocks.filter((p) => p.ticker !== s.ticker && p.industry === s.industry);
  if (peers.length < 3) peers = u.stocks.filter((p) => p.ticker !== s.ticker && p.sector === s.sector);
  peers = peers.sort((a, b) => b.marketCap - a.marketCap).slice(0, 6).map((p) => ({
    ticker: p.ticker,
    name: p.name,
    exchange: p.exchange,
    price: p.price,
    currency: p.currency,
    changePct: p.changePct,
    pe: p.pe,
    marketCap: p.marketCap,
    rating: p.rating,
    score: p.score,
    sector: p.sector,
  }));

  const detail = {
    ticker: s.ticker,
    name: s.name,
    exchange: s.exchange,
    country: s.country,
    region: s.region,
    sector: s.sector,
    industry: s.industry,
    currency: s.currency,
    marketCap: s.marketCap,
    price: s.price,
    changePct: s.changePct,
    dividendYield: s.dividendYield,
    dividendPayout: s.dividendPayout,
    pe: s.pe,
    pb: s.pb,
    ps: s.ps,
    evEbitda: s.evEbitda,
    roe: s.roe,
    roa: s.roa,
    netMargin: s.netMargin,
    grossMargin: s.grossMargin,
    opMargin: s.opMargin,
    debtToEquity: s.debtToEquity,
    currentRatio: s.currentRatio,
    interestCoverage: s.interestCoverage,
    revenueGrowth: s.revenueGrowth,
    epsGrowth: s.epsGrowth,
    beta: s.beta,
    freeCashFlowYield: s.freeCashFlowYield,
    momentum1m: s.momentum1m,
    momentum3m: s.momentum3m,
    momentum6m: s.momentum6m,
    momentum12m: s.momentum12m,
    volatility12m: s.volatility12m,
    avgVolume: s.avgVolume,
    rsi: s.rsi,
    movingAvg50: s.movingAvg50,
    movingAvg200: s.movingAvg200,
    shortInterest: s.shortInterest,
    insiderOwnership: s.insiderOwnership,
    employees: s.employees,
    foundedYear: s.foundedYear,
    fairValue: s.fairValue,
    upsidePct: s.upsidePct,
    verdict: s.verdict,
    fairValueModels: s.fairValueModels,
    rating: s.rating,
    score: s.score,
    rationaleTags: s.rationaleTags,
    rationaleText: s.rationaleText,
    spark: s.spark,
    history: {
      dates: s.history.dates.slice(from),
      closes: s.history.closes.slice(from),
      volume: s.history.volume.slice(from),
      range: String(range || '5Y').toUpperCase() in RANGES ? String(range || '5Y').toUpperCase() : '5Y',
    },
    ratings,
    peers,
    // Live-data extras + provenance
    yahooSymbol: s.yahooSymbol || null,
    dataSource: s.live && s.live.price ? 'live' : 'simulated',
    provenance: {
      price: s.live && s.live.price ? 'Yahoo Finance' : 'simulated',
      history: s.live && s.live.history ? 'Yahoo Finance' : 'simulated',
      fundamentals: s.live && s.live.fundamentals ? 'Yahoo Finance' : 'simulated',
      quoteAsOf: (s.live && s.live.quoteAsOf) || null,
      fundamentalsAsOf: (s.live && s.live.fundamentalsAsOf) || null,
      marketState: s.marketState || null,
    },
    about: s.about || null,
    website: s.website || null,
    analyst: s.analyst || null,
    analystRatingText: s.analystRatingText || null,
    eps: s.eps ?? null,
    forwardPE: s.forwardPE ?? null,
    dividendRate: s.dividendRate ?? null,
    sharesOutstanding: s.sharesOutstanding ?? null,
    volume: s.volume ?? null,
    week52High: s.week52High ?? null,
    week52Low: s.week52Low ?? null,
    ma50Quote: s.ma50Quote ?? null,
    ma200Quote: s.ma200Quote ?? null,
  };
  stockDetailCache.set(key, detail);
  return detail;
}

function batchStocks(tickers) {
  const u = ensure();
  const out = [];
  for (const t of tickers) {
    const s = u.byTicker.get(String(t).toUpperCase());
    if (!s) continue;
    out.push({
      ticker: s.ticker,
      name: s.name,
      country: s.country,
      region: s.region,
      sector: s.sector,
      exchange: s.exchange,
      currency: s.currency,
      price: s.price,
      changePct: s.changePct,
      marketCap: s.marketCap,
      pe: s.pe,
      rating: s.rating,
      score: s.score,
      fairValue: s.fairValue,
      upsidePct: s.upsidePct,
      live: Boolean(s.live && s.live.price),
      asOf: (s.live && s.live.quoteAsOf) || null,
    });
  }
  return out;
}

function getQuotes(symbols) {
  const u = ensure();
  const quotes = [];
  const seen = new Set();
  for (const sym of symbols) {
    const key = String(sym).toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const s = u.byTicker.get(key);
    if (!s) continue;
    quotes.push({
      ticker: s.ticker,
      name: s.name,
      currency: s.currency,
      price: s.price,
      changePct: s.changePct,
      spark: s.spark,
      live: Boolean(s.live && s.live.price),
      asOf: (s.live && s.live.quoteAsOf) || null,
    });
  }
  return quotes;
}

function getCalendar(params) {
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const plus = new Date(now.getTime() + 60 * 86400000);
  const later = `${plus.getFullYear()}-${p(plus.getMonth() + 1)}-${p(plus.getDate())}`;

  const from = params.from || today;
  const to = params.to || later;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw httpError(400, 'BAD_DATE', 'from/to must be dates in YYYY-MM-DD format');
  }
  if (from > to) throw httpError(400, 'BAD_RANGE', 'from must be before to');
  let importance;
  if (params.importance != null && params.importance !== '') {
    importance = Number(params.importance);
    if (![1, 2, 3].includes(importance)) throw httpError(400, 'BAD_IMPORTANCE', 'importance must be 1, 2 or 3');
  }
  const country = params.country || undefined;
  if (country && !calendar.COUNTRIES.has(country)) {
    throw httpError(400, 'BAD_COUNTRY', `Unknown country "${country}"`);
  }
  const events = calendar.query({ from, to, country, importance });
  return { events };
}

function getStocksScreenerFilters() {
  return screener.filters(ensure());
}

function runScreener(body) {
  return screener.run(ensure(), body);
}

function ask(q, state) {
  return assistant.ask(q, ensure(), state, payloadFor);
}

function counts() {
  const u = ensure();
  const byCountry = {};
  for (const s of u.stocks) byCountry[s.country] = (byCountry[s.country] || 0) + 1;
  return { total: u.stocks.length, byCountry };
}

function getFunds(q) {
  if (q) return { funds: funds.search(q), status: funds.status() };
  return { funds: funds.list(), status: funds.status() };
}

function getFund(id) {
  const f = funds.get(id);
  if (!f) throw httpError(404, 'UNKNOWN_FUND', `No mutual fund matching "${id}"`);
  return f;
}

module.exports = {
  warmup, listStrategies, getStrategy, getFeatured, getSimulator,
  searchStocks, getStock, batchStocks, getQuotes, getCalendar,
  getStocksScreenerFilters, runScreener, ask, counts, getFunds, getFund,
  startMarket, getMarketStatus, refreshMarket, probeMarket, invalidateCaches,
};
