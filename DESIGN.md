# AlphaDesk — Design & Build Spec

A self-contained clone of the InvestingPro / ProPicks AI workflow, built from the
reverse-engineered feature map in `FINDINGS.md`. Original branding, original UI,
and AlphaDesk-owned selection/valuation models. Prices, price history and
fundamentals are fetched live from Yahoo Finance's public endpoints; where they
are unavailable the deterministic baseline engine is used and the app reports
the data source. No paywalled content is copied.

Product: **AlphaDesk**. Premium tier badge: **AlphaDesk Pro+**. AI picks: **AlphaPicks AI**.

## Stack

- `server/` — Node.js 24, ZERO npm dependencies (node:http, node:fs, node:crypto only).
  Serves the JSON API and the built client. Port **8787** (override `PORT`).
- `client/` — Vite + React 18 (npm allowed here), plain CSS (no UI library),
  hand-rolled SVG charts (line/cumulative-return chart with hover tooltip, sparklines).
  `npm run build` → `client/dist`, served by the server at `/`.
- Persistence: JSON files under `server/data/` (auto-created): `state.json`
  (watchlists, saved screeners, alerts, watchlist notes) and `market/`
  (provider session, resolved symbols, and history/fundamentals caches).
- Live market data: `server/src/market/` — Yahoo Finance provider + overlay
  (see "Live market data overlay" below). Pure Node `fetch`, no dependencies.
  Disable with `ALPHADESK_LIVE=0` (the self-test does this).
- Public access: the :8787 server is exposed on the internet through a tunnel so
  the app is reachable from any device. The server process itself is kept alive
  by `run-server.ps1`, a single-instance supervisor (named mutex) that restarts
  it within **seconds** of any exit and records every start/exit to
  `~\.alphadesk\server.log`, with the server's own stdout/stderr in
  `~\.alphadesk\server-out.log` and `server-err.log`. `watch-alpha.ps1` is the
  slower safety net: it restarts that supervisor if it is gone and re-arms the
  tunnel below (it is driven by the `AlphaDesk` Windows scheduled task at logon,
  then every 5 minutes).
  Default provider is a permanent **Tailscale Funnel** (`tailscale funnel --bg 8787`);
  the active provider/credentials live in `~\.alphadesk\tunnel.config.json`
  (`tailscale` | `ngrok` | `quick`), and the live URL is in
  `~\.alphadesk\tunnel-url.txt` and at **`GET /api/tunnel`**.
- Cloud hosting (no PC): the same server also runs on any container host.
  `Dockerfile` (multi-stage: client build → zero-dep runtime), `render.yaml`,
  `fly.toml` and a root `package.json` (`start`/`build`) are provided; see
  `DEPLOY.md`. The container honors `PORT`/`HOST` and exposes a cheap liveness
  probe at **`GET /api/health`**.

## Deterministic data engine (server/src/engine/)

Seeded PRNG: mulberry32. Universe seed fixed; pick-selection seed keyed by
`YYYY-MM` so each month has stable picks and history is reproducible.

Universe (two tiers, ~2,860 stocks):
- **Curated core (~327)** — hand-listed global names, richest tags, seeds the
  cross-sectional stats:
  - US: ~150 (S&P 500 mega/large caps, 30 Dow names, ~40 mid-caps $2–10B, ~25 tech)
  - India: ~70 (Nifty 50 subset, ~20 small caps)
  - UK ~25, Canada ~15, Europe ~30, Asia-Pac ~20.
- **NSE expansion (~2,533, flagged `expanded`)** — the entire National Stock
  Exchange of India listing, loaded from NSE's public `EQUITY_L.csv` + Nifty
  500/Midcap 150/Smallcap 250 industry lists (`market/india.js`, 30-day disk
  cache). `scoreUniverse` computes peer medians, sector momentum, calibration
  and rating quartiles from the **core only**, then scores the expansion against
  those curated sets; `picks.js` also excludes `expanded` so curated strategy
  pools are unaffected. The expansion surfaces in the screener/search/watchlist/
  stock pages with real data.
