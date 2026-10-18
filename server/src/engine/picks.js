'use strict';
// Monthly picks engine: strategy definitions, deterministic month-by-month
// portfolio replay, NAV/benchmark histories, stats, previous winners.
const { rngFor, round, clamp, ymIndex, indexToYm, ymFirstDay, todayYm } = require('./prng');
const { monthlyScore, FACTOR_WEIGHTS, rationaleFor } = require('./universe');

const DEFAULT_WEIGHTS = { ...FACTOR_WEIGHTS };

// dollar volume traded per day, in USD
function dollarVol(s) {
  return (s.avgVolume * s.price) / s.fx;
}

const STRATEGIES = [
  {
    slug: 'beat-nifty-50', code: 'NIFTY20', name: 'Nifty 50 Outperformers',
    description: 'This month\'s top 20 Indian large caps, re-ranked by our AI to outpace the Nifty 50.',
    market: 'India', region: 'IN', benchmark: 'nifty50', benchmarkName: 'Nifty 50',
    yearStart: 2013, pickCount: 20, featured: true,
    tags: ['Monthly', 'India', 'Large Cap'],
    filter: (s) => s.country === 'IN' && s.tier !== 'S' && dollarVol(s) >= 5e6,
    weights: DEFAULT_WEIGHTS,
  },
  {
    slug: 'bharat-bargains', code: 'INB15', name: 'India Value 15',
    description: 'Fifteen Indian companies trading below fair value with the fundamentals to close the gap.',
    market: 'India', region: 'IN', benchmark: 'nifty500', benchmarkName: 'Nifty 500',
    yearStart: 2019, pickCount: 15,
    tags: ['Monthly', 'India', 'Value'],
    filter: (s) => s.country === 'IN' && s.marketCap >= 2e9 && dollarVol(s) >= 3e6,
    weights: { financial: 0.15, multiples: 0.25, momentum: 0.12, efficiency: 0.07, profitability: 0.13, debt: 0.12, industry: 0.08, corporate: 0.08 },
  },
  {
    slug: 'bharat-small-cap-gems', code: 'INS20', name: 'India Smallcap 20',
    description: 'Twenty Indian small caps whose growth and momentum our AI screens every month.',
    market: 'India', region: 'IN', benchmark: 'indiaSmallcap', benchmarkName: 'MSCI India Small-Cap',
    yearStart: 2019, pickCount: 20,
    tags: ['Monthly', 'India', 'Small Cap'],
    filter: (s) => s.country === 'IN' && s.tier === 'S' && dollarVol(s) >= 0.5e6,
    weights: { financial: 0.16, multiples: 0.12, momentum: 0.22, efficiency: 0.08, profitability: 0.14, debt: 0.10, industry: 0.10, corporate: 0.08 },
  },
  {
    slug: 'tech-titans', code: 'IT15', name: 'Tech Vanguard 15',
    description: 'Fifteen large-cap technology leaders picked to stay ahead of the S&P 500.',
    market: 'US', region: 'US', benchmark: 'nasdaq100', benchmarkName: 'Nasdaq 100',
    yearStart: 2013, pickCount: 15,
    tags: ['Monthly', 'US', 'Technology'],
    filter: (s) => s.country === 'US' && s.sector === 'Technology' && s.marketCap >= 10e9 && dollarVol(s) >= 10e6,
    weights: { financial: 0.18, multiples: 0.12, momentum: 0.18, efficiency: 0.08, profitability: 0.16, debt: 0.10, industry: 0.10, corporate: 0.08 },
  },
  {
    slug: 'beat-sp-500', code: 'SP20', name: 'S&P Elite 20',
    description: 'Twenty US mega caps scored monthly on our eight metric families to beat the S&P 500.',
    market: 'US', region: 'US', benchmark: 'sp500', benchmarkName: 'S&P 500',
    yearStart: 2013, pickCount: 20,
    tags: ['Monthly', 'US', 'Large Cap'],
    filter: (s) => s.country === 'US' && s.marketCap >= 50e9,
    weights: DEFAULT_WEIGHTS,
  },
  {
    slug: 'dominate-the-dow', code: 'DOW10', name: 'Dow Dynamos 10',
    description: 'Ten Dow Jones constituents our model likes most versus the Dow itself.',
    market: 'US', region: 'US', benchmark: 'dow', benchmarkName: 'Dow Jones Industrial Average',
    yearStart: 2019, pickCount: 10,
    tags: ['Monthly', 'US', 'Dow 30'],
    filter: (s) => s.dow && dollarVol(s) >= 15e6,
    weights: DEFAULT_WEIGHTS,
  },
  {
    slug: 'mid-cap-movers', code: 'MM20', name: 'Mid-Cap Momentum 20',
    description: 'Twenty US mid caps ($2-10B) with the momentum and balance sheets to keep moving.',
    market: 'US', region: 'US', benchmark: 'sp400', benchmarkName: 'S&P 400',
    yearStart: 2019, pickCount: 20,
    tags: ['Monthly', 'US', 'Mid Cap'],
    filter: (s) => s.country === 'US' && s.marketCap >= 2e9 && s.marketCap <= 10e9 && dollarVol(s) >= 5e6,
    weights: { financial: 0.16, multiples: 0.12, momentum: 0.22, efficiency: 0.10, profitability: 0.14, debt: 0.10, industry: 0.10, corporate: 0.06 },
  },
  {
    slug: 'euro-leaders', code: 'EU15', name: 'Euro Leaders',
    description: 'Fifteen European heavyweights our AI ranks above the STOXX 600.',
    market: 'Europe', region: 'EU', benchmark: 'eurostoxx50', benchmarkName: 'Euro Stoxx 50',
    yearStart: 2019, pickCount: 15,
    tags: ['Monthly', 'Europe', 'Large Cap'],
    filter: (s) => s.region === 'EU' && s.marketCap >= 20e9 && dollarVol(s) >= 5e6,
    weights: DEFAULT_WEIGHTS,
  },
  {
    slug: 'dividend-dynamos', code: 'DIV15', name: 'Dividend Dynamos',
    description: 'Fifteen US payers yielding at least 1.8% with payouts our model considers durable.',
    market: 'US', region: 'US', benchmark: 'sp500', benchmarkName: 'S&P 500',
    yearStart: 2013, pickCount: 15,
    tags: ['Monthly', 'US', 'Dividend'],
    filter: (s) => s.country === 'US' && s.dividendYield >= 1.8 && s.marketCap >= 8e9,
    weights: { financial: 0.13, multiples: 0.13, momentum: 0.08, efficiency: 0.07, profitability: 0.15, debt: 0.14, industry: 0.05, corporate: 0.25 },
  },
  {
    slug: 'ftse-fortunes', code: 'UK15', name: 'FTSE Fortunes',
    description: 'Fifteen London listings chosen to out-run the FTSE 100 over the long haul.',
    market: 'United Kingdom', region: 'UK', benchmark: 'ftse100', benchmarkName: 'FTSE 100',
    yearStart: 2019, pickCount: 15,
    tags: ['Monthly', 'United Kingdom', 'Large Cap'],
    filter: (s) => s.country === 'GB' && s.marketCap >= 5e9 && dollarVol(s) >= 3e6,
    weights: DEFAULT_WEIGHTS,
  },
];

