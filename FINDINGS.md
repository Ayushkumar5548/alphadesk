# REA Findings: investing.com Pro / ProPicks AI

Reverse engineered with REA browser observation (visible Chrome launch, DOM +
accessibility tree + network capture). Evidence: live page observations,
October 2026.

## Tech stack (observed)

- SPA with webpack content-hashed chunks: `www.investing.com/pro/assets/www/<id>.<hash>.chunk.js`,
  entry `edition-www.<hash>.js` — custom build pipeline, service workers, WebGL (charts use GPU adapter).
- gRPC-Web API for auth: `auth.eu.api.investing.com/investing.auth.Auth/Login`
- GraphQL-style query gateway: `www.investing.com/pro/_/api/query?raw=true`
- REST feature API (Finbox-derived): `pro.api.investing.com/finbox/propicks/v1/featured?popular=any&page=1`,
  `/finbox/propicks/v1/strategies/<slug>`, `/finbox/propicks/v1/strategies/<slug>/winners`
- Subscriptions API: `subscriptions.eu.api.investing.com/v1/plans?country_code=..` + Stripe.js for payments.
- Cloudflare in front (challenge platform), Sentry, Hotjar, GTM/Meta pixel, ad networks.
- Screener state is shareable as URL-encoded JSON: `/pro/screener/q/<urlencoded-json>` with shape
  `{combine:"and", filters:[{value:{input, text, unit}, slug}], sort:[{slug:-1}], columns:[...]}`.

## App shell (observed)

Left sidebar nav: Watchlists, Ideas, ProPicks AI, Screener, Data Explorer, Charts,
Saved Work, WarrenAI, Getting Started. Top bar: company search, region button (US),
"Go To" investing.com, Upgrade to Pro, Sign In.

## ProPicks page structure (observed)

1. H1 "ProPicks AI - Find Winning Stocks with AI"; "Next Update Nov 1, 2026 /
   Stock Picks Updated Oct 1, 2026" (rebalance on the 1st of each month).
2. "About ProPicks AI" link -> methodology page.
3. Featured strategy header (e.g. "Bharat Market Outperformers", code NIFTY20,
   one-line description "This month's top N ... stocks picked by our AI.")
4. Picks table: columns Company | Total Return | Why it was picked.
   Rows: sector badge + ticker + company name, return %, rationale tags
   (e.g. "Steady Momentum, Fair Price, Controlled Risk",
   "Consistent Growth, Momentum, and Steady Business",
   "Breakout Returns, Undervalued Growth, Steady Momentum").
   Guests see masked rows + "Unlock Stocks Now" paywall CTA. (Our clone: no paywall.)
5. Performance simulator: strategy vs benchmark cumulative return chart
   (e.g. NIFTY20 +1,046.1% vs Nifty 50 +112.2%), 1Y/5Y/Max range buttons,
   invested-amount spinbutton (default 10,000), currency/% toggle, year selector buttons.
6. "Previous Winning Stocks" carousel: per pick - name, Date Added, Date Removed,
   Total Return (e.g. Bank of India, Jun 1 2023 -> Feb 1 2024, +100.5%).
7. "Explore Different Strategies": filter chips (All Markets / Focus / All Popular),
   strategy cards: code (INB15, IT15, SP20, INSG20, DOW10, MM20), name, description,
   active year range (2019-2026), "Monthly", Total Return 1Y, Total Return 5Y,
   "View stocks" button. Pagination (16 pages observed).
8. "How to Use ProPicks AI": 4 steps - Explore Different Strategies / Use Them To
   Generate Ideas / Choose Stocks That Appeal To You / Set Your Exit Plan.

## Methodology page (observed)

- AI + human analysis; model trained on 25+ yrs data, 50+ metrics across thousands
  of companies; labels each stock underperform / neutral / outperformance;
  constraints (region, index membership, market cap, liquidity) group top-rated
  stocks into strategies; strategies backtested.
- 8 metric categories: Harmonized Financial Statements, Trading Multiples,
  Price Momentum Indicators, Asset Efficiency and Utilization, Profitability
  Trends, Debt & Liquidity Analysis, Industry Taxonomy, Corporate Actions.
- Performance stats cards: Total Return, Outperformance vs benchmark,
  Annualized Return, Beta. FAQ accordion.

## Screener (observed)

- Toolbar: New Screener | Strategies | Analysis | Save.
- Filter rows: field (Market Cap (Adjusted), Dividend Yield, Sector, ...) +
  operator (greater than, is one of, ...) + value input + unit (million, percent).
- Match counter "1,575/153,195"; Any/All toggle; dimension filters
  (Entity Type, Trading Region, Stock Exchange, Primary Trading Item);
  shareable filter link; results table gated by Pro+ for guests.

## Strategy list observed

beat-nifty-50 (NIFTY20 featured), Bharat Bargains (INB15), Tech Titans (IT15),
Beat the S&P 500 (SP20), Bharat Small Cap Gems (INS20), Dominate the Dow (DOW10),
Mid-Cap Movers (MM20).

## Cloning note

Our build replicates the feature set, information architecture and workflows with
original branding, original UI and a fully simulated data engine (the real picks
data is paywalled/proprietary and is NOT copied). Strategy names below are our own.