- Each: `ticker, name, exchange, country, region, sector, industry, currency,
  marketCap, price, dividendYield, pe, pb, ps, evEbitda, roe, roa, netMargin,
  grossMargin, opMargin, debtToEquity, currentRatio, interestCoverage,
  revenueGrowth, epsGrowth, beta, dividendPayout, freeCashFlowYield,
  momentum1m, momentum3m, momentum6m, momentum12m, volatility12m, avgVolume,
  rsi, movingAvg50, movingAvg200, shortInterest, insiderOwnership,
  employees, foundedYear, fairValue, fairValueModels (14 model outputs),
  rating (outperform|neutral|underperform), score (0-100)`.
  Company names: real public companies (factual reference). Metric fields are
  either live (overlaid by the market layer, see below) or the seeded baseline
  estimate; the UI reports which. Every response carries provenance.

Monthly picks engine:
- For month M, score each stock = weighted composite of 8 metric families
  (financial statements, multiples, momentum, asset efficiency, profitability,
  debt/liquidity, industry, corporate actions). Apply strategy constraints
  (universe filter, market-cap band, liquidity floor), take top N by score.
- Ratings: top quartile → outperform, middle → neutral, bottom → underperform.
- "Why it was picked": rationale tags composed from the stock's strongest metric
  families (e.g. "Strong Momentum, Fair Valuation, Controlled Risk") + 1-2
  sentence generated explanation referencing actual metric values.
- Previous winners: for each strategy, derive episodes of consecutive months a
  stock stayed in the portfolio (dateAdded/dateRemoved/totalReturn).

Real point-in-time backtest (`engine/backtest.js` + `engine/realhistory.js`):
- When live data is present, strategy NAVs are replayed from REAL prices, not
  the seeded simulation. `realhistory.js` distills each stock's real 5y daily
  history into month-end close series and fetches real benchmark index history
  (`^NSEI`, `^GSPC`, `^DJI`, `^SP400`, `^SP600`, `^FTSE`, `^BSESN`; disk-cached
  12h in `~\.alphadesk\benchmarks.json`). Yahoo quirks handled explicitly:
  `max`+1mo downsamples to quarterly (so a bounded `6y` range is used),
  `^FTSE` ships duplicate/missing month bars (deduped + short gaps
  forward-filled ≤2 months), and every series is trimmed to its trailing
  strictly-consecutive monthly run before the replay trusts it.
- `backtest.js` replays each strategy month by month over the real window
  (~Dec 2022 → today). Selection at month k uses ONLY data through month k-1:
  cross-sectional percentile ranks of 12m/6-momentum (newest month skipped —
  Jegadeesh-Titman formation), distance above the 10-month moving average, and
  inverse realised volatility, plus a static valuation/quality tilt from
  current fundamentals (the one disclosed non-point-in-time input). The
  realized monthly return is the ACTUAL market return of the picked stocks
  (and the actual index return for the benchmark), so NAV, CAGR, beta,
  outperformance, basket changes and post-exit P/L are real outcomes.
  A contiguous-coverage pre-scan bounds the replay to months where enough of
  the pool has real history — months are never skipped mid-run (that would
  silently drop losing months and inflate returns).
- Exit accounting: `postExitReturnPct = booked return − hold-to-today return`.
  Positive = the sale beat holding (✓ Good exit); negative = money left on the
  table (✗ Costly exit).
- Offline (`ALPHADESK_LIVE=0` / Yahoo unreachable / thin history) the engine
  falls back to the seeded simulation (`picks.js replay`); every payload and
  page labels which one it got via `dataSource: 'real' | 'simulated'` and a
  REAL MARKET DATA / SIMULATED badge.

Fair value (14 models): DCF (simplified FCFF 5yr), Graham, residual income,
dividend discount, earnings capitalization, peer-comparable PE, peer PB,
EV/EBITDA multiple, PEG, sales multiple, owner earnings, magic formula earnings yield,
ROIC-DCF-lite, asset-backed. Blend → `fairValue`, `upsidePct`, verdict
(undervalued < -10%, fairly valued ±10%, overvalued > +10%), model table.

