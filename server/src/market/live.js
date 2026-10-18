'use strict';
// Live market overlay: attaches real Yahoo Finance data to the deterministic
// AlphaDesk universe, recomputes derived metrics and re-scores the analytics.
//
// Everything degrades gracefully: if the network (or Yahoo) is unavailable the
// engine keeps serving its simulated baseline, and the UI reports the source.
const { round } = require('../engine/prng');
const { computeHistoryMetrics, scoreUniverse } = require('../engine/universe');
const yahoo = require('./yahoo');
const symbols = require('./symbols');

const CURRENCY_FX = {
  USD: 1, INR: 88, GBP: 0.79, CAD: 1.36, EUR: 0.92, CHF: 0.88,
  JPY: 150, AUD: 1.52, HKD: 7.85, SGD: 1.3, KRW: 1350, TWD: 32,
};

const QUOTE_REFRESH_MS = 90 * 1000;
const HISTORY_REFRESH_MS = 8 * 60 * 60 * 1000;
const FUNDAMENTALS_REFRESH_MS = 20 * 60 * 60 * 1000;

let universeRef = null;
let hooks = { onRescore: null };
const inFlight = new Set();
const timers = [];

const status = {
  enabled: false,
  started: false,
  online: false,
  source: 'Yahoo Finance',
  revision: 0,
  startedAt: null,
  lastError: null,
  lastRefreshAt: null,
  quotes: { done: 0, total: 0, asOf: null },
  history: { done: 0, total: 0, asOf: null },
  fundamentals: { done: 0, total: 0, asOf: null },
  coverage: { price: 0, fundamentals: 0, history: 0 },
  unresolved: [],
};

function fxFor(currency) {
  return CURRENCY_FX[currency] != null ? CURRENCY_FX[currency] : 1;
}

function setLive(stock, patch) {
  stock.live = { ...(stock.live || {}), ...patch };
}

// ---------------------------------------------------------------------------
// Overlay application
// ---------------------------------------------------------------------------
function applyQuote(stock, quote) {
  if (!quote || quote.price == null || !(quote.price > 0)) return false;
  stock.price = round(quote.price, 2);
  if (quote.currency) stock.currency = quote.currency;
  if (quote.marketCapLocal != null) {
    stock.marketCap = Math.round(quote.marketCapLocal / fxFor(quote.currency || stock.currency));
  }
  if (quote.changePct != null) {
    stock.changePct = round(quote.changePct, 2);
    stock.liveChangePct = stock.changePct;
  }
  if (quote.avgVolume != null) stock.avgVolume = Math.round(quote.avgVolume);
  if (quote.volume != null) stock.volume = Math.round(quote.volume);
  if (quote.pe != null && quote.pe > 0) stock.pe = round(quote.pe, 2);
  if (quote.forwardPE != null && quote.forwardPE > 0) stock.forwardPE = round(quote.forwardPE, 2);
  if (quote.pb != null && quote.pb > 0) stock.pb = round(quote.pb, 2);
  if (quote.eps != null) stock.eps = round(quote.eps, 2);
  if (quote.dividendYield != null) stock.dividendYield = round(quote.dividendYield, 2);
  if (quote.dividendRate != null) stock.dividendRate = round(quote.dividendRate, 4);
  if (quote.sharesOutstanding != null) stock.sharesOutstanding = quote.sharesOutstanding;
  if (quote.fiftyTwoWeekHigh != null) stock.week52High = round(quote.fiftyTwoWeekHigh, 2);
  if (quote.fiftyTwoWeekLow != null) stock.week52Low = round(quote.fiftyTwoWeekLow, 2);
  if (quote.ma50 != null) stock.ma50Quote = round(quote.ma50, 2);
  if (quote.ma200 != null) stock.ma200Quote = round(quote.ma200, 2);
  if (quote.name) stock.realName = quote.name;
  if (quote.marketState) stock.marketState = quote.marketState;
  if (quote.analystRating) stock.analystRatingText = quote.analystRating;
  setLive(stock, {
    price: true,
    currency: quote.currency || stock.currency,
    marketState: quote.marketState || null,
    quoteAsOf: quote.marketTime || new Date().toISOString(),
  });
  return true;
}

function applyHistory(stock, hist) {
  if (!hist || !Array.isArray(hist.closes) || hist.closes.length < 30) return false;
  const minor = hist.currency === 'GBp' || hist.currency === 'ZAc';
  const closes = minor ? hist.closes.map((c) => round(c / 100, 2)) : hist.closes;
  stock.history = { dates: hist.dates, closes, volume: hist.volume };
  computeHistoryMetrics(stock);
  if (stock.liveChangePct != null) stock.changePct = round(stock.liveChangePct, 2);
  if (hist.fiftyTwoWeekHigh != null && stock.week52High == null) {
    stock.week52High = round(minor ? hist.fiftyTwoWeekHigh / 100 : hist.fiftyTwoWeekHigh, 2);
  }
  if (hist.fiftyTwoWeekLow != null && stock.week52Low == null) {
    stock.week52Low = round(minor ? hist.fiftyTwoWeekLow / 100 : hist.fiftyTwoWeekLow, 2);
  }
  setLive(stock, { history: true, historyAsOf: hist.fetchedAt || new Date().toISOString() });
  return true;
}

