// api.js — the single data-access layer for the AlphaDesk client.
//
// Every page talks to the AlphaDesk backend through the typed functions
// below, which follow the frozen API contract in alpha/DESIGN.md
// (all endpoints prefixed with /api, proxied by Vite to localhost:8787).
// Prices and company fundamentals are served from Yahoo Finance where
// available; picks, ratings and fair values are AlphaDesk's own model output.
//
// When VITE_USE_MOCK=1 is set at dev time and the real API is unreachable,
// calls transparently fall back to the deterministic generator in
// ../mock-api.js. Production builds default to the real API.

const MOCK_ENABLED = import.meta.env?.VITE_USE_MOCK === '1';

let mockModule = null;
async function loadMock() {
  if (!mockModule) mockModule = await import('../mock-api.js');
  return mockModule;
}

async function call(path, options = {}) {
  let res = null;
  let failure = null;
  try {
    res = await fetch(path, options);
  } catch (e) {
    failure = e; // network error / server down
  }
  if (res && res.ok) {
    try {
      return await res.json();
    } catch (e) {
      failure = e;
    }
  }
  if (MOCK_ENABLED) {
    const m = await loadMock();
    return dispatchMock(m, path, options);
  }
  const err = failure || new Error(`Request failed (${res ? res.status : 'no response'}): ${path}`);
  err.status = res ? res.status : 0;
  throw err;
}

function jsonOptions(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/* --------------------------- mock fallback dispatch ------------------------ */

async function dispatchMock(m, path, options = {}) {
  const url = new URL(path, 'http://mock.local');
  const p = url.pathname.replace(/^\/api/, '');
  const q = url.searchParams;

  if (p === '/propicks/strategies') return { strategies: m.strategies().strategies };
  if (p === '/propicks/featured') {
    return m.detail('us-large-cap-leaders');
  }
  if (p.startsWith('/propicks/strategies/')) {
    const slug = decodeURIComponent(p.split('/').pop());
    const d = m.detail(slug);
    if (!d) throw new Error(`Unknown strategy: ${slug}`);
    return d;
  }
  if (p === '/propicks/simulator') {
    return m.simulator({
      slug: q.get('slug') || undefined,
      amount: Number(q.get('amount')) || 10000,
      years: q.get('years') ? Number(q.get('years')) : null,
    });
  }
  if (p === '/stocks' && (options.method || 'GET') === 'GET') {
    const needle = (q.get('q') || '').toLowerCase();
    const limit = Number(q.get('limit')) || 8;
    const all = m.universe();
    const hits = needle
      ? all.filter((s) => s.ticker.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle))
      : all;
    return hits.slice(0, limit).map((s) => ({
      ticker: s.ticker, name: s.name, country: s.country, regionCode: s.regionCode,
      sector: s.sector, exchange: s.exchange, currency: s.currency,
      price: s.price, changePct: s.changePct,
    }));
  }
  if (p === '/stocks/batch') {
    let body = {};
    try { body = JSON.parse(options.body || '{}'); } catch { /* ignore */ }
    return { stocks: (body.tickers || []).map((t) => m.findStock(t)).filter(Boolean).map((s) => m.summary(s)) };
  }
  if (p.startsWith('/stocks/')) {
    const ticker = decodeURIComponent(p.split('/').pop());
    const s = m.findStock(ticker);
    if (!s) throw new Error(`Unknown ticker: ${ticker}`);
    const hist = m.priceHistory(ticker);
    const peers = m.universe()
      .filter((x) => x.sector === s.sector && x.ticker !== s.ticker)
      .slice(0, 5)
      .map((x) => ({ ticker: x.ticker, name: x.name, price: x.price, changePct: x.changePct }));
    return { ...s, history: { ...hist }, peers };
  }
  if (p === '/screener/filters') {
    return { filters: m.filters(), columns: m.screenerColumns() };
  }
  if (p === '/screener/run') {
    let body = {};
    try { body = JSON.parse(options.body || '{}'); } catch { /* ignore */ }
    return m.runScreener(body);
  }
  if (p === '/calendar') {
    return m.calendar({
      from: q.get('from') || undefined,
      to: q.get('to') || undefined,
      country: q.get('country') || undefined,
      importance: q.get('importance') || undefined,
    });
  }
  if (p === '/quotes') {
    return m.quotes(q.get('symbols') || '');
  }
  if (p === '/market/status' || p === '/market/refresh') {
    return mockMarketStatus(m);
  }
  if (p === '/market/probe') {
    return { online: false, error: 'mock mode — live provider not contacted' };
  }
  if (p === '/assistant/ask') {
    return m.ask(q.get('q') || '');
  }
  if (p === '/funds') {
    return { funds: [], status: { loaded: false, live: 0, sample: 0, total: 0, asOf: null } };
  }
  if (p.startsWith('/funds/')) {
    throw new Error('Mutual funds are unavailable in mock mode');
  }
  if (p === '/state') {
    if ((options.method || 'GET') === 'PUT') {
      return m.saveMockState(JSON.parse(options.body || '{}'));
    }
    return m.loadMockState();
  }
  if (p.startsWith('/watchlists/') && p.endsWith('/copy-strategy')) {
    const id = decodeURIComponent(p.split('/')[3]);
    const slug = JSON.parse(options.body || '{}').slug;
    const state = m.loadMockState();
    const d = m.detail(slug);
    const wl = state.watchlists.find((w) => w.id === id);
    if (wl && d) {
      d.picks.forEach((pick) => {
        if (!wl.tickers.includes(pick.ticker)) wl.tickers.push(pick.ticker);
      });
      m.saveMockState(state);
    }
    return { watchlist: wl, strategy: d ? d.strategy : null };
  }
  throw new Error(`Mock dispatch: unhandled endpoint ${path}`);
}

