'use strict';
// Broad correctness audit of the live overlay.
const engine = require('./src/engine');
const live = require('./src/market/live');
const uni = require('./src/engine/universe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  engine.warmup();
  await engine.startMarket({ periodic: false });
  await sleep(20000);
  const st = engine.getMarketStatus();
  console.log('coverage:', JSON.stringify(st.coverage), 'of', st.totals.stocks, '| unresolved', JSON.stringify(st.unresolved));

  const u = uni.buildUniverse; // not used; pull stocks via engine internals instead
  const names = ['AAPL', 'SU.PA', 'SAN.PA', 'T.TO', 'T', 'MRSH', 'NTRA', 'OMF', 'WBD', 'HSBA', 'INGA', 'UBSG', 'ROP', 'TMPV', 'KPITTECH', 'GMRAIRPORT', 'AZN', 'RELIANCE', '7203', '005930'];
  console.log('\nspot checks:');
  for (const t of names) {
    try {
      const s = engine.getStock(t);
      console.log(`  ${t.padEnd(11)} ${String(s.price).padStart(10)} ${String(s.currency).padEnd(4)} chg ${String(s.changePct).padStart(7)}  pe ${String(s.pe).padStart(7)}  cap $${(s.marketCap / 1e9).toFixed(1)}B  hist ${String(s.history.dates.length).padStart(4)}  ${s.dataSource}`);
    } catch (e) { console.log(`  ${t.padEnd(11)} ERROR ${e.code || e.message}`); }
  }

  // Consistency: marketCap / price must equal shares outstanding (proves the
  // local-currency handling for price AND market cap is coherent).
  const screener = engine.runScreener({
    combine: 'and', filters: [], sort: [{ slug: 'marketCap', direction: 'desc' }],
    columns: ['price', 'marketCap'], page: 1, pageSize: 1,
  });
  const allTickers = engine.searchStocks('', 50).map((s) => s.ticker);
  // grab every stock via the universe facade through getStrategy coverage is heavy;
  // instead re-run a screener with a permissive filter and page through.
  const offenders = [];
  const noHistory = [];
  const noFund = [];
  let seen = 0;
  for (let page = 1; page <= 20; page++) {
    const r = engine.runScreener({ combine: 'and', filters: [], sort: [{ slug: 'marketCap', direction: 'desc' }], columns: [], page, pageSize: 50 });
    if (!r.rows.length) break;
    for (const row of r.rows) {
      const s = engine.getStock(row.ticker);
      seen++;
      if (!(s.price > 0)) offenders.push(`${row.ticker}: price ${s.price}`);
      if (s.provenance.price === 'Yahoo Finance' && s.sharesOutstanding && s.price > 0) {
        const fx = live.CURRENCY_FX[s.currency] || 1;
        const implied = (s.marketCap * fx) / s.price; // back to local-currency share count
        const ratio = implied / s.sharesOutstanding;
        if (ratio < 0.8 || ratio > 1.25) {
          offenders.push(`${row.ticker}: cap* fx/price=${implied.toExponential(2)} vs shares=${s.sharesOutstanding.toExponential(2)} (ratio ${ratio.toFixed(2)}) ${s.currency}`);
        }
      }
      if (s.provenance.price === 'Yahoo Finance' && s.provenance.history !== 'Yahoo Finance') noHistory.push(row.ticker);
      if (s.provenance.price === 'Yahoo Finance' && s.provenance.fundamentals !== 'Yahoo Finance') noFund.push(row.ticker);
    }
    if (page * 50 >= r.matchedOfTotal) break;
  }
  console.log(`\naudited ${seen} stocks; ${offenders.length} inconsistencies`);
  for (const o of offenders.slice(0, 25)) console.log('  -', o);
  if (noHistory.length) console.log('no live history yet:', noHistory.join(' '));
  if (noFund.length) console.log('no live fundamentals yet:', noFund.join(' '));

  // Data-quality: fair value models must be finite for every stock.
  const badFv = [];
  for (let page = 1; page <= 20; page++) {
    const r = engine.runScreener({ combine: 'and', filters: [], sort: [{ slug: 'marketCap', direction: 'desc' }], columns: [], page, pageSize: 50 });
    if (!r.rows.length) break;
    for (const row of r.rows) {
      const s = engine.getStock(row.ticker);
      const m = s.fairValueModels || [];
      if (m.length !== 14 || m.some((x) => !(x.value > 0) || !Number.isFinite(x.value))) badFv.push(row.ticker);
      if (!Number.isFinite(s.fairValue) || !Number.isFinite(s.score)) badFv.push(row.ticker + ':fv');
    }
    if (page * 50 >= r.matchedOfTotal) break;
  }
  console.log(`fair-value integrity: ${badFv.length ? 'FAIL ' + badFv.join(',') : 'ok (all 14 models finite for every stock)'}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