const FUNDAMENTAL_KEYS = [
  'roe', 'roa', 'netMargin', 'grossMargin', 'opMargin', 'ebitdaMargin',
  'revenueGrowth', 'epsGrowth', 'debtToEquity', 'currentRatio', 'beta',
  'ps', 'evEbitda', 'payoutRatio', 'freeCashFlowYield', 'interestCoverage', 'employees',
];

function applyFundamentals(stock, f) {
  if (!f) return false;
  for (const key of FUNDAMENTAL_KEYS) {
    if (f[key] != null && Number.isFinite(f[key])) stock[key] = f[key];
  }
  if (f.payoutRatio != null) stock.dividendPayout = f.payoutRatio;
  if (f.sector) stock.realSector = f.sector;
  if (f.industry) stock.realIndustry = f.industry;
  if (f.summary) stock.about = f.summary;
  if (f.website) stock.website = f.website;
  if (f.recommendation || f.targetMean != null) {
    stock.analyst = {
      recommendation: f.recommendation || null,
      targetMean: f.targetMean != null ? round(f.targetMean, 2) : null,
      targetHigh: f.targetHigh != null ? round(f.targetHigh, 2) : null,
      targetLow: f.targetLow != null ? round(f.targetLow, 2) : null,
      count: f.analystCount != null ? Math.round(f.analystCount) : null,
    };
  }
  setLive(stock, { fundamentals: true, fundamentalsAsOf: f.fetchedAt || new Date().toISOString() });
  return true;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
function coverage() {
  const stocks = universeRef ? universeRef.stocks : [];
  let price = 0;
  let fundamentals = 0;
  let history = 0;
  for (const s of stocks) {
    if (s.live && s.live.price) price++;
    if (s.live && s.live.fundamentals) fundamentals++;
    if (s.live && s.live.history) history++;
  }
  status.coverage = { price, fundamentals, history };
  return status.coverage;
}

function rescore() {
  if (!universeRef) return;
  scoreUniverse(universeRef);
  coverage();
  status.revision++;
  status.lastRefreshAt = new Date().toISOString();
  if (hooks.onRescore) hooks.onRescore();
}

function attach(entries) {
  return symbols.resolve(entries).then((map) => {
    const resolved = new Set();
    for (const stock of universeRef.stocks) {
      const sym = map.get(String(stock.ticker).toUpperCase()) || symbols.forTicker(stock.ticker);
      if (sym) {
        stock.yahooSymbol = sym;
        resolved.add(stock.ticker);
      }
    }
    status.unresolved = universeRef.stocks.filter((s) => !s.yahooSymbol).map((s) => s.ticker);
    return resolved;
  });
}

async function refreshQuotes() {
  const stocks = universeRef.stocks.filter((s) => s.yahooSymbol);
  const quotes = await yahoo.quoteBatch(stocks.map((s) => s.yahooSymbol), { fresh: true });

  // Fall back to the chart endpoint for symbols the quote endpoint omits.
  // Parallelized: with a whole-exchange universe this can be thousands of
  // symbols, so a serial loop would stall the refresh for minutes.
  const missing = stocks.filter((s) => !quotes.has(s.yahooSymbol));
  await pool(missing, 4, async (stock) => {
    try {
      const q = await yahoo.quoteFromChart(stock.yahooSymbol);
      if (q) quotes.set(stock.yahooSymbol, q);
    } catch (e) { /* keep the simulated baseline for this symbol */ }
  });

  let applied = 0;
  for (const stock of stocks) {
    const q = quotes.get(stock.yahooSymbol);
    if (q && applyQuote(stock, q)) applied++;
  }
  status.quotes = { done: applied, total: stocks.length, asOf: new Date().toISOString() };
  status.online = applied > 0;
  status.unresolved = stocks.filter((s) => !(s.live && s.live.price)).map((s) => s.ticker);
  return applied;
}

async function pool(items, size, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try { await worker(item); } catch (e) { /* per-item failures are non-fatal */ }
    }
  });
  await Promise.all(runners);
}

async function refreshHistoryAll({ limit = Infinity } = {}) {
  const stocks = universeRef.stocks.filter((s) => s.yahooSymbol).slice(0, limit);
  let done = 0;
  let sinceTick = 0;
  await pool(stocks, 3, async (stock) => {
    const hist = await yahoo.history(stock.yahooSymbol, { maxAgeMs: HISTORY_REFRESH_MS });
    if (hist && applyHistory(stock, hist)) done++;
    status.history.done = done;
    status.history.total = stocks.length;
    if (++sinceTick >= 12) { sinceTick = 0; status.history.asOf = new Date().toISOString(); rescore(); }
  });
  status.history = { done, total: stocks.length, asOf: new Date().toISOString() };
  rescore();
  return done;
}

