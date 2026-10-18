'use strict';
// Warren AI — the AlphaDesk research assistant.
//
// A deterministic, rule-based research agent over the (partly live) dataset.
// It answers detailed stock questions (valuation, quality, growth, risk,
// technicals, dividends, peers, verdict), mutual-fund questions (returns, risk,
// expense, comparisons, "best <category> fund", SIP maths) and strategy /
// methodology / calendar / watchlist questions. Every figure comes from the
// dataset (or real NAV/price history) — nothing is invented.
const { round } = require('./prng');
const { STRATEGIES } = require('./picks');
const calendar = require('./calendar');
const funds = require('./funds');

const SUGGESTIONS = [
  'Should I buy AAPL? Give a full analysis',
  'Best small cap mutual fund?',
  'Compare HDFC Flexi Cap and Parag Parikh Flexi Cap',
  'SIP 5000 for 10 years in Nippon India Small Cap',
  'Best performing strategy?',
  'How does AlphaPicks AI choose stocks?',
];

// ---- formatting -----------------------------------------------------------
function fmtPct(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return `${v >= 0 ? '+' : ''}${round(v, 1)}%`;
}
function n(v, digits = 1) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return String(round(v, digits));
}
function money(v, cur) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ''}`;
}
function bigCap(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v)}`;
}
function inr(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}

// ---- entity resolution ----------------------------------------------------
function findStrategy(lowerText, strategies) {
  for (const d of strategies) {
    if (lowerText.includes(d.slug) || lowerText.includes(d.name.toLowerCase()) || lowerText.includes(d.code.toLowerCase())) return d;
  }
  for (const d of strategies) {
    const words = d.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.length && words.every((w) => lowerText.includes(w))) return d;
  }
  return null;
}

function findStock(token, lowerText, universe) {
  const cleaned = String(token || '').toUpperCase().replace(/[^A-Z0-9.&-]/g, '');
  if (cleaned && universe.byTicker.has(cleaned)) return universe.byTicker.get(cleaned);
  let best = null;
  let bestLen = 0;
  for (const s of universe.stocks) {
    const name = s.name.toLowerCase();
    const bare = name.replace(/,? (inc|corp|corporation|company|limited|ltd|plc|group|holdings?|co|technologies|enterprises)\.?$/i, '').trim();
    if (bare.length >= 5 && bare.length > bestLen && lowerText.includes(bare)) {
      best = s;
      bestLen = bare.length;
    }
  }
  return best;
}

function findFund(lowerText) {
  const hits = funds.search(lowerText, 1);
  return hits.length ? hits[0] : null;
}

// returns { a, b } stocks or { a, b } strategies from "X vs Y" / "compare X and Y"
function parseComparison(query) {
  const vsSplit = query.split(/\s+(?:vs\.?|versus)\s+/i);
  if (vsSplit.length === 2) return [vsSplit[0], vsSplit[1]];
  if (/^compare\s+/i.test(query)) {
    const rest = query.replace(/^compare\s+/i, '');
    const joined = rest.split(/\s+(?:and|to|with|vs)\s+/i);
    if (joined.length === 2) return [joined[0], joined[1]];
  }
  return null;
}

// ---- stock report ---------------------------------------------------------
function verdictSentence(s) {
  const up = s.upsidePct;
  const q = s.score >= 70 ? 'a strong' : s.score >= 45 ? 'a middling' : 'a weak';
  const val = up > 15 ? 'clearly undervalued' : up > 5 ? 'modestly undervalued' : up < -15 ? 'clearly overvalued' : up < -5 ? 'modestly overvalued' : 'close to fair value';
  const mom = s.momentum12m > 15 ? 'strong 12-month momentum' : s.momentum12m < -10 ? 'negative 12-month momentum' : 'flat momentum';
  const risk = s.debtToEquity > 2 ? 'high leverage' : s.debtToEquity < 0.5 ? 'a conservative balance sheet' : 'moderate leverage';
  return `On the blended fair-value model it screens **${val}**, with a ${s.score}/100 quality score, ${mom} and ${risk}. Rules-based research, not investment advice.`;
}

