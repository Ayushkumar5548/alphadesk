'use strict';
// Maps the (human) tickers used across AlphaDesk to Yahoo Finance symbols.
// Most markets are resolved by suffix; ambiguous ones are bulk-tested against
// the quote endpoint and the winning symbols are cached on disk so each
// ticker is only resolved once.
const { createDiskCache } = require('./provider');
const yahoo = require('./yahoo');

const SUFFIX = {
  US: '',
  IN: '.NS',
  GB: '.L',
  CA: '.TO',
  DE: '.DE',
  FR: '.PA',
  NL: '.AS',
  CH: '.SW',
  ES: '.MC',
  IT: '.MI',
  JP: '.T',
  AU: '.AX',
  HK: '.HK',
  SG: '.SI',
  KR: '.KS',
  TW: '.TW',
};

// Extra candidates tried (in order) when the primary suffix does not resolve.
const ALTERNATES = {
  US: [''],
  IN: ['.NS', '.BO'],
  DE: ['.DE', '.F', '.BE'],
  KR: ['.KS', '.KQ'],
  TW: ['.TW', '.TWO'],
  JP: ['.T'],
  HK: ['.HK'],
  SG: ['.SI'],
};

// Yahoo `market` code prefix expected for each country (informational only).
const MARKET_CODE = {
  US: 'us_market', IN: 'in_market', GB: 'gb_market', CA: 'ca_market',
  DE: 'de_market', FR: 'fr_market', NL: 'nl_market', CH: 'ch_market',
  ES: 'es_market', IT: 'it_market', JP: 'jp_market', AU: 'au_market',
  HK: 'hk_market', SG: 'sg_market', KR: 'kr_market', TW: 'tw_market',
};

// Exact-ticker overrides mapping straight to a full Yahoo symbol. Used for US
// class shares (dash on Yahoo), exchange-qualified tickers that already carry
// their suffix, and symbols the quote endpoint does not return.
const SYMBOL_OVERRIDES = {
  'BRK.B': 'BRK-B',
  'BRK.A': 'BRK-A',
  'BF.B': 'BF-B',
  'T.TO': 'T.TO',
  'SAN.PA': 'SAN.PA',
  'SU.PA': 'SU.PA',
  WBD: 'WBD', // recently listed split entity: quote endpoint omits it, chart works
};

const resolveCache = createDiskCache('symbols');

function baseTicker(entry) {
  const t = String(entry.ticker || '').trim().toUpperCase();
  if (SYMBOL_OVERRIDES[t]) return SYMBOL_OVERRIDES[t];
  if (entry.country === 'US') return t.replace(/\./g, '-');
  if (entry.country === 'HK') return t.padStart(4, '0');
  return t;
}

function candidates(entry) {
  const t = String(entry.ticker || '').trim().toUpperCase();
  if (SYMBOL_OVERRIDES[t]) return [SYMBOL_OVERRIDES[t]];
  const list = ALTERNATES[entry.country] || [SUFFIX[entry.country] || ''];
  const base = baseTicker(entry);
  return [...new Set(list.map((sfx) => `${base}${sfx}`))];
}

// Resolve every entry that is not already cached. Returns Map(ticker -> symbol).
async function resolve(entries, { onProgress } = {}) {
  const resolved = new Map();
  const pending = [];
  for (const entry of entries) {
    const key = String(entry.ticker).toUpperCase();
    const cached = resolveCache.get(key);
    if (cached) { resolved.set(key, cached); continue; }
    if (SYMBOL_OVERRIDES[key]) {
      resolveCache.set(key, SYMBOL_OVERRIDES[key]);
      resolved.set(key, SYMBOL_OVERRIDES[key]);
      continue;
    }
    pending.push(entry);
  }
  if (!pending.length) return resolved;

  // Candidate symbol -> owner ticker (first owner wins for shared candidates).
  const owner = new Map();
  const all = [];
  for (const entry of pending) {
    for (const sym of candidates(entry)) {
      if (!owner.has(sym)) { owner.set(sym, String(entry.ticker).toUpperCase()); all.push(sym); }
    }
  }

  const hits = new Map(); // symbol -> quote
  for (const batch of yahoo.chunk(all, 40)) {
    let quotes;
    try {
      quotes = await yahoo.quoteBatch(batch, { fresh: true });
    } catch (e) {
      continue; // a failed batch just leaves those tickers unresolved
    }
    for (const [sym, quote] of quotes) hits.set(sym, quote);
  }

  for (const entry of pending) {
    const key = String(entry.ticker).toUpperCase();
    const wanted = MARKET_CODE[entry.country];
    const cands = candidates(entry);
    let pick = cands.find((sym) => hits.has(sym) && (!wanted || !hits.get(sym).market || hits.get(sym).market === wanted));
    if (!pick) pick = cands.find((sym) => hits.has(sym));
    if (pick) {
      resolveCache.set(key, pick);
      resolved.set(key, pick);
    }
    if (onProgress) onProgress(key, pick || null);
  }
  resolveCache.flush();
  return resolved;
}

function forTicker(ticker) {
  return resolveCache.get(String(ticker).toUpperCase()) || null;
}

module.exports = {
  SUFFIX, ALTERNATES, MARKET_CODE, SYMBOL_OVERRIDES,
  baseTicker, candidates, resolve, forTicker, resolveCache,
};
