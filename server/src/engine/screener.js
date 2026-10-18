'use strict';
// Screener: filter catalog + deterministic filtering/sorting/pagination.
// All values are simulated numbers from the engine universe.
const { round } = require('./prng');

const NUM_OPS = ['gt', 'gte', 'lt', 'lte', 'eq', 'between'];
const SEL_OPS = ['is', 'isNot'];
const MULTI_OPS = ['in', 'notIn'];

function pct(v) { return `${v}%`; }

function filters(universe) {
  const sectors = [...new Set(universe.stocks.map((s) => s.sector))].sort();
  const countries = [...new Set(universe.stocks.map((s) => s.country))].sort();
  const exchanges = [...new Set(universe.stocks.map((s) => s.exchange))].sort();
  const regions = [...new Set(universe.stocks.map((s) => s.region))].sort();

  return [
    { slug: 'marketCap', label: 'Market Cap', type: 'number', ops: NUM_OPS, units: ['million', 'billion', 'trillion'], choices: [] },
    { slug: 'price', label: 'Price', type: 'number', ops: NUM_OPS, units: ['number'], choices: [] },
    { slug: 'pe', label: 'P/E Ratio', type: 'number', ops: NUM_OPS, units: ['x'], choices: [] },
    { slug: 'pb', label: 'P/B Ratio', type: 'number', ops: NUM_OPS, units: ['x'], choices: [] },
    { slug: 'ps', label: 'P/S Ratio', type: 'number', ops: NUM_OPS, units: ['x'], choices: [] },
    { slug: 'evEbitda', label: 'EV/EBITDA', type: 'number', ops: NUM_OPS, units: ['x'], choices: [] },
    { slug: 'dividendYield', label: 'Dividend Yield', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'dividendPayout', label: 'Dividend Payout', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'roe', label: 'Return on Equity', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'roa', label: 'Return on Assets', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'netMargin', label: 'Net Margin', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'grossMargin', label: 'Gross Margin', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'opMargin', label: 'Operating Margin', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'revenueGrowth', label: 'Revenue Growth', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'epsGrowth', label: 'EPS Growth', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'freeCashFlowYield', label: 'Free Cash Flow Yield', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'momentum3m', label: '3M Momentum', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'momentum12m', label: '12M Momentum', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'volatility12m', label: '12M Volatility', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'shortInterest', label: 'Short Interest', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'upsidePct', label: 'Fair Value Upside', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'changePct', label: 'Daily Change', type: 'percent', ops: NUM_OPS, units: ['percent'], choices: [] },
    { slug: 'beta', label: 'Beta', type: 'number', ops: NUM_OPS, units: ['number'], choices: [] },
    { slug: 'debtToEquity', label: 'Debt / Equity', type: 'number', ops: NUM_OPS, units: ['number'], choices: [] },
    { slug: 'currentRatio', label: 'Current Ratio', type: 'number', ops: NUM_OPS, units: ['number'], choices: [] },
    { slug: 'interestCoverage', label: 'Interest Coverage', type: 'number', ops: NUM_OPS, units: ['x'], choices: [] },
    { slug: 'rsi', label: 'RSI (14)', type: 'number', ops: NUM_OPS, units: ['number'], choices: [] },
    { slug: 'score', label: 'AlphaDesk Score', type: 'number', ops: NUM_OPS, units: ['number'], choices: [] },
    { slug: 'avgVolume', label: 'Avg Volume (shares)', type: 'number', ops: NUM_OPS, units: ['number'], choices: [] },
    { slug: 'sector', label: 'Sector', type: 'multiselect', ops: MULTI_OPS, units: [], choices: sectors },
    { slug: 'country', label: 'Country', type: 'multiselect', ops: MULTI_OPS, units: [], choices: countries },
    { slug: 'exchange', label: 'Stock Exchange', type: 'multiselect', ops: MULTI_OPS, units: [], choices: exchanges },
    { slug: 'region', label: 'Trading Region', type: 'multiselect', ops: MULTI_OPS, units: [], choices: regions },
    { slug: 'rating', label: 'AI Rating', type: 'select', ops: SEL_OPS, units: [], choices: ['outperform', 'neutral', 'underperform'] },
  ];
}

