'use strict';
// Deterministic data engine core: builds the ~320-stock universe from a fixed
// seed. All metrics are simulated but internally consistent (e.g. P/B = P/E x
// ROE, dividend yield = payout / P/E, ROA = net margin x asset turnover).
const { rngFor, rr, rint, clamp, round, logUniform, todayYm, ymIndex, fmtDate } = require('./prng');
const { fairValueFor, calibrate } = require('./fairvalue');
const { COUNTRY_META, rawEntries } = require('./universe_data');

const UNIVERSE_SEED = 'alphadesk-universe-v1';

// Sector profiles: [lo, hi] ranges used by the generator.
const SECTOR_PROFILES = {
  'Technology': { gross: [55, 88], op: [18, 42], net: [12, 32], pe: [22, 45], g: [5, 30], de: [0.1, 1.4], payout: [5, 30], beta: [0.9, 1.6], at: [0.35, 1.1], cur: [1.4, 3.0], mult: [1.5, 3.5], sig: [1.7, 2.6] },
  'Healthcare': { gross: [48, 80], op: [12, 34], net: [8, 26], pe: [16, 38], g: [3, 20], de: [0.2, 1.8], payout: [10, 55], beta: [0.6, 1.2], at: [0.4, 0.9], cur: [1.2, 2.6], mult: [1.5, 3.0], sig: [1.4, 2.2] },
  'Financial Services': { gross: [45, 85], op: [22, 48], net: [14, 36], pe: [7, 18], g: [1, 15], de: [0.8, 2.6], payout: [20, 55], beta: [0.7, 1.4], at: [0.03, 0.09], cur: [1.0, 2.0], mult: [6, 14], sig: [1.3, 2.2] },
  'Energy': { gross: [20, 55], op: [8, 30], net: [5, 22], pe: [8, 22], g: [-4, 25], de: [0.3, 1.6], payout: [20, 60], beta: [0.9, 1.6], at: [0.3, 0.9], cur: [1.0, 2.2], mult: [1.5, 3.0], sig: [1.6, 2.6] },
  'Consumer Cyclical': { gross: [25, 60], op: [6, 22], net: [3, 15], pe: [12, 35], g: [2, 25], de: [0.5, 2.5], payout: [0, 45], beta: [0.9, 1.6], at: [0.5, 1.4], cur: [1.0, 2.2], mult: [1.8, 4.0], sig: [1.7, 2.7] },
  'Consumer Defensive': { gross: [25, 60], op: [8, 25], net: [4, 18], pe: [12, 30], g: [0, 12], de: [0.5, 2.2], payout: [30, 70], beta: [0.4, 0.9], at: [0.6, 1.5], cur: [0.9, 2.0], mult: [1.5, 3.5], sig: [1.1, 1.8] },
  'Industrials': { gross: [25, 55], op: [8, 24], net: [4, 17], pe: [12, 32], g: [1, 18], de: [0.5, 2.2], payout: [20, 65], beta: [0.8, 1.5], at: [0.4, 1.1], cur: [1.0, 2.2], mult: [1.6, 3.5], sig: [1.4, 2.3] },
  'Basic Materials': { gross: [18, 45], op: [6, 24], net: [3, 18], pe: [8, 28], g: [-5, 22], de: [0.4, 2.0], payout: [15, 55], beta: [0.9, 1.6], at: [0.5, 1.3], cur: [1.0, 2.4], mult: [1.5, 3.2], sig: [1.6, 2.6] },
  'Communication Services': { gross: [40, 85], op: [12, 40], net: [8, 30], pe: [10, 35], g: [0, 25], de: [0.4, 2.4], payout: [0, 60], beta: [0.7, 1.5], at: [0.35, 1.0], cur: [1.0, 2.4], mult: [1.5, 3.5], sig: [1.5, 2.5] },
  'Real Estate': { gross: [40, 80], op: [25, 55], net: [12, 45], pe: [8, 30], g: [-2, 15], de: [0.8, 3.0], payout: [30, 90], beta: [0.6, 1.2], at: [0.05, 0.3], cur: [0.8, 2.0], mult: [1.2, 2.5], sig: [1.3, 2.2] },
  'Utilities': { gross: [35, 70], op: [15, 35], net: [8, 25], pe: [9, 24], g: [0, 10], de: [0.9, 2.6], payout: [35, 75], beta: [0.3, 0.8], at: [0.2, 0.7], cur: [0.8, 1.8], mult: [1.5, 3.0], sig: [1.0, 1.8] },
};