// Offline/simulated status shape for mock mode and for servers that predate
// the live market-data overlay. Never advertises a live provider we did not use.
function mockMarketStatus(m) {
  let total = 0;
  try { total = m.universe().length; } catch { total = 0; }
  return {
    enabled: false,
    online: false,
    source: null,
    revision: 0,
    startedAt: null,
    lastRefreshAt: null,
    lastError: null,
    quotes: { done: 0, total, asOf: null },
    history: { done: 0, total, asOf: null },
    fundamentals: { done: 0, total, asOf: null },
    coverage: { price: 0, fundamentals: 0, history: 0 },
    totals: { stocks: total },
    unresolvedCount: 0,
    unresolved: [],
  };
}

/* ------------------------------ typed helpers ------------------------------ */

/** GET /api/propicks/strategies */
export function getStrategies() {
  return call('/api/propicks/strategies');
}

/** GET /api/propicks/strategies/:slug */
export function getStrategy(slug) {
  return call(`/api/propicks/strategies/${encodeURIComponent(slug)}`);
}

/** GET /api/propicks/featured */
export function getFeatured() {
  return call('/api/propicks/featured');
}

/** GET /api/propicks/simulator?slug=&amount=&years= (years omitted = Max) */
export function getSimulator({ slug, amount = 10000, years }) {
  const params = new URLSearchParams({ slug, amount: String(amount) });
  if (years != null && years > 0) params.set('years', String(years));
  return call(`/api/propicks/simulator?${params.toString()}`);
}

/** GET /api/stocks?q=&limit= */
export function searchStocks(q, limit = 8) {
  const params = new URLSearchParams({ q: q || '', limit: String(limit) });
  return call(`/api/stocks?${params.toString()}`);
}

/** GET /api/stocks/:ticker */
export function getStock(ticker) {
  return call(`/api/stocks/${encodeURIComponent(String(ticker).toUpperCase())}`);
}

/** POST /api/stocks/batch { tickers: [...] } */
export function batchStocks(tickers) {
  return call('/api/stocks/batch', jsonOptions('POST', { tickers }));
}

/** GET /api/screener/filters */
export function getScreenerFilters() {
  return call('/api/screener/filters');
}

/** POST /api/screener/run */
export function runScreener(payload) {
  return call('/api/screener/run', jsonOptions('POST', payload));
}

/** GET /api/calendar?from=&to=&country=&importance= */
export function getCalendar({ from, to, country, importance } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (country) params.set('country', country);
  if (importance) params.set('importance', String(importance));
  const qs = params.toString();
  return call(`/api/calendar${qs ? `?${qs}` : ''}`);
}

/** GET /api/quotes?symbols=A,B,C */
export function getQuotes(symbols) {
  const list = Array.isArray(symbols) ? symbols.join(',') : String(symbols || '');
  return call(`/api/quotes?symbols=${encodeURIComponent(list)}`);
}

/** GET /api/assistant/ask?q= */
export function askAssistant(q) {
  return call(`/api/assistant/ask?q=${encodeURIComponent(q)}`);
}

/** GET /api/funds?q= — mutual-fund directory (real NAV metrics). */
export function getFunds(q) {
  return call(`/api/funds${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}

/** GET /api/funds/:id — one mutual fund. */
export function getFund(id) {
  return call(`/api/funds/${encodeURIComponent(id)}`);
}

/** GET /api/state */
export function getState() {
  return call('/api/state');
}

/** PUT /api/state (full state body) */
export function putState(state) {
  return call('/api/state', jsonOptions('PUT', state));
}

/** POST /api/watchlists/:id/copy-strategy { slug } */
export function copyStrategyToWatchlist(watchlistId, slug) {
  return call(`/api/watchlists/${encodeURIComponent(watchlistId)}/copy-strategy`,
    jsonOptions('POST', { slug }));
}

/** GET /api/market/status — live market-data overlay status (revision, coverage). */
export function getMarketStatus() {
  return call('/api/market/status');
}

/** POST /api/market/refresh — triggers an immediate quote refresh + re-score. */
export function refreshMarket() {
  return call('/api/market/refresh', { method: 'POST' });
}

/** GET /api/market/probe — provider reachability check. */
export function probeMarket() {
  return call('/api/market/probe');
}