function stockReport(s, universe) {
  const cur = s.currency;
  const L = [];
  L.push(`**${s.name} (${s.ticker})** — ${s.sector}${s.industry ? ` / ${s.industry}` : ''}, ${s.exchange} · ${s.country}`);
  L.push(`Price ${money(s.price, cur)} (${fmtPct(s.changePct)} today) · Market cap ${bigCap(s.marketCap)} · AI score ${s.score}/100 (${s.rating})`);
  L.push('');
  L.push('**Valuation**');
  L.push(`P/E ${n(s.pe)} · P/B ${n(s.pb)} · P/S ${n(s.ps)} · EV/EBITDA ${n(s.evEbitda)} · dividend yield ${n(s.dividendYield)}%`);
  L.push(`Blended fair value ${money(s.fairValue, cur)} → ${fmtPct(s.upsidePct)} ${s.upsidePct >= 0 ? 'upside' : 'downside'} (${s.verdict}).`);
  L.push('');
  L.push('**Profitability & growth**');
  L.push(`ROE ${n(s.roe)}% · ROA ${n(s.roa)}% · net margin ${n(s.netMargin)}% · operating margin ${n(s.opMargin)}%`);
  L.push(`Revenue growth ${fmtPct(s.revenueGrowth)} · EPS growth ${fmtPct(s.epsGrowth)}`);
  L.push('');
  L.push('**Balance sheet**');
  L.push(`Debt/equity ${n(s.debtToEquity)} · current ratio ${n(s.currentRatio)} · interest cover ${n(s.interestCoverage)}x · FCF yield ${n(s.freeCashFlowYield)}%`);
  L.push('');
  L.push('**Market behaviour**');
  L.push(`Momentum: 1M ${fmtPct(s.momentum1m)} · 3M ${fmtPct(s.momentum3m)} · 6M ${fmtPct(s.momentum6m)} · 12M ${fmtPct(s.momentum12m)}`);
  L.push(`Volatility ${n(s.volatility12m)}% · RSI ${n(s.rsi)} · beta ${n(s.beta)} · 50-DMA ${money(s.movingAvg50, cur)} · 200-DMA ${money(s.movingAvg200, cur)}`);
  const extra = [];
  if (s.week52High != null) extra.push(`52-week range ${money(s.week52Low, cur)}–${money(s.week52High, cur)}`);
  if (s.shortInterest != null) extra.push(`short interest ${n(s.shortInterest)}%`);
  if (s.insiderOwnership != null) extra.push(`insider holding ${n(s.insiderOwnership)}%`);
  if (extra.length) L.push(extra.join(' · '));
  if (s.dividendPayout != null) {
    L.push('');
    L.push('**Dividends**');
    L.push(`Yield ${n(s.dividendYield)}% · payout ${n(s.dividendPayout)}%${s.dividendRate != null ? ` · annual rate ${money(s.dividendRate, cur)}` : ''}`);
  }
  const peers = universe.stocks
    .filter((p) => p.ticker !== s.ticker && (p.industry === s.industry || p.sector === s.sector))
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 5)
    .map((p) => `${p.ticker} (score ${p.score}, P/E ${n(p.pe)})`)
    .join(', ');
  L.push('');
  L.push('**Peers**');
  L.push(peers || 'No close peers in the tracked universe.');
  if (s.rationaleText) {
    L.push('');
    L.push('**Model read**');
    L.push(s.rationaleText);
  }
  L.push('');
  L.push('**Bottom line**');
  L.push(verdictSentence(s));
  return L.join('\n');
}