const TIER_RANGES = {
  M: { price: [30, 700], cap: [150e9, 3000e9], dollarVol: [200e6, 3e9], emps: [20000, 350000] },
  L: { price: [15, 400], cap: [10e9, 150e9], dollarVol: [40e6, 600e6], emps: [5000, 150000] },
  D: { price: [8, 120], cap: [2e9, 10e9], dollarVol: [5e6, 60e6], emps: [1000, 30000] },
  S: { price: [3, 45], cap: [0.3e9, 2e9], dollarVol: [0.5e6, 10e6], emps: [300, 10000] },
};

const FACTOR_WEIGHTS = {
  financial: 0.15, multiples: 0.15, momentum: 0.20, efficiency: 0.08,
  profitability: 0.15, debt: 0.12, industry: 0.08, corporate: 0.07,
};

// Shared 5-year trading-day calendar (weekdays), oldest first.
function tradingDates(years = 5) {
  const days = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (days.length < 252 * years) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.push(fmtDate(d));
    d.setDate(d.getDate() - 1);
  }
  days.reverse();
  return days;
}

function normal(rng) {
  const z = (rng() + rng() + rng() + rng() - 2) / 0.5774;
  return clamp(z, -3.5, 3.5);
}

// Deterministic daily price history; rescaled so the final close equals `price`.
function buildHistory(ticker, price, avgVolume, drift, sigma, dates) {
  const rng = rngFor(UNIVERSE_SEED, 'hist', ticker);
  const closes = new Array(dates.length);
  const volume = new Array(dates.length);
  let logp = 0;
  for (let i = 0; i < dates.length; i++) {
    const ret = drift / 252 + (sigma / 100) * normal(rng);
    logp += ret;
    const dayVol = avgVolume * rr(rng, 0.55, 1.45) * (1 + Math.min(Math.abs(ret) * 8, 2.5));
    volume[i] = Math.round(dayVol);
    closes[i] = Math.exp(logp);
  }
  const scale = price / closes[closes.length - 1];
  const out = closes.map((c) => Math.max(round(c * scale, 2), 0.01));
  return { closes, volume: volume.map((v) => v) };
}