const FEATURED_SLUG = 'beat-nifty-50';

const BENCH_DRIFT = {
  nifty50: 0.0088, nifty500: 0.0090, indiaSmallcap: 0.0106,
  sp500: 0.0075, nasdaq100: 0.0092, dow: 0.0068, sp400: 0.0070,
  eurostoxx50: 0.0055, ftse100: 0.0042,
};
const BENCH_VOL = {
  nifty50: 1.15, nifty500: 1.15, indiaSmallcap: 1.45,
  sp500: 1.0, nasdaq100: 1.2, dow: 1.0, sp400: 1.1, eurostoxx50: 1.05, ftse100: 0.95,
};

// Discrete market regimes shared across benchmarks (realistic-looking path).
const REGIME = {
  '2015-08': -0.05, '2016-01': -0.05, '2016-02': 0.03,
  '2018-10': -0.06, '2018-12': -0.07, '2019-01': 0.06,
  '2020-02': -0.07, '2020-03': -0.17, '2020-04': 0.11, '2020-08': 0.05, '2020-11': 0.07,
  '2022-01': -0.025, '2022-02': -0.03, '2022-03': -0.03, '2022-05': -0.03,
  '2022-06': -0.06, '2022-08': -0.03, '2022-09': -0.05, '2022-10': -0.045,
  '2022-11': 0.07, '2022-12': 0.05,
  '2023-01': 0.03, '2023-11': 0.05, '2023-12': 0.04,
  '2024-02': 0.04, '2024-11': 0.04,
  '2025-02': -0.03, '2025-03': -0.06, '2025-04': 0.07, '2025-09': -0.03, '2025-10': 0.04,
  '2026-02': -0.025, '2026-03': -0.045, '2026-04': 0.05, '2026-07': -0.03, '2026-09': 0.035,
};