// ---- fund research --------------------------------------------------------
function fundReport(f) {
  const L = [];
  L.push(`**${f.name}** — ${f.category} (${f.region}) by ${f.house}`);
  L.push(`Benchmark ${f.benchmark} · risk ${f.risk} · expense ratio ${n(f.expense)}%`);
  if (f.source === 'live') {
    L.push(`Latest NAV ${n(f.latestNav, 2)} across ${f.monthsTracked} months of real NAV history.`);
    L.push('');
    L.push('**Returns (CAGR from real NAV)**');
    L.push(`1 year ${fmtPct(f.return1y)} · 3 years ${fmtPct(f.return3y)} · 5 years ${fmtPct(f.return5y)}`);
    L.push('');
    L.push('**Risk**');
    L.push(`Annualised volatility ${n(f.volatility12m)}% · max drawdown ${n(f.maxDrawdown)}%`);
  } else {
    L.push(`Returns (illustrative sample — live NAV unavailable): 1Y ${fmtPct(f.return1y)} · 3Y ${fmtPct(f.return3y)} · 5Y ${fmtPct(f.return5y)}`);
  }
  L.push('');
  L.push('**Assessment**');
  if (f.source === 'live') {
    const cat = f.category.toLowerCase();
    const riskNote = f.maxDrawdown != null && f.maxDrawdown < -30
      ? `It has endured a ${n(f.maxDrawdown)}% drawdown, so expect real pain in a bad market.`
      : `Its worst drawdown in the available history was ${n(f.maxDrawdown)}%.`;
    L.push(`A ${cat} fund in the ${f.region} market. Over 3 years it compounded at ${fmtPct(f.return3y)} p.a. with ${n(f.volatility12m)}% annualised volatility against the ${f.benchmark}. ${riskNote}`);
  } else {
    L.push(`A ${f.category.toLowerCase()} fund in the ${f.region} market benchmarked to ${f.benchmark}.`);
  }
  L.push('');
  L.push('Data: mfapi.in (Indian fund NAV) and Yahoo Finance (US fund NAV). Past returns do not guarantee future results.');
  return L.join('\n');
}

function compareFunds(a, b) {
  const rows = [
    ['Category', a.category, b.category],
    ['1Y CAGR', fmtPct(a.return1y), fmtPct(b.return1y)],
    ['3Y CAGR', fmtPct(a.return3y), fmtPct(b.return3y)],
    ['5Y CAGR', fmtPct(a.return5y), fmtPct(b.return5y)],
    ['Volatility', `${n(a.volatility12m)}%`, `${n(b.volatility12m)}%`],
    ['Max drawdown', `${n(a.maxDrawdown)}%`, `${n(b.maxDrawdown)}%`],
    ['Expense ratio', `${n(a.expense)}%`, `${n(b.expense)}%`],
  ];
  const L = [`**${a.name}** vs **${b.name}**`, ''];
  for (const [k, x, y] of rows) L.push(`${k}:  ${x}  vs  ${y}`);
  const score = (f) => (f.return3y || 0) - (f.volatility12m || 0) / 2 - (f.expense || 0);
  const winner = score(a) >= score(b) ? a : b;
  L.push('');
  L.push(`On risk-adjusted 3-year returns net of cost, **${winner.name}** screens stronger. Suitable as a ${winner.category.toLowerCase()} allocation for a long-horizon investor comfortable with ${winner.risk.toLowerCase()} risk. Not investment advice.`);
  return L.join('\n');
}

function bestFunds(lowerText, limit = 3) {
  const all = funds.list();
  const cat = ['small cap', 'mid cap', 'large cap', 'flexi cap', 'elss', 'value', 'index', 'sectoral', 'technology', 'pharma', 'hybrid', 'balanced advantage', 'commodities', 'growth']
    .find((k) => lowerText.includes(k));
  const regionIndia = /india|nifty|indian/.test(lowerText);
  const regionUS = /\bus\b|american|s&p/.test(lowerText);
  let pool = all;
  if (cat) pool = pool.filter((f) => f.category.toLowerCase().includes(cat));
  if (regionIndia) pool = pool.filter((f) => f.region === 'India');
  if (regionUS) pool = pool.filter((f) => f.region === 'US');
  if (!pool.length) pool = all;
  const ranked = [...pool].sort((x, y) => (y.return3y ?? -99) - (x.return3y ?? -99)).slice(0, 3);
  const L = [`Top ${cat ? `${cat} ` : ''}funds by 3-year CAGR${regionIndia ? ' (India)' : regionUS ? ' (US)' : ''}:`, ''];
  for (const f of ranked) {
    L.push(`• **${f.name}** — 3Y ${fmtPct(f.return3y)} p.a., 1Y ${fmtPct(f.return1y)}, risk ${f.risk}, vol ${n(f.volatility12m)}%, expense ${n(f.expense)}%${f.source === 'live' ? '' : ' (sample)'}`);
  }
  L.push('');
  L.push('Ranked on real NAV history. A high past return is not a promise — match the fund to your horizon and risk appetite.');
  return { answer: L.join('\n'), refs: ranked.map((f) => ({ type: 'fund', id: f.id, label: f.name })) };
}