const UNIT_SCALE = { million: 1e6, billion: 1e9, trillion: 1e12 };

function bad(msg, code) {
  const err = new Error(msg);
  err.status = 400;
  err.code = code || 'BAD_REQUEST';
  return err;
}

function extract(stock, slug) {
  return stock[slug];
}

// Human-readable operator aliases (client fallback catalogs use long forms).
const OP_ALIASES = {
  'is greater than': 'gt',
  'is less than': 'lt',
  'is between': 'between',
  'is greater than or equal to': 'gte',
  'is less than or equal to': 'lte',
  'is not': 'isNot',
};

// Columns that are display/sortable but not filterable.
const EXTRA_COLUMNS = ['fairValue'];

// Validate and normalize a screener run request. Throws 400-style errors.
function normalizeRun(body, catalog) {
  if (!body || typeof body !== 'object') throw bad('Request body must be a JSON object');
  const bySlug = new Map(catalog.map((f) => [f.slug, f]));

  const combine = body.combine == null ? 'and' : body.combine;
  if (combine !== 'and' && combine !== 'or') throw bad('combine must be "and" or "or"', 'BAD_COMBINE');

  const rawFilters = body.filters == null ? [] : body.filters;
  if (!Array.isArray(rawFilters)) throw bad('filters must be an array');
  if (rawFilters.length > 20) throw bad('A maximum of 20 filters is allowed');

  const filters = rawFilters.map((f, i) => {
    if (!f || typeof f !== 'object') throw bad(`filters[${i}] must be an object`);
    const spec = bySlug.get(f.slug);
    if (!spec) throw bad(`Unknown filter "${f.slug}"`, 'UNKNOWN_FILTER');
    const op = OP_ALIASES[f.op] || f.op;
    if (!spec.ops.includes(op)) throw bad(`Operator "${f.op}" is not valid for ${spec.label}`, 'UNKNOWN_OP');
    let value = f.value;
    if (spec.type === 'select' || spec.type === 'multiselect') {
      if (spec.type === 'select') {
        if (!spec.choices.includes(value)) throw bad(`"${value}" is not a valid choice for ${spec.label}`, 'BAD_VALUE');
        if (op === 'isNot') { /* ok */ }
      } else {
        if (op === 'in' || op === 'notIn') {
          if (!Array.isArray(value) || value.length === 0) throw bad(`${spec.label} expects an array of values`, 'BAD_VALUE');
          for (const v of value) {
            if (!spec.choices.includes(v)) throw bad(`"${v}" is not a valid choice for ${spec.label}`, 'BAD_VALUE');
          }
        } else {
          throw bad(`Operator "${f.op}" is not valid for ${spec.label}`, 'UNKNOWN_OP');
        }
      }
      return { slug: f.slug, op, value, spec };
    }
    // numeric
    const conv = (v) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(`${spec.label} expects a numeric value`, 'BAD_VALUE');
      const unit = f.unit && spec.units.includes(f.unit) ? f.unit : spec.units[0];
      return v * (UNIT_SCALE[unit] || 1);
    };
    if (op === 'between') {
      if (!Array.isArray(value) || value.length !== 2) throw bad(`${spec.label} "between" expects [lo, hi]`, 'BAD_VALUE');
      const lo = conv(value[0]);
      const hi = conv(value[1]);
      if (lo > hi) throw bad(`${spec.label} range is inverted (lo > hi)`, 'BAD_VALUE');
      return { slug: f.slug, op, value: [lo, hi], spec };
    }
    return { slug: f.slug, op, value: conv(value), spec };
  });

  const rawSort = body.sort == null ? [] : body.sort;
  if (!Array.isArray(rawSort)) throw bad('sort must be an array');
  if (rawSort.length > 3) throw bad('A maximum of 3 sort columns is allowed');
  const sort = rawSort.map((s, i) => {
    if (!s || typeof s !== 'object') throw bad(`sort[${i}] must be an object`);
    const spec = bySlug.get(s.slug);
    const allowed = ['ticker', 'name', ...EXTRA_COLUMNS].includes(s.slug);
    if (!spec && !allowed) throw bad(`Unknown sort column "${s.slug}"`, 'UNKNOWN_COLUMN');
    if (s.direction !== 'asc' && s.direction !== 'desc') throw bad('sort direction must be "asc" or "desc"');
    return { slug: s.slug, direction: s.direction };
  });

  const rawColumns = body.columns == null ? [] : body.columns;
  if (!Array.isArray(rawColumns)) throw bad('columns must be an array');
  if (rawColumns.length > 20) throw bad('A maximum of 20 columns is allowed');
  for (const c of rawColumns) {
    if (!bySlug.has(c) && !['ticker', 'name', ...EXTRA_COLUMNS].includes(c)) throw bad(`Unknown column "${c}"`, 'UNKNOWN_COLUMN');
  }

  const page = body.page == null ? 1 : body.page;
  const pageSize = body.pageSize == null ? 25 : body.pageSize;
  if (!Number.isInteger(page) || page < 1) throw bad('page must be a positive integer');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw bad('pageSize must be 1-100');

  return { combine, filters, sort, columns: rawColumns, page, pageSize };
}

