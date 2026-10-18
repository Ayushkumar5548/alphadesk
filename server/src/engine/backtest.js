'use strict';
// Point-in-time REAL backtest.
//
// Unlike the seeded-noise simulation in picks.js, this module ranks stocks each
// month using factor values computed ONLY from price history that existed at
// that month (no look-ahead), then realizes the ACTUAL market return of the
// stocks it picked. Returns, NAV, episodes and post-exit tracking are therefore
// real historical market outcomes over the real-data window (~5y).
//
// Factors (all point-in-time except the documented static quality tilt):
//   momentum  - trailing 12/6/3-month real returns (12m skips the newest month
//               to avoid short-term reversal; Jegadeesh-Titman formation)
//   trend     - distance above the 10-month (~200dma) real moving average
//   lowvol    - inverse of trailing 12-month realised volatility
//   quality   - static valuation/profitability/leverage tilt from fundamentals
//               (current values; NOT point-in-time — disclosed limitation)
const { round, clamp } = require('./prng');

const MIN_BURN = 13;   // months of history required before the first selection
const MIN_POOL = 8;    // need a real cross-section to rank against

function pctRank(sortedAsc, v) {
  // percentile of v within sorted ascending array (0..1)
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] < v) lo = mid + 1; else hi = mid;
  }
  return sortedAsc.length > 1 ? lo / (sortedAsc.length - 1) : 0.5;
}

// Static quality/valuation tilt in 0..1 from current fundamentals.
// Higher = cheaper + more profitable + less levered.
function qualityTilt(s) {
  const pe = Number.isFinite(s.pe) && s.pe > 0 ? s.pe : 30;
  const val = clamp((45 - pe) / 40, 0, 1);            // cheaper better
  const prof = clamp((s.roe || 0) / 35, 0, 1);        // higher ROE better
  const lev = clamp(1 - (s.debtToEquity || 0) / 3, 0, 1); // lower leverage better
  const marg = clamp((s.netMargin || 0) / 30, 0, 1);
  return 0.35 * val + 0.3 * prof + 0.2 * lev + 0.15 * marg;
}

// Point-in-time factor score for one stock at rebalance month `ym`, using only
// its monthly closes up to the previous month. Returns 0..100 or null when the
// stock lacks the history needed (caller should skip it that month).
function pitScore(series, ym) {
  const { ymToClose, months } = series;
  const rIdx = months.indexOf(ym) - 1; // last completed month
  if (rIdx < MIN_BURN) return null;
  const at = (i) => (i >= 0 ? ymToClose.get(months[i]) : null);

  const cNow = at(rIdx);
  const c1 = at(rIdx - 1);
  const c6 = at(rIdx - 6);
  const c13 = at(rIdx - 13);
  if (!cNow || !c13) return null;

  // momentum: 12-month formation ending one month back (skip newest month to
  // avoid short-term reversal), blended with 6-month for responsiveness.
  const mom12 = c1 && c13 ? c1 / c13 - 1 : cNow / c13 - 1;
  const mom6 = c1 && c6 ? c1 / c6 - 1 : null;
  let mom = mom12;
  if (mom6 != null) mom = 0.6 * mom12 + 0.4 * mom6;
  if (!Number.isFinite(mom)) return null;

  // trend: distance above 10-month MA (uses rIdx-9..rIdx)
  let trend = null;
  const maWindow = [];
  for (let i = rIdx - 9; i <= rIdx; i++) { const c = at(i); if (c) maWindow.push(c); }
  if (maWindow.length >= 6) {
    const ma = maWindow.reduce((a, b) => a + b, 0) / maWindow.length;
    trend = ma > 0 ? cNow / ma - 1 : null;
  }

  // volatility: stdev of last 12 monthly returns (annualised)
  const rets = [];
  for (let i = rIdx - 11; i <= rIdx; i++) {
    const a = at(i - 1); const b = at(i);
    if (a && b) rets.push(b / a - 1);
  }
  let vol = null;
  if (rets.length >= 8) {
    const mean = rets.reduce((x, y) => x + y, 0) / rets.length;
    const varr = rets.reduce((x, y) => x + (y - mean) * (y - mean), 0) / rets.length;
    vol = Math.sqrt(varr) * Math.sqrt(12);
  }

  // pack for cross-sectional normalisation, plus the raw signals the exit
  // decision uses (a stock is only sold when its trend genuinely rolls over).
  return {
    mom, mom6, mom12,
    trend: trend == null ? 0 : trend,
    vol: vol == null ? 0.5 : vol,
  };
}

