'use strict';
// Deterministic economic calendar. Events are generated on demand per
// (year, month) so any date range can be served. All values are simulated.
const { rngFor, rr, rint, clamp, round, hash32, pad2 } = require('./prng');

// Each template: how often it fires within a month, its window, and value range.
const TEMPLATES = [
  { key: 'fed-rate', indicator: 'Fed Interest Rate Decision', country: 'US', importance: 3, unit: '%', months: [1, 3, 5, 6, 9, 10, 12], day: [15, 20], time: '18:00', range: [3.0, 5.0], dp: 2 },
  { key: 'ecb-rate', indicator: 'ECB Interest Rate Decision', country: 'EU', importance: 3, unit: '%', months: [1, 3, 6, 9, 12], day: [14, 22], time: '12:15', range: [2.0, 4.0], dp: 2 },
  { key: 'rbi-rate', indicator: 'RBI Policy Rate', country: 'IN', importance: 3, unit: '%', months: [2, 4, 6, 8, 10, 12], day: [6, 12], time: '11:00', range: [5.5, 7.0], dp: 2 },
  { key: 'boe-rate', indicator: 'Bank of England Rate Decision', country: 'GB', importance: 3, unit: '%', months: [2, 3, 5, 6, 8, 9, 11, 12], day: [5, 12], time: '12:00', range: [3.5, 5.5], dp: 2 },
  { key: 'boc-rate', indicator: 'Bank of Canada Rate Decision', country: 'CA', importance: 3, unit: '%', months: [1, 3, 4, 6, 7, 9, 10, 12], day: [14, 22], time: '14:00', range: [2.5, 5.0], dp: 2 },
  { key: 'boj-rate', indicator: 'Bank of Japan Rate Decision', country: 'JP', importance: 3, unit: '%', months: [1, 3, 4, 6, 7, 9, 10, 12], day: [14, 22], time: '03:00', range: [0.0, 1.5], dp: 2 },
  { key: 'us-cpi', indicator: 'US CPI YoY', country: 'US', importance: 3, unit: '%', every: 1, day: [10, 14], time: '12:30', range: [1.8, 3.8], dp: 1 },
  { key: 'us-core-cpi', indicator: 'US Core CPI MoM', country: 'US', importance: 3, unit: '%', every: 1, day: [10, 14], time: '12:30', range: [0.1, 0.5], dp: 1 },
  { key: 'us-nfp', indicator: 'Non-Farm Payrolls', country: 'US', importance: 3, unit: 'K', firstFriday: true, time: '12:30', range: [80, 330], dp: 0 },
  { key: 'us-unemp', indicator: 'US Unemployment Rate', country: 'US', importance: 3, unit: '%', firstFriday: true, time: '12:30', range: [3.4, 4.8], dp: 1 },
  { key: 'us-gdp', indicator: 'US GDP QoQ (Advance)', country: 'US', importance: 2, unit: '%', months: [1, 4, 7, 10], day: [24, 30], time: '12:30', range: [0.5, 3.5], dp: 1 },
  { key: 'us-retail', indicator: 'US Retail Sales MoM', country: 'US', importance: 2, unit: '%', every: 1, day: [15, 18], time: '12:30', range: [-0.6, 1.2], dp: 1 },
  { key: 'us-ppi', indicator: 'US PPI YoY', country: 'US', importance: 2, unit: '%', every: 1, day: [12, 17], time: '12:30', range: [0.5, 3.5], dp: 1 },
  { key: 'us-claims', indicator: 'US Initial Jobless Claims', country: 'US', importance: 1, unit: 'K', weeks: 4, time: '12:30', range: [180, 280], dp: 0 },
  { key: 'us-pmi-m', indicator: 'US Manufacturing PMI', country: 'US', importance: 2, unit: '', every: 1, day: [1, 3], time: '14:00', range: [46, 57], dp: 1 },
  { key: 'us-pmi-s', indicator: 'US Services PMI', country: 'US', importance: 2, unit: '', every: 1, day: [3, 5], time: '14:00', range: [48, 60], dp: 1 },
  { key: 'us-confidence', indicator: 'US Consumer Confidence', country: 'US', importance: 2, unit: '', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], day: [24, 28], time: '14:00', range: [90, 125], dp: 1 },
  { key: 'eu-cpi', indicator: 'Eurozone Inflation Rate YoY', country: 'EU', importance: 3, unit: '%', every: 1, day: [18, 22], time: '10:00', range: [1.2, 3.5], dp: 1 },
  { key: 'eu-gdp', indicator: 'Eurozone GDP QoQ', country: 'EU', importance: 2, unit: '%', months: [1, 4, 7, 10], day: [14, 18], time: '10:00', range: [-0.5, 1.0], dp: 1 },
  { key: 'eu-pmi-m', indicator: 'Eurozone Manufacturing PMI', country: 'EU', importance: 2, unit: '', every: 1, day: [1, 3], time: '09:00', range: [44, 57], dp: 1 },
  { key: 'eu-pmi-s', indicator: 'Eurozone Services PMI', country: 'EU', importance: 2, unit: '', every: 1, day: [3, 5], time: '09:00', range: [46, 60], dp: 1 },
  { key: 'eu-ip', indicator: 'Eurozone Industrial Production MoM', country: 'EU', importance: 2, unit: '%', every: 1, day: [12, 16], time: '10:00', range: [-1.5, 1.5], dp: 1 },
  { key: 'in-cpi', indicator: 'India CPI YoY', country: 'IN', importance: 3, unit: '%', every: 1, day: [10, 14], time: '17:30', range: [2.5, 6.5], dp: 1 },
  { key: 'in-gdp', indicator: 'India GDP QoQ', country: 'IN', importance: 2, unit: '%', months: [2, 5, 8, 11], day: [26, 30], time: '17:30', range: [1.0, 4.0], dp: 1 },
  { key: 'in-pmi-m', indicator: 'India Manufacturing PMI', country: 'IN', importance: 2, unit: '', every: 1, day: [1, 3], time: '10:00', range: [48, 58], dp: 1 },
  { key: 'gb-cpi', indicator: 'UK CPI YoY', country: 'GB', importance: 3, unit: '%', every: 1, day: [14, 20], time: '07:00', range: [1.5, 4.5], dp: 1 },
  { key: 'ca-jobs', indicator: 'Canada Employment Change', country: 'CA', importance: 2, unit: 'K', firstFriday: true, time: '12:30', range: [-60, 120], dp: 0 },
  { key: 'jp-cpi', indicator: 'Japan CPI YoY', country: 'JP', importance: 2, unit: '%', every: 1, day: [18, 22], time: '23:30', range: [-0.5, 4.0], dp: 1 },
  { key: 'cn-pmi', indicator: 'China Manufacturing PMI', country: 'CN', importance: 2, unit: '', every: 1, day: [30, 31], time: '01:00', range: [47, 52], dp: 1 },
  { key: 'us-trade', indicator: 'US Trade Balance', country: 'US', importance: 1, unit: '$B', every: 1, day: [18, 24], time: '12:30', range: [-95, -55], dp: 1 },
];

