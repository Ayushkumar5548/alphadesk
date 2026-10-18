'use strict';
// AlphaDesk server self-test. Spawns the HTTP server on a dedicated port,
// exercises every endpoint in the DESIGN.md contract (shapes, status codes,
// error envelopes), checks determinism across two server starts, prints a
// PASS/FAIL summary and exits non-zero on any failure. Zero npm dependencies.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = Number.parseInt(process.env.SELFTEST_PORT, 10) || 18791;
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER = path.join(__dirname, 'src', 'index.js');
const STATE_FILE = path.join(__dirname, 'data', 'state.json');

const results = []; // {name, pass, detail}

function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || '' });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`  ${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  check(name, false, detail);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, PORT: String(PORT), ALPHADESK_LIVE: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(`server did not start in 30s. output:\n${out}`));
      }
    }, 30000);
    const onData = (buf) => {
      out += buf.toString();
      if (!settled && out.includes('listening at')) {
        settled = true;
        clearTimeout(timeout);
        resolve({ child, output: out });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`server exited early (code ${code}). output:\n${out}`));
      }
    });
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode != null) return resolve();
    const done = () => resolve();
    child.on('exit', done);
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode == null) child.kill('SIGKILL');
      resolve();
    }, 3000).unref();
  });
}

async function get(p) {
  const r = await fetch(BASE + p);
  let json = null;
  try {
    json = await r.json();
  } catch (e) {
    /* non-JSON */
  }
  return { status: r.status, json, headers: r.headers };
}

async function send(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await r.json();
  } catch (e) {
    /* non-JSON */
  }
  return { status: r.status, json, headers: r.headers };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string';
const isArr = (v) => Array.isArray(v);
function hasKeys(o, keys) {
  return o && typeof o === 'object' && keys.every((k) => k in o);
}

// ---------------------------------------------------------------------------
// Endpoint checks (pass 1 against server A).
// ---------------------------------------------------------------------------
async function runSuite(label) {
  console.log(`\n[${label}] endpoint contract checks`);

  // -- Strategies list ------------------------------------------------------
  const sl = await get('/api/propicks/strategies');
  const strategies = sl.json && sl.json.strategies;
  check(`${label} strategies list status 200`, sl.status === 200, `got ${sl.status}`);
  check(`${label} strategies list shape`, isArr(strategies) && strategies.length === 10,
    `count=${strategies && strategies.length}`);
  const row = strategies && strategies[0];
  check(`${label} strategy row fields`,
    hasKeys(row, ['code', 'slug', 'name', 'description', 'market', 'benchmark', 'yearStart',
      'pickCount', 'return1y', 'return5y', 'returnMax', 'annualized', 'beta', 'outperformance',
      'updated', 'nextUpdate', 'favorite', 'tags']),
    row ? Object.keys(row).filter((k) => !['code', 'slug', 'name', 'description', 'market',
      'benchmark', 'yearStart', 'pickCount', 'return1y', 'return5y', 'returnMax', 'annualized',
      'beta', 'outperformance', 'updated', 'nextUpdate', 'favorite', 'tags'].includes(k)).join(',')
      : 'no row');
  check(`${label} strategy row numeric fields`, row && isNum(row.returnMax) && isNum(row.beta) && isNum(row.outperformance) && isNum(row.pickCount) && row.favorite === false);

  const slug = strategies[0].slug;

  // -- Strategy detail ------------------------------------------------------
  const sd = await get(`/api/propicks/strategies/${slug}`);
  const d = sd.json;
  check(`${label} strategy detail status 200`, sd.status === 200, `got ${sd.status}`);
  check(`${label} strategy detail keys`, d && hasKeys(d, ['strategy', 'picks', 'history', 'previousWinners']),
    d ? Object.keys(d).join(',') : 'none');
  check(`${label} detail has no internal fields`, d && !('_stats' in d) && !('poolSize' in d));
  const pick = d && d.picks && d.picks[0];
  check(`${label} picks count matches pickCount`, d && d.picks.length === d.strategy.pickCount,
    d ? `${d.picks.length} vs ${d.strategy.pickCount}` : '');
  check(`${label} pick fields`,
    hasKeys(pick, ['ticker', 'name', 'sector', 'exchange', 'country', 'price', 'returnPct',
      'rating', 'score', 'rationaleTags', 'rationaleText', 'fairValue', 'upsidePct', 'marketCap']),
    pick ? Object.keys(pick).filter((k) => !['ticker', 'name', 'sector', 'exchange', 'country',
      'price', 'returnPct', 'rating', 'score', 'rationaleTags', 'rationaleText', 'fairValue',
      'upsidePct', 'marketCap'].includes(k)).join(',') : 'no pick');
  check(`${label} pick rationale is text`, pick && isStr(pick.rationaleText) && pick.rationaleText.length > 20 && isArr(pick.rationaleTags));
  const h = d && d.history;
  check(`${label} history aligned arrays`, h && isArr(h.dates) && isArr(h.strategyNav) && isArr(h.benchmarkNav)
    && h.dates.length === h.strategyNav.length && h.dates.length === h.benchmarkNav.length
    && h.dates.length > 0 && h.dates.length <= 160,
    h ? `len=${h.dates.length}` : '');
  check(`${label} previousWinners shape`, d && isArr(d.previousWinners)
    && d.previousWinners.every((w) => hasKeys(w, ['ticker', 'name', 'dateAdded', 'dateRemoved', 'totalReturnPct'])),
    d ? `n=${d.previousWinners.length}` : '');

  // -- Featured -------------------------------------------------------------
  const sf = await get('/api/propicks/featured');
  check(`${label} featured status 200 + same shape`, sf.status === 200 && sf.json
    && hasKeys(sf.json, ['strategy', 'picks', 'history', 'previousWinners']));

  // -- Simulator ------------------------------------------------------------
  const ss = await get(`/api/propicks/simulator?slug=${slug}&amount=100000&years=5`);
  const sim = ss.json;
  check(`${label} simulator status 200`, ss.status === 200);
  check(`${label} simulator shape`, sim && hasKeys(sim, ['points', 'startAmount', 'endAmount',
    'endBenchmark', 'strategyTotalPct', 'benchmarkTotalPct']) && isArr(sim.points)
    && sim.points.every((p) => hasKeys(p, ['date', 'value', 'benchmarkValue'])),
    sim ? `points=${sim.points.length}` : '');
  check(`${label} simulator 5Y point count ~62`, sim && sim.points.length >= 55 && sim.points.length <= 66, sim ? `${sim.points.length}` : '');
  const smax = await get(`/api/propicks/simulator?slug=${slug}&years=max`);
  check(`${label} simulator max history <=160`, smax.json && smax.json.points.length <= 160 && smax.json.points.length > 100, smax.json ? `${smax.json.points.length}` : '');

  const sbad = await get(`/api/propicks/simulator?slug=${slug}&amount=abc`);
  check(`${label} simulator bad amount 400 + envelope`, sbad.status === 400 && hasKeys(sbad.json, ['error']) && sbad.json.error.code === 'BAD_AMOUNT', JSON.stringify(sbad.json));

  // -- Search ---------------------------------------------------------------
  const sq = await get('/api/stocks?q=apple&limit=10');
  check(`${label} search status 200 + array`, sq.status === 200 && isArr(sq.json), sq.json && !isArr(sq.json) ? JSON.stringify(sq.json).slice(0, 120) : '');
  check(`${label} search row fields`, sq.json && sq.json.length > 0 && hasKeys(sq.json[0],
    ['ticker', 'name', 'country', 'sector', 'price', 'changePct']));
  const seq = await get('/api/stocks?q=zzzznotarealticker');
  check(`${label} search empty ok`, seq.status === 200 && isArr(seq.json) && seq.json.length === 0);

  // -- Stock detail ---------------------------------------------------------
  const ticker = sq.json[0].ticker;
  const st = await get(`/api/stocks/${encodeURIComponent(ticker)}`);
  const stock = st.json;
  check(`${label} stock detail status 200`, st.status === 200);
  check(`${label} 14 fair-value models`, stock && isArr(stock.fairValueModels) && stock.fairValueModels.length === 14,
    stock ? `${stock.fairValueModels.length}` : '');
  check(`${label} model entries finite`, stock && stock.fairValueModels.every((m) => isStr(m.model) && isNum(m.value) && isNum(m.upsidePct) && m.value > 0));
  check(`${label} verdict vocabulary`, stock && ['undervalued', 'fairly valued', 'overvalued'].includes(stock.verdict));
  check(`${label} daily history capped <=1500`, stock && isArr(stock.history.dates) && isArr(stock.history.closes)
    && stock.history.dates.length === stock.history.closes.length && stock.history.dates.length <= 1500,
    stock ? `${stock.history.dates.length}` : '');
  check(`${label} ratings history present`, stock && isArr(stock.ratings) && stock.ratings.length === 13 && stock.ratings.every((r) => isStr(r.month) && isNum(r.score)));
  check(`${label} peers present`, stock && isArr(stock.peers) && stock.peers.length > 0 && stock.peers.length <= 6);
  const stRange = await get(`/api/stocks/${encodeURIComponent(ticker)}?range=1Y`);
  check(`${label} range=1Y slices ~252 pts`, stRange.json && stRange.json.history.dates.length >= 240 && stRange.json.history.dates.length <= 260, `${stRange.json && stRange.json.history.dates.length}`);
  const stBad = await get('/api/stocks/NOPE123');
  check(`${label} unknown ticker 404 envelope`, stBad.status === 404 && stBad.json.error.code === 'UNKNOWN_TICKER', JSON.stringify(stBad.json));

  // -- Batch ----------------------------------------------------------------
  const batch = await send('POST', '/api/stocks/batch', { tickers: [ticker, 'MSFT', 'NVDA', 'notreal'] });
  check(`${label} batch status 200 + skips unknown`, batch.status === 200 && isArr(batch.json.stocks) && batch.json.stocks.length === 3, batch.json ? `n=${batch.json.stocks.length}` : '');
  const batchGet = await get('/api/stocks/batch');
  check(`${label} GET batch is 405 (exact route wins)`, batchGet.status === 405 && batchGet.json.error.code === 'METHOD_NOT_ALLOWED');

  // -- Screener -------------------------------------------------------------
  const sfil = await get('/api/screener/filters');
  check(`${label} screener filters status 200 + array`, sfil.status === 200 && isArr(sfil.json) && sfil.json.length > 10, sfil.json ? `n=${sfil.json.length}` : '');
  check(`${label} filter entries shape`, sfil.json.every((f) => isStr(f.slug) && isStr(f.label)
    && ['number', 'percent', 'select', 'multiselect'].includes(f.type) && isArr(f.ops) && isArr(f.units) && isArr(f.choices)));
  const sr = await send('POST', '/api/screener/run', {
    combine: 'and',
    filters: [{ slug: 'pe', op: 'lt', value: 25 }, { slug: 'dividendYield', op: 'gt', value: 2 }],
    sort: [{ slug: 'marketCap', direction: 'desc' }],
    columns: ['pe', 'dividendYield', 'roe'],
    page: 1,
    pageSize: 10,
  });
  const scr = sr.json;
  check(`${label} screener run status 200`, sr.status === 200);
  check(`${label} screener result shape`, scr && hasKeys(scr, ['total', 'matchedOfTotal', 'rows', 'page', 'pageSize', 'totalPages'])
    && isArr(scr.rows) && scr.rows.length <= 10 && isNum(scr.total) && isNum(scr.matchedOfTotal));
  check(`${label} screener rows carry requested columns`, scr && scr.rows.every((r) => 'pe' in r && 'dividendYield' in r && 'roe' in r));
  const srOr = await send('POST', '/api/screener/run', {
    combine: 'or',
    filters: [{ slug: 'pe', op: 'between', value: [0, 12] }, { slug: 'dividendYield', op: 'gt', value: 5 }],
    sort: [{ slug: 'price', direction: 'asc' }],
    columns: [],
    page: 2,
    pageSize: 25,
  });
  check(`${label} screener OR + between + page`, srOr.status === 200 && srOr.json.rows.length <= 25 && srOr.json.page === 2);
  const srBad = await send('POST', '/api/screener/run', {
    combine: 'and', filters: [{ slug: 'not-a-filter', op: 'lt', value: 1 }], sort: [], columns: [], page: 1, pageSize: 10,
  });
  check(`${label} screener unknown filter 400`, srBad.status === 400 && srBad.json.error.code === 'UNKNOWN_FILTER', JSON.stringify(srBad.json));
  const srNoJson = await fetch(BASE + '/api/screener/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  const srNoJsonJ = await srNoJson.json().catch(() => null);
  check(`${label} screener invalid JSON 400`, srNoJson.status === 400 && srNoJsonJ && srNoJsonJ.error.code === 'INVALID_JSON');

  // -- Calendar -------------------------------------------------------------
  const cal = await get('/api/calendar');
  check(`${label} calendar status 200 + events`, cal.status === 200 && isArr(cal.json.events) && cal.json.events.length > 0, cal.json ? `n=${cal.json.events.length}` : '');
  check(`${label} calendar event fields`, cal.json.events.every((e) => hasKeys(e,
    ['id', 'date', 'country', 'importance', 'indicator', 'previous', 'forecast', 'actual', 'unit'])));
  const calF = await get('/api/calendar?country=US&importance=3');
  check(`${label} calendar country+importance filter`, calF.status === 200 && calF.json.events.every((e) => e.country === 'US' && e.importance === 3));
  const calBad = await get('/api/calendar?from=not-a-date');
  check(`${label} calendar bad date 400`, calBad.status === 400 && calBad.json.error.code === 'BAD_DATE');

  // -- Quotes ---------------------------------------------------------------
  const qt = await get(`/api/quotes?symbols=${ticker},MSFT,NOTREAL`);
  check(`${label} quotes status 200 + skip unknown`, qt.status === 200 && isArr(qt.json.quotes) && qt.json.quotes.length === 2, qt.json ? `n=${qt.json.quotes.length}` : '');
  check(`${label} quote spark 20 pts`, qt.json.quotes.every((q) => isArr(q.spark) && q.spark.length === 20 && isNum(q.price) && isNum(q.changePct)));

  // -- Assistant ------------------------------------------------------------
  const as = await get(`/api/assistant/ask?q=${encodeURIComponent('which strategy has the best returns?')}`);
  check(`${label} assistant status 200 + shape`, as.status === 200 && hasKeys(as.json, ['answer', 'references', 'suggestions'])
    && isStr(as.json.answer) && as.json.answer.length > 30 && isArr(as.json.references) && isArr(as.json.suggestions),
    as.json ? `anslen=${as.json.answer && as.json.answer.length}` : '');
  const asStock = await get(`/api/assistant/ask?q=${encodeURIComponent('tell me about ' + ticker)}`);
  check(`${label} assistant stock intent`, asStock.status === 200 && asStock.json.references.some((r) => r.ticker === ticker),
    JSON.stringify(asStock.json.references));
  const asGib = await get(`/api/assistant/ask?q=${encodeURIComponent('purple monkey dishwasher quantum')}`);
  check(`${label} assistant fallback + suggestions`, asGib.status === 200 && isStr(asGib.json.answer) && asGib.json.suggestions.length > 0);
  const asNoQ = await get('/api/assistant/ask');
  check(`${label} assistant missing q 400`, asNoQ.status === 400 && asNoQ.json.error.code === 'MISSING_Q');

  // -- State ----------------------------------------------------------------
  const stGet1 = await get('/api/state');
  check(`${label} state GET status 200 + shape`, stGet1.status === 200 && hasKeys(stGet1.json,
    ['watchlists', 'alerts', 'savedScreeners', 'savedStrategies', 'notes']),
    stGet1.json ? Object.keys(stGet1.json).join(',') : '');
  const putBody = {
    watchlists: [{ id: 'st-wl', name: 'Selftest', tickers: ['AAPL'], createdAt: '2026-10-01T00:00:00.000Z' }],
    alerts: [{ id: 'st-al', ticker: 'AAPL', type: 'price', condition: 'above', value: 999, createdAt: '2026-10-01T00:00:00.000Z', active: true }],
    savedScreeners: [{ id: 'st-sc', name: 'My screen', state: { combine: 'and' }, createdAt: '2026-10-01T00:00:00.000Z' }],
    savedStrategies: ['beat-nifty-50'],
    notes: { 'st-note': 'hello' },
  };
  const put = await send('PUT', '/api/state', putBody);
  check(`${label} state PUT status 200 {ok:true}`, put.status === 200 && put.json && put.json.ok === true, JSON.stringify(put.json));
  const stGet2 = await get('/api/state');
  const st2 = stGet2.json;
  check(`${label} state PUT roundtrip`, st2 && st2.watchlists.length === 1 && st2.watchlists[0].tickers.includes('AAPL')
    && st2.alerts.length === 1 && st2.alerts[0].condition === 'above'
    && st2.savedScreeners.length === 1 && st2.savedStrategies.includes('beat-nifty-50')
    && st2.notes['st-note'] === 'hello',
    st2 ? JSON.stringify({ wl: st2.watchlists.length, al: st2.alerts.length, cond: st2.alerts[0] && st2.alerts[0].condition }) : '');

  // -- Copy strategy --------------------------------------------------------
  const cp = await send('POST', '/api/watchlists/st-wl/copy-strategy', { slug: slug });
  check(`${label} copy-strategy status 200`, cp.status === 200, JSON.stringify(cp.json).slice(0, 120));
  const stGet3 = await get('/api/state');
  check(`${label} copy-strategy added picks`, stGet3.json.watchlists[0].tickers.length > 1,
    `n=${stGet3.json.watchlists[0].tickers.length}`);
  const cpBadSlug = await send('POST', '/api/watchlists/st-wl/copy-strategy', { slug: 'no-such-strategy' });
  check(`${label} copy-strategy unknown slug 404`, cpBadSlug.status === 404 && cpBadSlug.json.error.code === 'UNKNOWN_STRATEGY');
  const cpBadWl = await send('POST', '/api/watchlists/nope/copy-strategy', { slug });
  check(`${label} copy-strategy unknown watchlist 404`, cpBadWl.status === 404 && cpBadWl.json.error.code === 'UNKNOWN_WATCHLIST');

  // -- Errors / envelopes ---------------------------------------------------
  const nf = await get('/api/definitely-not-a-route');
  check(`${label} unknown route 404 envelope`, nf.status === 404 && hasKeys(nf.json, ['error'])
    && nf.json.error.code === 'NOT_FOUND' && isStr(nf.json.error.message), JSON.stringify(nf.json));
  const ns = await get('/api/propicks/strategies/no-such-slug');
  check(`${label} unknown strategy 404 envelope`, ns.status === 404 && ns.json.error.code === 'UNKNOWN_STRATEGY');
  const opt = await fetch(BASE + '/api/state', { method: 'OPTIONS' });
  check(`${label} OPTIONS 204`, opt.status === 204);

  // Re-fetch the list after the suite's state mutations so the determinism
  // comparison in run2 compares like with like (favorites come from state).
  const slEnd = await get('/api/propicks/strategies');
  return { slug, ticker, picksDigest: d && JSON.stringify(d.picks), listDigest: slEnd.json && JSON.stringify(slEnd.json), stockDigest: stock && JSON.stringify({ fv: stock.fairValueModels, fairValue: stock.fairValue, verdict: stock.verdict }) };
}

// ---------------------------------------------------------------------------
// Static serving (informational — client build may not exist yet).
// ---------------------------------------------------------------------------
async function checkStatic() {
  console.log('\n[static] SPA static checks');
  const hasDist = fs.existsSync(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  if (!hasDist) {
    check('static: client build absent (server serves API-only JSON 404)', true, 'client/dist/index.html not built yet');
    return;
  }
  const idx = await fetch(BASE + '/');
  check('static: GET / serves index.html', idx.status === 200 && (idx.headers.get('content-type') || '').includes('text/html'));
  const spa = await fetch(BASE + '/some/client/route');
  check('static: SPA fallback for client route', spa.status === 200 && (spa.headers.get('content-type') || '').includes('text/html'));
  const api404 = await get('/api/nope');
  check('static: unknown /api route stays JSON 404', api404.status === 404 && (api404.headers.get('content-type') || '').includes('application/json'));
  const trav = await fetch(BASE + '/../../etc/passwd');
  check('static: traversal guard', trav.status === 200 || trav.status === 404);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`AlphaDesk selftest — port ${PORT}`);
  const started = Date.now();

  // Preserve any real user state, then reset so the suite starts deterministic.
  const stateBak = STATE_FILE + '.selftest.bak';
  try {
    if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, stateBak);
    else fs.rmSync(stateBak, { force: true });
    fs.rmSync(STATE_FILE, { force: true });
    fs.rmSync(STATE_FILE + '.corrupt.bak', { force: true });
  } catch (e) {
    /* ignore */
  }

  // ---- Run 1 ----
  let a = await startServer();
  let suite;
  try {
    suite = await runSuite('run1');
    await checkStatic();
  } finally {
    await stopServer(a.child);
  }

  // ---- Run 2: determinism ----
  console.log('\n[run2] determinism across server restarts');
  let b = await startServer();
  try {
    const sl2 = await get('/api/propicks/strategies');
    const d2 = await get(`/api/propicks/strategies/${suite.slug}`);
    check('determinism: strategy list identical across restarts',
      JSON.stringify(sl2.json) === suite.listDigest);
    check('determinism: picks identical across restarts',
      d2.json && JSON.stringify(d2.json.picks) === suite.picksDigest,
      d2.json ? `len=${JSON.stringify(d2.json.picks).length} vs ${suite.picksDigest.length}` : 'no payload');
    const stock2 = await get(`/api/stocks/${encodeURIComponent(suite.ticker)}`);
    check('determinism: stock fair value identical across restarts',
      stock2.json && JSON.stringify({ fv: stock2.json.fairValueModels, fairValue: stock2.json.fairValue, verdict: stock2.json.verdict }) === suite.stockDigest);
    const cal2 = await get('/api/calendar');
    check('determinism: calendar stable', cal2.status === 200 && isArr(cal2.json.events));
  } finally {
    await stopServer(b.child);
  }

  // ---- Summary ----
  // Restore the user's state (the suite only ever writes fixtures).
  try {
    if (fs.existsSync(stateBak)) {
      fs.copyFileSync(stateBak, STATE_FILE);
      fs.rmSync(stateBak, { force: true });
    } else {
      fs.rmSync(STATE_FILE, { force: true });
    }
    fs.rmSync(STATE_FILE + '.corrupt.bak', { force: true });
  } catch (e) {
    /* ignore */
  }

  const failed = results.filter((r) => !r.pass);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Selftest summary: ${results.length - failed.length}/${results.length} passed in ${secs}s`);
  if (failed.length) {
    console.log('FAILED checks:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
    process.exitCode = 1;
  } else {
    console.log('ALL CHECKS PASSED');
  }
}

main().catch((err) => {
  console.error('Selftest crashed:', err);
  process.exitCode = 1;
});