function compositeFromNorm(n) {
  return 100 * (0.5 * n.mom + 0.2 * n.trend + 0.15 * n.lowvol + 0.15 * n.qual);
}

// Full real replay for one strategy. Returns the same shape as picks.replay().
function realReplay(def, universe, benchSeries, poolSeries) {
  const pool = universe.stocks.filter((s) => def.filter(s) && poolSeries.has(s.ticker));
  if (pool.length < MIN_POOL) return null;

  const bench = benchSeries[def.benchmark];
  if (!bench || !bench.months || bench.months.length < MIN_BURN + 12) return null;

  const benchMonths = bench.months;
  // Timeline integrity: the loop below treats consecutive indices as
  // consecutive calendar months (k-1 = previous month). Reject anything else.
  for (let i = 1; i < benchMonths.length; i++) {
    const [py, pm] = benchMonths[i - 1].split('-').map(Number);
    const [cy, cm] = benchMonths[i].split('-').map(Number);
    const expected = pm === 12 ? `${py + 1}-01` : `${py}-${String(pm + 1).padStart(2, '0')}`;
    if (benchMonths[i] !== expected) return null;
  }
  const lastIdx = benchMonths.length - 1;
  const startIdx = MIN_BURN; // first selectable month (factors defined)
  if (lastIdx <= startIdx + 6) return null;

  // Pre-scan pool coverage per month so we only run over a CONTIGUOUS window.
  // Compounding across months where we had to skip (thin history) would
  // silently drop flat/losing months and inflate returns — so we find the
  // longest contiguous run of well-covered months and use exactly that.
  function coverageAt(k) {
    const ym = benchMonths[k];
    let c = 0;
    for (const s of pool) if (pitScore(poolSeries.get(s.ticker), ym) != null) c++;
    return c;
  }
  let firstIdx = -1;
  for (let k = startIdx; k <= lastIdx; k++) {
    if (coverageAt(k) >= MIN_POOL) { firstIdx = k; break; }
  }
  if (firstIdx < 0) return null;
  let endIdx = firstIdx;
  for (let k = firstIdx; k <= lastIdx; k++) {
    if (coverageAt(k) >= MIN_POOL) endIdx = k; else break;
  }
  if (endIdx - firstIdx < 11) return null; // <12 months is not meaningful
  const startIdxRun = firstIdx;
  const lastIdxRun = endIdx;

  // Static quality tilt per stock (computed once).
  const qualOf = new Map(pool.map((s) => [s.ticker, qualityTilt(s)]));

  const target = def.pickCount;
  const dates = [];
  const strategyNav = [1];
  const benchmarkNav = [1];
  let members = []; // { s, addedIdx, cum, entryScore, realScore }
  const episodes = [];
  const added = [];
  const exited = new Map();
  const dominant = 'price momentum';
  // Month-by-month ledger: every rebalance month with the portfolio's average
  // return (before and after costs), the benchmark's return, the NAV level and
  // exactly which stocks entered or left the basket that month.
  const monthly = [];

  for (let k = startIdxRun; k <= lastIdxRun; k++) {
    const ym = benchMonths[k];
    const entriesThis = [];
    const exitsThis = [];

    // ---- point-in-time ranking (data through month k-1 only) ----
    const rows = [];
    for (const s of pool) {
      const sc = pitScore(poolSeries.get(s.ticker), ym);
      if (sc == null) continue;
      rows.push({ s, raw: sc });
    }
    if (rows.length < MIN_POOL) continue; // guarded by contiguous window above

    // cross-sectional percentile normalisation of each factor
    const moms = rows.map((r) => r.raw.mom).sort((a, b) => a - b);
    const trends = rows.map((r) => r.raw.trend).sort((a, b) => a - b);
    const vols = rows.map((r) => r.raw.vol).sort((a, b) => a - b);
    for (const r of rows) {
      const nMom = pctRank(moms, r.raw.mom);
      const nTrend = pctRank(trends, r.raw.trend);
      const nLowvol = 1 - pctRank(vols, r.raw.vol); // low vol -> high score
      const nQual = qualOf.get(r.s.ticker);
      r.sc = round(compositeFromNorm({ mom: nMom, trend: nTrend, lowvol: nLowvol, qual: nQual }), 1);
    }
    rows.sort((a, b) => b.sc - a.sc);
    const rankOf = new Map(rows.map((r, i) => [r.s.ticker, i]));
    const scoreOf = new Map(rows.map((r) => [r.s.ticker, r.sc]));

    if (members.length === 0) {
      members = rows.slice(0, target).map((r) => ({ s: r.s, addedIdx: k, addedYm: ym, cum: 1, entryScore: r.sc, realScore: r.sc }));
      for (const m of members) {
        added.push({
          ticker: m.s.ticker, name: m.s.name, dateAdded: `${ym}-01`, score: m.entryScore,
          code: 'opening',
          reason: `Opened the ${def.code} basket at backtest start: top-${target} by point-in-time factor score (${m.entryScore}) in a ${pool.length}-stock ${def.market} pool, ranked on real price momentum, trend and volatility as of ${ym}.`,
        });
        entriesThis.push({ ticker: m.s.ticker, name: m.s.name, score: m.entryScore });
      }
    } else {
      const extended = Math.min(Math.ceil(target * 1.5), Math.max(target + 2, Math.floor(pool.length * 0.75)));
      // ---- Exit discipline (v2, "hold winners, never sell the dip") ----------
      // Empirically the main source of COSTLY exits is selling a stock that is
      // merely out-ranked for a month, or selling into a drawdown just before it
      // mean-reverts. So an incumbent is only sold when deterioration is BOTH
      // relative (rank well past the cut-off and fade persisting 2+ months) and
      // not a hole (not deeply below its 10-month average). A name that keeps
      // breaking down is still forced out after 3 months. No arbitrary monthly
      // eviction — if nothing deteriorated, the basket simply does not change.
      const hardCut = Math.ceil(extended * 2.2);
      const sigOf = new Map(rows.map((r) => [r.s.ticker, r.raw]));
      // Pool-median 6-month momentum: a sold name should be *relatively* weak,
      // not merely out-ranked, for the swap to be likely to add value.
      const mom6vals = rows.map((r) => r.raw.mom6).filter((v) => v != null).sort((a, b) => a - b);
      const medianMom6 = mom6vals.length ? mom6vals[Math.floor(mom6vals.length / 2)] : 0;
      const kept = [];
      const removed = [];
      for (const m of members) {
        const rank = rankOf.get(m.s.ticker);
        if (rank == null) { removed.push({ m, rank, cause: 'no-data' }); continue; }
        const sig = sigOf.get(m.s.ticker) || {};
        const exitScoreNow = scoreOf.has(m.s.ticker) ? scoreOf.get(m.s.ticker) : m.entryScore;
        const scoreDrop = m.entryScore - exitScoreNow;
        const monthsHeld = k - m.addedIdx;
        const soft = rank >= extended;
        // consecutive months past the soft cut / deeply under the 10-month MA
        m.fadeMonths = soft ? (m.fadeMonths || 0) + 1 : 0;
        const deepHole = (sig.trend || 0) < -0.08;
        m.holeMonths = deepHole ? (m.holeMonths || 0) + 1 : 0;
        const weakMomentum = sig.mom6 == null ? true : sig.mom6 < medianMom6;
        const relativeFade = scoreDrop >= 8 || weakMomentum;
        if (rank >= hardCut && monthsHeld >= 2) { removed.push({ m, rank, cause: 'far-rank' }); continue; }
        if (soft && m.fadeMonths >= 2 && relativeFade && !deepHole) { removed.push({ m, rank, cause: 'deterioration' }); continue; }
        if (soft && m.holeMonths >= 3 && relativeFade) { removed.push({ m, rank, cause: 'breakdown' }); continue; }
        kept.push(m); // out-ranked this month but still constructive -> hold
      }
      const forcedOut = null;
      for (const { m, rank, forced, cause } of removed) {
        const exitScore = scoreOf.has(m.s.ticker) ? scoreOf.get(m.s.ticker) : m.entryScore;
        const monthsHeld = k - m.addedIdx;
        const sig = sigOf.get(m.s.ticker) || {};
        episodes.push(episode(m, ym, rank, extended, exitScore, monthsHeld, forced, dominant, sig, cause));
        const ep = episodes[episodes.length - 1];
        exitsThis.push({
          ticker: ep.ticker, name: ep.name, bookedReturnPct: ep.totalReturnPct,
          holdingMonths: ep.holdingMonths, code: ep.reasonCode,
        });
        exited.set(m.s.ticker, { s: m.s, mult: m.cum });
      }
      members = kept;
      const inBook = new Set(members.map((m) => m.s.ticker));
      for (const r of rows) {
        if (members.length >= target) break;
        if (inBook.has(r.s.ticker)) continue;
        if (forcedOut && forcedOut.has(r.s.ticker)) continue;
        added.push({
          ticker: r.s.ticker, name: r.s.name, dateAdded: `${ym}-01`, score: r.sc,
          code: 'rotation',
          reason: `Added at the ${ym} rebalance: real point-in-time factor score ${r.sc} ranked it #${rankOf.get(r.s.ticker) + 1} in the ${def.market} pool, rotating out a weaker holding to keep the ${target}-stock basket.`,
        });
        entriesThis.push({ ticker: r.s.ticker, name: r.s.name, score: r.sc });
        members.push({ s: r.s, addedIdx: k, addedYm: ym, cum: 1, entryScore: r.sc, realScore: r.sc });
      }
    }

    // ---- realize ACTUAL market returns for month k ----
    let sum = 0; let counted = 0;
    for (const m of members) {
      const r = realMonthlyReturn(poolSeries.get(m.s.ticker), benchMonths[k - 1], ym);
      m.cum *= 1 + r;
      sum += r; counted++;
    }
    for (const [, ex] of exited) {
      ex.mult *= 1 + realMonthlyReturn(poolSeries.get(ex.s.ticker), benchMonths[k - 1], ym);
    }
    const portRet = counted ? sum / counted - 0.005 / 12 : 0;
    const br = benchReturn(bench, benchMonths[k - 1], ym);
    strategyNav.push(strategyNav[strategyNav.length - 1] * (1 + portRet));
    benchmarkNav.push(benchmarkNav[benchmarkNav.length - 1] * (1 + (br == null ? 0 : br)));
    dates.push(`${ym}-01`);
    monthly.push({
      ym,
      avgHoldingReturnPct: counted ? round((sum / counted) * 100, 2) : 0,
      portfolioReturnPct: round(portRet * 100, 2),
      totalReturnPct: round((strategyNav[strategyNav.length - 1] - 1) * 100, 2),
      benchmarkReturnPct: br == null ? null : round(br * 100, 2),
      benchTotalReturnPct: round((benchmarkNav[benchmarkNav.length - 1] - 1) * 100, 2),
      excessPct: br == null ? null : round((portRet - br) * 100, 2),
      nav: round(strategyNav[strategyNav.length - 1], 4),
      benchNav: round(benchmarkNav[benchmarkNav.length - 1], 4),
      holdings: members.length,
      entries: entriesThis,
      exits: exitsThis,
    });
  }

  if (dates.length < 12) return null; // too short to be a meaningful backtest
  dates.push(nextMonth(dates[dates.length - 1]));

  // post-exit profit/loss using real forward returns
  const navByYm = new Map(monthly.map((m) => [m.ym, m.nav]));
  const finalNav = strategyNav.length ? strategyNav[strategyNav.length - 1] : 1;
  for (const ep of episodes) {
    const ex = exited.get(ep.ticker);
    if (ex) {
      const heldValue = round((ex.mult - 1) * 100, 1);
      // Value created by the EXIT decision: booked return minus hold-to-today.
      // Positive = the sale beat holding (smart exit); negative = money left.
      ep.postExitReturnPct = round(ep.totalReturnPct - heldValue, 1);
      ep.postExitVerdict = ep.postExitReturnPct >= 0 ? 'good-exit' : 'costly-exit';
      ep.heldValuePct = heldValue;
      // Fair, market-neutral verdict: did the stock we SOLD go on to beat the
      // basket we redeployed into? Comparing against the index/basket removes
      // the bull-market bias that makes almost any sale look "costly".
      const exitYm = ep.dateRemoved.slice(0, 7);
      const navAt = navByYm.get(exitYm);
      if (navAt) {
        const stockPost = (1 + heldValue / 100) / (1 + ep.totalReturnPct / 100) - 1;
        const basketPost = finalNav / navAt - 1;
        ep.relativeExitPct = round((stockPost - basketPost) * 100, 1);
        ep.relativeVerdict = ep.relativeExitPct > 0 ? 'costly-exit' : 'good-exit';
      } else {
        ep.relativeExitPct = null;
        ep.relativeVerdict = null;
      }
    } else {
      ep.postExitReturnPct = null;
      ep.postExitVerdict = null;
      ep.heldValuePct = null;
      ep.relativeExitPct = null;
      ep.relativeVerdict = null;
    }
  }

  return {
    dates, strategyNav, benchmarkNav, members, episodes, added, monthly,
    poolSize: pool.length, curYm: benchMonths[lastIdx], dataSource: 'real',
  };
}