function rsiOf(closes, period = 14) {
  const slice = closes.slice(-(period + 1));
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < slice.length; i++) {
    const ch = slice[i] - slice[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  if (gain + loss === 0) return 50;
  const rs = gain / Math.max(loss, 1e-9);
  return round(100 - 100 / (1 + rs), 1);
}

function stdev(arr) {
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const v = arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return Math.sqrt(v);
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pctChange(closes, back) {
  const n = closes.length;
  const i = Math.max(n - 1 - back, 0);
  return round(((closes[n - 1] / closes[i]) - 1) * 100, 1);
}

function avgOf(arr, count) {
  const slice = arr.slice(-count);
  return round(slice.reduce((a, b) => a + b, 0) / slice.length, 2);
}

// Provisional quality score used for price-history drift (no momentum input,
// avoiding circularity with history-derived momentum metrics).
function provisionalScore(s) {
  const growth = clamp((s.revenueGrowth + 5) / 35, 0, 1);
  const prof = clamp((s.roe - 4) / 34, 0, 1);
  const val = clamp((45 - s.pe) / 38, 0, 1);
  const safety = clamp(1 - s.debtToEquity / 3.2, 0, 1);
  return round(100 * (0.3 * growth + 0.3 * prof + 0.2 * val + 0.2 * safety), 1);
}

// Derives every price-derived metric (momentum, RSI, volatility, moving
// averages, sparkline) from s.history. Kept separate so the live market layer
// can recompute them after swapping in real daily closes.
function computeHistoryMetrics(s) {
  const closes = s.history.closes;
  const n = closes.length;
  if (!n) return s;
  s.momentum1m = pctChange(closes, 22);
  s.momentum3m = pctChange(closes, 66);
  s.momentum6m = pctChange(closes, 126);
  s.momentum12m = pctChange(closes, 252);
  const returns = closes.slice(-252).map((c, i, a) => (i ? Math.log(c / a[i - 1]) : 0)).slice(1);
  s.volatility12m = returns.length > 1 ? round(stdev(returns) * Math.sqrt(252) * 100, 1) : 0;
  s.movingAvg50 = avgOf(closes, Math.min(50, n));
  s.movingAvg200 = avgOf(closes, Math.min(200, n));
  s.rsi = rsiOf(closes);
  s.changePct = n > 1 ? round(((closes[n - 1] / closes[n - 2]) - 1) * 100, 2) : 0;
  s.spark = closes.slice(-20).map((c) => round(c, 2));
  return s;
}

function buildStock(entry, dates) {
  const meta = COUNTRY_META[entry.country];
  const p = SECTOR_PROFILES[entry.sector];
  const tr = TIER_RANGES[entry.tier];
  const rng = rngFor(UNIVERSE_SEED, 'metric', entry.ticker);

  const grossMargin = round(rr(rng, p.gross[0], p.gross[1]), 1);
  const opMargin = round(rr(rng, p.op[0], p.op[1]), 1);
  const netMargin = round(clamp(rr(rng, p.net[0], p.net[1]), 0.5, p.net[1]), 1);
  const revenueGrowth = round(clamp(rr(rng, p.g[0], p.g[1]), -8, 35), 1);
  const epsGrowth = round(clamp(revenueGrowth * rr(rng, 1.0, 1.7) + rr(rng, -2, 4), -25, 55), 1);

  const debtToEquity = round(clamp(rr(rng, p.de[0], p.de[1]), 0.05, 4), 2);
  const currentRatio = round(clamp(rr(rng, p.cur[0], p.cur[1]), 0.4, 4.5), 2);
  const assetTurnover = round(rr(rng, p.at[0], p.at[1]), 2);
  const roa = round(clamp(netMargin * assetTurnover, 0.2, 28), 1);
  const equityMult = rr(rng, p.mult[0], p.mult[1]);
  const roe = round(clamp(roa * equityMult, 3, 55), 1);
  const interestCoverage = round(clamp((opMargin + 8) / (0.7 + 0.5 * debtToEquity), 0.8, 60), 1);

  // Multiples derived from quality/growth with consistent identities.
  let pe = rr(rng, p.pe[0], p.pe[1]);
  pe *= 1 + (revenueGrowth - (p.g[0] + p.g[1]) / 2) / 60;
  pe *= 1 + (roe - 15) / 120;
  pe = round(clamp(pe, 4.5, 65), 1);
  const pb = round(clamp(pe * (roe / 100), 0.3, 25), 2);
  const ps = round(clamp(pe * (netMargin / 100), 0.2, 25), 2);
  const ebitdaMargin = opMargin + 3.5;
  const evEbitda = round(clamp((pe * netMargin) / Math.max(ebitdaMargin, 1), 3, 30), 1);

  const dividendPayout = round(clamp(rr(rng, p.payout[0], p.payout[1]), 0, 95), 1);
  const dividendYield = round(clamp(dividendPayout / pe, 0, 12), 2);
  const fcfConv = rr(rng, 0.6, 1.3);
  const freeCashFlowYield = round(clamp((fcfConv * 100) / pe, 0.3, 14), 2);
  const beta = round(clamp(rr(rng, p.beta[0], p.beta[1]), 0.25, 2.1), 2);

  // Sizes.
  const priceUSD = logUniform(rng, tr.price[0], tr.price[1]);
  const price = round(priceUSD * meta.fx, meta.fx > 50 ? 1 : 2);
  const marketCap = Math.round(logUniform(rng, tr.cap[0], tr.cap[1]));
  const dollarVolUSD = logUniform(rng, tr.dollarVol[0], tr.dollarVol[1]);
  const avgVolume = Math.max(Math.round(dollarVolUSD / priceUSD), 1000);

  const shortInterest = round(rr(rng, 0.3, entry.tier === 'S' ? 12 : 8), 1);
  const insiderOwnership = round(entry.sector === 'Technology' ? rr(rng, 1, 45) : rr(rng, 0.1, 15), 1);
  const employees = Math.round(rr(rng, tr.emps[0], tr.emps[1]));
  const foundedYear = entry.sector === 'Technology' ? rint(rng, 1975, 2016) : rint(rng, 1880, 2005);

  const s = {
    ticker: entry.ticker,
    name: entry.name,
    exchange: entry.exchange,
    country: entry.country,
    region: meta.region,
    sector: entry.sector,
    industry: entry.industry,
    currency: meta.currency,
    fx: meta.fx,
    tier: entry.tier,
    dow: entry.dow,
    // Expanded (full-exchange listing) stocks get a short simulated baseline
    // that the live overlay overwrites with real quotes/history/fundamentals.
    expanded: entry.expanded === true,
    marketCap,
    price,
    dividendYield,
    pe, pb, ps, evEbitda,
    roe, roa,
    netMargin, grossMargin, opMargin,
    debtToEquity, currentRatio, interestCoverage,
    revenueGrowth, epsGrowth,
    beta,
    dividendPayout,
    freeCashFlowYield,
    avgVolume,
    shortInterest, insiderOwnership, employees, foundedYear,
  };

  // History-driven metrics.
  const prov = provisionalScore(s);
  const alphaAnnual = ((prov - 50) / 50) * 0.09;
  const drift = beta * 0.085 + alphaAnnual;
  const sigma = round(rr(rng, p.sig[0], p.sig[1]) * rr(rng, 0.9, 1.15), 2);
  // Expanded listings only need a ~1y baseline (enough for the 12m momentum /
  // RSI family scores) — the live overlay supplies the real 5y history, which
  // keeps startup fast and memory low when the universe spans a whole exchange.
  const histDates = s.expanded && dates.length > 260 ? dates.slice(dates.length - 260) : dates;
  const { closes, volume } = buildHistory(s.ticker, price, avgVolume, drift, sigma, histDates);
  s.history = { dates: histDates, closes, volume };
  computeHistoryMetrics(s);
  s.provScore = prov;
  return s;
}

// ---- 8 metric families + composite score ----

const FAMILY_LABELS = {
  momentum: 'Strong Momentum',
  multiples: 'Fair Valuation',
  profitability: 'High Profitability',
  financial: 'Consistent Growth',
  debt: 'Controlled Risk',
  efficiency: 'Efficient Operations',
  industry: 'Favorable Industry',
  corporate: 'Shareholder Returns',
};

function familyScores(s, ctx) {
  const fin = 100 * (0.5 * clamp((s.revenueGrowth + 5) / 35, 0, 1) + 0.5 * clamp((s.epsGrowth + 10) / 45, 0, 1));
  const mult = 100 * (
    0.4 * clamp((50 - s.pe) / 42, 0, 1) +
    0.25 * clamp((6 - s.pb) / 5.5, 0, 1) +
    0.2 * clamp((25 - s.evEbitda) / 22, 0, 1) +
    0.15 * clamp((8 - s.ps) / 7.5, 0, 1)
  );
  const mom = 100 * (
    0.45 * clamp((s.momentum12m + 30) / 75, 0, 1) +
    0.3 * clamp((s.momentum3m + 18) / 40, 0, 1) +
    0.25 * clamp(1 - Math.abs(s.rsi - 58) / 45, 0, 1)
  );
  const eff = 100 * (0.7 * clamp(s.roa / 16, 0, 1) + 0.3 * clamp((s.currentRatio - 0.6) / 2, 0, 1));
  const prof = 100 * (
    0.35 * clamp((s.roe - 3) / 32, 0, 1) +
    0.25 * clamp(s.netMargin / 25, 0, 1) +
    0.2 * clamp(s.opMargin / 35, 0, 1) +
    0.2 * clamp(s.grossMargin / 75, 0, 1)
  );
  const debt = 100 * (
    0.4 * clamp(1 - s.debtToEquity / 3.2, 0, 1) +
    0.35 * clamp(s.interestCoverage / 25, 0, 1) +
    0.25 * clamp((s.currentRatio - 0.5) / 2, 0, 1)
  );
  const sectorMom = ctx ? ctx.sectorMomentum[s.sector] : 0;
  const industryAppeal = ctx ? ctx.industryAppeal[s.industry] : 50;
  const ind = 100 * (0.6 * clamp((sectorMom + 25) / 60, 0, 1) + 0.4 * clamp(industryAppeal / 100, 0, 1));
  const corp = 100 * (
    0.55 * clamp(s.dividendYield / 5, 0, 1) +
    0.45 * clamp(1 - Math.abs(s.dividendPayout - 45) / 55, 0, 1)
  );
  const f = { financial: fin, multiples: mult, momentum: mom, efficiency: eff, profitability: prof, debt, industry: ind, corporate: corp };
  for (const k of Object.keys(f)) f[k] = round(clamp(f[k], 0, 100), 1);
  return f;
}

function compositeScore(families, weights = FACTOR_WEIGHTS) {
  let total = 0;
  for (const [k, w] of Object.entries(weights)) total += (families[k] || 0) * w;
  return round(clamp(total, 0, 100), 1);
}

// Rationale tags + 1-2 sentence text referencing real metric values.
function rationaleFor(s, families, override) {
  const score = override && override.score != null ? override.score : s.score;
  const rating = (override && override.rating) || s.rating;
  const ranked = Object.entries(families).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const tags = ranked.map(([k]) => FAMILY_LABELS[k]);
  const top = ranked[0][0];
  const second = ranked[1] ? ranked[1][0] : null;
  const snippets = {
    momentum: `12-month momentum of ${s.momentum12m >= 0 ? '+' : ''}${s.momentum12m}% with RSI at ${s.rsi}`,
    multiples: `P/E of ${s.pe} against a blended fair value of ${s.fairValue} (${s.currency})`,
    profitability: `ROE of ${s.roe}% and net margin of ${s.netMargin}%`,
    financial: `revenue growth of ${s.revenueGrowth}% and EPS growth of ${s.epsGrowth}%`,
    debt: `debt/equity of ${s.debtToEquity} with interest coverage of ${s.interestCoverage}x`,
    efficiency: `ROA of ${s.roa}% and a current ratio of ${s.currentRatio}`,
    industry: `sector strength in ${s.sector} with ${s.momentum12m >= 0 ? 'positive' : 'resilient'} 12-month momentum`,
    corporate: `dividend yield of ${s.dividendYield}% on a ${s.dividendPayout}% payout`,
  };
  const parts = [snippets[top]];
  if (second) parts.push(snippets[second]);
  const text = `Picked for its ${parts.join(' and ')}. Combined with an AlphaDesk score of ${score}, that puts it in the ${rating} camp this month.`;
  return { rationaleTags: tags, rationaleText: text };
}

function buildUniverse() {
  const dates = tradingDates(5);
  const entries = rawEntries();
  const stocks = entries.map((e) => buildStock(e, dates));
  const byTicker = new Map(stocks.map((s) => [s.ticker.toUpperCase(), s]));
  const universe = { stocks, byTicker };
  scoreUniverse(universe);
  return universe;
}

// Cross-sectional scoring: sector momentum, peer medians, the 14 fair-value
// models, 8 metric families, composite score, quartile ratings and rationale.
// Runs at build time and again whenever live data changes the inputs.
function scoreUniverse(universe) {
  const { stocks } = universe;
  // Cross-sectional stats (sector momentum, peer medians, calibration and the
  // rating quartile cuts) are derived from the core curated universe only.
  // Expanded full-exchange listings are then scored against those curated peer
  // sets, so a whole-exchange expansion can't pollute the curated estimates or
  // re-quartile the ratings the curated stocks are shown against.
  const core = stocks.filter((s) => !s.expanded);
  const statStocks = core.length ? core : stocks;

  // Sector momentum + static industry appeal for the industry family.
  const sectorMomentum = {};
  for (const st of statStocks) {
    sectorMomentum[st.sector] = (sectorMomentum[st.sector] || []).concat(st.momentum12m);
  }
  for (const k of Object.keys(sectorMomentum)) {
    sectorMomentum[k] = round(sectorMomentum[k].reduce((a, b) => a + b, 0) / sectorMomentum[k].length, 1);
  }
  const industries = [...new Set(stocks.map((s) => s.industry))];
  const industryAppeal = {};
  for (const ind of industries) industryAppeal[ind] = Math.round(rngFor(UNIVERSE_SEED, 'industry', ind)() * 60 + 35);
  const ctx = { sectorMomentum, industryAppeal };

  // Sector medians for peer-comparable fair-value models (curated peers).
  const bySector = {};
  for (const st of statStocks) (bySector[st.sector] = bySector[st.sector] || []).push(st);
  const peerMeds = {};
  for (const [sec, list] of Object.entries(bySector)) {
    peerMeds[sec] = {
      medianPe: round(median(list.map((x) => x.pe)), 1),
      medianPb: round(median(list.map((x) => x.pb)), 2),
      medianPs: round(median(list.map((x) => x.ps)), 2),
      medianEvEbitda: round(median(list.map((x) => x.evEbitda)), 1),
    };
  }

  const calib = calibrate(statStocks, peerMeds);

  // Neutral fallback peers for a sector with no curated members, so an
  // expanded stock in a novel sector still gets a finite fair value.
  const neutralPeers = {
    medianPe: 18, medianPb: 2.2, medianPs: 2, medianEvEbitda: 12,
  };

  for (const st of stocks) {
    const fv = fairValueFor(st, peerMeds[st.sector] || neutralPeers, calib);
    st.fairValue = fv.fairValue;
    st.upsidePct = fv.upsidePct;
    st.verdict = fv.verdict;
    st.fairValueModels = fv.models;
    st.families = familyScores(st, ctx);
    st.score = compositeScore(st.families);
  }

  // Ratings: quartile cuts taken from the core distribution, then applied to
  // every stock by score, so expansion doesn't shift curated ratings.
  const coreByScore = [...statStocks].sort((a, b) => b.score - a.score);
  const cut = Math.max(1, Math.floor(statStocks.length / 4));
  const topScore = coreByScore.length ? coreByScore[Math.min(cut, coreByScore.length) - 1].score : 100;
  const bottomScore = coreByScore.length ? coreByScore[Math.max(0, coreByScore.length - cut)].score : 0;
  for (const st of stocks) {
    st.rating = st.score >= topScore ? 'outperform'
      : st.score <= bottomScore ? 'underperform' : 'neutral';
    const r = rationaleFor(st, st.families);
    st.rationaleTags = r.rationaleTags;
    st.rationaleText = r.rationaleText;
  }

  universe.ctx = ctx;
  universe.peerMeds = peerMeds;
  universe.sectorMomentum = sectorMomentum;
  universe.industryAppeal = industryAppeal;
  return universe;
}

// Monthly score used for pick selection and per-month rating history.
function monthlyScore(s, ym) {
  const noise = (rngFor(UNIVERSE_SEED, 'month', s.ticker, ym)() - 0.5) * 12;
  return round(clamp(s.score + noise, 0, 100), 1);
}

module.exports = {
  buildUniverse, scoreUniverse, computeHistoryMetrics, familyScores, compositeScore,
  rationaleFor, monthlyScore, FACTOR_WEIGHTS, FAMILY_LABELS, tradingDates,
};