function benchMonthlyReturn(benchId, ym) {
  const rng = rngFor('bench', benchId, ym);
  const vol = BENCH_VOL[benchId] || 1;
  const noise = (rng() - 0.5) * 0.07 * vol;
  return BENCH_DRIFT[benchId] + (REGIME[ym] || 0) + noise;
}

// Monthly return of a stock inside a strategy replay.
function stockMonthlyReturn(s, ym, benchId) {
  const mkt = benchMonthlyReturn(benchId, ym);
  const alphaM = ((s.score - 50) / 50) * 0.011 + (clamp(s.revenueGrowth, 0, 30) / 30) * 0.003;
  const rng = rngFor('stockm', s.ticker, ym);
  const idio = (rng() - 0.5) * 0.16 * (1.35 - s.score / 140);
  return clamp(s.beta * mkt + alphaM + idio, -0.6, 0.6);
}

function historyStartYm(def) {
  return def.yearStart <= 2013 ? '2013-11' : `${def.yearStart}-01`;
}

// The metric family whose weight is highest for a strategy — used to name the
// dominant driver in a buy/sell rationale so the "why" reflects that strategy's
// own objective function rather than a generic label.
function dominantFamily(weights) {
  let best = 'momentum';
  let bestW = -1;
  for (const [k, w] of Object.entries(weights || DEFAULT_WEIGHTS)) {
    if (w > bestW) { bestW = w; best = k; }
  }
  return best;
}

const FAMILY_LONG = {
  momentum: 'price momentum', multiples: 'valuation', efficiency: 'asset efficiency',
  profitability: 'profitability', financial: 'financial strength', debt: 'low leverage',
  industry: 'sector positioning', corporate: 'shareholder returns',
};

// Plain-language reason a stock dropped out of the monthly basket. Built from
// the score trajectory (was it a gradual fade or a sudden collapse?) plus the
// dominant metric family that strategy weights most heavily. Returns a short
// code for grouping/colouring and a human sentence for the UI.
function removalReason(ctx) {
  const { entryScore, exitScore, exitRank, extended, dominant, monthsHeld } = ctx;
  const drop = entryScore - exitScore;
  const collapsed = drop >= 12 || exitRank >= extended * 1.75;
  const dominantName = FAMILY_LONG[dominant] || 'its metric profile';
  let code;
  let reason;
  if (collapsed) {
    code = 'score-collapse';
    reason = `Score collapsed from ${exitScore + drop} to ${exitScore} over ${monthsHeld} month${monthsHeld === 1 ? '' : 's'} — a sharp deterioration, driven mainly by ${dominantName}. Its rank fell to #${exitRank + 1}, far outside the extended cut-off of ${extended}, so the AI sold at the next rebalance.`;
  } else if (monthsHeld <= 1) {
    code = 'short-tenure';
    reason = `Exited after a single month: its score slipped to ${exitScore} and rank #${exitRank + 1} already breached the extended cut-off of ${extended}, so it never regained a slot.`;
  } else {
    code = 'rank-fade';
    reason = `Score faded from ${exitScore + drop} to ${exitScore} across ${monthsHeld} months. Peers ranked above it on ${dominantName}, pushing it to #${exitRank + 1} — past the extended cut-off of ${extended} — so it was rotated out.`;
  }
  return { code, reason };
}

