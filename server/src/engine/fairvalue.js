'use strict';
// 14 fair-value models. All outputs are simulated but internally consistent:
// per-share values are in the stock's local currency (EPS = price / PE etc.).
const { clamp, round } = require('./prng');

const MODEL_NAMES = [
  'DCF (FCF 5Y)',
  'Graham Formula',
  'Residual Income',
  'Dividend Discount',
  'Earnings Capitalization',
  'Peer Comparable P/E',
  'Peer Comparable P/B',
  'EV/EBITDA Multiple',
  'PEG Model',
  'Sales Multiple',
  'Owner Earnings',
  'Magic Formula Earnings Yield',
  'ROIC-DCF-Lite',
  'Asset-Backed Value',
];

// Raw model outputs before calibration. May contain non-finite values for
// pathological inputs; those are repaired by calibration / guards downstream.
function computeModels(s, peers) {
  const price = s.price;
  const eps = price / Math.max(s.pe, 1);                 // local currency per share
  const bvps = price / Math.max(s.pb, 0.05);             // book value per share
  const dps = (price * s.dividendYield) / 100;
  const fcfPerShare = (price * s.freeCashFlowYield) / 100;
  const revenuePerShare = eps / Math.max(s.netMargin, 1) * 100;
  const ebitdaPerShare = (revenuePerShare * (s.opMargin + 3.5)) / 100;
  const ebitPerShare = (revenuePerShare * s.opMargin) / 100;
  // Net debt per share approximated as D/E * book equity per share.
  const netDebtPS = s.debtToEquity * bvps;

  const g = clamp(s.revenueGrowth / 100, -0.02, 0.20);   // FCFF growth base
  const r = clamp(0.065 + (s.beta - 1) * 0.035 + 0.03, 0.06, 0.16); // discount rate
  const tg = 0.03;

  const out = [];

  // 1. DCF (simplified FCFF, 5 years + terminal)
  {
    let pv = 0;
    let fcf = fcfPerShare;
    for (let t = 1; t <= 5; t++) {
      fcf *= 1 + g;
      pv += fcf / Math.pow(1 + r, t);
    }
    const term = (fcf * (1 + tg)) / Math.max(r - tg, 0.01);
    pv += term / Math.pow(1 + r, 5);
    out.push(pv);
  }

  // 2. Graham: EPS * (8.5 + 2 * expected growth %)
  {
    const growth = clamp(s.epsGrowth, 0, 20);
    out.push(eps * (8.5 + 2 * growth));
  }

  // 3. Residual income: BV + PV of (ROE - r) * book over 5 years
  {
    let bv = bvps;
    let pv = 0;
    const roe = s.roe / 100;
    for (let t = 1; t <= 5; t++) {
      pv += ((roe - r) * bv) / Math.pow(1 + r, t);
      bv *= 1 + roe * 0.55; // modest book growth (retention)
    }
    out.push(bvps + pv);
  }

  // 4. Dividend discount (Gordon growth on next dividend)
  {
    const gD = clamp(s.epsGrowth / 200, 0.005, 0.055);
    const d1 = dps * (1 + gD);
    out.push(d1 / Math.max(r - gD, 0.015));
  }

  // 5. Earnings capitalization: EPS / cap rate (beta + quality driven; s.score is
  // assigned after fair value in the engine, so quality is approximated by ROE).
  {
    const capRate = clamp(0.06 + (s.beta - 1) * 0.025 + (18 - clamp(s.roe, -20, 45)) / 500, 0.045, 0.13);
    out.push(eps / capRate);
  }

  // 6. Peer comparable P/E
  out.push(peers.medianPe * eps);

  // 7. Peer comparable P/B
  out.push(peers.medianPb * bvps);

  // 8. EV/EBITDA multiple: EV/share - net debt/share
  {
    const ev = peers.medianEvEbitda * ebitdaPerShare;
    out.push(Math.max(ev - netDebtPS, 0.05));
  }

  // 9. PEG: fair PE from growth, quality adjusted
  {
    const fairPe = clamp(s.epsGrowth * (1 + (s.roe - 12) / 120), 6, 55);
    out.push(eps * fairPe);
  }

  // 10. Sales multiple: peer P/S * revenue per share
  out.push(peers.medianPs * revenuePerShare);

  // 11. Owner earnings capitalized
  {
    const owner = fcfPerShare * 0.95;
    const capRate = clamp(0.065 + (s.beta - 1) * 0.03, 0.05, 0.14);
    out.push(owner / capRate);
  }

  // 12. Magic formula earnings yield: EBIT/share / required yield
  {
    const required = 0.085;
    out.push((ebitPerShare * (1 - 0.22)) / required + 0);
  }

  // 13. ROIC-DCF-lite: NOPAT capitalized with growth
  {
    const nopat = ebitPerShare * 0.78;
    const gR = clamp(s.revenueGrowth / 300, 0.005, 0.04);
    const wacc = clamp(0.075 + (s.beta - 1) * 0.03, 0.06, 0.14);
    const val = (nopat * (1 + gR)) / Math.max(wacc - gR, 0.012);
    out.push(val);
  }

  // 14. Asset-backed: book value adjusted by ROA
  {
    const adj = clamp(0.8 + s.roa / 30, 0.65, 1.35);
    out.push(bvps * adj);
  }

  return out.map((v) => Math.max(round(v, 2), 0.01));
}

// Robust blend: drop the two highest and two lowest model values, average the rest.
function blend(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const core = sorted.slice(2, Math.max(sorted.length - 2, 2));
  const use = core.length ? core : sorted;
  return use.reduce((a, b) => a + b, 0) / use.length;
}

// Calibration: classic textbook models are systematically biased against the
// market (Graham runs hot, asset-backed runs cold, etc). We calibrate each
// model once per universe build so that its cross-sectional median fair value
// equals the cross-sectional median price. Per-stock dispersion is preserved.
function calibrate(stocks, peerMeds) {
  const ratios = MODEL_NAMES.map(() => []);
  for (const s of stocks) {
    const raw = computeModels(s, peerMeds[s.sector]);
    for (let i = 0; i < raw.length; i++) {
      const v = raw[i];
      if (Number.isFinite(v) && v > 0 && s.price > 0) ratios[i].push(v / s.price);
    }
  }
  return ratios.map((list) => {
    const m = list.length ? median(list) : 1;
    return Number.isFinite(m) && m > 0.05 ? m : 1;
  });
}

function verdictFor(upsidePct) {
  if (upsidePct > 10) return 'undervalued';
  if (upsidePct < -10) return 'overvalued';
  return 'fairly valued';
}

function median(list) {
  if (!list.length) return NaN;
  const s = [...list].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Returns {fairValue, upsidePct, verdict, models:[{model,value,upsidePct}]}
function fairValueFor(s, peers, calib) {
  const raw = computeModels(s, peers).map((v, i) => {
    const c = calib && Number.isFinite(calib[i]) && calib[i] > 0 ? calib[i] : 1;
    const scaled = v / c;
    return Number.isFinite(scaled) && scaled > 0 ? scaled : s.price;
  });
  const fair = round(blend(raw), 2);
  const upside = round(((fair - s.price) / s.price) * 100, 1);
  const models = raw.map((v, i) => ({
    model: MODEL_NAMES[i],
    value: v,
    upsidePct: round(((v - s.price) / s.price) * 100, 1),
  }));
  return { fairValue: fair, upsidePct: upside, verdict: verdictFor(upside), models };
}

module.exports = { MODEL_NAMES, fairValueFor, calibrate };