Economic calendar: next ~60 events generated deterministically per month
(Fed/ECB/RBI meetings, CPI, NFP, GDP, retail sales, PPI, jobless claims) with
country, importance (1-3), previous/forecast/actual, time.

## Live market data overlay (server/src/market/)

The engine above stays the deterministic baseline. The market layer overlays
real data onto the *same* stock objects and then re-runs the cross-sectional
scoring, so every strategy, rating and fair value is computed from real inputs
whenever they are available.

- `provider.js` — cookie+crumb session (persisted), global rate limiter,
  retry/backoff, memory cache (quotes 30s) and disk caches (history 10h gzipped,
  fundamentals 24h, symbols forever).
- `yahoo.js` — `quoteBatch` (batched `/v7/finance/quote`, chunks of 40),
  `history` (daily `/v8/finance/chart`, 5y with a `max` fallback for recently
  reorganised entities), `fundamentals` (`/v10/finance/quoteSummary` —
  assetProfile, summaryDetail, defaultKeyStatistics, financialData, price),
  `search`, plus a `quoteFromChart` fallback. Normalizes `{raw,fmt}` objects to
  numbers and converts minor units (GBp/ZAc → GBP/ZAR) on every price field.
- `symbols.js` — ticker → Yahoo symbol by exchange suffix, verified in bulk and
  cached; explicit overrides for class shares and renamed tickers.
- `live.js` — `applyQuote` / `applyHistory` / `applyFundamentals`; recomputes
  momentum/RSI/volatility/moving averages via `engine/universe.computeHistoryMetrics`,
  then `engine/universe.scoreUniverse`; bumps a `revision` counter and clears the
  engine's payload caches via a callback.

Units convention: `price` and all per-share values are in the stock's local
`currency`; `marketCap` is converted to **USD** with the static `COUNTRY_META`/
`CURRENCY_FX` table. `dividendYield` is a percentage, `debtToEquity` is a ratio,
`roe`/margins/growth are percentages.

Refresh cadence: quotes ~90s, history ~8h, fundamentals ~20h; stock detail
requests trigger on-demand enrichment. The server never blocks on the network —
it serves the baseline immediately and republishes as data lands.

Universe corrections: tickers were updated to current live symbols (MRSH, SAN.PA,
SU.PA, T.TO, HSBA, INGA, UBSG, ROP, TMPV, KPITTECH, GMRAIRPORT) and two delisted
names replaced with live sector peers (OMF, NTRA).

## API contract (all JSON, prefix `/api`)

- `GET /api/propicks/strategies` → `{strategies:[{code,slug,name,description,market,benchmark,yearStart,pickCount,return1y,return5y,returnMax,annualized,beta,outperformance,updated,nextUpdate, favorite:bool, tags:[...]}]}`
- `GET /api/propicks/strategies/:slug` → `{strategy:{...(incl. benchmarkName, dataSource)}, picks:[{ticker,name,sector,exchange,country,price,returnPct,rating,score,rationaleTags:[],rationaleText,fairValue,upsidePct,marketCap}], history:{dates:[],strategyNav:[],benchmarkNav:[]}, previousWinners:[{ticker,name,dateAdded,dateRemoved,totalReturnPct}], basketChanges:{additions:[{ticker,name,dateAdded,score,code,reason}], removals:[{ticker,name,dateAdded,dateRemoved,totalReturnPct,holdingMonths,entryScore,exitScore,exitRank,extendedCutoff,reasonCode,reason,heldValuePct,postExitReturnPct,postExitVerdict,relativeExitPct,relativeVerdict}], exitPnL:{good,costly,relGood,relCostly}, rebalanceDay}, monthlyLedger:[{ym,date,portfolioReturnPct,avgHoldingReturnPct,totalReturnPct,benchmarkReturnPct,benchTotalReturnPct,excessPct,nav,benchNav,holdings,entries:[],exits:[]}]}`
  - Per-basket benchmark: each strategy maps to the index it draws from (see `engine/realhistory.js` `BENCH_SYMBOLS`)
  - Two exit verdicts: `postExitVerdict` = booked vs hold-to-now (absolute); `relativeVerdict` = did the sold stock beat the basket after exit (fair, headline)