function realMonthlyReturn(series, prevYm, ym) {
  if (!series) return 0;
  const a = series.ymToClose.get(prevYm);
  const b = series.ymToClose.get(ym);
  if (!a || !b) return 0;
  return clamp(b / a - 1, -0.9, 4);
}

function benchReturn(bench, prevYm, ym) {
  const a = bench.ymToClose.get(prevYm);
  const b = bench.ymToClose.get(ym);
  if (!a || !b) return null;
  return b / a - 1;
}

function episode(m, ym, rank, extended, exitScore, monthsHeld, forced, dominant, sig = {}, cause) {
  const drop = m.entryScore - exitScore;
  const collapsed = drop >= 12 || (rank != null && rank >= extended * 1.75);
  const trend = sig.trend || 0;
  const mom6 = sig.mom6;
  let code; let reason;
  const trendTxt = `${trend >= 0 ? '+' : ''}${round(trend * 100, 1)}%`;
  const momTxt = mom6 == null ? 'n/a' : `${mom6 >= 0 ? '+' : ''}${round(mom6 * 100, 1)}%`;
  if (cause === 'no-data' || rank == null) {
    code = 'data-gap';
    reason = `The stock stopped reporting usable real price history at the ${ym} rebalance, so the AI removed it to keep the basket fully invested in verifiable data.`;
  } else if (forced) {
    code = 'rebalance-floor';
    reason = `Held ${monthsHeld} month${monthsHeld === 1 ? '' : 's'} but drifted to the lowest-ranked spot inside the basket (rank #${rank + 1}). To keep the monthly refresh meaningful the AI rotated it out for a higher-conviction name.`;
  } else if (cause === 'breakdown' || (collapsed && trend < -0.05)) {
    code = 'breakdown';
    reason = `Persistent breakdown: rank #${rank + 1} (past the ${extended}-stock cut-off) for three straight months with 6-month momentum at ${momTxt} and the price ${trendTxt} versus its 10-month average. The AI does not hold a name whose real trend keeps deteriorating, so it exited at the ${ym} rebalance.`;
  } else if (cause === 'far-rank' || collapsed) {
    code = 'score-collapse';
    reason = `Real factor score fell from ${round(exitScore + drop, 1)} to ${exitScore} over ${monthsHeld} month${monthsHeld === 1 ? '' : 's'} — its real ${dominant} deteriorated sharply and rank slipped to #${rank + 1}, well past the ${extended}-stock cut-off, so it was sold at the ${ym} rebalance.`;
  } else {
    code = 'relative-fade';
    reason = `Real factor score eased from ${round(exitScore + drop, 1)} to ${exitScore} and it ranked #${rank + 1} — beyond the ${extended}-stock cut-off — for a second consecutive month, while the price was still ${trendTxt} versus its 10-month average (not a drawdown, so it was not sold into weakness). The AI rotated it into a stronger name at the ${ym} rebalance.`;
  }
  return {
    ticker: m.s.ticker, name: m.s.name, sector: m.s.sector, currency: m.s.currency,
    dateAdded: `${m.addedYm}-01`, dateRemoved: `${ym}-01`,
    totalReturnPct: round((m.cum - 1) * 100, 1), holdingMonths: monthsHeld,
    entryScore: m.entryScore, exitScore, scoreDelta: round(exitScore - m.entryScore, 1),
    exitRank: rank == null ? null : rank + 1, extendedCutoff: extended,
    reasonCode: code, reason,
  };
}

function nextMonth(d) {
  const [y, m] = d.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

module.exports = { realReplay, pitScore, qualityTilt, MIN_BURN };
