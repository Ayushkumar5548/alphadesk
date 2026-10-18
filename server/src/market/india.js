'use strict';
// Builds a comprehensive India (NSE) universe from public NSE CSVs.
// - Primary: EQUITY_L.csv (all listed equities, ~2,500 symbols) — gives symbol+name
// - Supplementary: Nifty 500/Midcap 150/Smallcap 250 CSVs — give industry for mapping

const fs = require('node:fs');
const path = require('node:path');
const { createDiskCache } = require('./provider');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'market');
const CACHE_FILE = path.join(DATA_DIR, 'india-list.json');

const SOURCES = [
  { name: 'EQUITY_L', url: 'https://archives.nseindia.com/content/equities/EQUITY_L.csv' },
  { name: 'nifty500', url: 'https://archives.nseindia.com/content/indices/ind_nifty500list.csv' },
  { name: 'midcap150', url: 'https://archives.nseindia.com/content/indices/ind_niftymidcap150list.csv' },
  { name: 'smallcap250', url: 'https://archives.nseindia.com/content/indices/ind_niftysmallcap250list.csv' },
];

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Simple CSV parser (handles commas inside quoted fields? NSE CSVs usually don't have quotes with commas for these lists)
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const header = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // naive split (works for these NSE CSVs)
    const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 2) continue;
    const obj = {};
    for (let j = 0; j < header.length && j < parts.length; j++) {
      obj[header[j]] = parts[j];
    }
    rows.push(obj);
  }
  return rows;
}

const NSE_TO_SECTOR = new Map([
  ['IT Services', 'Technology'],
  ['Software (Application)', 'Technology'],
  ['Software (System)', 'Technology'],
  ['Pharmaceuticals', 'Healthcare'],
  ['Biotechnology', 'Healthcare'],
  ['Healthcare Services', 'Healthcare'],
  ['Medical Care Facilities', 'Healthcare'],
  ['Medical Devices', 'Healthcare'],
  ['Diagnostics & Research', 'Healthcare'],
  ['Financial Services', 'Financial Services'],
  ['Banks (Large)', 'Financial Services'],
  ['Banks (Global)', 'Financial Services'],
  ['Consumer Finance', 'Financial Services'],
  ['Insurance (Diversified)', 'Financial Services'],
  ['Life Insurance', 'Financial Services'],
  ['Property & Casualty Insurance', 'Financial Services'],
  ['Financial Data & Ratings', 'Financial Services'],
  ['Oil & Gas Integrated', 'Energy'],
  ['Oil & Gas Exploration & Production', 'Energy'],
  ['Oil & Gas Refining & Marketing', 'Energy'],
  ['Coal', 'Energy'],
  ['Automobile', 'Consumer Cyclical'],
  ['Auto Manufacturers', 'Consumer Cyclical'],
  ['Auto Parts', 'Consumer Cyclical'],
  ['Consumer Durables', 'Consumer Cyclical'],
  ['Luxury Goods', 'Consumer Cyclical'],
  ['Apparel Retail', 'Consumer Cyclical'],
  ['Specialty Retail', 'Consumer Cyclical'],
  ['Internet Retail', 'Consumer Cyclical'],
  ['Restaurants', 'Consumer Cyclical'],
  ['Leisure', 'Consumer Cyclical'],
  ['Entertainment', 'Consumer Cyclical'],
  ['Footwear & Accessories', 'Consumer Cyclical'],
  ['Household & Personal Products', 'Consumer Defensive'],
  ['Packaged Foods', 'Consumer Defensive'],
  ['Tobacco', 'Consumer Defensive'],
  ['Beverages', 'Consumer Defensive'],
  ['Discount Stores', 'Consumer Defensive'],
  ['Capital Goods', 'Industrials'],
  ['Engineering & Construction', 'Industrials'],
  ['Specialty Industrial Machinery', 'Industrials'],
  ['Industrial Products', 'Industrials'],
  ['Aerospace & Defense', 'Industrials'],
  ['Conglomerates', 'Industrials'],
  ['Waste Management', 'Industrials'],
  ['Integrated Shipping & Logistics', 'Industrials'],
  ['Transportation', 'Industrials'],
  ['Chemicals', 'Basic Materials'],
  ['Cement', 'Basic Materials'],
  ['Steel', 'Basic Materials'],
  ['Aluminum', 'Basic Materials'],
  ['Metals & Mining', 'Basic Materials'],
  ['Paints & Coatings', 'Basic Materials'],
  ['Telecom Services', 'Communication Services'],
  ['Media & Entertainment', 'Communication Services'],
  ['Internet Content', 'Communication Services'],
  ['Real Estate', 'Real Estate'],
  ['Power', 'Utilities'],
  ['Electric Utilities', 'Utilities'],
  ['Gas Utilities', 'Utilities'],
  ['Infrastructure', 'Industrials'],
  ['Construction Materials', 'Basic Materials'],
  ['Electronic Manufacturing Services', 'Technology'],
  ['Semiconductors', 'Technology'],
  ['Electronic Equipment & Instruments', 'Technology'],
  ['Consumer Electronics', 'Technology'],
]);

