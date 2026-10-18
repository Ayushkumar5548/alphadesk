# AlphaDesk

A self-contained stock-research workstation that recreates the InvestingPro /
ProPicks AI premium workflow: monthly AI stock picks with transparent rationales,
strategy simulators, a Pro-grade stock screener, fair-value estimates (14 models),
an economic calendar, watchlists with alerts, a **Warren AI** research assistant
that deep-dives any stock or mutual fund, a real-NAV **Mutual Funds** browser, and a
save feature — all unlocked, no subscription.

Built by reverse engineering the public feature surface of investing.com/pro
with [REA](https://github.com/morluto/rea) (browser DOM, accessibility tree, and
network observation). See `FINDINGS.md` for the evidence and `DESIGN.md` for the
frozen architecture contract.

**Prices, fundamentals and price history are real**, fetched live from Yahoo
Finance (keyless public endpoints) for **2,860 companies** — the full NSE
(India) listing plus a curated global large/mid-cap universe across the US, UK,
Canada, continental Europe, Japan, Korea, Taiwan, Hong Kong, Singapore and
Australia. AlphaDesk's own model output (AlphaPicks AI picks, ratings, fair
values) is then computed *from that real data*. Where live data is unavailable
the app says so instead of inventing a number.

The strategy/pick *selection logic* is AlphaDesk's own (the real picks on
Investing.com are proprietary and paywalled; nothing was copied).

## Architecture

```
alpha/
  server/   Node 24, zero npm dependencies. API + data engine on :8787.
    src/market/   Live market-data provider (Yahoo Finance) + overlay.
  client/   Vite + React 18 SPA. Built to client/dist, served by the server.
  FINDINGS.md   REA reverse-engineering evidence (tech stack, feature map).
  DESIGN.md     Frozen design + API contract the build followed.
```

## Live market data