function matches(stock, f) {
  const v = extract(stock, f.slug);
  if (f.spec.type === 'select') {
    return f.op === 'is' ? v === f.value : v !== f.value;
  }
  if (f.spec.type === 'multiselect') {
    const set = f.value;
    const has = set.includes(v);
    return f.op === 'in' ? has : !has;
  }
  const num = typeof v === 'number' ? v : NaN;
  switch (f.op) {
    case 'gt': return num > f.value;
    case 'gte': return num >= f.value;
    case 'lt': return num < f.value;
    case 'lte': return num <= f.value;
    case 'eq': return Math.abs(num - f.value) < 1e-9;
    case 'between': return num >= f.value[0] && num <= f.value[1];
    default: return false;
  }
}

const BASE_ROW = ['ticker', 'name', 'country', 'region', 'sector', 'exchange', 'currency', 'price', 'changePct', 'marketCap', 'rating', 'score'];

function run(universe, req) {
  const catalog = filters(universe);
  const norm = normalizeRun(req, catalog);

  let matched = universe.stocks.filter((s) => {
    if (norm.filters.length === 0) return true;
    if (norm.combine === 'and') return norm.filters.every((f) => matches(s, f));
    return norm.filters.some((f) => matches(s, f));
  });

  if (norm.sort.length === 0) {
    matched = matched.slice().sort((a, b) => b.score - a.score);
  } else {
    matched = matched.slice().sort((a, b) => {
      for (const spec of norm.sort) {
        const av = extract(a, spec.slug);
        const bv = extract(b, spec.slug);
        let cmp = 0;
        if (typeof av === 'string') cmp = av.localeCompare(bv);
        else cmp = (av ?? -Infinity) - (bv ?? -Infinity);
        if (cmp !== 0) return spec.direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }

  const total = matched.length;
  const start = (norm.page - 1) * norm.pageSize;
  const pageRows = matched.slice(start, start + norm.pageSize);
  const columns = [...new Set([...BASE_ROW, ...norm.columns])];

  const rows = pageRows.map((s) => {
    const row = {};
    for (const c of columns) row[c] = extract(s, c);
    return row;
  });

  return {
    total: universe.stocks.length,
    matchedOfTotal: total,
    rows,
    page: norm.page,
    pageSize: norm.pageSize,
    totalPages: Math.max(Math.ceil(total / norm.pageSize), 1),
  };
}

module.exports = { filters, run };