- `GET /api/propicks/featured` → featured strategy payload (same shape as :slug).
- `GET /api/propicks/simulator?slug=&amount=&years=` → `{points:[{date,value,benchmarkValue}], startAmount, endAmount, endBenchmark, strategyTotalPct, benchmarkTotalPct}`
- `GET /api/stocks?q=&limit=` → search `[{ticker,name,country,sector,price,changePct,live}]`
- `GET /api/stocks/:ticker` → full stock incl. `fairValueModels[14]`, `history:{dates,closes,volume}` (OHLC optional), ratings, peers, plus live extras: `dataSource`, `provenance:{price,history,fundamentals,quoteAsOf,fundamentalsAsOf,marketState}`, `about`, `website`, `analyst:{recommendation,targetMean,targetHigh,targetLow,count}`, `eps`, `forwardPE`, `dividendRate`, `sharesOutstanding`, `volume`, `week52High`, `week52Low`, `ma50Quote`, `ma200Quote`.
- `POST /api/stocks/batch` body `{tickers:[...]}` → summary rows (each with `live`, `asOf`).
- `GET /api/market/status` → `{enabled,online,source,revision,startedAt,lastRefreshAt,lastError,quotes:{done,total,asOf},history:{...},fundamentals:{...},coverage:{price,fundamentals,history},totals:{stocks},unresolvedCount,unresolved}` (`revision` changes whenever data lands → client refetches).
- `POST /api/market/refresh` → forces a quote refresh + re-score, returns the status.
- `GET /api/market/probe` → `{online,price}` provider reachability check.
- `GET /api/screener/filters` → filter catalog `[{slug,label,type:number|percent|select|multiselect,ops:[...],units:[...],choices:[...]}]`
- `POST /api/screener/run` body `{combine:"and"|"or",filters:[{slug,op,value}],sort:[{slug,direction}],columns:[slug],page,pageSize}` → `{total,matchedOfTotal,rows:[...]}` (rows = stock summaries + requested columns).
- `GET /api/calendar?from=&to=&country=&importance=` → `{events:[{id,date,country,importance,indicator,previous,forecast,actual,unit}]}`
- `GET /api/quotes?symbols=` → `{quotes:[{ticker,price,changePct,spark:[...20 pts],live,asOf}]}`
- `GET /api/assistant/ask?q=` → `{answer, references:[{ticker|slug|type:'fund',id,label}], suggestions:[]}` (Warren AI — deterministic research over the dataset: full stock reports, stock/fund/strategy comparisons, mutual-fund reports, "best <category> fund", SIP projections, exit-quality & methodology, calendar, watchlists).
- `GET /api/funds?q=` → `{funds:[{id,name,house,category,region,risk,benchmark,expense,source,latestNav,return1y,return3y,return5y,volatility12m,maxDrawdown,monthsTracked,asOf,spark:[{d,v}]}], status:{loaded,live,sample,total,asOf}}` (real NAV: mfapi.in for Indian schemes, Yahoo Finance for US funds).
- `GET /api/funds/:id` → a single fund object (404 `UNKNOWN_FUND` if unknown).
- Save/state (single local user, no auth):
  - `GET /api/state` → `{watchlists:[{id,name,tickers:[],createdAt}], alerts:[{id,ticker,type,condition,value,createdAt,active}], savedScreeners:[{id,name,state,createdAt}], savedStrategies:[slug], notes:{[key]:string}}`
  - `PUT /api/state` body = full state → `{ok:true}` (server persists atomically to `server/data/state.json`).
  - `POST /api/watchlists/:id/copy-strategy` body `{slug}` → adds strategy picks to watchlist (returns updated watchlist).

- `GET /api/health` → `{ok:true, uptimeSeconds, node}` (cheap liveness probe for hosting platforms; never touches the engine or disk).
- `GET /api/tunnel` → `{url}` (current public URL, read from `~\.alphadesk\tunnel-url.txt`).

## Frontend spec

Routes (React Router or hand-rolled history routing — your choice):
`/` (redirect to /propicks), `/propicks`, `/propicks/methodology`, `/propicks/:slug`,
`/screener`, `/watchlist`, `/calendar`, `/stock/:ticker`, `/assistant`, `/funds`, `/saved`.