function sipAnswer(lowerText, query) {
  const amtMatch = query.replace(/,/g, '').match(/(?:₹|rs\.?\s*|inr\s*|\$\s*)?(\d{3,7})/i);
  const amount = amtMatch ? Number(amtMatch[1]) : 5000;
  const yrsMatch = lowerText.match(/(\d{1,2})\s*(?:years?|yrs?|saal)/);
  const years = yrsMatch ? Number(yrsMatch[1]) : 10;
  let fund = findFund(lowerText);
  const rate = (fund && fund.return3y ? fund.return3y : 12) / 100;
  const i = rate / 12;
  const months = years * 12;
  const fv = amount * ((Math.pow(1 + i, months) - 1) / i) * (1 + i);
  const invested = amount * months;
  const L = [`**SIP projection** — ${inr(amount)} per month for ${years} years`];
  L.push(fund ? `Assumed return ${n(rate * 100)}% p.a. (${fund.name} 3-year CAGR).` : 'Assumed return 12% p.a. (long-run equity average).');
  L.push('');
  L.push(`Total invested: ${inr(invested)}`);
  L.push(`Projected value: **${inr(fv)}**`);
  L.push(`Estimated gain: ${inr(fv - invested)}`);
  L.push('');
  L.push('Monthly compounding assumed; returns are not guaranteed and vary with the market.');
  return { answer: L.join('\n'), refs: fund ? [{ type: 'fund', id: fund.id, label: fund.name }] : [] };
}

function compareStocks(a, b) {
  const rows = [
    ['Price', money(a.price, a.currency), money(b.price, b.currency)],
    ['AI score', `${a.score}/100 (${a.rating})`, `${b.score}/100 (${b.rating})`],
    ['P/E', n(a.pe), n(b.pe)],
    ['P/B', n(a.pb), n(b.pb)],
    ['ROE', `${n(a.roe)}%`, `${n(b.roe)}%`],
    ['Net margin', `${n(a.netMargin)}%`, `${n(b.netMargin)}%`],
    ['Revenue growth', fmtPct(a.revenueGrowth), fmtPct(b.revenueGrowth)],
    ['Debt/equity', n(a.debtToEquity), n(b.debtToEquity)],
    ['12M momentum', fmtPct(a.momentum12m), fmtPct(b.momentum12m)],
    ['Fair-value upside', fmtPct(a.upsidePct), fmtPct(b.upsidePct)],
  ];
  const L = [`**${a.name} (${a.ticker})** vs **${b.name} (${b.ticker})**`, ''];
  for (const [k, x, y] of rows) L.push(`${k}:  ${x}  vs  ${y}`);
  const winner = a.score >= b.score ? a : b;
  L.push('');
  L.push(`The model leans toward **${winner.name}** (${winner.score}/100 vs ${(winner === a ? b : a).score}/100). Consider fit with your portfolio, not just the score.`);
  return L.join('\n');
}

function compareStrategies(pa, pb) {
  const a = pa.strategy;
  const b = pb.strategy;
  const L = [`**${a.name}** vs **${b.name}**`, ''];
  L.push(`Total return: ${fmtPct(a.returnMax)} vs ${fmtPct(b.returnMax)}`);
  L.push(`1Y return: ${fmtPct(a.return1y)} vs ${fmtPct(b.return1y)}`);
  L.push(`Annualized: ${a.annualized}% vs ${b.annualized}%`);
  L.push(`Beta: ${a.beta} vs ${b.beta}`);
  L.push(`Benchmark: ${a.benchmark} vs ${b.benchmark}`);
  L.push(`Outperformance: ${fmtPct(a.outperformance)} vs ${fmtPct(b.outperformance)}`);
  L.push('');
  L.push(`${a.returnMax >= b.returnMax ? a.name : b.name} leads on total return. Both are point-in-time backtests on real prices — past performance is not a guarantee.`);
  return L.join('\n');
}

