'use strict';
// AlphaDesk JSON API router. Every response shape follows DESIGN.md.
// Errors: {error:{code,message}} with proper status codes.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const engine = require('./engine');
const state = require('./state');
const { STRATEGIES } = require('./engine/picks');

// Public tunnel URL, written by start-alpha.ps1 next to cloudflared.
function readTunnelUrl() {
  try {
    const f = path.join(os.homedir(), '.alphadesk', 'tunnel-url.txt');
    const raw = fs.readFileSync(f, 'utf8').trim();
    return raw || null;
  } catch {
    return null;
  }
}

const MAX_BODY = 1024 * 1024; // 1MB

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

function badRequest(message, code) {
  const err = new Error(message);
  err.status = 400;
  err.code = code || 'BAD_REQUEST';
  return err;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        const err = badRequest('Request body too large', 'BODY_TOO_LARGE');
        err.status = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(badRequest('Request body is not valid JSON', 'INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseIntParam(value, name) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest(`${name} must be a number`, 'BAD_PARAM');
  return n;
}

// Strips internal fields (poolSize, _stats) from the cached strategy payload
// and adds `favorite` from persisted state.
function strategyDetailWrap(payload) {
  const st = state.get();
  const { poolSize, ...strategy } = payload.strategy;
  return {
    strategy: { ...strategy, favorite: (st.savedStrategies || []).includes(payload.strategy.slug) },
    picks: payload.picks,
    history: payload.history,
    previousWinners: payload.previousWinners,
    basketChanges: payload.basketChanges,
    monthlyLedger: payload.monthlyLedger || [],
  };
}

// ---- route handlers ----

const routes = [
  {
    method: 'GET',
    segments: ['propicks', 'strategies'],
    handler(ctx) {
      const st = state.get();
      return engine.listStrategies(st.savedStrategies || []);
    },
    wrap: (data) => ({ strategies: data }),
  },
  {
    method: 'GET',
    segments: ['propicks', 'strategies', ':slug'],
    handler(ctx) {
      return engine.getStrategy(ctx.params.slug);
    },
    wrap: strategyDetailWrap,
  },
  {
    method: 'GET',
    segments: ['propicks', 'featured'],
    handler() {
      return engine.getFeatured();
    },
    wrap: strategyDetailWrap,
  },
  {
    method: 'GET',
    segments: ['propicks', 'simulator'],
    handler(ctx) {
      if (!ctx.query.slug) throw badRequest('slug is required', 'MISSING_SLUG');
      return engine.getSimulator({
        slug: ctx.query.slug,
        amount: ctx.query.amount,
        years: ctx.query.years,
      });
    },
  },
  {
    method: 'GET',
    segments: ['stocks'],
    handler(ctx) {
      const limit = parseIntParam(ctx.query.limit, 'limit') ?? 10;
      if (limit < 1 || limit > 50) throw badRequest('limit must be 1-50', 'BAD_LIMIT');
      const q = ctx.query.q || '';
      if (typeof q !== 'string' || q.length > 100) throw badRequest('q must be a string of at most 100 characters', 'BAD_QUERY');
      return engine.searchStocks(q, limit);
    },
    wrap: null, // bare array per contract
  },
  {
    method: 'GET',
    segments: ['stocks', ':ticker'],
    handler(ctx) {
      if (!ctx.params.ticker) throw badRequest('ticker is required', 'MISSING_TICKER');
      return engine.getStock(ctx.params.ticker, ctx.query.range);
    },
  },
  {
    method: 'POST',
    segments: ['stocks', 'batch'],
    async handler(ctx) {
      const body = ctx.body;
      if (!body || typeof body !== 'object') throw badRequest('Body must be a JSON object');
      if (!Array.isArray(body.tickers)) throw badRequest('tickers must be an array', 'BAD_TICKERS');
      if (body.tickers.length > 50) throw badRequest('A maximum of 50 tickers is allowed', 'BAD_TICKERS');
      for (const t of body.tickers) {
        if (typeof t !== 'string' || !t.trim() || t.length > 20) throw badRequest('each ticker must be a non-empty string', 'BAD_TICKERS');
      }
      return { stocks: engine.batchStocks(body.tickers) };
    },
  },
  {
    method: 'GET',
    segments: ['screener', 'filters'],
    handler() {
      return engine.getStocksScreenerFilters();
    },
  },
  {
    method: 'POST',
    segments: ['screener', 'run'],
    async handler(ctx) {
      if (!ctx.body || typeof ctx.body !== 'object') throw badRequest('Body must be a JSON object');
      return engine.runScreener(ctx.body);
    },
  },
  {
    method: 'GET',
    segments: ['calendar'],
    handler(ctx) {
      return engine.getCalendar(ctx.query);
    },
  },
  {
    method: 'GET',
    segments: ['quotes'],
    handler(ctx) {
      const raw = ctx.query.symbols;
      if (!raw) throw badRequest('symbols is required (comma separated)', 'MISSING_SYMBOLS');
      const symbols = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
      if (symbols.length > 50) throw badRequest('A maximum of 50 symbols is allowed', 'BAD_SYMBOLS');
      for (const s of symbols) {
        if (s.length > 20 || !/^[\w.\-]+$/.test(s)) throw badRequest(`Invalid symbol "${s}"`, 'BAD_SYMBOLS');
      }
      return { quotes: engine.getQuotes(symbols) };
    },
  },
  {
    method: 'GET',
    segments: ['market', 'status'],
    handler() {
      return engine.getMarketStatus();
    },
  },
  {
    method: 'GET',
    segments: ['tunnel'],
    handler() {
      return { url: readTunnelUrl() };
    },
  },
  {
    // Cheap liveness probe for hosting platforms / uptime monitors. Never
    // touches the engine or disk, so it stays fast even during warm-up.
    method: 'GET',
    segments: ['health'],
    handler() {
      return { ok: true, uptimeSeconds: Math.round(process.uptime()), node: process.version };
    },
  },
  {
    method: 'GET',
    segments: ['market', 'probe'],
    handler() {
      return engine.probeMarket();
    },
  },
  {
    method: 'POST',
    segments: ['market', 'refresh'],
    async handler() {
      await engine.refreshMarket();
      return engine.getMarketStatus();
    },
  },
  {
    method: 'GET',
    segments: ['funds'],
    handler(ctx) {
      return engine.getFunds(ctx.query.q);
    },
  },
  {
    method: 'GET',
    segments: ['funds', ':id'],
    handler(ctx) {
      return engine.getFund(ctx.params.id);
    },
  },
  {
    method: 'GET',
    segments: ['assistant', 'ask'],
    handler(ctx) {
      if (ctx.query.q == null) throw badRequest('q is required', 'MISSING_Q');
      return engine.ask(String(ctx.query.q), state.get());
    },
  },
  {
    method: 'GET',
    segments: ['state'],
    handler() {
      return state.get();
    },
  },
  {
    method: 'PUT',
    segments: ['state'],
    async handler(ctx) {
      const body = ctx.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw badRequest('Body must be a full state object');
      }
      if (body.watchlists != null && !Array.isArray(body.watchlists)) throw badRequest('watchlists must be an array');
      if (body.alerts != null && !Array.isArray(body.alerts)) throw badRequest('alerts must be an array');
      if (body.savedScreeners != null && !Array.isArray(body.savedScreeners)) throw badRequest('savedScreeners must be an array');
      if (body.savedStrategies != null && !Array.isArray(body.savedStrategies)) throw badRequest('savedStrategies must be an array');
      if (body.notes != null && (typeof body.notes !== 'object' || Array.isArray(body.notes))) throw badRequest('notes must be an object');
      state.update(body);
      return { ok: true };
    },
  },
  {
    method: 'POST',
    segments: ['watchlists', ':id', 'copy-strategy'],
    async handler(ctx) {
      const body = ctx.body;
      if (!body || typeof body !== 'object') throw badRequest('Body must be a JSON object');
      if (typeof body.slug !== 'string' || !body.slug) throw badRequest('slug is required', 'MISSING_SLUG');
      const def = STRATEGIES.find((d) => d.slug === body.slug);
      if (!def) {
        const err = new Error(`No strategy with slug "${body.slug}"`);
        err.status = 404;
        err.code = 'UNKNOWN_STRATEGY';
        throw err;
      }
      const st = state.get();
      const wl = (st.watchlists || []).find((w) => w.id === ctx.params.id);
      if (!wl) {
        const err = new Error(`No watchlist with id "${ctx.params.id}"`);
        err.status = 404;
        err.code = 'UNKNOWN_WATCHLIST';
        throw err;
      }
      const payload = engine.getStrategy(def.slug);
      const tickers = payload.picks.map((p) => p.ticker);
      wl.tickers = [...new Set([...wl.tickers, ...tickers])];
      state.update(st);
      return { ok: true, watchlist: wl };
    },
  },
];

function matchRoute(method, segments) {
  const hasParams = (route) => route.segments.some((s) => s.startsWith(':'));

  const test = (route) => {
    if (route.segments.length !== segments.length) return null;
    const params = {};
    for (let i = 0; i < route.segments.length; i++) {
      const rs = route.segments[i];
      if (rs.startsWith(':')) params[rs.slice(1)] = decodeURIComponent(segments[i]);
      else if (rs !== segments[i]) return null;
    }
    return params;
  };

  // Pass 1: exact (parameterless) routes — these win over parameter routes so
  // e.g. GET /api/stocks/batch answers 405 rather than treating "batch" as a ticker.
  let exactPathMatched = false;
  for (const route of routes) {
    if (hasParams(route)) continue;
    const params = test(route);
    if (!params) continue;
    if (route.method === method) return { route, params };
    exactPathMatched = true;
  }
  if (exactPathMatched) return { methodMismatch: true };

  // Pass 2: parameterized routes.
  let pathMatched = false;
  for (const route of routes) {
    if (!hasParams(route)) continue;
    const params = test(route);
    if (!params) continue;
    if (route.method === method) return { route, params };
    pathMatched = true;
  }
  return pathMatched ? { methodMismatch: true } : null;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  if (!pathname.startsWith('/api')) return false;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
  }

  const rest = pathname.slice(4).replace(/^\/+/, '');
  const segments = rest.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  const query = Object.fromEntries(url.searchParams.entries());

  const match = matchRoute(req.method, segments);
  if (!match) {
    sendError(res, 404, 'NOT_FOUND', `No API route for ${req.method} ${pathname}`);
    return true;
  }
  if (match.methodMismatch) {
    sendError(res, 405, 'METHOD_NOT_ALLOWED', `${req.method} is not allowed for ${pathname}`);
    return true;
  }

  try {
    let body = null;
    if (req.method === 'POST' || req.method === 'PUT') {
      body = await readBody(req);
    }
    const ctx = { params: match.params, query, body };
    const data = await match.route.handler(ctx);
    const out = match.route.wrap === undefined ? data : match.route.wrap ? match.route.wrap(data) : data;
    sendJson(res, 200, out);
  } catch (err) {
    const status = err.status || 500;
    const code = err.code || 'INTERNAL_ERROR';
    const message = status === 500 ? 'Internal server error' : err.message;
    if (status === 500) console.error('[api] 500:', err);
    sendError(res, status, code, message);
  }
  return true;
}

module.exports = { handle, sendJson, sendError };