Layout: dark professional trading theme (dark navy/charcoal background, green/red
for +/-, accent indigo), left icon+label sidebar (Watchlists, ProPicks AI,
Screener, Economic Calendar, Charts→/stock/:ticker, Saved Work, Alpha AI),
top bar: search box (typeahead hitting /api/stocks), region selector (US/IN/EU/ALL
— filters propicks strategies), live-data status badge (Live·Yahoo Finance /
loading / Simulated, with a details popover + "Refresh now"), no paywall anywhere.

Pages:
1. **ProPicks AI** (`/propicks`): mirror observed layout — H1 "AlphaPicks AI -
   Find Winning Stocks with AI", "Next Update <1st of next month> · Picks updated
   <1st of this month>", About link, featured strategy panel with picks table
   (Company | Total Return | Why it was picked; sector badge; color-coded
   rationale tags; per-row star → add to watchlist; row click → /stock/:ticker),
   performance simulator card (SVG cumulative-return chart strategy vs benchmark,
   1Y/5Y/Max buttons, amount spinbutton default 10000, % toggle, year chips),
   Previous Winning Stocks carousel (← → arrows), Explore Different Strategies
   (market chips All/US/India, cards with code badge, returns 1Y/5Y/Max,
   "View stocks" → /propicks/:slug), How-to 4-step strip, footer disclaimer.
2. **Strategy detail** (`/propicks/:slug`): full picks table + simulator + history.
3. **Methodology** (`/propicks/methodology`): 8 metric categories grid, how-it-works
   steps, performance stat cards (Total Return, Outperformance, Annualized, Beta),
   FAQ accordion. All text original.
4. **Screener** (`/screener`): filter builder rows (field select, operator select,
   value input, unit select, add/remove rows, Any/All toggle), match count
   "N/total", sort by column headers, column chooser, Save screener (→ state),
   share-link button that encodes state in URL (base64 JSON, same idea as observed).
5. **Watchlist** (`/watchlist`): multiple named watchlists, add stocks via search,
   "Copy strategy to watchlist" select on ProPicks cards, price/change columns,
   sparkline, alerts column (add alert: price above/below value), notes, remove.
6. **Economic Calendar** (`/calendar`): month navigation, country + importance
   filters, table rows colored by importance, actual vs forecast vs previous.
7. **Stock page** (`/stock/:ticker`): price header with live/simulated provenance
   pills and "as of" time, SVG price chart (1M/6M/1Y/5Y/Max), key metrics grid
   (incl. EPS, forward P/E, dividend rate, shares outstanding, volume, 52-week
   range, 50/200-day MA), Fair Value card (blended value, upside, verdict pill,
   14-model table), AI rating card (outperform/neutral/underperform + score bar +
   why), Analyst consensus card, About/business summary, "Add to watchlist",
   "Set alert". Missing values render as "—".
8. **Warren AI** (`/assistant`): chat UI; GET /api/assistant/ask; suggestion chips
   (full stock analysis, best mutual fund, fund comparison, SIP, strategy ranking);
   multi-line research bubbles (pre-wrap, light bold) with references that link to
   stock / strategy pages and to the funds browser.
9. **Mutual Funds** (`/funds`): real-NAV fund table (1/3/5-year CAGR, volatility,
   max drawdown, expense), region/category filters, search, row → detail panel with
   a NAV growth chart; GET /api/funds (or /api/funds/:id).
10. **Saved Work** (`/saved`): saved screeners (load→/screener), saved strategies,
   watchlists overview, notes, export JSON button (downloads state).

Quality bar: works at 1280px wide; loading and empty states; number formatting
(+12.3%, $1.2B, compact); consistent colors for rating (green/amber/red);
no console errors.

## Build order for agents

Server agent: engine → api → state persistence → `node server/src/index.js` boots
and serves `/api/*` with correct shapes (self-test with curl).
Client agent: scaffold with `npm create vite` (react), implement pages against
this contract, `npm run build` succeeds. Dev proxy `/api` → `localhost:8787`.
Integration owner (lead): run server serving client/dist, verify pages.