function strategyDetailSentence(p) {
  const s = p.strategy;
  const led = p.monthlyLedger && p.monthlyLedger.length ? p.monthlyLedger[p.monthlyLedger.length - 1] : null;
  const L = [];
  L.push(`**${s.name}** — ${s.description}`);
  L.push('');
  L.push(`Market ${s.market} · benchmark ${s.benchmark} · ${s.pickCount} stocks · ${s.dataSource === 'real' ? 'real point-in-time backtest' : 'simulated backtest'}`);
  L.push(`Total return ${fmtPct(s.returnMax)} · 1Y ${fmtPct(s.return1y)} · annualized ${s.annualized}% · beta ${s.beta} · vs benchmark ${fmtPct(s.outperformance)}`);
  if (led) L.push(`Portfolio total return after the latest rebalance: ${fmtPct(led.totalReturnPct)}; benchmark over the same window ${fmtPct(led.benchTotalReturnPct)}.`);
  if (p.picks && p.picks.length) {
    L.push('');
    L.push(`Top holdings right now: ${p.picks.slice(0, 5).map((x) => `${x.ticker} (${x.score})`).join(', ')}.`);
  }
  return L.join('\n');
}

// ---- calendar -------------------------------------------------------------
function localYmd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function weekStart() {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return localYmd(d);
}
function weekEnd() {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + 6);
  return localYmd(d);
}
function calendarAnswer(lowerText) {
  const wantsWeek = lowerText.includes('week');
  const country = lowerText.includes('fed') || lowerText.includes('cpi') || lowerText.includes('payroll') ? 'US'
    : lowerText.includes('ecb') ? 'EU'
      : lowerText.includes('rbi') ? 'IN'
        : lowerText.includes('boe') || lowerText.includes('uk') ? 'GB'
          : undefined;
  const events = wantsWeek
    ? calendar.query({ from: weekStart(), to: weekEnd(), country, importance: undefined })
    : calendar.upcoming(6, country);
  if (!events.length) return 'I could not find scheduled events matching that filter — try "economic calendar this week" or mention a country such as the US, EU or India.';
  const list = events.slice(0, 5).map((e) => `• ${e.date} — ${e.indicator} (${e.country}, importance ${e.importance})`).join('\n');
  return `**Upcoming economic events**\n${list}\n\nPrevious/forecast/actual values are on the Economic Calendar page.`;
}

