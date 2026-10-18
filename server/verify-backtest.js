'use strict';
// Verify the REAL point-in-time backtest produces real-market returns.
process.env.ALPHADESK_LIVE = '1';
const universe = require('./src/engine/universe.js');
const live = require('./src/market/live.js');
const realhistory = require('./src/engine/realhistory.js');
const backtest = require('./src/engine/backtest.js');
const { STRATEGIES } = require('./src/engine/picks.js');

function navStats(nav) {
  const n = nav.length - 1;
  const total = (nav[nav.length - 1] - 1) * 100;
  const ann = n > 0 ? (Math.pow(nav[nav.length - 1], 12 / n) - 1) * 100 : 0;
  return { months: n, total: total.toFixed(1), ann: ann.toFixed(1) };
}

async function main() {
  const u = universe.buildUniverse();
  console.log('building universe + loading real history (background fill)...');
  await live.start(u, { periodic: false });
  // wait for background history fill to finish
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = live.getStatus();
    if (st.history.done >= st.history.total && st.history.total > 0) break;
  }
  const st = live.getStatus();
  console.log(`real history coverage: ${st.coverage.history}/${st.totals.stocks}`);

  console.log('loading real benchmarks...');
  const bench = await realhistory.loadBenchmarks();
  console.log('benchmarks loaded:', Object.keys(bench).join(', '));

  // build per-stock monthly series
  const poolSeries = new Map();
  for (const s of u.stocks) {
    if (s.live && s.live.history) {
      const ms = realhistory.monthlySeries(s);
      if (ms) poolSeries.set(s.ticker, ms);
    }
  }
  console.log('stocks with monthly series:', poolSeries.size);

  console.log('\n=== REAL point-in-time backtests ===');
  for (const def of STRATEGIES) {
    const rr = backtest.realReplay(def, u, bench, poolSeries);
    if (!rr) { console.log(`${def.code.padEnd(8)} SKIP (insufficient real data)`); continue; }
    const s = navStats(rr.strategyNav);
    const b = navStats(rr.benchmarkNav);
    const win = rr.dates[0].slice(0, 7) + '..' + rr.dates[rr.dates.length - 2].slice(0, 7);
    console.log(
      `${def.code.padEnd(8)} ${win}  strat=${String(s.total).padStart(7)}%  bench=${String(b.total).padStart(7)}%  ` +
      `alpha=${(s.total - b.total).toFixed(1)}pp  ann=${s.ann}%  picks=${rr.members.length}  ` +
      `adds=${rr.added.length} rms=${rr.episodes.length} pool=${rr.poolSize}`
    );
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
