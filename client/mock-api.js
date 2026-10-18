// mock-api.js — deterministic, shape-correct mock of the AlphaDesk JSON API.
//
// Used ONLY as a fallback by src/api.js when the real backend at /api is
// unavailable AND VITE_USE_MOCK=1 is set at dev time. Production builds talk
// to the real API by default. All data below is generated from fixed seeds.

/* ---------------------------------- PRNG ---------------------------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFor(key) {
  return mulberry32(hash(key));
}

const round = (v, d = 1) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

/* ------------------------------- universe --------------------------------- */
// Real public companies (factual identifiers); every metric is simulated.

const C = [
  // US
  { t: 'AAPL', n: 'Apple Inc.', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Technology', i: 'Consumer Electronics', cur: 'USD', p: 232, mc: 3.5e12 },
  { t: 'MSFT', n: 'Microsoft Corporation', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Technology', i: 'Software — Infrastructure', cur: 'USD', p: 418, mc: 3.1e12 },
  { t: 'NVDA', n: 'NVIDIA Corporation', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Technology', i: 'Semiconductors', cur: 'USD', p: 138, mc: 3.4e12 },
  { t: 'AMZN', n: 'Amazon.com, Inc.', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Consumer Cyclical', i: 'Internet Retail', cur: 'USD', p: 186, mc: 1.95e12 },
  { t: 'GOOGL', n: 'Alphabet Inc.', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Communication Services', i: 'Internet Content & Information', cur: 'USD', p: 167, mc: 2.05e12 },
  { t: 'META', n: 'Meta Platforms, Inc.', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Communication Services', i: 'Internet Content & Information', cur: 'USD', p: 585, mc: 1.48e12 },
  { t: 'TSLA', n: 'Tesla, Inc.', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Consumer Cyclical', i: 'Auto Manufacturers', cur: 'USD', p: 249, mc: 7.9e11 },
  { t: 'JPM', n: 'JPMorgan Chase & Co.', ex: 'NYSE', c: 'United States', r: 'US', s: 'Financial Services', i: 'Banks — Diversified', cur: 'USD', p: 221, mc: 6.2e11 },
  { t: 'V', n: 'Visa Inc.', ex: 'NYSE', c: 'United States', r: 'US', s: 'Financial Services', i: 'Credit Services', cur: 'USD', p: 289, mc: 5.6e11 },
  { t: 'JNJ', n: 'Johnson & Johnson', ex: 'NYSE', c: 'United States', r: 'US', s: 'Healthcare', i: 'Drug Manufacturers — General', cur: 'USD', p: 162, mc: 3.9e11 },
  { t: 'WMT', n: 'Walmart Inc.', ex: 'NYSE', c: 'United States', r: 'US', s: 'Consumer Defensive', i: 'Discount Stores', cur: 'USD', p: 81, mc: 6.5e11 },
  { t: 'PG', n: 'The Procter & Gamble Company', ex: 'NYSE', c: 'United States', r: 'US', s: 'Consumer Defensive', i: 'Household & Personal Products', cur: 'USD', p: 172, mc: 4.0e11 },
  { t: 'UNH', n: 'UnitedHealth Group Incorporated', ex: 'NYSE', c: 'United States', r: 'US', s: 'Healthcare', i: 'Healthcare Plans', cur: 'USD', p: 565, mc: 5.2e11 },
  { t: 'HD', n: 'The Home Depot, Inc.', ex: 'NYSE', c: 'United States', r: 'US', s: 'Consumer Cyclical', i: 'Home Improvement Retail', cur: 'USD', p: 392, mc: 3.9e11 },
  { t: 'MA', n: 'Mastercard Incorporated', ex: 'NYSE', c: 'United States', r: 'US', s: 'Financial Services', i: 'Credit Services', cur: 'USD', p: 497, mc: 4.6e11 },
  { t: 'XOM', n: 'Exxon Mobil Corporation', ex: 'NYSE', c: 'United States', r: 'US', s: 'Energy', i: 'Oil & Gas Integrated', cur: 'USD', p: 118, mc: 5.2e11 },
  { t: 'CVX', n: 'Chevron Corporation', ex: 'NYSE', c: 'United States', r: 'US', s: 'Energy', i: 'Oil & Gas Integrated', cur: 'USD', p: 158, mc: 2.9e11 },
  { t: 'KO', n: 'The Coca-Cola Company', ex: 'NYSE', c: 'United States', r: 'US', s: 'Consumer Defensive', i: 'Beverages — Non-Alcoholic', cur: 'USD', p: 71, mc: 3.05e11 },
  { t: 'PEP', n: 'PepsiCo, Inc.', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Consumer Defensive', i: 'Beverages — Non-Alcoholic', cur: 'USD', p: 173, mc: 2.4e11 },
  { t: 'PFE', n: 'Pfizer Inc.', ex: 'NYSE', c: 'United States', r: 'US', s: 'Healthcare', i: 'Drug Manufacturers — General', cur: 'USD', p: 29, mc: 1.65e11 },
  { t: 'MRK', n: 'Merck & Co., Inc.', ex: 'NYSE', c: 'United States', r: 'US', s: 'Healthcare', i: 'Drug Manufacturers — General', cur: 'USD', p: 103, mc: 2.6e11 },
  { t: 'ABBV', n: 'AbbVie Inc.', ex: 'NYSE', c: 'United States', r: 'US', s: 'Healthcare', i: 'Drug Manufacturers — General', cur: 'USD', p: 196, mc: 3.5e11 },
  { t: 'COST', n: 'Costco Wholesale Corporation', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Consumer Defensive', i: 'Discount Stores', cur: 'USD', p: 892, mc: 3.95e11 },
  { t: 'CSCO', n: 'Cisco Systems, Inc.', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Technology', i: 'Communication Equipment', cur: 'USD', p: 52, mc: 2.1e11 },
  { t: 'INTC', n: 'Intel Corporation', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Technology', i: 'Semiconductors', cur: 'USD', p: 23, mc: 9.8e10 },
  { t: 'AMD', n: 'Advanced Micro Devices, Inc.', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Technology', i: 'Semiconductors', cur: 'USD', p: 158, mc: 2.55e11 },
  { t: 'NFLX', n: 'Netflix, Inc.', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Communication Services', i: 'Entertainment', cur: 'USD', p: 738, mc: 3.15e11 },
  { t: 'CRM', n: 'Salesforce, Inc.', ex: 'NYSE', c: 'United States', r: 'US', s: 'Technology', i: 'Software — Application', cur: 'USD', p: 274, mc: 2.65e11 },
  { t: 'ORCL', n: 'Oracle Corporation', ex: 'NYSE', c: 'United States', r: 'US', s: 'Technology', i: 'Software — Infrastructure', cur: 'USD', p: 178, mc: 4.9e11 },
  { t: 'TXN', n: 'Texas Instruments Incorporated', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Technology', i: 'Semiconductors', cur: 'USD', p: 202, mc: 1.85e11 },
  { t: 'QCOM', n: 'QUALCOMM Incorporated', ex: 'NASDAQ', c: 'United States', r: 'US', s: 'Technology', i: 'Semiconductors', cur: 'USD', p: 168, mc: 1.85e11 },
  { t: 'BA', n: 'The Boeing Company', ex: 'NYSE', c: 'United States', r: 'US', s: 'Industrials', i: 'Aerospace & Defense', cur: 'USD', p: 152, mc: 9.2e10 },
  { t: 'CAT', n: 'Caterpillar Inc.', ex: 'NYSE', c: 'United States', r: 'US', s: 'Industrials', i: 'Farm & Heavy Construction Machinery', cur: 'USD', p: 392, mc: 1.9e11 },
  { t: 'GS', n: 'The Goldman Sachs Group, Inc.', ex: 'NYSE', c: 'United States', r: 'US', s: 'Financial Services', i: 'Capital Markets', cur: 'USD', p: 512, mc: 1.65e11 },
  { t: 'DIS', n: 'The Walt Disney Company', ex: 'NYSE', c: 'United States', r: 'US', s: 'Communication Services', i: 'Entertainment', cur: 'USD', p: 96, mc: 1.75e11 },
  { t: 'NKE', n: 'NIKE, Inc.', ex: 'NYSE', c: 'United States', r: 'US', s: 'Consumer Cyclical', i: 'Footwear & Accessories', cur: 'USD', p: 88, mc: 1.3e11 },
  { t: 'UBER', n: 'Uber Technologies, Inc.', ex: 'NYSE', c: 'United States', r: 'US', s: 'Technology', i: 'Software — Application', cur: 'USD', p: 76, mc: 1.6e11 },
  // India
  { t: 'RELIANCE', n: 'Reliance Industries Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Energy', i: 'Oil & Gas Refining & Marketing', cur: 'INR', p: 1290, mc: 1.75e11 },
  { t: 'TCS', n: 'Tata Consultancy Services Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Technology', i: 'Information Technology Services', cur: 'INR', p: 3120, mc: 1.13e11 },
  { t: 'INFY', n: 'Infosys Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Technology', i: 'Information Technology Services', cur: 'INR', p: 1460, mc: 6.1e10 },
  { t: 'HDFCBANK', n: 'HDFC Bank Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Financial Services', i: 'Banks — Regional', cur: 'INR', p: 985, mc: 7.6e10 },
  { t: 'ICICIBANK', n: 'ICICI Bank Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Financial Services', i: 'Banks — Regional', cur: 'INR', p: 1290, mc: 9.1e10 },
  { t: 'HINDUNILVR', n: 'Hindustan Unilever Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Consumer Defensive', i: 'Household & Personal Products', cur: 'INR', p: 2480, mc: 5.8e10 },
  { t: 'ITC', n: 'ITC Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Consumer Defensive', i: 'Farm Products', cur: 'INR', p: 412, mc: 5.2e10 },
  { t: 'SBIN', n: 'State Bank of India', ex: 'NSE', c: 'India', r: 'IN', s: 'Financial Services', i: 'Banks — Regional', cur: 'INR', p: 815, mc: 7.3e10 },
  { t: 'BHARTIARTL', n: 'Bharti Airtel Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Communication Services', i: 'Telecom Services', cur: 'INR', p: 1620, mc: 9.6e10 },
  { t: 'LT', n: 'Larsen & Toubro Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Industrials', i: 'Engineering & Construction', cur: 'INR', p: 3640, mc: 5.0e10 },
  { t: 'ASIANPAINT', n: 'Asian Paints Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Basic Materials', i: 'Specialty Chemicals', cur: 'INR', p: 2380, mc: 2.3e10 },
  { t: 'MARUTI', n: 'Maruti Suzuki India Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Consumer Cyclical', i: 'Auto Manufacturers', cur: 'INR', p: 12400, mc: 3.9e10 },
  { t: 'TATAMOTORS', n: 'Tata Motors Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Consumer Cyclical', i: 'Auto Manufacturers', cur: 'INR', p: 685, mc: 2.5e10 },
  { t: 'WIPRO', n: 'Wipro Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Technology', i: 'Information Technology Services', cur: 'INR', p: 248, mc: 2.6e10 },
  { t: 'AXISBANK', n: 'Axis Bank Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Financial Services', i: 'Banks — Regional', cur: 'INR', p: 1180, mc: 3.6e10 },
  { t: 'BAJFINANCE', n: 'Bajaj Finance Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Financial Services', i: 'Credit Services', cur: 'INR', p: 6820, mc: 4.2e10 },
  { t: 'KOTAKBANK', n: 'Kotak Mahindra Bank Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Financial Services', i: 'Banks — Regional', cur: 'INR', p: 1760, mc: 3.5e10 },
  { t: 'HCLTECH', n: 'HCL Technologies Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Technology', i: 'Information Technology Services', cur: 'INR', p: 1840, mc: 5.0e10 },
  { t: 'TATASTEEL', n: 'Tata Steel Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Basic Materials', i: 'Steel', cur: 'INR', p: 165, mc: 2.05e10 },
  { t: 'SUNPHARMA', n: 'Sun Pharmaceutical Industries Limited', ex: 'NSE', c: 'India', r: 'IN', s: 'Healthcare', i: 'Drug Manufacturers — General', cur: 'INR', p: 1820, mc: 4.4e10 },
  // United Kingdom
  { t: 'SHEL', n: 'Shell plc', ex: 'LSE', c: 'United Kingdom', r: 'UK', s: 'Energy', i: 'Oil & Gas Integrated', cur: 'GBP', p: 27.4, mc: 1.65e11 },
  { t: 'AZN', n: 'AstraZeneca PLC', ex: 'LSE', c: 'United Kingdom', r: 'UK', s: 'Healthcare', i: 'Drug Manufacturers — General', cur: 'GBP', p: 122, mc: 1.9e11 },
  { t: 'HSBA', n: 'HSBC Holdings plc', ex: 'LSE', c: 'United Kingdom', r: 'UK', s: 'Financial Services', i: 'Banks — Diversified', cur: 'GBP', p: 6.9, mc: 1.3e11 },
  { t: 'ULVR', n: 'Unilever PLC', ex: 'LSE', c: 'United Kingdom', r: 'UK', s: 'Consumer Defensive', i: 'Household & Personal Products', cur: 'GBP', p: 48.5, mc: 1.2e11 },
  { t: 'BP', n: 'BP p.l.c.', ex: 'LSE', c: 'United Kingdom', r: 'UK', s: 'Energy', i: 'Oil & Gas Integrated', cur: 'GBP', p: 3.9, mc: 6.2e10 },
  { t: 'GSK', n: 'GSK plc', ex: 'LSE', c: 'United Kingdom', r: 'UK', s: 'Healthcare', i: 'Drug Manufacturers — General', cur: 'GBP', p: 14.8, mc: 6.0e10 },
  { t: 'RIO', n: 'Rio Tinto Group', ex: 'LSE', c: 'United Kingdom', r: 'UK', s: 'Basic Materials', i: 'Other Industrial Metals & Mining', cur: 'GBP', p: 52.8, mc: 8.4e10 },
  { t: 'BATS', n: 'British American Tobacco p.l.c.', ex: 'LSE', c: 'United Kingdom', r: 'UK', s: 'Consumer Defensive', i: 'Tobacco', cur: 'GBP', p: 31.2, mc: 7.0e10 },
  { t: 'LSEG', n: 'London Stock Exchange Group plc', ex: 'LSE', c: 'United Kingdom', r: 'UK', s: 'Financial Services', i: 'Capital Markets', cur: 'GBP', p: 82.5, mc: 4.6e10 },
  { t: 'NG', n: 'National Grid plc', ex: 'LSE', c: 'United Kingdom', r: 'UK', s: 'Utilities', i: 'Regulated Electric', cur: 'GBP', p: 8.4, mc: 4.2e10 },
  // Europe
  { t: 'SAP', n: 'SAP SE', ex: 'XETRA', c: 'Germany', r: 'EU', s: 'Technology', i: 'Software — Application', cur: 'EUR', p: 212, mc: 2.5e11 },
  { t: 'ASML', n: 'ASML Holding N.V.', ex: 'Euronext', c: 'Netherlands', r: 'EU', s: 'Technology', i: 'Semiconductor Equipment & Materials', cur: 'EUR', p: 685, mc: 2.7e11 },
  { t: 'NESN', n: 'Nestlé S.A.', ex: 'SIX', c: 'Switzerland', r: 'EU', s: 'Consumer Defensive', i: 'Packaged Foods', cur: 'CHF', p: 82, mc: 2.15e11 },
  { t: 'OR', n: "L'Oréal S.A.", ex: 'Euronext', c: 'France', r: 'EU', s: 'Consumer Defensive', i: 'Household & Personal Products', cur: 'EUR', p: 358, mc: 1.9e11 },
  { t: 'MC', n: 'LVMH Moët Hennessy Louis Vuitton S.A.', ex: 'Euronext', c: 'France', r: 'EU', s: 'Consumer Cyclical', i: 'Luxury Goods', cur: 'EUR', p: 618, mc: 3.1e11 },
  { t: 'SIE', n: 'Siemens AG', ex: 'XETRA', c: 'Germany', r: 'EU', s: 'Industrials', i: 'Industrial Machinery', cur: 'EUR', p: 172, mc: 1.4e11 },
  { t: 'ALV', n: 'Allianz SE', ex: 'XETRA', c: 'Germany', r: 'EU', s: 'Financial Services', i: 'Insurance — Diversified', cur: 'EUR', p: 348, mc: 1.35e11 },
  { t: 'SAN', n: 'Sanofi', ex: 'Euronext', c: 'France', r: 'EU', s: 'Healthcare', i: 'Drug Manufacturers — General', cur: 'EUR', p: 88, mc: 1.1e11 },
  { t: 'IBE', n: 'Iberdrola, S.A.', ex: 'BME', c: 'Spain', r: 'EU', s: 'Utilities', i: 'Regulated Electric', cur: 'EUR', p: 13.1, mc: 8.7e10 },
  { t: 'AIR', n: 'Airbus SE', ex: 'Euronext', c: 'France', r: 'EU', s: 'Industrials', i: 'Aerospace & Defense', cur: 'EUR', p: 148, mc: 1.16e11 },
  // Canada
  { t: 'SHOP', n: 'Shopify Inc.', ex: 'NYSE', c: 'Canada', r: 'CA', s: 'Technology', i: 'Software — Application', cur: 'CAD', p: 105, mc: 1.35e11 },
  { t: 'RY', n: 'Royal Bank of Canada', ex: 'TSX', c: 'Canada', r: 'CA', s: 'Financial Services', i: 'Banks — Diversified', cur: 'CAD', p: 188, mc: 2.6e11 },
  { t: 'TD', n: 'The Toronto-Dominion Bank', ex: 'TSX', c: 'Canada', r: 'CA', s: 'Financial Services', i: 'Banks — Regional', cur: 'CAD', p: 82, mc: 1.5e11 },
  { t: 'CNR', n: 'Canadian National Railway Company', ex: 'TSX', c: 'Canada', r: 'CA', s: 'Industrials', i: 'Railroads', cur: 'CAD', p: 148, mc: 9.8e10 },
  { t: 'ENB', n: 'Enbridge Inc.', ex: 'TSX', c: 'Canada', r: 'CA', s: 'Energy', i: 'Oil & Gas Midstream', cur: 'CAD', p: 64, mc: 1.4e11 },
  { t: 'SU', n: 'Suncor Energy Inc.', ex: 'TSX', c: 'Canada', r: 'CA', s: 'Energy', i: 'Oil & Gas Integrated', cur: 'CAD', p: 58, mc: 7.3e10 },
  { t: 'MFC', n: 'Manulife Financial Corporation', ex: 'TSX', c: 'Canada', r: 'CA', s: 'Financial Services', i: 'Insurance — Diversified', cur: 'CAD', p: 44, mc: 7.8e10 },
  { t: 'BCE', n: 'BCE Inc.', ex: 'TSX', c: 'Canada', r: 'CA', s: 'Communication Services', i: 'Telecom Services', cur: 'CAD', p: 32, mc: 2.9e10 },
  // Asia-Pacific
  { t: 'TSM', n: 'Taiwan Semiconductor Manufacturing Company Limited', ex: 'NYSE', c: 'Taiwan', r: 'AP', s: 'Technology', i: 'Semiconductors', cur: 'USD', p: 188, mc: 9.7e11 },
  { t: 'TM', n: 'Toyota Motor Corporation', ex: 'NYSE', c: 'Japan', r: 'AP', s: 'Consumer Cyclical', i: 'Auto Manufacturers', cur: 'USD', p: 178, mc: 2.35e11 },
  { t: 'SONY', n: 'Sony Group Corporation', ex: 'NYSE', c: 'Japan', r: 'AP', s: 'Communication Services', i: 'Entertainment', cur: 'USD', p: 22.5, mc: 1.4e11 },
  { t: 'BABA', n: 'Alibaba Group Holding Limited', ex: 'NYSE', c: 'China', r: 'AP', s: 'Consumer Cyclical', i: 'Internet Retail', cur: 'USD', p: 88, mc: 2.1e11 },
  { t: 'SE', n: 'Sea Limited', ex: 'NYSE', c: 'Singapore', r: 'AP', s: 'Communication Services', i: 'Internet Content & Information', cur: 'USD', p: 132, mc: 7.6e10 },
  { t: 'NTES', n: 'NetEase, Inc.', ex: 'NASDAQ', c: 'China', r: 'AP', s: 'Communication Services', i: 'Electronic Games', cur: 'USD', p: 102, mc: 6.5e10 },
];

const REGION_BY_COUNTRY = {
  'United States': 'US', India: 'IN', 'United Kingdom': 'UK',
  Germany: 'EU', Netherlands: 'EU', Switzerland: 'EU', France: 'EU', Spain: 'EU',
  Canada: 'CA', Taiwan: 'AP', Japan: 'AP', China: 'AP', Singapore: 'AP',
};

/* ------------------------------ stock builder ------------------------------ */

const historyCache = new Map();

function buildStock(co) {
  const rng = rngFor(`stock:${co.t}`);
  const revenueGrowth = round(clamp(2 + rng() * 30 + (co.s === 'Technology' ? 6 : 0), -8, 45));
  const pe = round(clamp(8 + revenueGrowth * 0.75 + rng() * 14, 5, 65));
  const roe = round(clamp(5 + rng() * 35, 1, 52));
  const roa = round(clamp(2 + rng() * 13, 0.4, 18));
  const grossMargin = round(clamp(22 + rng() * 55, 8, 92));
  const opMargin = round(grossMargin * (0.35 + rng() * 0.45));
  const netMargin = round(clamp(opMargin * (0.55 + rng() * 0.4), 1, 45));
  const debtToEquity = round(rng() * rng() * 190, 1);
  const currentRatio = round(0.7 + rng() * 2.1);
  const interestCoverage = round(debtToEquity < 5 ? 20 + rng() * 40 : 2 + rng() * 12);
  const epsGrowth = round(clamp(revenueGrowth + rng() * 22 - 12, -35, 60));
  const beta = round(0.45 + rng() * 1.15, 2);
  const div = rng();
  const dividendYield = div < 0.42 ? round(0.35 + rng() * 4.6, 2) : 0;
  const dividendPayout = dividendYield > 0 ? round(8 + rng() * 70) : 0;
  const freeCashFlowYield = round(1 + rng() * 8);
  const pb = round(clamp(0.7 + pe * 0.085 + rng() * 1.6, 0.5, 14));
  const ps = round(clamp(0.4 + rng() * 12, 0.3, 20));
  const evEbitda = round(clamp(5 + rng() * 20, 3, 32));
  const momentum1m = round(rng() * 22 - 10);
  const momentum3m = round(rng() * 34 - 14);
  const momentum6m = round(rng() * 52 - 20);
  const momentum12m = round(rng() * 80 - 30);
  const volatility12m = round(12 + rng() * 48);
  const avgVolume = Math.round((0.5 + rng() * 45) * 1e6);
  const rsi = round(28 + rng() * 44);
  const movingAvg50 = round(co.p * (0.9 + rng() * 0.22), 2);
  const movingAvg200 = round(co.p * (0.8 + rng() * 0.42), 2);
  const shortInterest = round(rng() * 8);
  const insiderOwnership = round(rng() * 16);
  const employees = Math.round(1500 + rng() * 240000);
  const foundedYear = 1850 + Math.floor(rng() * 160);

  // Rating/score composite.
  const score = Math.round(clamp(
    26 + roe * 0.45 + revenueGrowth * 0.5 + momentum6m * 0.18
    - Math.max(0, pe - 22) * 0.35 - Math.min(12, debtToEquity * 0.035)
    + (dividendYield > 0 ? 4 : 0) + rng() * 10,
    4, 97,
  ));
  const rating = score >= 68 ? 'outperform' : score >= 44 ? 'neutral' : 'underperform';

  const fairValue = round(co.p * (0.82 + rngFor(`fv:${co.t}`)() * 0.44), 2);
  const upsidePct = round(((fairValue - co.p) / co.p) * 100);

  const MODEL_NAMES = [
    'Discounted Cash Flow', 'Graham Number', 'Residual Income', 'Dividend Discount',
    'Earnings Capitalization', 'Peer P/E', 'Peer P/B', 'EV/EBITDA Multiple',
    'PEG Analysis', 'Sales Multiple', 'Owner Earnings', 'Magic Formula',
    'ROIC DCF Lite', 'Asset Backed',
  ];
  const mRng = rngFor(`fvm:${co.t}`);
  const fairValueModels = MODEL_NAMES.map((model) => {
    const value = round(fairValue * (0.72 + mRng() * 0.56), 2);
    return { model, value, upsidePct: round(((value - co.p) / co.p) * 100) };
  });

  const changePct = round(rngFor(`chg:${co.t}`)() * 6 - 2.8);

  return {
    ticker: co.t, name: co.n, exchange: co.ex, country: co.c, region: co.r,
    regionCode: REGION_BY_COUNTRY[co.c] || co.r, sector: co.s, industry: co.i,
    currency: co.cur, marketCap: co.mc, price: co.p, changePct,
    dividendYield, pe, pb, ps, evEbitda, roe, roa, netMargin, grossMargin,
    opMargin, debtToEquity, currentRatio, interestCoverage, revenueGrowth,
    epsGrowth, beta, dividendPayout, freeCashFlowYield, momentum1m, momentum3m,
    momentum6m, momentum12m, volatility12m, avgVolume, rsi, movingAvg50,
    movingAvg200, shortInterest, insiderOwnership, employees, foundedYear,
    fairValue, upsidePct, fairValueModels, rating, score,
  };
}

let STOCKS = null;
function universe() {
  if (!STOCKS) STOCKS = C.map(buildStock);
  return STOCKS;
}

function findStock(ticker) {
  const t = String(ticker || '').toUpperCase();
  return universe().find((s) => s.ticker === t) || null;
}

// ~10 years of weekday closes, deterministic per ticker, cached.
function priceHistory(ticker) {
  if (historyCache.has(ticker)) return historyCache.get(ticker);
  const co = C.find((x) => x.t === ticker);
  const rng = rngFor(`hist:${ticker}`);
  const days = 2610;
  const closes = new Array(days);
  const volume = new Array(days);
  // Walk backwards from today's price.
  let price = co.p;
  const end = new Date();
  const dates = [];
  for (let i = days - 1; i >= 0; i--) dates.push(isoOf(addDays(end, -i)));
  for (let i = days - 1; i >= 0; i--) {
    closes[i] = round(price, 2);
    volume[i] = Math.round((0.4 + rng() * 1.8) * 1e6 * (co.mc / 1e11 + 1));
    const step = (rng() - 0.485) * 0.035;
    price = clamp(price / (1 + step), co.p * 0.15, co.p * 4);
  }
  const out = { dates, closes, volume };
  historyCache.set(ticker, out);
  return out;
}

function summary(s) {
  const { fairValueModels, ...rest } = s;
  return rest;
}

/* ------------------------------- strategies -------------------------------- */

const STRATEGY_DEFS = [
  {
    slug: 'us-large-cap-leaders', code: 'USL20', name: 'US Large-Cap Leaders',
    market: 'US', benchmark: 'S&P 500', yearStart: 2013, pickCount: 12, drift: 0.21, benchDrift: 0.13,
    description: 'Twelve established US mega- and large-cap names that combine quality earnings, resilient balance sheets and positive price momentum, refreshed on the first trading day of every month.',
    tags: ['Popular', 'Quality', 'Large Cap'],
  },
  {
    slug: 'dow-momentum-ten', code: 'DOW10', name: 'Dow Momentum Ten',
    market: 'US', benchmark: 'Dow Jones Industrial Average', yearStart: 2019, pickCount: 10, drift: 0.18, benchDrift: 0.11,
    description: 'Ten blue-chip Dow constituents ranked highest on six-month momentum and earnings revisions, designed for investors who want index-like steadiness with an active tilt.',
    tags: ['Momentum', 'Blue Chip'],
  },
  {
    slug: 'us-midcap-movers', code: 'MID15', name: 'US Mid-Cap Movers',
    market: 'US', benchmark: 'S&P 400 MidCap', yearStart: 2019, pickCount: 10, drift: 0.24, benchDrift: 0.12,
    description: 'A rotating basket of US mid-sized companies with accelerating revenue, improving margins and above-average relative strength.',
    tags: ['Mid Cap', 'Growth'],
  },
  {
    slug: 'nifty-outperformers', code: 'NFTY20', name: 'Nifty 50 Outperformers',
    market: 'India', benchmark: 'Nifty 50', yearStart: 2013, pickCount: 14, drift: 0.26, benchDrift: 0.14,
    description: 'Large-cap Indian companies scoring highest across fundamentals and momentum, screened from the Nifty 50 universe with liquidity and free-float constraints.',
    tags: ['Popular', 'India', 'Large Cap'],
  },
  {
    slug: 'india-smallcap-gems', code: 'SMC15', name: 'India Small-Cap Gems',
    market: 'India', benchmark: 'Nifty Smallcap 250', yearStart: 2019, pickCount: 12, drift: 0.29, benchDrift: 0.15,
    description: 'Smaller Indian businesses with high return on equity, low leverage and strong relative momentum — higher volatility by design.',
    tags: ['Small Cap', 'High Growth'],
  },
  {
    slug: 'ftse-value-picks', code: 'FTV10', name: 'FTSE Value Picks',
    market: 'UK', benchmark: 'FTSE 100', yearStart: 2019, pickCount: 10, drift: 0.12, benchDrift: 0.08,
    description: 'Value-oriented UK large caps trading below intrinsic-value estimates while carrying dependable dividend streams.',
    tags: ['Value', 'Dividend'],
  },
  {
    slug: 'europe-quality-twelve', code: 'EUQ12', name: 'European Quality Twelve',
    market: 'Europe', benchmark: 'STOXX Europe 600', yearStart: 2019, pickCount: 10, drift: 0.15, benchDrift: 0.1,
    description: 'Twelve European compounders screened for consistent profitability, moderate leverage and pricing power across the STOXX region.',
    tags: ['Quality', 'Europe'],
  },
  {
    slug: 'tsx-dividend-leaders', code: 'TSD10', name: 'TSX Dividend Leaders',
    market: 'Canada', benchmark: 'S&P/TSX 60', yearStart: 2019, pickCount: 8, drift: 0.13, benchDrift: 0.09,
    description: 'Canadian dividend payers with sustainable payout ratios, strong cash generation and defensive sector exposure.',
    tags: ['Dividend', 'Canada'],
  },
  {
    slug: 'asia-pac-bluechips', code: 'APB10', name: 'Asia-Pacific Blue Chips',
    market: 'Asia-Pacific', benchmark: 'MSCI AC Asia Pacific', yearStart: 2019, pickCount: 6, drift: 0.16, benchDrift: 0.1,
    description: 'Established Asia-Pacific franchises with global franchises in semiconductors, autos and internet platforms.',
    tags: ['Asia', 'Blue Chip'],
  },
];

const MARKET_COUNTRIES = {
  US: ['United States'], India: ['India'], UK: ['United Kingdom'],
  Europe: ['Germany', 'Netherlands', 'Switzerland', 'France', 'Spain'],
  Canada: ['Canada'], 'Asia-Pacific': ['Taiwan', 'Japan', 'China', 'Singapore'],
};

// Normalized weekly NAV series per strategy, cached so stats/simulator agree.
const seriesCache = new Map();

function strategySeries(def) {
  if (seriesCache.has(def.slug)) return seriesCache.get(def.slug);
  const rng = rngFor(`series:${def.slug}`);
  const dates = [];
  const nav = [];
  const bench = [];
  const end = new Date();
  const start = new Date(def.yearStart, 0, 1);
  let d = new Date(start);
  let v = 100;
  let b = 100;
  const wDrift = Math.pow(1 + def.drift, 1 / 52) - 1;
  const bDrift = Math.pow(1 + def.benchDrift, 1 / 52) - 1;
  const wVol = 0.028 + (def.drift - 0.12) * 0.05;
  while (d <= end) {
    dates.push(isoOf(d));
    nav.push(round(v, 3));
    bench.push(round(b, 3));
    v *= 1 + wDrift + (rng() - 0.5) * 2 * wVol;
    b *= 1 + bDrift + (rng() - 0.5) * 0.02;
    d = addDays(d, 7);
  }
  const out = { dates, nav, bench };
  seriesCache.set(def.slug, out);
  return out;
}

function strategyStats(def) {
  const { dates, nav, bench } = strategySeries(def);
  const last = nav[nav.length - 1];
  const bLast = bench[bench.length - 1];
  const at = (arr, weeksAgo) => arr[Math.max(0, arr.length - 1 - weeksAgo)];
  const r1y = round((last / at(nav, 52) - 1) * 100);
  const r5y = round((last / at(nav, 260) - 1) * 100);
  const rMax = round((last / nav[0] - 1) * 100);
  const years = Math.max(1, (new Date(dates[dates.length - 1]) - new Date(dates[0])) / (365.25 * 864e5));
  const annualized = round((Math.pow(last / nav[0], 1 / years) - 1) * 100);
  const beta = round(0.55 + rngFor(`beta:${def.slug}`)() * 0.6, 2);
  const benchMax = round((bLast / bench[0] - 1) * 100);
  return {
    return1y: r1y, return5y: r5y, returnMax: rMax, annualized, beta,
    outperformance: round(rMax - benchMax), benchmarkMax: benchMax,
  };
}

let updatedStamp = null;
function updateStamps() {
  if (!updatedStamp) {
    const now = new Date();
    const firstThis = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    updatedStamp = {
      updated: isoOf(firstThis),
      nextUpdate: isoOf(firstNext),
    };
  }
  return updatedStamp;
}

function pickStocksFor(def) {
  const countries = MARKET_COUNTRIES[def.market] || [];
  return universe()
    .filter((s) => countries.includes(s.country))
    .sort((a, b) => b.score - a.score || hash(a.ticker) - hash(b.ticker))
    .slice(0, def.pickCount);
}

const TAG_POOL = [
  'Strong Momentum', 'Fair Valuation', 'Controlled Risk', 'Consistent Growth',
  'Profitable & Efficient', 'Low Leverage', 'Industry Leader', 'Shareholder Returns',
  'Earnings Acceleration', 'Quality Balance Sheet', 'Undervalued', 'Cash Generation',
];

function rationaleFor(stock, rng) {
  const tags = [];
  if (stock.momentum6m > 12) tags.push('Strong Momentum');
  if (stock.pe < 20 && stock.pe > 2) tags.push('Fair Valuation');
  if (stock.debtToEquity < 60 && stock.interestCoverage > 8) tags.push('Controlled Risk');
  if (stock.revenueGrowth > 12) tags.push('Consistent Growth');
  if (stock.roe > 18 && stock.netMargin > 12) tags.push('Profitable & Efficient');
  if (stock.debtToEquity < 40) tags.push('Low Leverage');
  if (stock.score > 75) tags.push('Industry Leader');
  if (stock.dividendYield > 1.5) tags.push('Shareholder Returns');
  if (stock.epsGrowth > stock.revenueGrowth) tags.push('Earnings Acceleration');
  if (stock.currentRatio > 1.4) tags.push('Quality Balance Sheet');
  if (stock.fairValue > stock.price * 1.1) tags.push('Undervalued');
  if (stock.freeCashFlowYield > 5) tags.push('Cash Generation');
  while (tags.length < 2) {
    const t = pick(rng, TAG_POOL);
    if (!tags.includes(t)) tags.push(t);
    if (tags.length >= 3) break;
  }
  const text = `${stock.name} was selected for its combination of `
    + `${stock.roe.toFixed(0)}% return on equity and ${stock.revenueGrowth > 0 ? '+' : ''}`
    + `${stock.revenueGrowth.toFixed(1)}% revenue growth, while trading at `
    + `${stock.pe.toFixed(1)}x earnings with 6-month momentum of `
    + `${stock.momentum6m > 0 ? '+' : ''}${stock.momentum6m.toFixed(1)}%.`;
  return { tags: tags.slice(0, 3), text };
}

const detailCache = new Map();

function strategyDetail(slug) {
  if (detailCache.has(slug)) return detailCache.get(slug);
  const def = STRATEGY_DEFS.find((x) => x.slug === slug);
  if (!def) return null;
  const rng = rngFor(`picks:${slug}:${new Date().getMonth()}`);
  const stats = strategyStats(def);
  const { updated, nextUpdate } = updateStamps();
  const strategy = {
    code: def.code, slug: def.slug, name: def.name, description: def.description,
    market: def.market, benchmark: def.benchmark, yearStart: def.yearStart,
    pickCount: def.pickCount, updated, nextUpdate, tags: def.tags,
    favorite: rngFor(`fav:${slug}`)() > 0.6,
    ...stats,
  };
  const stocks = pickStocksFor(def);
  const picks = stocks.map((s) => {
    const rrng = rngFor(`ret:${slug}:${s.ticker}`);
    const ret = round(rrng() * rrng() * 150 - 18);
    const { tags, text } = rationaleFor(s, rrng);
    return {
      ticker: s.ticker, name: s.name, sector: s.sector, exchange: s.exchange,
      country: s.country, currency: s.currency, price: s.price, returnPct: ret,
      rating: s.rating, score: s.score, rationaleTags: tags, rationaleText: text,
      fairValue: s.fairValue, upsidePct: s.upsidePct, marketCap: s.marketCap,
    };
  });
  const { dates, nav, bench } = strategySeries(def);
  // Monthly history sampled from the weekly series.
  const hIdx = [];
  let lastMonth = -1;
  for (let i = 0; i < dates.length; i++) {
    const m = new Date(`${dates[i]}T00:00:00`).getMonth();
    if (m !== lastMonth) { hIdx.push(i); lastMonth = m; }
  }
  const history = {
    dates: hIdx.map((i) => dates[i]),
    strategyNav: hIdx.map((i) => round((nav[i] / nav[0]) * 100, 2)),
    benchmarkNav: hIdx.map((i) => round((bench[i] / bench[0]) * 100, 2)),
  };
  // Previous winners: episodes of consecutive months held.
  const wrng = rngFor(`win:${slug}`);
  const previousWinners = picks.slice(0, 12).map((p) => {
    const startYear = 2023 + Math.floor(wrng() * 2);
    const startMonth = Math.floor(wrng() * 12);
    const held = 4 + Math.floor(wrng() * 12);
    const added = new Date(startYear, startMonth, 1);
    const removed = new Date(startYear, startMonth + held, 1);
    const overhang = removed > new Date() ? new Date() : removed;
    return {
      ticker: p.ticker, name: p.name,
      dateAdded: isoOf(added),
      dateRemoved: isoOf(overhang),
      totalReturnPct: round(wrng() * wrng() * 190 - 22),
    };
  }).sort((a, b) => b.totalReturnPct - a.totalReturnPct);
  const out = { strategy, picks, history, previousWinners };
  detailCache.set(slug, out);
  return out;
}

function strategiesList() {
  const { updated, nextUpdate } = updateStamps();
  return {
    strategies: STRATEGY_DEFS.map((def) => {
      const stats = strategyStats(def);
      return {
        code: def.code, slug: def.slug, name: def.name,
        description: def.description, market: def.market, benchmark: def.benchmark,
        yearStart: def.yearStart, pickCount: def.pickCount, updated, nextUpdate,
        tags: def.tags, favorite: rngFor(`fav:${def.slug}`)() > 0.6,
        ...stats,
      };
    }),
  };
}

/* -------------------------------- simulator -------------------------------- */

function simulator({ slug, amount = 10000, years = null }) {
  const def = STRATEGY_DEFS.find((x) => x.slug === slug) || STRATEGY_DEFS[0];
  const { dates, nav, bench } = strategySeries(def);
  let startIdx = 0;
  if (years && years > 0) {
    const cutoff = new Date(new Date().getFullYear() - years, new Date().getMonth(), new Date().getDate());
    startIdx = dates.findIndex((d) => new Date(`${d}T00:00:00`) >= cutoff);
    if (startIdx < 0) startIdx = Math.max(0, dates.length - 52 * years);
  }
  const nav0 = nav[startIdx];
  const bench0 = bench[startIdx];
  const points = [];
  for (let i = startIdx; i < dates.length; i++) {
    points.push({
      date: dates[i],
      value: round((nav[i] / nav0) * amount, 2),
      benchmarkValue: round((bench[i] / bench0) * amount, 2),
    });
  }
  const endAmount = points.length ? points[points.length - 1].value : amount;
  const endBenchmark = points.length ? points[points.length - 1].benchmarkValue : amount;
  return {
    points,
    startAmount: amount,
    endAmount: round(endAmount, 2),
    endBenchmark: round(endBenchmark, 2),
    strategyTotalPct: round((endAmount / amount - 1) * 100),
    benchmarkTotalPct: round((endBenchmark / amount - 1) * 100),
  };
}

/* ------------------------------- screener ---------------------------------- */

const FILTERS = [
  { slug: 'marketCap', label: 'Market Cap', type: 'number', ops: ['is greater than', 'is less than', 'is between'], units: ['USD'], choices: [] },
  { slug: 'price', label: 'Price', type: 'number', ops: ['is greater than', 'is less than', 'is between'], units: ['USD'], choices: [] },
  { slug: 'dividendYield', label: 'Dividend Yield', type: 'percent', ops: ['is greater than', 'is less than'], units: ['percent'], choices: [] },
  { slug: 'pe', label: 'P/E Ratio', type: 'number', ops: ['is greater than', 'is less than', 'is between'], units: ['x'], choices: [] },
  { slug: 'pb', label: 'Price to Book', type: 'number', ops: ['is greater than', 'is less than'], units: ['x'], choices: [] },
  { slug: 'roe', label: 'Return on Equity', type: 'percent', ops: ['is greater than', 'is less than'], units: ['percent'], choices: [] },
  { slug: 'netMargin', label: 'Net Margin', type: 'percent', ops: ['is greater than', 'is less than'], units: ['percent'], choices: [] },
  { slug: 'revenueGrowth', label: 'Revenue Growth (YoY)', type: 'percent', ops: ['is greater than', 'is less than'], units: ['percent'], choices: [] },
  { slug: 'epsGrowth', label: 'EPS Growth (YoY)', type: 'percent', ops: ['is greater than', 'is less than'], units: ['percent'], choices: [] },
  { slug: 'debtToEquity', label: 'Debt to Equity', type: 'number', ops: ['is greater than', 'is less than'], units: ['%'], choices: [] },
  { slug: 'beta', label: 'Beta', type: 'number', ops: ['is greater than', 'is less than', 'is between'], units: ['x'], choices: [] },
  { slug: 'momentum3m', label: '3-Month Momentum', type: 'percent', ops: ['is greater than', 'is less than'], units: ['percent'], choices: [] },
  { slug: 'momentum12m', label: '12-Month Momentum', type: 'percent', ops: ['is greater than', 'is less than'], units: ['percent'], choices: [] },
  { slug: 'fairValue', label: 'Fair Value', type: 'number', ops: ['is greater than', 'is less than'], units: ['USD'], choices: [] },
  { slug: 'score', label: 'AlphaScore (0-100)', type: 'number', ops: ['is greater than', 'is less than'], units: [''], choices: [] },
  { slug: 'sector', label: 'Sector', type: 'select', ops: ['is', 'is not'], units: [], choices: [...new Set(C.map((c) => c.s))].sort() },
  { slug: 'country', label: 'Country', type: 'select', ops: ['is', 'is not'], units: [], choices: [...new Set(C.map((c) => c.c))].sort() },
  { slug: 'exchange', label: 'Stock Exchange', type: 'select', ops: ['is', 'is not'], units: [], choices: [...new Set(C.map((c) => c.ex))].sort() },
  { slug: 'rating', label: 'AI Rating', type: 'select', ops: ['is', 'is not'], units: [], choices: ['outperform', 'neutral', 'underperform'] },
];

const SCREENER_COLUMNS = [
  'ticker', 'name', 'sector', 'country', 'exchange', 'marketCap', 'price',
  'changePct', 'pe', 'dividendYield', 'roe', 'netMargin', 'revenueGrowth',
  'momentum3m', 'fairValue', 'upsidePct', 'beta', 'score', 'rating',
];

function opMatches(op, v, value) {
  const o = String(op || '').toLowerCase();
  const num = (x) => {
    if (Array.isArray(x)) return x.map(Number);
    return Number(x);
  };
  if (o.includes('between')) {
    const [lo, hi] = num(value);
    return v >= Math.min(lo, hi) && v <= Math.max(lo, hi);
  }
  if (o.includes('greater') || o === 'gt' || o === '>') return v > Number(value);
  if (o.includes('less') || o === 'lt' || o === '<') return v < Number(value);
  if (o.includes('not') && (o.includes('one of') || o.includes('is not'))) return !String(v).toLowerCase().includes(String(value).toLowerCase());
  if (o.includes('one of') || o === 'in') return String(v).toLowerCase().includes(String(value).toLowerCase());
  if (o.includes('equal') || o === 'eq' || o === '=') return String(v).toLowerCase() === String(value).toLowerCase();
  return String(v).toLowerCase().includes(String(value).toLowerCase());
}

function runScreener(body = {}) {
  const { combine = 'and', filters = [], sort = [], columns = [], page = 1, pageSize = 25 } = body;
  let rows = universe().slice();
  const active = filters.filter((f) => f && f.slug && String(f.value ?? '') !== '');
  if (active.length) {
    rows = rows.filter((s) => {
      const results = active.map((f) => opMatches(f.op, s[f.slug], f.value));
      return combine === 'or' ? results.some(Boolean) : results.every(Boolean);
    });
  }
  if (sort && sort.length && sort[0].slug) {
    const { slug, direction } = sort[0];
    const dir = direction === 'desc' || direction === -1 || direction === '-1' ? -1 : 1;
    rows.sort((a, b) => {
      const av = a[slug]; const bv = b[slug];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  } else {
    rows.sort((a, b) => b.score - a.score);
  }
  const matched = rows.length;
  const cols = columns.length ? columns : ['ticker', 'name', 'price', 'changePct', 'marketCap', 'pe'];
  const p = Math.max(1, page);
  const pageRows = rows.slice((p - 1) * pageSize, (p - 1) * pageSize + pageSize).map((s) => {
    const row = { ticker: s.ticker, name: s.name, currency: s.currency };
    cols.forEach((c) => { row[c] = s[c]; });
    return row;
  });
  return { total: universe().length, matchedOfTotal: matched, rows: pageRows };
}

/* -------------------------------- calendar --------------------------------- */

const CAL_TEMPLATES = [
  { indicator: 'CPI m/m', country: 'US', importance: 3, unit: '%', base: 0.25, spread: 0.3, time: '08:30' },
  { indicator: 'Fed Interest Rate Decision', country: 'US', importance: 3, unit: '%', base: 4.0, spread: 0.25, time: '14:00' },
  { indicator: 'Non-Farm Payrolls', country: 'US', importance: 3, unit: 'K', base: 185, spread: 130, time: '08:30' },
  { indicator: 'GDP q/q', country: 'US', importance: 3, unit: '%', base: 2.4, spread: 1.4, time: '08:30' },
  { indicator: 'Retail Sales m/m', country: 'US', importance: 2, unit: '%', base: 0.4, spread: 0.5, time: '08:30' },
  { indicator: 'PPI m/m', country: 'US', importance: 2, unit: '%', base: 0.2, spread: 0.35, time: '08:30' },
  { indicator: 'Initial Jobless Claims', country: 'US', importance: 2, unit: 'K', base: 220, spread: 45, time: '08:30' },
  { indicator: 'Consumer Confidence', country: 'US', importance: 2, unit: '', base: 102, spread: 12, time: '10:00' },
  { indicator: 'Existing Home Sales', country: 'US', importance: 1, unit: 'M', base: 4.0, spread: 0.5, time: '10:00' },
  { indicator: 'ECB Interest Rate Decision', country: 'EU', importance: 3, unit: '%', base: 3.25, spread: 0.25, time: '14:15' },
  { indicator: 'Eurozone CPI y/y', country: 'EU', importance: 3, unit: '%', base: 2.4, spread: 0.8, time: '11:00' },
  { indicator: 'Eurozone Manufacturing PMI', country: 'EU', importance: 2, unit: '', base: 47.5, spread: 3.5, time: '10:00' },
  { indicator: 'Eurozone GDP q/q', country: 'EU', importance: 2, unit: '%', base: 0.3, spread: 0.4, time: '11:00' },
  { indicator: 'RBI Repo Rate', country: 'IN', importance: 3, unit: '%', base: 6.5, spread: 0.25, time: '12:00' },
  { indicator: 'India CPI y/y', country: 'IN', importance: 3, unit: '%', base: 4.6, spread: 1.0, time: '17:00' },
  { indicator: 'India GDP y/y', country: 'IN', importance: 2, unit: '%', base: 6.8, spread: 1.2, time: '17:30' },
  { indicator: 'India Manufacturing PMI', country: 'IN', importance: 1, unit: '', base: 56.5, spread: 3.0, time: '10:00' },
  { indicator: 'BoE Interest Rate Decision', country: 'GB', importance: 3, unit: '%', base: 4.75, spread: 0.25, time: '12:00' },
  { indicator: 'UK CPI y/y', country: 'GB', importance: 3, unit: '%', base: 2.8, spread: 1.0, time: '07:00' },
  { indicator: 'UK Retail Sales m/m', country: 'GB', importance: 2, unit: '%', base: 0.3, spread: 0.6, time: '07:00' },
  { indicator: 'BoC Interest Rate Decision', country: 'CA', importance: 3, unit: '%', base: 3.75, spread: 0.25, time: '09:45' },
  { indicator: 'Canada Employment Change', country: 'CA', importance: 3, unit: 'K', base: 25, spread: 45, time: '08:30' },
  { indicator: 'Japan BoJ Policy Rate', country: 'JP', importance: 3, unit: '%', base: 0.5, spread: 0.25, time: '03:00' },
  { indicator: 'China Manufacturing PMI', country: 'CN', importance: 2, unit: '', base: 49.8, spread: 2.5, time: '21:30' },
];

const COUNTRY_NAMES = {
  US: 'United States', EU: 'Euro Area', IN: 'India', GB: 'United Kingdom',
  CA: 'Canada', JP: 'Japan', CN: 'China',
};

function monthEvents(year, month) {
  const rng = rngFor(`cal:${year}-${month}`);
  const count = 12 + Math.floor(rng() * 5);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const now = new Date();
  const events = [];
  const chosen = [];
  for (let i = 0; i < count; i++) {
    chosen.push(CAL_TEMPLATES[Math.floor(rng() * CAL_TEMPLATES.length)]);
  }
  chosen.forEach((tpl, i) => {
    const day = 1 + Math.floor(rng() * daysInMonth);
    const date = new Date(year, month, day);
    const j = round((rng() - 0.5) * 2 * tpl.spread, 2);
    const previous = round(tpl.base + j, 2);
    const forecast = round(tpl.base + (rng() - 0.5) * tpl.spread, 2);
    const isFuture = date > now;
    const actual = isFuture ? null : round(tpl.base + (rng() - 0.5) * tpl.spread * 1.2, 2);
    events.push({
      id: `${year}-${month}-${i}-${tpl.indicator.replace(/\W+/g, '')}`,
      date: isoOf(date),
      country: tpl.country,
      countryName: COUNTRY_NAMES[tpl.country] || tpl.country,
      importance: tpl.importance,
      indicator: tpl.indicator,
      previous, forecast, actual,
      unit: tpl.unit,
      time: tpl.time,
    });
  });
  events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return events;
}

function calendar({ from, to, country, importance } = {}) {
  const start = from ? new Date(`${from}T00:00:00`) : new Date();
  const end = to ? new Date(`${to}T00:00:00`) : new Date(start.getFullYear(), start.getMonth() + 2, 0);
  let events = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    events = events.concat(monthEvents(cursor.getFullYear(), cursor.getMonth()));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (country) events = events.filter((e) => e.country === country);
  if (importance) {
    const imp = Number(importance);
    if (!Number.isNaN(imp)) events = events.filter((e) => e.importance === imp);
  }
  events = events.filter((e) => e.date >= isoOf(start) && e.date <= isoOf(end));
  return { events };
}

/* -------------------------------- quotes ----------------------------------- */

function quotes(symbols = '') {
  const list = String(symbols).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  return {
    quotes: list.map((t) => {
      const s = findStock(t);
      if (!s) return { ticker: t, price: null, changePct: null, spark: [] };
      const hist = priceHistory(t);
      return {
        ticker: t, price: s.price, changePct: s.changePct,
        spark: hist.closes.slice(-20),
      };
    }),
  };
}

/* ------------------------------- assistant --------------------------------- */

function ask(q = '') {
  const text = String(q);
  const lower = text.toLowerCase();
  const best = strategiesList().strategies.slice().sort((a, b) => b.returnMax - a.returnMax)[0];
  const mentioned = universe().find((s) => new RegExp(`\\b${s.ticker}\\b`, 'i').test(text));

  if (/strategy|strategies|propicks|pick|performing|backtest/.test(lower)) {
    return {
      answer: `${best.name} (${best.code}) is the strongest AlphaPicks AI strategy right now: `
        + `${fmt(best.returnMax)} since inception (${best.yearStart}), ${fmt(best.return1y)} over the past year `
        + `and ${fmt(best.annualized)} annualized versus ${best.benchmark}. `
        + `It currently holds ${best.pickCount} stocks and was rebalanced on ${best.updated}.`,
      references: [{ slug: best.slug }],
      suggestions: [`Show me the ${best.name} picks`, 'Is AAPL undervalued?', 'What is coming up on the economic calendar?'],
    };
  }
  if (mentioned && /undervalued|overvalued|fair value|cheap|expensive|valuation|worth|buy|sell/.test(lower)) {
    const verdict = mentioned.upsidePct > 10 ? 'undervalued' : mentioned.upsidePct < -10 ? 'overvalued' : 'fairly valued';
    return {
      answer: `${mentioned.ticker} (${mentioned.name}) screens as ${verdict}. `
        + `Blended fair value is ${money(mentioned.fairValue, mentioned.currency)} against a market price of `
        + `${money(mentioned.price, mentioned.currency)} (${fmt(mentioned.upsidePct)} upside). `
        + `The AlphaScore is ${mentioned.score}/100 with a ${mentioned.rating} rating.`,
      references: [{ ticker: mentioned.ticker }],
      suggestions: ['Best performing strategy?', 'Show me high-momentum stocks', 'Any central bank meetings this month?'],
    };
  }
  if (mentioned) {
    return {
      answer: `${mentioned.ticker} — ${mentioned.name} (${mentioned.exchange}, ${mentioned.country}) trades at `
        + `${money(mentioned.price, mentioned.currency)} (${fmt(mentioned.changePct)} today). `
        + `Metrics: P/E ${mentioned.pe.toFixed(1)}x, ROE ${mentioned.roe.toFixed(1)}%, `
        + `revenue growth ${fmt(mentioned.revenueGrowth)}, dividend yield ${mentioned.dividendYield.toFixed(2)}%. `
        + `AlphaScore ${mentioned.score}/100 → ${mentioned.rating}.`,
      references: [{ ticker: mentioned.ticker }],
      suggestions: [`Is ${mentioned.ticker} undervalued?`, 'Best performing strategy?', 'Top dividend payers?'],
    };
  }
  if (/calendar|economic|cpi|fed|central bank|rate decision|nfp|payroll|macro/.test(lower)) {
    const now = new Date();
    const { events } = calendar({ from: isoOf(now), to: isoOf(new Date(now.getFullYear(), now.getMonth() + 1, 0)) });
    const high = events.filter((e) => e.importance === 3).slice(0, 4);
    return {
      answer: `The highest-impact events in the next four weeks: ${high.map((e) => `${e.indicator} (${e.country}, ${fmtDateShort(e.date)})`).join('; ')}. `
        + 'Open the Economic Calendar for the full month view with previous, forecast and actual figures.',
      references: [],
      suggestions: ['Best performing strategy?', 'Is MSFT expensive?', 'US dividend stocks'],
    };
  }
  if (/dividend|income|yield/.test(lower)) {
    const top = universe().filter((s) => s.dividendYield > 0).sort((a, b) => b.dividendYield - a.dividendYield).slice(0, 3);
    return {
      answer: `Highest simulated dividend yields in the universe: `
        + `${top.map((s) => `${s.ticker} (${s.dividendYield.toFixed(2)}%)`).join(', ')}. `
        + 'Use the Screener with "Dividend Yield is greater than 3" to explore the full list.',
      references: top.map((s) => ({ ticker: s.ticker })),
      suggestions: ['Best performing strategy?', 'What is on the economic calendar this week?'],
    };
  }
  return {
    answer: 'I can help with AlphaPicks AI strategies, individual stock statistics and fair values, '
      + 'screener ideas, comparisons and the economic calendar. Try asking "Best performing strategy?", '
      + '"Is AAPL undervalued?" or "What\'s on the economic calendar this week?"',
    references: [],
    suggestions: ['Best performing strategy?', 'Is AAPL undervalued?', "What's on the economic calendar this week?"],
  };
}

function fmt(n) {
  return `${n > 0 ? '+' : ''}${Number(n).toFixed(1)}%`;
}
function money(v, cur) {
  const sym = { USD: '$', INR: '₹', GBP: '£', EUR: '€', CAD: 'CA$', CHF: 'CHF ' }[cur] || '$';
  return `${sym}${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
function fmtDateShort(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getDate()}`;
}

/* ---------------------------------- state ---------------------------------- */

export function defaultState() {
  return {
    watchlists: [{ id: 'wl-1', name: 'My Watchlist', tickers: [], createdAt: new Date().toISOString() }],
    alerts: [],
    savedScreeners: [],
    savedStrategies: [],
    notes: {},
  };
}

const STATE_KEY = 'alphadesk-mock-state';

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(STATE_KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultState();
}

function saveState(state) {
  try { globalThis.localStorage?.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  return { ok: true };
}

/* --------------------------------- exports --------------------------------- */

export {
  strategiesList as strategies,
  strategyDetail as detail,
  simulator,
  universe,
  findStock,
  priceHistory,
  summary,
  FILTERS as filters,
  SCREENER_COLUMNS as screenerColumns,
  runScreener,
  calendar,
  quotes,
  ask,
  loadState as loadMockState,
  saveState as saveMockState,
  C as companies,
};