const COUNTRIES = new Set(['US', 'EU', 'IN', 'GB', 'CA', 'JP', 'CN']);

function firstFriday(y, m) {
  const d = new Date(y, m - 1, 1);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  return d.getDate();
}

function dateFor(y, m, day) {
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(Math.min(day, last))}`;
}

// Deterministic value chain per template key: value depends only on (key, ym).
function valueAt(key, spec, ym, monthIdx) {
  const rng = rngFor('cal-val', key, ym);
  const [lo, hi] = spec.range;
  return round(rr(rng, lo, hi), spec.dp);
}

function prevReleaseYm(key, ym) {
  // Monthly series -> previous month; quarterly templates handled by caller months.
  const [y, m] = ym.split('-').map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${pad2(pm)}`;
}

// Generate all events for a single month (deterministic per ym).
function monthEvents(ym) {
  const [y, m] = ym.split('-').map(Number);
  const events = [];
  let seq = 0;
  const push = (t, dateStr, previous, forecast, actual) => {
    events.push({
      id: `${t.key}-${dateStr}-${seq++}`,
      date: dateStr,
      country: t.country,
      importance: t.importance,
      indicator: t.indicator,
      previous,
      forecast,
      actual,
      unit: t.unit,
      time: t.time,
    });
  };

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  for (const t of TEMPLATES) {
    const rng = rngFor('cal-plan', t.key, ym);
    const dates = [];

    if (t.firstFriday) {
      dates.push(dateFor(y, m, firstFriday(y, m)));
    } else if (t.weeks) {
      // weekly releases: 4-5 occurrences, roughly one per week
      const starts = [2, 9, 16, 23];
      if (m % 2 === 0) starts.push(28);
      for (const s of starts) dates.push(dateFor(y, m, s + Math.floor(rr(rng, 0, 2))));
    } else if (t.months && !t.every) {
      if (t.months.includes(m)) {
        const [d0, d1] = t.day;
        dates.push(dateFor(y, m, rint(rng, d0, d1)));
      }
    } else {
      // monthly (or every-month) release
      const [d0, d1] = t.day;
      dates.push(dateFor(y, m, rint(rng, d0, d1)));
    }

    for (const dateStr of dates) {
      const current = valueAt(t.key, t, ym, m);
      const prevYm = prevReleaseYm(t.key, ym);
      const previous = valueAt(t.key, t, prevYm, m - 1);
      const forecast = round(previous + (current - previous) * rr(rng, 0.3, 0.8), t.dp);
      const isPast = dateStr < todayStr;
      const actual = isPast ? round(current, t.dp) : null;
      push(t, dateStr, previous, forecast, actual);
    }
  }

  // NOTE: for past events `actual` carries the realized value; `forecast` keeps
  // a plausible consensus. Sort by date then importance.
  events.sort((a, b) => (a.date === b.date ? b.importance - a.importance : a.date < b.date ? -1 : 1));
  return events;
}

// Query with filters. from/to are "YYYY-MM-DD"; window capped at 400 days.
function query({ from, to, country, importance }) {
  const dayMs = 86400000;
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  const span = Math.round((end - start) / dayMs);
  const maxSpan = 400;
  if (span > maxSpan) {
    const err = new Error(`Date range too large (max ${maxSpan} days)`);
    err.status = 400;
    err.code = 'RANGE_TOO_LARGE';
    throw err;
  }

  // Collect unique YYYY-MM keys touched by the range.
  const months = new Set();
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const stop = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= stop) {
    months.add(`${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}`);
    cur.setMonth(cur.getMonth() + 1);
  }

  let events = [];
  for (const ym of [...months].sort()) {
    for (const ev of monthEvents(ym)) {
      if (ev.date < from || ev.date > to) continue;
      if (country && ev.country !== country) continue;
      if (importance && ev.importance < importance) continue;
      events.push(ev);
    }
  }
  events.sort((a, b) => (a.date === b.date ? b.importance - a.importance : a.date < b.date ? -1 : 1));
  return events;
}

// Upcoming events starting from today (used by the assistant).
function upcoming(n, country) {
  const now = new Date();
  const from = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const end = new Date(now.getTime() + 120 * 86400000);
  const to = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
  return query({ from, to, country, importance: undefined }).slice(0, n);
}

module.exports = { query, upcoming, COUNTRIES, monthEvents };