`server/src/market/` is a small provider layer with **zero npm dependencies**
(Node's global `fetch`):

- `provider.js` — cookie + crumb session (persisted to
  `server/data/market/session.json`), a global rate limiter, retry/backoff, and
  memory/disk caches.
- `yahoo.js` — `/v7/finance/quote` (batched quotes), `/v8/finance/chart` (daily
  history, 5y with a `max` fallback), `/v10/finance/quoteSummary` (fundamentals),
  `/v1/finance/search`. All values normalized to plain numbers; London/Jo'burg
  minor units (pence) are converted to major units.
- `symbols.js` — resolves each universe ticker to a Yahoo symbol by exchange
  suffix, verified in bulk against the quote endpoint and cached to
  `server/data/market/symbols.json`.
- `live.js` — overlays real quotes/history/fundamentals onto the deterministic
  universe, recomputes every derived metric (momentum, RSI, volatility, moving
  averages), re-scores the analytics from real inputs, and republishes a
  `revision` counter the client uses to refetch.

Behaviour:

- The server starts instantly and serves the baseline immediately; a background
  fill brings in 327/327 quotes (~6s), then history and fundamentals (a couple
  of minutes on a cold start, then cached).
- Quotes refresh every ~90s; history ~8h; fundamentals ~20h. Caches live under
  `server/data/market/` and survive restarts.
- Stock detail requests trigger on-demand enrichment for that symbol.
- **Graceful degradation**: with no network, or with `ALPHADESK_LIVE=0`, the app
  keeps serving the deterministic baseline and the UI reports "SIMULATED".
- Every response carries provenance — `GET /api/market/status` reports provider
  health, coverage and freshness; stock/quote rows carry a `live` flag; stock
  detail carries a per-group `provenance` block.

Coverage: **2,860** companies — every one resolves to a live Yahoo symbol and
carries a real price; history and fundamentals fill progressively (see below).
The curated subset (the original 327) additionally had ticker corrections
applied where companies had renamed or symbol rules collided (e.g. Marsh &
McLennan `MMC`→`MRSH`, Sanofi `SNY`→`SAN.PA`, HSBC `HSBC`→`HSBA`, Schneider
Electric `SU`→`SU.PA` vs Suncor `SU`, Telus `T`→`T.TO` vs AT&T `T`). Two
delisted names were replaced with live sector peers (`LC`→`OMF`, `EXAS`→`NTRA`).

## Warren AI & mutual-fund data

**Warren AI** (`/assistant`, `engine/assistant.js`) is a deterministic research
agent over the dataset. It resolves the stock, fund, strategy or macro topic in a
question and answers with the full underlying fields — no free-text generation,
every number traceable. It handles: full single-stock reports; two-stock, two-fund
and two-strategy comparisons; mutual-fund reports; "best <category> fund"; SIP
projections; AlphaPicks ranking; methodology and exit-quality questions; the
economic calendar; and watchlists.

**Mutual-fund NAV** (`engine/funds.js`) comes from two free, key-less sources:

- **Indian funds** — `https://api.mfapi.in/mf/{schemeCode}` (full NAV history per
  direct-plan growth scheme).
- **US funds** — Yahoo Finance mutual-fund tickers (e.g. `VFIAX`).

1/3/5-year CAGR, annualised volatility, max drawdown and latest NAV are computed
from the actual NAV series, cached to `~/.alphadesk/funds.json` for ~12h, and
refreshed in the background at boot. If a source is unreachable the curated seed
figures are served, labelled **SAMPLE**, so the page never goes blank.

## Universe: curated core + full NSE listing

AlphaDesk serves a **two-tier universe** (`engine/universe_data.js`):

- **Curated core (~327 stocks)** — hand-listed global names across every
  region. These carry the richest industry/segment tags and seed the peer
  medians, sector momentum and rating quartiles.
- **NSE expansion (~2,533 stocks)** — the *entire* National Stock Exchange of
  India listing, loaded from NSE's public `EQUITY_L.csv` archive plus the Nifty
  500 / Midcap 150 / Smallcap 250 industry lists (`market/india.js`, cached to
  `server/data/market/india-list.json` for 30 days). These entries are flagged
  `expanded: true`.

Because the expansion is whole-exchange, it is kept out of the cross-sectional
statistics that the curated core defines (`scoreUniverse` computes peer medians,
sector momentum, calibration and rating quartiles from the core only), so
adding ~2,500 Indian names never distorts a curated stock's fair value or
rating. The **AlphaPicks AI curated strategies also draw only from the core**
(`picks.js` excludes `expanded`), so their pick pools keep their hand-picked
character — the NSE names appear in the **screener, search, watchlists and
stock pages** with real data instead.

Expanded entries start from a short (~260-bar) labeled baseline that the live
overlay overwrites with real 5-year history, so startup stays fast (~0.3s) and
memory bounded while the universe spans a whole exchange.

Because ~2,500 NSE names need individual chart/quoteSummary calls, **price**
coverage is complete within ~1 minute of a cold start (batched quotes), while
**history and fundamentals** fill in progressively over several minutes in the
background (and instantly on-demand when a stock page is opened). Until a given
stock's history/fundamentals land, its page shows the labeled baseline for those
fields rather than inventing numbers.

## Run

```powershell
# 1. Build the frontend (first time / after client changes)
cd client
npm.cmd install
npm.cmd run build
cd ..

# 2. Start the server (serves API + built client)
node server/src/index.js
# → http://localhost:8787
```

### Open it from any device, anywhere (public internet)

AlphaDesk can also be published with a **permanent** public URL via a
**Tailscale Funnel** (free, stable across restarts and reboots, no firewall
rules, no port forwarding, no domain needed). The live URL is whatever your
machine publishes — it's always available at `GET /api/tunnel`:

```
https://<machine>.<tailnet>.ts.net
```

```powershell
powershell -ExecutionPolicy Bypass -File start-alpha.ps1         # start
powershell -ExecutionPolicy Bypass -File start-alpha.ps1 -Stop    # stop
# or just double-click start-alpha.bat
```

- The current public URL is persisted to `~\.alphadesk\tunnel-url.txt` and is
  always readable at **`GET /api/tunnel`** (so the running app can tell you it).
- **Self-healing**: `watch-alpha.ps1` (run by the `AlphaDesk` scheduled task at
  logon and **every 5 minutes**) restarts the :8787 server or re-arms the Funnel
  whenever either is down, so the site recovers by itself after a reboot, a
  crash, or a network drop.
- Which tunnel is used is chosen by `~\.alphadesk\tunnel.config.json`:
  - `{ "provider": "tailscale" }` — the permanent Funnel URL above (default).
  - `{ "provider": "ngrok", "ngrokAuthtoken": "…", "ngrokDomain": "name.ngrok-free.app" }`
  - `{ "provider": "quick" }` — a temporary Cloudflare `trycloudflare.com` link
    (**random hostname that changes on every restart**); used automatically as a
    fallback when Tailscale is unavailable.

> First-time Funnel setup (once per machine): install Tailscale, `tailscale up`
> (sign in), then `tailscale funnel --bg 8787`. Funnel needs MagicDNS + HTTPS
> certificates enabled on the tailnet; Tailscale can take ~10 minutes to publish
> the public DNS record for a brand-new tailnet.

### Run it 24/7 without this PC (cloud hosting)

The server is a single zero-dependency Node process that also runs on any
container host — no PC and no Tailscale needed. A ready-made deployment kit
lives in this folder:

- `Dockerfile` + `.dockerignore` — multi-stage build (client + server).
- `render.yaml` — Render blueprint (free tier).
- `fly.toml` — Fly.io config (always-on).
- `package.json` — `start` / `build` scripts used by PaaS platforms.

**See [`DEPLOY.md`](./DEPLOY.md)** for step-by-step instructions for Render
(free), Fly.io (always-on, ~US$3/mo) and Hugging Face Spaces (free). Liveness
probe: `GET /api/health`.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Ayushkumar5548/alphadesk)

