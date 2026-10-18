'use strict';
// Low-level plumbing for the Yahoo Finance market-data provider:
// an authenticated session (cookie + crumb), a global rate limiter, and
// memory/disk caches. Zero npm dependencies — uses Node's global fetch.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'market');
const SESSION_FILE = path.join(DATA_DIR, 'session.json');
const SESSION_TTL_MS = 3 * 60 * 60 * 1000; // refresh the cookie/crumb every 3h

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJsonFile(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function readGzJsonFile(file) {
  try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')); } catch (e) { return null; }
}

function writeAtomic(file, buf) {
  ensureDataDir();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}

function writeJsonFile(file, data) { writeAtomic(file, Buffer.from(JSON.stringify(data), 'utf8')); }
function writeGzJsonFile(file, data) { writeAtomic(file, zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8'), { level: 6 })); }

// ---------------------------------------------------------------------------
// Global rate limiter: at most `concurrency` requests in flight, and at least
// `minGapMs` between request starts.
// ---------------------------------------------------------------------------
function createLimiter(concurrency, minGapMs) {
  let active = 0;
  let lastStart = 0;
  const queue = [];
  function pump() {
    if (!queue.length || active >= concurrency) return;
    const wait = Math.max(0, lastStart + minGapMs - Date.now());
    if (wait > 0) { setTimeout(pump, wait).unref?.(); return; }
    const job = queue.shift();
    active++;
    lastStart = Date.now();
    Promise.resolve()
      .then(job.fn)
      .then(job.resolve, job.reject)
      .finally(() => { active--; pump(); });
  }
  return function schedule(fn) {
    return new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); pump(); });
  };
}

const limiter = createLimiter(4, 60);

// ---------------------------------------------------------------------------
// Yahoo session (cookie + crumb). The crumb is required by the quote,
// quoteSummary and search endpoints; the chart endpoint works without it.
// ---------------------------------------------------------------------------
const jar = { cookie: '', crumb: '', epoch: 0 };
let refreshing = null;

function loadSession() {
  const s = readJsonFile(SESSION_FILE);
  if (s && typeof s.cookie === 'string' && typeof s.crumb === 'string' && s.crumb && !/\s/.test(s.crumb)) {
    jar.cookie = s.cookie;
    jar.crumb = s.crumb;
    jar.epoch = Number(s.epoch) || 0;
  }
}

function persistSession() {
  writeJsonFile(SESSION_FILE, { cookie: jar.cookie, crumb: jar.crumb, epoch: jar.epoch });
}

function sessionFresh() {
  return Boolean(jar.cookie && jar.crumb && Date.now() - jar.epoch < SESSION_TTL_MS);
}

async function refreshSession() {
  const cookies = {};
  try {
    const res = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'follow' });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  } catch (e) { /* fc.yahoo.com often 404s but still sets A1/A3; crumb usually works regardless */ }

  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, cookie, Accept: '*/*' },
  });
  if (!res.ok) throw new Error(`Yahoo session: crumb request failed (HTTP ${res.status})`);
  const crumb = (await res.text()).trim();
  if (!crumb || crumb.length > 64 || /\s/.test(crumb)) throw new Error('Yahoo session: invalid crumb');
  jar.cookie = cookie;
  jar.crumb = crumb;
  jar.epoch = Date.now();
  persistSession();
  return jar;
}

async function ensureSession() {
  if (sessionFresh()) return jar;
  if (!refreshing) refreshing = refreshSession().finally(() => { refreshing = null; });
  return refreshing;
}

function invalidateSession() {
  jar.crumb = '';
  jar.epoch = 0;
}

// ---------------------------------------------------------------------------
// JSON GET with session injection, retry/backoff and rate limiting.
// ---------------------------------------------------------------------------
async function getJson(host, pathname, params = {}, { auth = true, attempts = 4 } = {}) {
  let backoff = 400;
  for (let attempt = 1; ; attempt++) {
    try {
      return await limiter(async () => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
          if (v != null && v !== '') qs.set(k, String(v));
        }
        const headers = { 'User-Agent': UA, Accept: 'application/json' };
        if (auth) {
          const s = await ensureSession();
          headers.cookie = s.cookie;
          qs.set('crumb', s.crumb);
        }
        const res = await fetch(`https://${host}${pathname}?${qs.toString()}`, { headers });
        if (res.status === 401 || res.status === 403) {
          invalidateSession();
          const err = new Error(`auth ${res.status}`);
          err.auth = true;
          throw err;
        }
        if (res.status === 429 || res.status >= 500) {
          const err = new Error(`http ${res.status}`);
          err.retryable = true;
          throw err;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${pathname}`);
        return res.json();
      });
    } catch (err) {
      const canRetry = err.retryable || err.auth;
      if (attempt >= attempts || !canRetry) throw err;
      await sleep(backoff + Math.floor(Math.random() * 200));
      backoff *= 2;
    }
  }
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------
function createMemCache(ttlMs) {
  const map = new Map();
  return {
    get(key) {
      const entry = map.get(key);
      if (!entry) return null;
      if (ttlMs && Date.now() - entry.t > ttlMs) return null;
      return entry.v;
    },
    set(key, value) { map.set(key, { t: Date.now(), v: value }); },
    size() { return map.size; },
  };
}

// Disk cache: one file per namespace, lazily loaded, writes debounced.
function createDiskCache(name, { ttlMs = 0, gzip = false } = {}) {
  const file = path.join(DATA_DIR, gzip ? `${name}.json.gz` : `${name}.json`);
  let store = null;
  let dirty = false;
  let timer = null;

  function load() {
    if (store) return store;
    const raw = gzip ? readGzJsonFile(file) : readJsonFile(file);
    store = raw && typeof raw === 'object' ? raw : {};
    return store;
  }

  function flush() {
    timer = null;
    if (!dirty || !store) return;
    dirty = false;
    try {
      if (gzip) writeGzJsonFile(file, store);
      else writeJsonFile(file, store);
    } catch (e) { /* cache writes are best-effort */ }
  }

  return {
    get(key) {
      const entry = load()[key];
      if (!entry) return null;
      if (ttlMs && Date.now() - entry.t > ttlMs) return null;
      return entry.v;
    },
    set(key, value) {
      load()[key] = { t: Date.now(), v: value };
      dirty = true;
      if (!timer) {
        timer = setTimeout(flush, 1200);
        if (timer.unref) timer.unref();
      }
    },
    all() { return load(); },
    flush,
    file,
  };
}

// Restore a persisted session at load so restarts skip the cookie/crumb dance.
loadSession();

module.exports = {
  UA,
  DATA_DIR,
  sleep,
  getJson,
  createLimiter,
  createMemCache,
  createDiskCache,
  ensureSession,
  invalidateSession,
  loadSession,
  sessionFresh,
  limiter,
};