async function refreshFundamentalsAll({ limit = Infinity } = {}) {
  const stocks = universeRef.stocks.filter((s) => s.yahooSymbol).slice(0, limit);
  let done = 0;
  let sinceTick = 0;
  await pool(stocks, 2, async (stock) => {
    const f = await yahoo.fundamentals(stock.yahooSymbol, { maxAgeMs: FUNDAMENTALS_REFRESH_MS });
    if (f && applyFundamentals(stock, f)) done++;
    status.fundamentals.done = done;
    status.fundamentals.total = stocks.length;
    if (++sinceTick >= 10) { sinceTick = 0; status.fundamentals.asOf = new Date().toISOString(); rescore(); }
  });
  status.fundamentals = { done, total: stocks.length, asOf: new Date().toISOString() };
  rescore();
  return done;
}

// On-demand enrichment (used when a stock page is opened).
function requestFundamentals(ticker) {
  const stock = universeRef && universeRef.byTicker.get(String(ticker).toUpperCase());
  if (!stock || !stock.yahooSymbol) return;
  if (stock.live && stock.live.fundamentals) {
    const age = Date.now() - Date.parse((stock.live.fundamentalsAsOf) || 0);
    if (age < FUNDAMENTALS_REFRESH_MS) return;
  }
  const key = `f:${stock.ticker}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  yahoo.fundamentals(stock.yahooSymbol, { maxAgeMs: 0 })
    .then((f) => { if (f && applyFundamentals(stock, f)) rescore(); })
    .catch(() => {})
    .finally(() => inFlight.delete(key));
}

function requestHistory(ticker) {
  const stock = universeRef && universeRef.byTicker.get(String(ticker).toUpperCase());
  if (!stock || !stock.yahooSymbol) return;
  const key = `h:${stock.ticker}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  yahoo.history(stock.yahooSymbol, { maxAgeMs: HISTORY_REFRESH_MS })
    .then((hist) => { if (hist && applyHistory(stock, hist)) rescore(); })
    .catch(() => {})
    .finally(() => inFlight.delete(key));
}

async function refreshNow() {
  if (!universeRef) return status;
  try {
    await refreshQuotes();
    rescore();
  } catch (e) {
    status.online = false;
    status.lastError = String((e && e.message) || e);
  }
  return status;
}

function schedule(name, ms, fn) {
  const timer = setInterval(() => { fn().catch(() => {}); }, ms);
  if (timer.unref) timer.unref();
  timers.push(timer);
  return name;
}

async function start(universe, options = {}) {
  if (status.started || !universe) return status;
  universeRef = universe;
  hooks = { onRescore: options.onRescore || null };
  status.enabled = true;
  status.started = true;
  status.startedAt = new Date().toISOString();

  try {
    await attach(universe.stocks.map((s) => ({ ticker: s.ticker, country: s.country, exchange: s.exchange })));
    if (!universeRef.stocks.some((s) => s.yahooSymbol)) throw new Error('no symbols resolved');
    await refreshQuotes();
    rescore();
  } catch (e) {
    status.online = false;
    status.lastError = String((e && e.message) || e);
    return status;
  }

  // Fill history + fundamentals in the background so the app is usable now.
  refreshHistoryAll().catch((e) => { status.lastError = String((e && e.message) || e); });
  refreshFundamentalsAll().catch((e) => { status.lastError = String((e && e.message) || e); });

  if (options.periodic !== false) {
    schedule('quotes', QUOTE_REFRESH_MS, refreshQuotes);
    schedule('history', HISTORY_REFRESH_MS, () => refreshHistoryAll());
    schedule('fundamentals', FUNDAMENTALS_REFRESH_MS, () => refreshFundamentalsAll());
  }
  return status;
}

function probe() {
  return yahoo.quoteBatch(['AAPL'], { fresh: true })
    .then((m) => ({ online: m.has('AAPL'), price: m.get('AAPL') ? m.get('AAPL').price : null }))
    .catch((e) => ({ online: false, error: String((e && e.message) || e) }));
}

function getStatus() {
  coverage();
  return {
    enabled: status.enabled,
    online: status.online,
    source: status.source,
    revision: status.revision,
    startedAt: status.startedAt,
    lastRefreshAt: status.lastRefreshAt,
    lastError: status.lastError,
    quotes: { ...status.quotes },
    history: { ...status.history },
    fundamentals: { ...status.fundamentals },
    coverage: { ...status.coverage },
    totals: { stocks: universeRef ? universeRef.stocks.length : 0 },
    unresolvedCount: status.unresolved.length,
    unresolved: status.unresolved.slice(0, 40),
  };
}

module.exports = {
  start, attach, refreshNow, refreshQuotes, refreshHistoryAll, refreshFundamentalsAll,
  requestFundamentals, requestHistory, getStatus, probe, rescore, applyQuote, applyHistory,
  applyFundamentals, CURRENCY_FX,
};