### Monthly basket changes & exit tracking

The server fetches real data on startup. To run fully offline (deterministic
baseline, no network calls):

```powershell
$env:ALPHADESK_LIVE = "0"; node server/src/index.js
```

Client dev mode with hot reload (server must be running):

```powershell
cd client
npm.cmd run dev   # → http://localhost:5173, proxies /api to :8787
```

## Features

- **Live quotes** — real prices, changes, market caps, P/E, P/B, EPS, dividend
  yield, 52-week ranges, moving averages and volume for all 2,860 companies, with
  price history charts and a live/simulated provenance indicator.
- **AlphaPicks AI** (`/propicks`) — monthly-rebalanced themed strategies
  (S&P Elite 20, Tech Vanguard 15, Dow Dynamos 10, India Value 15, India
  Smallcap 20, Mid-Cap Momentum 20), picks table with "why it was picked"
  rationale tags, strategy-vs-benchmark simulator, previous winning stocks
  carousel, methodology page.
- **Real point-in-time backtests** — strategy returns are computed from actual
  historical market prices (real 5-year monthly closes per stock + real index
  history for each benchmark). Each rebalance month ranks stocks on factor
  values computed *only from data that existed at that month* (12/6-month
  momentum skipping the newest month, trend above the 10-month moving average,
  low volatility, plus a valuation/quality tilt from current fundamentals —
  the one disclosed non-point-in-time input), then realizes the **actual**
  market return of the stocks picked. NAVs, CAGR, beta, outperformance,
  basket-change history and post-exit P/L are therefore real market outcomes
  over the real-data window (Dec 2022 → present), never simulated. When live
  data is unavailable (offline / `ALPHADESK_LIVE=0`) the engine falls back to
  the seeded simulation and every page labels it **SIMULATED**.
- **Monthly Basket Changes** (strategy detail) — every rebalance month grouped
  with a plain-language reason per addition and per removal, **filterable by
  month, ticker/name and addition-vs-removal** so long histories stay scannable.
  Each sell is scored two ways: **booked vs held-to-now** (what the basket booked
  while it held the stock vs. where the stock stands today) and the fairer
  **vs basket after exit** verdict — did the stock we sold go on to beat the
  basket we rotated into? The headline "value-adding / costly" label uses the
  fair, market-neutral test; the booked-vs-held figure is shown alongside.
  Exit discipline itself is built to avoid costly sells: an incumbent is only
  removed once it has been out-ranked for two consecutive months *and* its own
  momentum/score has faded — never merely for being in a short-term drawdown —
  while a sustained three-month breakdown is still cut.
- **Per-basket benchmarks** — each strategy compares against the index it
  actually draws stocks from (India Smallcap 20 → MSCI India Small-Cap,
  Tech Titans → Nasdaq 100, Euro Leaders → Euro Stoxx 50, Bharat Bargains →
  Nifty 500, …), not one blanket index.
- **Monthly total-return ledger** (strategy detail) — month-by-month portfolio
  return, net-of-cost return, benchmark return, excess, NAV/benchmark-NAV and
  **cumulative portfolio total return** after every month's entries and exits,
  with a summary stat grid.
- **Screener** (`/screener`) — field/operator/value/unit filter builder,
  Any/All combining, sortable results over the live metrics, save screeners,
  shareable link state.
- **Fair Value** (stock page) — blended estimate from 14 models (DCF, Graham,
  comps, DDM, EV/EBITDA, …) computed from the live fundamentals, with per-model
  table and verdict.
- **Analyst consensus & profile** (stock page) — recommendation, mean/high/low
  price targets, business summary and company profile from live fundamentals.
- **Watchlists & Alerts** (`/watchlist`) — multiple lists, copy a whole AI
  strategy into a watchlist, price alerts, notes.
- **Economic Calendar** (`/calendar`) — central-bank meetings and indicators
  with previous/forecast/actual, country and importance filters (scheduled events
  are modelled by AlphaDesk, not sourced live).