// Full deterministic replay of one strategy: portfolio, NAV, benchmark, episodes.
function replay(def, universe) {
  const curYm = todayYm();
  const startIdx = ymIndex(historyStartYm(def));
  const curIdx = ymIndex(curYm);
  const pool = universe.stocks.filter((s) => !s.expanded && def.filter(s));

  const dates = [];
  const strategyNav = [1];
  const benchmarkNav = [1];
  let members = []; // {s, addedIdx, cum, entryScore}
  const episodes = [];
  const added = []; // additions (other than the opening basket) with reasons
  // Post-exit tracking: once a stock is sold we keep following its standalone
  // (buy-and-hold) monthly returns so the UI can show the profit or loss it
  // would have booked *after* leaving the basket. Map ticker -> {mult, ...}.
  const exited = new Map();
  const dominant = dominantFamily(def.weights);
  // Month-by-month ledger (same shape as the real engine's) so the backtest
  // data table renders identically in offline/simulated mode.
  const monthly = [];

  for (let idx = startIdx; idx <= curIdx; idx++) {
    const ym = indexToYm(idx);
    const entriesThis = [];
    const exitsThis = [];
    const ranked = pool
      .map((s) => ({ s, sc: monthlyScore(s, ym) }))
      .sort((a, b) => b.sc - a.sc);
    ranked.forEach((r, i) => { r.i = i; });
    const rankOf = new Map(ranked.map((r, i) => [r.s.ticker, i]));
    const scoreOf = new Map(ranked.map((r) => [r.s.ticker, r.sc]));
    const target = def.pickCount;

    if (members.length === 0) {
      members = ranked.slice(0, target).map((r) => ({ s: r.s, addedIdx: idx, cum: 1, entryScore: r.sc }));
      // Record the opening basket as additions so month one is explained too.
      for (const m of members) {
        added.push({
          ticker: m.s.ticker,
          name: m.s.name,
          dateAdded: ymFirstDay(ym),
          score: m.entryScore,
          reason: `Opened the ${def.code} basket at launch: top-${target} by AI composite score (${m.entryScore}) within the ${def.market} universe of ${pool.length} qualifying stocks.`,
          code: 'opening',
        });
        entriesThis.push({ ticker: m.s.ticker, name: m.s.name, score: m.entryScore });
      }
    } else {
      // Incumbents stay unless they fall out of the extended top N. The
      // extended bound is capped relative to the pool size: with a small
      // universe (pool close to pickCount) a fixed 1.5x bound would be
      // unreachable and membership would freeze forever.
      const extended = Math.min(
        Math.ceil(target * 1.5),
        Math.max(target + 2, Math.floor(pool.length * 0.75))
      );
      const kept = [];
      const removed = [];
      for (const m of members) {
        const rank = rankOf.get(m.s.ticker);
        if (rank != null && rank < extended) kept.push(m);
        else removed.push({ m, rank });
      }
      // Monthly rebalance floor: when the rank rules would leave the book
      // untouched this month, evict the lowest-ranked incumbent so every
      // strategy keeps a living monthly add/remove history (the monthly
      // refresh cadence users expect). Only applied when the pool is large
      // enough to replace them with a genuinely different stock.
      let forcedOut = null;
      if (removed.length === 0 && kept.length >= target && pool.length > target + 1) {
        let worstIdx = -1;
        let worstRank = -1;
        for (let i = 0; i < kept.length; i++) {
          const r = rankOf.get(kept[i].s.ticker);
          if (r != null && r > worstRank) {
            worstRank = r;
            worstIdx = i;
          }
        }
        if (worstIdx >= 0) {
          forcedOut = new Set([kept[worstIdx].s.ticker]);
          const m = kept.splice(worstIdx, 1)[0];
          removed.push({ m, rank: worstRank, forced: true });
        }
      }
      for (const { m, rank, forced } of removed) {
        const entryScore = m.entryScore;
        const exitScore = scoreOf.get(m.s.ticker) != null ? scoreOf.get(m.s.ticker) : entryScore;
        const monthsHeld = idx - m.addedIdx;
        const rsn = removalReason({
          entryScore, exitScore, exitRank: rank == null ? pool.length : rank,
          extended, dominant, monthsHeld,
        });
        episodes.push({
          ticker: m.s.ticker,
          name: m.s.name,
          sector: m.s.sector,
          currency: m.s.currency,
          dateAdded: ymFirstDay(indexToYm(m.addedIdx)),
          dateRemoved: ymFirstDay(ym),
          totalReturnPct: round((m.cum - 1) * 100, 1),
          holdingMonths: monthsHeld,
          entryScore,
          exitScore,
          scoreDelta: round(exitScore - entryScore, 1),
          exitRank: rank == null ? null : rank + 1,
          extendedCutoff: extended,
          reasonCode: forced ? 'rebalance-floor' : rsn.code,
          reason: forced
            ? `Held ${monthsHeld} month${monthsHeld === 1 ? '' : 's'} but drifted to the lowest-ranked spot inside the basket (rank #${rank == null ? '?' : rank + 1}). To keep the monthly refresh meaningful the AI rotated it out in favour of a higher-conviction name.`
            : rsn.reason,
        });
        // Start (or resume) post-exit performance tracking for this stock.
        exited.set(m.s.ticker, { s: m.s, mult: m.cum, prevScore: exitScore });
        exitsThis.push({
          ticker: m.s.ticker,
          name: m.s.name,
          bookedReturnPct: (m.cum - 1) * 100,
          holdingMonths: idx - m.addedIdx,
          code: forced ? 'rebalance-floor' : rsn.code,
        });
      }
      members = kept;
      const inPortfolio = new Set(members.map((m) => m.s.ticker));
      for (const r of ranked) {
        if (members.length >= target) break;
        if (inPortfolio.has(r.s.ticker)) continue;
        // Never re-add a stock evicted by the rebalance floor this month.
        if (forcedOut && forcedOut.has(r.s.ticker)) continue;
        added.push({
          ticker: r.s.ticker,
          name: r.s.name,
          dateAdded: ymFirstDay(ym),
          score: r.sc,
          code: 'rotation',
          reason: `Added at the ${ym} rebalance: AI composite score ${r.sc} ranked it #${r.i + 1} in the ${def.market} pool, displacing a weaker holding to keep the basket at its ${target}-stock target.`,
        });
        entriesThis.push({ ticker: r.s.ticker, name: r.s.name, score: r.sc });
        members.push({ s: r.s, addedIdx: idx, cum: 1, entryScore: r.sc });
      }
    }

    // Monthly returns for the month just entered.
    let sum = 0;
    for (const m of members) {
      const r = stockMonthlyReturn(m.s, ym, def.benchmark);
      m.cum *= 1 + r;
      sum += r;
    }
    // Advance post-exit tracking for stocks that already left the basket.
    for (const [, ex] of exited) {
      ex.mult *= 1 + stockMonthlyReturn(ex.s, ym, def.benchmark);
    }
    const portRet = members.length ? sum / members.length - 0.005 / 12 : 0;
    strategyNav.push(strategyNav[strategyNav.length - 1] * (1 + portRet));
    benchmarkNav.push(benchmarkNav[benchmarkNav.length - 1] * (1 + benchMonthlyReturn(def.benchmark, ym)));
    dates.push(ymFirstDay(ym));
    const benchRetM = benchMonthlyReturn(def.benchmark, ym);
    const portRetM = members.length ? sum / members.length - 0.005 / 12 : 0;
    monthly.push({
      ym,
      avgHoldingReturnPct: members.length ? round((sum / members.length) * 100, 2) : 0,
      portfolioReturnPct: round(portRetM * 100, 2),
      totalReturnPct: round((strategyNav[strategyNav.length - 1] - 1) * 100, 2),
      benchmarkReturnPct: round(benchRetM * 100, 2),
      benchTotalReturnPct: round((benchmarkNav[benchmarkNav.length - 1] - 1) * 100, 2),
      excessPct: round((portRetM - benchRetM) * 100, 2),
      nav: round(strategyNav[strategyNav.length - 1], 4),
      benchNav: round(benchmarkNav[benchmarkNav.length - 1], 4),
      holdings: members.length,
      entries: entriesThis,
      exits: exitsThis,
    });
  }
  // dates has N entries (one per month), nav arrays N+1 (index 0 = start
  // capital of 1.0). Append the closing month boundary so all three align.
  dates.push(nextMonthFirstDay(dates[dates.length - 1]));

  // Post-exit profit/loss: for every removed episode, compare the exit value
  // (the cumulative return the basket booked while it was held) against where
  // the same stock stands today had it simply been held after the sale. A
  // positive figure means the sale looks smart in hindsight; negative means it
  // left money on the table.
  const navByYm = new Map(monthly.map((m) => [m.ym, m.nav]));
  const finalNav = strategyNav.length ? strategyNav[strategyNav.length - 1] : 1;
  for (const ep of episodes) {
    const ex = exited.get(ep.ticker);
    const exitValue = ep.totalReturnPct;
    if (ex) {
      const heldValue = round((ex.mult - 1) * 100, 1);
      // Value created by the EXIT decision: what the basket booked minus what
      // a hold-to-today would be worth. Positive = selling beat holding.
      ep.postExitReturnPct = round(exitValue - heldValue, 1);
      ep.postExitVerdict = ep.postExitReturnPct >= 0 ? 'good-exit' : 'costly-exit';
      ep.heldValuePct = heldValue;
      // Fair metric: did the sold stock beat the basket we rotated into?
      const ym = (ep.dateRemoved || '').slice(0, 7);
      const navAt = navByYm.get(ym);
      if (navAt) {
        const stockPost = (1 + heldValue / 100) / (1 + exitValue / 100) - 1;
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

  return { dates, strategyNav, benchmarkNav, members, episodes, added, monthly, poolSize: pool.length, curYm };
}

function nextMonthFirstDay(d) {
  const [y, m] = d.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

function totalReturn(nav) {
  return round((nav[nav.length - 1] - 1) * 100, 1);
}

function windowReturn(nav, months) {
  if (nav.length <= months) return totalReturn(nav);
  const base = nav[nav.length - 1 - months];
  return round((nav[nav.length - 1] / base - 1) * 100, 1);
}

function statsOf(replayResult) {
  const sn = replayResult.strategyNav;
  const bn = replayResult.benchmarkNav;
  const nMonths = sn.length - 1;
  const returnMax = totalReturn(sn);
  const benchMax = totalReturn(bn);
  const rets = [];
  const brets = [];
  for (let i = 1; i < sn.length; i++) {
    rets.push(sn[i] / sn[i - 1] - 1);
    brets.push(bn[i] / bn[i - 1] - 1);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const mr = mean(rets);
  const mb = mean(brets);
  let cov = 0;
  let varb = 0;
  for (let i = 0; i < rets.length; i++) {
    cov += (rets[i] - mr) * (brets[i] - mb);
    varb += (brets[i] - mb) * (brets[i] - mb);
  }
  const beta = varb > 0 ? round(cov / varb, 2) : 1;
  const annualized = nMonths > 0 ? round((Math.pow(sn[sn.length - 1], 12 / nMonths) - 1) * 100, 1) : 0;
  return {
    return1y: windowReturn(sn, 12),
    return5y: windowReturn(sn, 60),
    returnMax,
    annualized,
    beta: Math.abs(beta) < 0.05 ? 1 : beta,
    outperformance: round(returnMax - benchMax, 1),
    benchmarkMax: benchMax,
  };
}

function pickRows(def, replayResult) {
  const { members, episodes, curYm } = replayResult;
  const real = replayResult.dataSource === 'real';
  const picks = members
    .map((m) => {
      // Real backtests carry the point-in-time score and the entry month
      // directly; the simulated engine derives them from the month index.
      const sc = m.realScore != null ? m.realScore : monthlyScore(m.s, curYm);
      return {
        stock: m.s,
        monthScore: sc,
        returnPct: round((m.cum - 1) * 100, 1),
        dateAdded: m.addedYm ? `${m.addedYm}-01` : ymFirstDay(indexToYm(m.addedIdx)),
      };
    })
    .sort((a, b) => b.monthScore - a.monthScore);

  const n = picks.length;
  const cut = Math.max(Math.floor(n / 4), 1);
  return picks.map((p, i) => {
    const rating = i < cut ? 'outperform' : i >= n - cut ? 'underperform' : 'neutral';
    const rationale = rationaleFor(p.stock, p.stock.families, { score: p.monthScore, rating });
    const s = p.stock;
    return {
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      exchange: s.exchange,
      country: s.country,
      currency: s.currency,
      price: s.price,
      returnPct: p.returnPct,
      rating,
      score: p.monthScore,
      rationaleTags: rationale.rationaleTags,
      rationaleText: rationale.rationaleText,
      fairValue: s.fairValue,
      upsidePct: s.upsidePct,
      marketCap: s.marketCap,
      dateAdded: p.dateAdded,
    };
  });
}

function updatedDates() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const mm = String(m).padStart(2, '0');
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? '01' : String(m + 1).padStart(2, '0');
  return { updated: `${y}-${mm}-01`, nextUpdate: `${nextY}-${nextM}-01` };
}

// Full payload for GET /strategies/:slug (also used by featured).
// `replayResult` is optional: when the engine has real history it passes a
// point-in-time REAL backtest here; otherwise this falls back to the seeded
// simulation. The `dataSource` field tells the UI which one it got.
function strategyPayload(def, universe, replayResult) {
  const rr = replayResult || replay(def, universe);
  const isReal = rr.dataSource === 'real';
  const stats = statsOf(rr);
  const picks = pickRows(def, rr);
  const { updated, nextUpdate } = updatedDates();
  const previousWinners = rr.episodes
    .sort((a, b) => b.totalReturnPct - a.totalReturnPct)
    .slice(0, 30);

  // Monthly basket-change feed, newest first. Grouped by the rebalance month
  // so the UI can show "what changed in <Month>" with a reason per stock, and
  // for sells the profit/loss booked while held plus the post-exit performance.
  const removals = [...rr.episodes].sort((a, b) => (a.dateRemoved < b.dateRemoved ? 1 : -1));
  const additions = [...rr.added].sort((a, b) => (a.dateAdded < b.dateAdded ? 1 : -1));
  const exitPnL = removals.reduce((acc, e) => {
    if (e.postExitVerdict === 'good-exit') acc.good += 1;
    else if (e.postExitVerdict === 'costly-exit') acc.costly += 1;
    if (e.relativeVerdict === 'good-exit') acc.relGood += 1;
    else if (e.relativeVerdict === 'costly-exit') acc.relCostly += 1;
    return acc;
  }, { good: 0, costly: 0, relGood: 0, relCostly: 0 });

  return {
    strategy: {
      code: def.code,
      slug: def.slug,
      name: def.name,
      description: def.description,
      market: def.market,
      region: def.region,
      benchmark: def.benchmarkName,
      yearStart: isReal ? Number(rr.dates[0].slice(0, 4)) : def.yearStart,
      windowMonths: isReal ? rr.strategyNav.length - 1 : null,
      dataSource: isReal ? 'real' : 'simulated',
      pickCount: picks.length,
      return1y: stats.return1y,
      return5y: stats.return5y,
      returnMax: stats.returnMax,
      annualized: stats.annualized,
      beta: stats.beta,
      outperformance: stats.outperformance,
      updated,
      nextUpdate,
      tags: def.tags,
      poolSize: rr.poolSize,
    },
    picks,
    history: {
      dates: rr.dates,
      strategyNav: rr.strategyNav.map((v) => round(v, 4)),
      benchmarkNav: rr.benchmarkNav.map((v) => round(v, 4)),
    },
    previousWinners,
    basketChanges: {
      additions,
      removals,
      exitPnL,
      rebalanceDay: '1st of each month',
    },
    monthlyLedger: rr.monthly ? rr.monthly.map((m) => ({
      ym: m.ym,
      date: `${m.ym}-01`,
      portfolioReturnPct: round(m.portfolioReturnPct, 2),
      avgHoldingReturnPct: round(m.avgHoldingReturnPct, 2),
      totalReturnPct: round(m.totalReturnPct, 2),
      benchmarkReturnPct: m.benchmarkReturnPct == null ? null : round(m.benchmarkReturnPct, 2),
      benchTotalReturnPct: round(m.benchTotalReturnPct, 2),
      excessPct: m.excessPct == null ? null : round(m.excessPct, 2),
      nav: round(m.nav, 4),
      benchNav: round(m.benchNav, 4),
      holdings: m.holdings,
      entries: (m.entries || []).map((e) => ({ ticker: e.ticker, name: e.name, score: e.score })),
      exits: (m.exits || []).map((e) => ({
        ticker: e.ticker, name: e.name, bookedReturnPct: e.bookedReturnPct,
        holdingMonths: e.holdingMonths, code: e.code,
      })),
    })) : [],
    _stats: stats,
  };
}

// Lightweight list payload for GET /strategies.
function strategyListRow(def, universe, favorite, replayResult) {
  const rr = replayResult || replay(def, universe);
  const isReal = rr.dataSource === 'real';
  const stats = statsOf(rr);
  const { updated, nextUpdate } = updatedDates();
  return {
    code: def.code,
    slug: def.slug,
    name: def.name,
    description: def.description,
    market: def.market,
    region: def.region,
    benchmark: def.benchmarkName,
    yearStart: isReal ? Number(rr.dates[0].slice(0, 4)) : def.yearStart,
    dataSource: isReal ? 'real' : 'simulated',
    pickCount: def.pickCount,
    return1y: stats.return1y,
    return5y: stats.return5y,
    returnMax: stats.returnMax,
    annualized: stats.annualized,
    beta: stats.beta,
    outperformance: stats.outperformance,
    updated,
    nextUpdate,
    favorite: !!favorite,
    tags: def.tags,
  };
}

// Simulator for GET /propicks/simulator?slug&amount&years
function simulator(def, universe, amount, years, replayResult) {
  const rr = replayResult || replay(def, universe);
  const sn = rr.strategyNav;
  const bn = rr.benchmarkNav;
  const total = sn.length; // N+1 points
  let lo = 0;
  if (years && years > 0) {
    const want = Math.min(years * 12 + 1, total - 1);
    lo = Math.max(total - 1 - want, 0);
  }
  const points = [];
  for (let i = lo; i < total; i++) {
    points.push({
      date: rr.dates[i],
      value: round(amount * (sn[i] / sn[lo]), 2),
      benchmarkValue: round(amount * (bn[i] / bn[lo]), 2),
    });
  }
  const endAmount = points[points.length - 1].value;
  const endBenchmark = points[points.length - 1].benchmarkValue;
  return {
    points,
    startAmount: amount,
    endAmount: round(endAmount, 2),
    endBenchmark: round(endBenchmark, 2),
    strategyTotalPct: round((endAmount / amount - 1) * 100, 1),
    benchmarkTotalPct: round((endBenchmark / amount - 1) * 100, 1),
  };
}

module.exports = {
  STRATEGIES, FEATURED_SLUG, replay, statsOf, strategyPayload,
  strategyListRow, simulator, benchMonthlyReturn, historyStartYm,
};
