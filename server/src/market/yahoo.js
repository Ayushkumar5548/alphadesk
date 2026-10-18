'use strict';
// Yahoo Finance endpoints used by AlphaDesk:
//   /v7/finance/quote          — batch real-time-ish quotes (price, cap, P/E…)
//   /v8/finance/chart          — daily OHLC history
//   /v10/finance/quoteSummary  — full fundamentals profile (per symbol)
//   /v1/finance/search         — symbol search
// All responses are normalized to plain numbers (Yahoo returns {raw,fmt}).
const {
  getJson, createMemCache, createDiskCache, sleep,
} = require('./provider');

const HOST = 'query1.finance.yahoo.com';
const SEARCH_HOST = 'query2.finance.yahoo.com';

const quoteCache = createMemCache(30 * 1000);   // quotes: 30s in memory
const historyCache = createDiskCache('history', { ttlMs: 10 * 60 * 60 * 1000, gzip: true });
const summaryCache = createDiskCache('fundamentals', { ttlMs: 24 * 60 * 60 * 1000 });

function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v && typeof v === 'object' && typeof v.raw === 'number' && Number.isFinite(v.raw)) return v.raw;
  return null;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------
// Yahoo quotes London/Johannesburg in minor units (pence). Scale every
// price-denominated field — but not market cap, which is in major units.
function finalizeQuote(raw) {
  const rawCurrency = raw.currency || 'USD';
  const scale = (rawCurrency === 'GBp' || rawCurrency === 'ZAc') ? 0.01 : 1;
  let currency = rawCurrency;
  if (currency === 'GBp') currency = 'GBP';
  else if (currency === 'ZAc') currency = 'ZAR';
  const s = (v) => (v == null || !Number.isFinite(v) ? null : v * scale);
  return {
    symbol: raw.symbol,
    name: raw.name || null,
    currency,
    rawCurrency,
    exchange: raw.exchange || null,
    market: raw.market || null,
    marketState: raw.marketState || null,
    price: s(raw.price),
    changePct: num(raw.changePct),
    change: s(raw.change),
    previousClose: s(raw.previousClose),
    open: s(raw.open),
    dayHigh: s(raw.dayHigh),
    dayLow: s(raw.dayLow),
    marketCapLocal: num(raw.marketCapLocal),
    sharesOutstanding: num(raw.sharesOutstanding),
    volume: num(raw.volume),
    avgVolume: num(raw.avgVolume),
    fiftyTwoWeekHigh: s(raw.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: s(raw.fiftyTwoWeekLow),
    fiftyTwoWeekChangePct: num(raw.fiftyTwoWeekChangePct),
    ma50: s(raw.ma50),
    ma200: s(raw.ma200),
    pe: num(raw.pe),
    forwardPE: num(raw.forwardPE),
    pb: num(raw.pb),
    bookValue: s(raw.bookValue),
    eps: s(raw.eps),
    epsForward: s(raw.epsForward),
    dividendRate: s(raw.dividendRate),
    dividendYield: num(raw.dividendYield),
    analystRating: raw.analystRating || null,
    marketTime: raw.marketTime || null,
    earningsTime: raw.earningsTime || null,
  };
}

function normalizeQuote(q) {
  if (!q || !q.symbol) return null;
  const marketTime = num(q.regularMarketTime);
  return finalizeQuote({
    symbol: q.symbol,
    name: q.longName || q.shortName || q.displayName,
    currency: q.currency || 'USD',
    exchange: q.fullExchangeName || q.exchange,
    market: q.market,
    marketState: q.marketState,
    price: num(q.regularMarketPrice),
    changePct: num(q.regularMarketChangePercent),
    change: num(q.regularMarketChange),
    previousClose: num(q.regularMarketPreviousClose),
    open: num(q.regularMarketOpen),
    dayHigh: num(q.regularMarketDayHigh),
    dayLow: num(q.regularMarketDayLow),
    marketCapLocal: num(q.marketCap),
    sharesOutstanding: num(q.sharesOutstanding) || num(q.impliedSharesOutstanding),
    volume: num(q.regularMarketVolume),
    avgVolume: num(q.averageDailyVolume3Month) || num(q.averageDailyVolume10Day),
    fiftyTwoWeekHigh: num(q.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(q.fiftyTwoWeekLow),
    fiftyTwoWeekChangePct: num(q.fiftyTwoWeekChangePercent),
    ma50: num(q.fiftyDayAverage),
    ma200: num(q.twoHundredDayAverage),
    pe: num(q.trailingPE),
    forwardPE: num(q.forwardPE),
    pb: num(q.priceToBook),
    bookValue: num(q.bookValue),
    eps: num(q.epsTrailingTwelveMonths),
    epsForward: num(q.epsForward),
    dividendRate: num(q.dividendRate) != null ? num(q.dividendRate) : num(q.trailingAnnualDividendRate),
    dividendYield: num(q.dividendYield) != null ? num(q.dividendYield)
      : (num(q.trailingAnnualDividendYield) != null ? num(q.trailingAnnualDividendYield) * 100 : null),
    analystRating: q.averageAnalystRating,
    marketTime: marketTime ? new Date(marketTime * 1000).toISOString() : null,
    earningsTime: num(q.earningsTimestamp) ? new Date(num(q.earningsTimestamp) * 1000).toISOString() : null,
  });
}

// Fallback quote built from the chart endpoint's meta block. Used for the rare
// symbol the quote endpoint omits (e.g. a very recent listing).
async function quoteFromChart(symbol) {
  const json = await getJson(HOST, `/v8/finance/chart/${encodeURIComponent(symbol)}`, { range: '5d', interval: '1d' }, { auth: false });
  const meta = json && json.chart && json.chart.result && json.chart.result[0] && json.chart.result[0].meta;
  if (!meta || meta.regularMarketPrice == null) return null;
  const price = num(meta.regularMarketPrice);
  const prev = num(meta.chartPreviousClose) || num(meta.previousClose);
  return finalizeQuote({
    symbol,
    name: meta.longName || meta.shortName,
    currency: meta.currency || 'USD',
    exchange: meta.fullExchangeName || meta.exchangeName,
    price,
    changePct: prev ? ((price / prev) - 1) * 100 : null,
    previousClose: prev,
    dayHigh: num(meta.regularMarketDayHigh),
    dayLow: num(meta.regularMarketDayLow),
    volume: num(meta.regularMarketVolume),
    fiftyTwoWeekHigh: num(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(meta.fiftyTwoWeekLow),
    marketTime: num(meta.regularMarketTime) ? new Date(num(meta.regularMarketTime) * 1000).toISOString() : null,
  });
}

async function quoteBatch(symbols, { fresh = false } = {}) {
  const wanted = [...new Set(symbols.filter(Boolean))];
  const out = new Map();
  const missing = [];
  for (const sym of wanted) {
    const cached = fresh ? null : quoteCache.get(sym);
    if (cached) out.set(sym, cached);
    else missing.push(sym);
  }
  for (const batch of chunk(missing, 40)) {
    const json = await getJson(HOST, '/v7/finance/quote', { symbols: batch.join(','), formatted: 'false' });
    const results = (json && json.quoteResponse && json.quoteResponse.result) || [];
    for (const q of results) {
      const nq = normalizeQuote(q);
      if (!nq || nq.price == null) continue;
      quoteCache.set(nq.symbol, nq);
      out.set(nq.symbol, nq);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Daily history
// ---------------------------------------------------------------------------
// Date-string intern cache: all stocks share the same trading calendar, so we
// collapse identical "YYYY-MM-DD" strings into shared references. Without this
// a whole-exchange universe would allocate millions of duplicate date strings.
const dateIntern = new Date(0);
const dateCache = new Map();
function dateKey(ts) {
  dateIntern.setTime(ts * 1000);
  const key = `${dateIntern.getUTCFullYear()}-${String(dateIntern.getUTCMonth() + 1).padStart(2, '0')}-${String(dateIntern.getUTCDate()).padStart(2, '0')}`;
  let s = dateCache.get(key);
  if (s === undefined) {
    s = key;
    if (dateCache.size > 4000) dateCache.clear(); // bounded growth
    dateCache.set(key, s);
  }
  return s;
}

function historyFromChart(json) {
  const res = json && json.chart && json.chart.result && json.chart.result[0];
  if (!res || !Array.isArray(res.timestamp)) return null;
  const quoteSeries = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const closes = quoteSeries.close || [];
  const volumes = quoteSeries.volume || [];
  const dates = [];
  const close = [];
  const volume = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    const c = closes[i];
    if (typeof c !== 'number' || !Number.isFinite(c)) continue;
    dates.push(dateKey(res.timestamp[i]));
    close.push(Math.round(c * 100) / 100);
    volume.push(Number.isFinite(volumes[i]) ? Math.round(volumes[i]) : 0);
  }
  if (!close.length) return null;
  return {
    symbol: res.meta && res.meta.symbol,
    currency: res.meta && res.meta.currency,
    exchangeTimezone: res.meta && res.meta.exchangeTimezoneName,
    dates,
    closes: close,
    volume,
    lastPrice: close[close.length - 1],
    fiftyTwoWeekHigh: res.meta && num(res.meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: res.meta && num(res.meta.fiftyTwoWeekLow),
    fetchedAt: new Date().toISOString(),
  };
}

async function chartRaw(symbol, range = '5y', interval = '1d') {
  const json = await getJson(HOST, `/v8/finance/chart/${encodeURIComponent(symbol)}`, {
    range, interval, includePrePost: 'false',
  }, { auth: false });
  return historyFromChart(json);
}

async function history(symbol, { maxAgeMs = 10 * 60 * 60 * 1000, onProgress } = {}) {
  if (!symbol) return null;
  const cached = historyCache.get(symbol);
  if (cached && Date.now() - Date.parse(cached.fetchedAt || 0) < maxAgeMs && cached.closes.length >= 20) return cached;

  let fresh = null;
  try { fresh = await chartRaw(symbol, '5y', '1d'); } catch (e) { /* fall through */ }
  // Newly listed / recently reorganised entities can return a single bar for a
  // 5y range; `max` still carries the full (shorter) series.
  if (!fresh || fresh.closes.length < 60) {
    try {
      const alt = await chartRaw(symbol, 'max', '1d');
      if (alt && alt.closes.length > (fresh ? fresh.closes.length : 0)) fresh = alt;
    } catch (e) { /* keep whatever we have */ }
  }
  if (!fresh) return cached || null;
  historyCache.set(symbol, fresh);
  if (onProgress) onProgress(symbol, fresh);
  return fresh;
}

// ---------------------------------------------------------------------------
// Fundamentals (quoteSummary)
// ---------------------------------------------------------------------------
const SUMMARY_MODULES = 'assetProfile,summaryDetail,defaultKeyStatistics,financialData,price';

function pct(fraction) {
  return fraction == null ? null : Math.round(fraction * 10000) / 100;
}

function normalizeSummary(module, symbol) {
  if (!module) return null;
  const price = module.price || {};
  const sd = module.summaryDetail || {};
  const ks = module.defaultKeyStatistics || {};
  const fin = module.financialData || {};
  const ap = module.assetProfile || {};
  const marketCap = num(price.marketCap);
  const fcf = num(fin.freeCashflow);
  const ebitda = num(fin.ebitda);
  const interestExpense = num(fin.interestExpense);

  return {
    symbol,
    // Quality / profitability
    roe: pct(num(fin.returnOnEquity)),
    roa: pct(num(fin.returnOnAssets)),
    netMargin: pct(num(fin.profitMargins)),
    grossMargin: pct(num(fin.grossMargins)),
    opMargin: pct(num(fin.operatingMargins)),
    ebitdaMargin: pct(num(fin.ebitdaMargins)),
    // Growth
    revenueGrowth: pct(num(fin.revenueGrowth)),
    epsGrowth: pct(num(fin.earningsGrowth) != null ? num(fin.earningsGrowth) : num(fin.earningsQuarterlyGrowth)),
    // Balance sheet / risk
    debtToEquity: num(fin.debtToEquity) != null ? Math.round((num(fin.debtToEquity) / 100) * 100) / 100 : null,
    currentRatio: num(fin.currentRatio) != null ? Math.round(num(fin.currentRatio) * 100) / 100 : null,
    totalDebt: num(fin.totalDebt),
    totalCash: num(fin.totalCash),
    beta: num(sd.beta) != null ? Math.round(num(sd.beta) * 100) / 100 : (num(ks.beta) != null ? Math.round(num(ks.beta) * 100) / 100 : null),
    // Multiples
    ps: num(sd.priceToSalesTrailing12Months) != null ? Math.round(num(sd.priceToSalesTrailing12Months) * 100) / 100 : null,
    evEbitda: num(ks.enterpriseToEbitda) != null ? Math.round(num(ks.enterpriseToEbitda) * 10) / 10 : null,
    enterpriseValue: num(ks.enterpriseValue),
    payoutRatio: pct(num(sd.payoutRatio)),
    freeCashFlowYield: (fcf != null && marketCap) ? Math.round((fcf / marketCap) * 10000) / 100 : null,
    interestCoverage: (ebitda != null && interestExpense) ? Math.round((ebitda / interestExpense) * 10) / 10 : null,
    // Profile
    sector: ap.sector || null,
    industry: ap.industry || null,
    employees: num(ap.fullTimeEmployees),
    website: ap.website || null,
    country: ap.country || null,
    summary: ap.longBusinessSummary ? String(ap.longBusinessSummary).replace(/\s+/g, ' ').slice(0, 1200) : null,
    // Analyst view
    recommendation: fin.recommendationKey || null,
    targetMean: num(fin.targetMeanPrice),
    targetHigh: num(fin.targetHighPrice),
    targetLow: num(fin.targetLowPrice),
    analystCount: num(fin.numberOfAnalystOpinions),
    fetchedAt: new Date().toISOString(),
  };
}

async function fundamentals(symbol, { maxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  if (!symbol) return null;
  const cached = summaryCache.get(symbol);
  if (cached && Date.now() - Date.parse(cached.fetchedAt || 0) < maxAgeMs) return cached;
  const json = await getJson(HOST, `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`, { modules: SUMMARY_MODULES });
  const result = json && json.quoteSummary && json.quoteSummary.result && json.quoteSummary.result[0];
  if (!result) return cached || null;
  const norm = normalizeSummary(result, symbol);
  if (norm) summaryCache.set(symbol, norm);
  return norm || cached || null;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
async function search(query, count = 8) {
  const json = await getJson(SEARCH_HOST, '/v1/finance/search', {
    q: query, quotesCount: count, newsCount: 0, listsCount: 0, enableFuzzyQuery: 'false',
  });
  const quotes = (json && json.quotes) || [];
  return quotes
    .filter((q) => q && q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
    .map((q) => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      exchange: q.exchDisp || q.exchange,
      type: q.quoteType,
      score: q.score,
    }));
}

function cacheInfo() {
  return { historyFile: historyCache.file, summaryFile: summaryCache.file, quoteCacheSize: quoteCache.size() };
}

module.exports = {
  normalizeQuote,
  finalizeQuote,
  quoteFromChart,
  quoteBatch,
  history,
  chartRaw,
  fundamentals,
  search,
  cacheInfo,
  quoteCache,
  historyCache,
  summaryCache,
  chunk,
  num,
  sleep,
};