- **Warren AI** (`/assistant`) — the AlphaDesk research assistant. Ask about any
  stock and get a full research report (valuation, P/E·P/B·P/S·EV/EBITDA,
  profitability, growth, balance sheet, momentum, RSI/technicals, dividends,
  peers, model read and a bottom-line verdict); compare two stocks, two mutual
  funds or two AlphaPicks baskets; ask about any mutual fund; ask for the best
  fund in a category; or run SIP maths ("SIP 5000 for 10 years in …"). Every
  figure is drawn from the dataset or real NAV/price history — nothing invented.
- **Mutual Funds** (`/funds`) — a curated set of Indian and US funds with **real
  NAV history** (mfapi.in for Indian schemes, Yahoo Finance for US funds):
  1/3/5-year CAGR, annualised volatility, max drawdown, latest NAV and a NAV
  growth chart, filterable by region and category. When a source is unreachable
  the curated seed figures are shown, clearly labelled **SAMPLE**.
- **Saved Work** (`/saved`) — saved screeners, strategies, watchlists, notes,
  JSON export. Persisted to `server/data/state.json`.

## Verified end-to-end

Integration is verified against the real engine (server on :8787 serving the built
client), not mocks: every route renders with live API data and zero console errors.

**Live market data** (`node server/verify-live.js`):

- **2,860/2,860** companies resolve to a live Yahoo symbol and carry a real
  price (100% quote coverage on the expanded universe; history and fundamentals
  fill progressively in the background and on demand).
- Spot checks match reality: AAPL **$343.46** (P/E 39.39, mkt cap $5.01T),
  MSFT $529.05, RELIANCE ₹1,211.20 ($186B), AZN £124.46 ($244B), SAP €199.22,
  Toyota ¥3,094, Samsung ₩215,500; expanded NSE names such as 20 Microns
  (₹193.32, `dataSource: live`).
- Currency integrity: `market cap × fx ÷ price` matches reported shares
  outstanding for every stock except 7 expected multi-class/dual-list artifacts
  (GOOGL Class A only, BRK.B vs BRK.A, BYD H-shares, ABNB/CHWY/ZG, RIO dual list).
- All 14 fair-value models produce finite outputs for **all 2,860** stocks after
  the overlay; picks, ratings and rationales are recomputed from real inputs
  (curated peer medians and rating quartiles derived from the core, so the
  NSE expansion never distorts them).
- `node selftest.js` still passes **65/65**, including determinism across server
  restarts (the self-test runs with `ALPHADESK_LIVE=0`).

**Feature surfaces**:

- **AlphaPicks AI** — 20-pick featured table with rationales, simulator, previous
  winners carousel (all 10 strategies return a populated winner history).
- **Strategy detail** — renamed original strategy set; real point-in-time NAV
  history, per-basket benchmark, monthly total-return ledger, filterable
  basket-change feed.
- **Screener** — 2,860-stock baseline (curated core + full NSE listing),
  `Market Cap > 50000 million` filters over pages;
  save → Saved Work → Load round-trip restores field/op/value exactly.
- **Stock page** — 14 fair-value models, metrics grid, SVG price chart, analyst
  consensus, business summary, alerts.
- **Watchlist** — star on a pick creates "My Watchlist" and persists server-side.
- **Warren AI** — full stock report, stock/fund/strategy comparisons, mutual-fund
  report, "best <category> fund", SIP projection, methodology and exit-quality
  answers all return populated multi-line research; fund references render as
  chips linking to the funds browser.
- **Mutual Funds** — 33 curated Indian + US funds all fetch real NAV history
  (33/33 live on a warm cache) with computed CAGR, volatility and max drawdown;
  region/category filters and the NAV growth chart render.
- **Calendar / Saved Work** — render and round-trip correctly.

Fixes applied during integration (both directions of the API contract):

- Server: pool-relative eviction bound + monthly churn floor so small strategy
  universes still produce add/remove history (INS20/IT15/UK15 were frozen).
- Server: `fairValue` accepted as a screener column; human-readable operator
  aliases (`is greater than` → `gt`); alias honoured through the numeric path.
- Client: numeric/between/multiselect filter values are converted to the
  canonical payload types, the unit selector is wired, ops show friendly labels,
  and Save uses an inline name popover instead of `window.prompt`.

## Legal

For education and personal research. Not investment advice. Prices, price
history and fundamentals are retrieved from Yahoo Finance's public endpoints at
runtime and may be delayed, incomplete or unavailable; they are not licensed
market data. AlphaPicks AI picks, ratings, fair-value estimates and calendar
events are AlphaDesk's own model output. "InvestingPro" and "ProPicks" are
trademarks of Investing.com; AlphaDesk is an independent reimplementation with
an original UI and no copied proprietary content.