function mapSector(industry) {
  if (!industry) return 'Industrials';
  if (NSE_TO_SECTOR.has(industry)) return NSE_TO_SECTOR.get(industry);
  // fuzzy fallbacks
  const s = industry.toLowerCase();
  if (s.includes('it') || s.includes('software')) return 'Technology';
  if (s.includes('pharma') || s.includes('health')) return 'Healthcare';
  if (s.includes('bank') || s.includes('finance') || s.includes('insurance')) return 'Financial Services';
  if (s.includes('oil') || s.includes('gas') || s.includes('coal')) return 'Energy';
  if (s.includes('auto') || s.includes('retail') || s.includes('apparel') || s.includes('hotel') || s.includes('media')) return 'Consumer Cyclical';
  if (s.includes('food') || s.includes('beverage') || s.includes('tobacco') || s.includes('fmcg')) return 'Consumer Defensive';
  if (s.includes('capital') || s.includes('construction') || s.includes('engineering') || s.includes('defense') || s.includes('machinery')) return 'Industrials';
  if (s.includes('cement') || s.includes('steel') || s.includes('metal') || s.includes('chem')) return 'Basic Materials';
  if (s.includes('telecom')) return 'Communication Services';
  if (s.includes('real')) return 'Real Estate';
  if (s.includes('power') || s.includes('utility')) return 'Utilities';
  return 'Industrials';
}

async function fetchCSV(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://www.nseindia.com/',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/csv,application/csv,text/plain',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function loadCached() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// Synchronous read of the cached NSE list (no network). Returns null when the
// cache has never been written — callers fall back to the curated universe.
function loadIndiaUniverseSync() {
  const cached = loadCached();
  return cached && Array.isArray(cached.rows) ? cached : null;
}

function saveCached(data) {
  ensureDir();
  const tmp = `${CACHE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, CACHE_FILE);
}

async function loadIndiaUniverse({ force = false } = {}) {
  if (!force) {
    const cached = loadCached();
    if (cached && Date.now() - cached.fetchedAt < 30 * 24 * 60 * 60 * 1000) {
      return cached;
    }
  }

  const industryMap = new Map(); // symbol -> industry
  const allResults = {};

  // Fetch supplementary sources for industry
  for (const src of SOURCES) {
    try {
      const text = await fetchCSV(src.url);
      allResults[src.name] = text;
      const rows = parseCSV(text);
      for (const r of rows) {
        const sym = (r.Symbol || r.SYMBOL || r['SYMBOL'] || '').toString().trim().toUpperCase();
        const ind = r.Industry || r.INDUSTRY || '';
        if (sym && ind && !industryMap.has(sym)) {
          industryMap.set(sym, ind);
        }
      }
    } catch (e) {
      // best effort
    }
  }

  // Parse EQUITY_L (primary) for all symbols
  const text = allResults.EQUITY_L || (await fetchCSV(SOURCES[0].url));
  const rows = parseCSV(text);
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const sym = (r.SYMBOL || r.Symbol || '').toString().trim().toUpperCase();
    if (!sym) continue;
    if (seen.has(sym)) continue;
    const name = r['NAME OF COMPANY'] || r.NAME || r['Company Name'] || '';
    const series = (r.SERIES || r.Series || '').toString().trim().toUpperCase();
    // Include EQ and BE (uncommon) but skip preference shares etc if SERIES is weird
    if (series && series !== 'EQ' && series !== 'BE') {
      // still include common active series
    }
    seen.add(sym);
    const industry = industryMap.get(sym) || 'Unknown';
    const sector = mapSector(industry);
    out.push({
      ticker: sym,
      name: name || sym,
      exchange: 'NSE',
      country: 'IN',
      sector,
      industry,
      tier: 'S', // unknown; will be refined if market cap becomes known
    });
  }

  const data = {
    source: 'NSE archives (EQUITY_L + Nifty indices)',
    fetchedAt: Date.now(),
    count: out.length,
    rows: out,
  };
  saveCached(data);
  return data;
}

module.exports = { loadIndiaUniverse, loadIndiaUniverseSync };
