'use strict';
// Local single-user state persisted to server/data/state.json.
// Writes are atomic: temp file in the same directory, then rename.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function nowIso() {
  return new Date().toISOString();
}

function defaultState() {
  return {
    watchlists: [
      { id: 'wl-default', name: 'My Watchlist', tickers: ['AAPL', 'MSFT', 'NVDA', 'RELIANCE'], createdAt: nowIso() },
    ],
    alerts: [],
    savedScreeners: [],
    savedStrategies: [],
    notes: {},
  };
}

function readStateFile() {
  try {
    return fs.readFileSync(STATE_FILE, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function sanitize(input) {
  const state = defaultState();
  if (!input || typeof input !== 'object') return state;

  if (Array.isArray(input.watchlists)) {
    state.watchlists = input.watchlists.filter((w) => w && typeof w === 'object').map((w) => ({
      id: typeof w.id === 'string' && w.id ? w.id : `wl-${crypto.randomUUID()}`,
      name: typeof w.name === 'string' && w.name.trim() ? w.name.slice(0, 80) : 'Untitled watchlist',
      tickers: Array.isArray(w.tickers)
        ? [...new Set(w.tickers.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().toUpperCase()))]
        : [],
      createdAt: typeof w.createdAt === 'string' ? w.createdAt : nowIso(),
    }));
  }

  if (Array.isArray(input.alerts)) {
    state.alerts = input.alerts.filter((a) => a && typeof a === 'object').map((a) => ({
      id: typeof a.id === 'string' && a.id ? a.id : `al-${crypto.randomUUID()}`,
      ticker: typeof a.ticker === 'string' ? a.ticker.trim().toUpperCase() : '',
      type: typeof a.type === 'string' && a.type.trim() ? a.type.trim().slice(0, 40) : 'price_above',
      condition: typeof a.condition === 'string' && a.condition.trim() ? a.condition.trim().slice(0, 40) : '',
      value: typeof a.value === 'number' && Number.isFinite(a.value) ? a.value : 0,
      createdAt: typeof a.createdAt === 'string' ? a.createdAt : nowIso(),
      active: a.active !== false,
    })).filter((a) => a.ticker);
  }

  if (Array.isArray(input.savedScreeners)) {
    state.savedScreeners = input.savedScreeners.filter((s) => s && typeof s === 'object').map((s) => ({
      id: typeof s.id === 'string' && s.id ? s.id : `sc-${crypto.randomUUID()}`,
      name: typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 80) : 'Untitled screener',
      state: s.state && typeof s.state === 'object' ? s.state : {},
      createdAt: typeof s.createdAt === 'string' ? s.createdAt : nowIso(),
    }));
  }

  if (Array.isArray(input.savedStrategies)) {
    state.savedStrategies = [...new Set(input.savedStrategies.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()))];
  }

  if (input.notes && typeof input.notes === 'object' && !Array.isArray(input.notes)) {
    const notes = {};
    for (const [k, v] of Object.entries(input.notes)) {
      if (typeof v === 'string') notes[String(k).slice(0, 200)] = v.slice(0, 5000);
    }
    state.notes = notes;
  }

  return state;
}

function save(state) {
  const clean = sanitize(state);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STATE_FILE + `.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE); // atomic replace on the same volume
  return clean;
}

let cached = null;

function load() {
  if (cached) return cached;
  const raw = readStateFile();
  if (raw == null) {
    cached = save(defaultState());
    return cached;
  }
  try {
    cached = sanitize(JSON.parse(raw));
  } catch (e) {
    // Corrupt file: keep a backup and fall back to defaults.
    try {
      fs.copyFileSync(STATE_FILE, STATE_FILE + '.corrupt.bak');
    } catch (_) { /* ignore */ }
    cached = save(defaultState());
  }
  return cached;
}

function update(newState) {
  cached = save(newState);
  return cached;
}

function get() {
  return load();
}

module.exports = { get, update, load, sanitize, defaultState, STATE_FILE };