// ---- main entry -----------------------------------------------------------
function ask(q, universe, state, getPayload) {
  const query = String(q || '').trim();
  const lower = query.toLowerCase();
  const refs = [];
  const pushStock = (s) => refs.push({ type: 'stock', ticker: s.ticker, label: s.ticker });
  const pushSlug = (d) => refs.push({ type: 'strategy', slug: d.slug, label: d.name });
  const out = (answer, extraRefs) => ({
    answer, references: extraRefs || refs, suggestions: SUGGESTIONS,
  });

  if (!query) {
    return {
      answer: "Hi, I'm Warren AI. Ask me anything about a stock, a mutual fund, an AlphaPicks AI basket, the methodology or the economic calendar — I'll give you a full, data-backed answer.",
      references: [], suggestions: SUGGESTIONS,
    };
  }

  // 0) resolve entities mentioned anywhere in the query
  const stock = (() => {
    for (const t of query.split(/[\s,.?!()]+/).filter(Boolean)) {
      const s = findStock(t, lower, universe);
      if (s) return s;
    }
    return findStock('', lower, universe);
  })();
  const strat = findStrategy(lower, STRATEGIES);
  const fund = findFund(lower);

  // 1) watchlist
  if ((lower.includes('watchlist') || lower.includes('watchlists')) && state) {
    const wl = state.watchlists || [];
    if (wl.length) {
      const total = wl.reduce((acc, w) => acc + (w.tickers || []).length, 0);
      return out(`You have ${wl.length} watchlist${wl.length > 1 ? 's' : ''} holding ${total} stock${total === 1 ? '' : 's'}: ${wl.map((w) => `${w.name} (${(w.tickers || []).length})`).join(', ')}. Manage them on the Watchlist page.`);
    }
    return out("You don't have any watchlists yet — star a pick on the ProPicks page or add one from the Watchlist page.");
  }

  // 2) SIP intent
  if (/\bsip\b|monthly invest|systematic investment|per month/.test(lower)) {
    return out(sipAnswer(lower, query).answer, sipAnswer(lower, query).refs);
  }

  // 3) comparisons
  const vsSplit = query.split(/\s+(?:vs\.?|versus)\s+/i);
  let compareParts = null;
  if (vsSplit.length === 2) compareParts = vsSplit;
  else if (/^compare\s+/i.test(query)) {
    const joined = query.replace(/^compare\s+/i, '').split(/\s+(?:and|to|with)\s+/i);
    if (joined.length === 2) compareParts = joined;
  }
  if (compareParts) {
    const [rawA, rawB] = compareParts;
    const la = rawA.toLowerCase();
    const lb = rawB.toLowerCase();
    const sa = findStock(rawA.split(/\s+/)[0], la, universe) || findStock('', la, universe);
    const sb = findStock(rawB.split(/\s+/)[0], lb, universe) || findStock('', lb, universe);
    const fa = funds.search(la, 1)[0] || findFund(la);
    const fb = funds.search(lb, 1)[0] || findFund(lb);
    if (sa && sb) { pushStock(sa); pushStock(sb); return out(compareStocks(sa, sb)); }
    if (fa && fb) return out(compareFunds(fa, fb), [
      { type: 'fund', id: fa.id, label: fa.name }, { type: 'fund', id: fb.id, label: fb.name },
    ]);
    const da = findStrategy(la, STRATEGIES);
    const db = findStrategy(lb, STRATEGIES);
    if (da && db) { pushSlug(da); pushSlug(db); return out(compareStrategies(getPayload(da), getPayload(db))); }
    return out('I can compare two stocks, two mutual funds or two AlphaPicks baskets — for example "Compare AAPL and MSFT", "Compare HDFC Flexi Cap and Parag Parikh Flexi Cap", or "Tech Titans vs S&P Elite 20".');
  }

  // 4) "best <category> fund" / fund ranking
  if (fund && /(best|top|good|recommend|which|should i (buy|invest)|worth).*(fund|scheme)|fund.*(best|top|recommend)/.test(lower)) {
    return out(fundReport(fund), [{ type: 'fund', id: fund.id, label: fund.name }]);
  }
  if (/(best|top|which|recommend).*(mutual fund|fund|scheme|sip)|best fund|top fund/.test(lower)) {
    const r = bestFunds(lower);
    return out(r.answer, r.refs);
  }

  // 5) fund-specific questions
  if (fund) {
    const wantsSip = /\bsip\b/.test(lower);
    if (wantsSip) return out(sipAnswer(lower, query).answer, sipAnswer(lower, query).refs);
    return out(fundReport(fund), [{ type: 'fund', id: fund.id, label: fund.name }]);
  }
  if (/mutual fund|elss|nav|expense ratio|fund house|amc\b/.test(lower)) {
    const r = bestFunds(lower);
    return out(r.answer, r.refs);
  }

  // 6) strategy ranking
  const wantsRank = /(best|top|highest|which|outperform).*strateg|strateg.*(best|top|highest|return|perform)|best performing/.test(lower);
  if (wantsRank) {
    const ranked = STRATEGIES.map((d) => ({ d, p: getPayload(d) }))
      .sort((x, y) => y.p.strategy.returnMax - x.p.strategy.returnMax).slice(0, 3);
    ranked.forEach((r) => pushSlug(r.d));
    const parts = ranked.map((r, i) => `${i + 1}. ${r.d.name} (${fmtPct(r.p.strategy.returnMax)} max, ${fmtPct(r.p.strategy.return1y)} 1Y, benchmark ${r.p.strategy.benchmark})`).join('\n');
    return out(`By total return the AlphaPicks AI baskets rank:\n${parts}\n\nAll are point-in-time backtests on real prices; past performance does not guarantee future results.`);
  }

  // 7) methodology / how it works
  if (/how does|how do|methodolog|how .*choose|what factors|how.*pick|explain alphapicks|how does alphapicks/.test(lower)) {
    return out([
      '**How AlphaPicks AI picks stocks**',
      '',
      '1. Universe — every stock in the covered market, filtered by the basket\'s rules (market cap, liquidity, region, sector).',
      '2. Factors — each stock is scored monthly on real price momentum (6- and 12-month), trend versus its 10-month average, and volatility (low-vol preference), plus a disclosed valuation/quality tilt.',
      '3. Ranking — scores are ranked cross-sectionally and the top names form the basket.',
      '4. Monthly rotation: an incumbent is only sold when it has been out-ranked for two consecutive months AND its own momentum/score has faded — and never sold purely because it is in a short-term dip.',
      '6. Exits are scored honestly: we show the return booked while held and whether the stock beat or lagged the basket afterwards.',
      '',
      'See the Methodology page for the full disclosure.',
    ].join('\n'));
  }

  // 7b) how exits/picks quality is judged
  if (/costly exit|exit quality|why.*(sell|remove|remove).*(stock|pick)|how do you (decide|choose).*(exit|sell)/.test(lower)) {
    return out([
      '**How Warren AI judges an exit**',
      'A sell is scored two ways:',
      '• Booked vs held-to-now — the return the basket booked while it held the stock, minus where the stock stands today. In a rising market this is harsh, because almost any sale looks "costly" in hindsight.',
      '• vs basket (headline) — did the sold stock subsequently beat the basket we rotated into? This is the fair test of whether the swap added value.',
      'The exit rule itself is built to avoid costly sells: a holding is only removed when it is out-ranked for two consecutive months AND fading, never merely for being in a drawdown. Persistent three-month breakdowns are still cut.',
    ].join('\n'));
  }

  // 8) explicit full-report request about a resolved stock
  if (stock && /full|analysis|analyse|analyze|report|research|deep ?dive|detail|everything|in depth|breakdown/.test(lower)) {
    pushStock(stock);
    return out(stockReport(stock, universe));
  }

  // 8b) valuation question about a resolved stock
  if (stock && /undervalued|overvalued|fairly valued|fair value|cheap|expensive|valued|upside|price target|worth|buy|sell|hold|good (stock|buy)|should i/.test(lower)) {
    pushStock(stock);
    const dir = stock.upsidePct > 10 ? 'undervalued' : stock.upsidePct < -10 ? 'overvalued' : 'fairly valued';
    return out([
      `**${stock.name} (${stock.ticker})** looks **${dir}**.`,
      `Price ${money(stock.price, stock.currency)} vs blended fair value ${money(stock.fairValue, stock.currency)} (${fmtPct(stock.upsidePct)}).`,
      `Quality ${stock.score}/100 (${stock.rating}) · P/E ${n(stock.pe)} · ROE ${n(stock.roe)}% · 12M momentum ${fmtPct(stock.momentum12m)} · debt/equity ${n(stock.debtToEquity)}.`,
      '',
      'Ask for "full analysis of ' + stock.ticker + '" for the complete multi-factor breakdown.',
    ].join('\n'));
  }

  // 9) calendar
  if (/calendar|economic|fed\b|cpi\b|payroll|rate (hike|cut)|ecb\b|rbi\b|inflation|gdp|boe\b|upcoming events|this week/.test(lower)) {
    return out(calendarAnswer(lower));
  }

  // 10) strategy lookup
  if (strat) { pushSlug(strat); return out(strategyDetailSentence(getPayload(strat))); }

  // 11) stock lookup — always give the full report
  if (stock) {
    pushStock(stock);
    return out(stockReport(stock, universe));
  }

  // 12) sector / screener ideas
  const sector = ['technology', 'healthcare', 'financials', 'energy', 'industrials', 'consumer', 'utilities', 'materials', 'real estate', 'communication']
    .find((k) => lower.includes(k));
  if (sector && /(best|top|idea|pick|screen|cheap|value|momentum|invest)/.test(lower)) {
    const pool = universe.stocks.filter((s) => s.sector.toLowerCase().includes(sector)).sort((a, b) => b.score - a.score).slice(0, 5);
    if (pool.length) {
      pool.forEach(pushStock);
      return out(`**Top ${sector} names by AI score**\n${pool.map((s) => `• ${s.name} (${s.ticker}) — score ${s.score}/100, P/E ${n(s.pe)}, 12M ${fmtPct(s.momentum12m)}`).join('\n')}`);
    }
  }

  // 13) smart fallback: interpret as a general research request
  const anyFund = /fund|scheme|nav|elss|sip/.test(lower);
  const r = anyFund ? bestFunds(lower) : null;
  if (r) return out(r.answer, r.refs);
  return out([
    "I couldn't pin that to a specific stock or fund, but here's how to ask me:",
    '• "Full analysis of AAPL" or "Is Reliance overvalued?" — single-stock research',
    '• "Best small cap fund" or "Compare HDFC Flexi Cap and Parag Parikh Flexi Cap" — mutual funds',
    '• "SIP 10000 for 15 years in Nippon India Small Cap" — SIP projections',
    '• "Best performing strategy" or "Tech Titans vs S&P Elite 20" — AlphaPicks AI baskets',
  ].join('\n'));
}

module.exports = { ask };
