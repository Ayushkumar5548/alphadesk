// Compact, consistent number/date formatting for the whole app.

export function fmtPct(n, digits = 1) {
  if (n == null || Number.isNaN(+n)) return '—';
  const v = +n;
  if (v === 0) return `0.${'0'.repeat(digits)}%`;
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export function fmtPctPlain(n, digits = 1) {
  if (n == null || Number.isNaN(+n)) return '—';
  return `${(+n).toFixed(digits)}%`;
}

export function fmtCompact(n, prefix = '$') {
  if (n == null || Number.isNaN(+n)) return '—';
  const v = Math.abs(+n);
  const sign = +n < 0 ? '-' : '';
  if (v >= 1e12) return `${sign}${prefix}${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `${sign}${prefix}${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${sign}${prefix}${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${sign}${prefix}${(v / 1e3).toFixed(1)}K`;
  return `${sign}${prefix}${v.toFixed(v >= 100 ? 0 : 2)}`;
}

const CURRENCY_SYMBOLS = {
  USD: '$', INR: '₹', GBP: '£', EUR: '€', CAD: 'CA$', JPY: '¥',
  SGD: 'S$', TWD: 'NT$', CNY: 'CN¥', HKD: 'HK$', AUD: 'A$',
};

export function currencySymbol(cur) {
  return CURRENCY_SYMBOLS[cur] || '$';
}

export function fmtPrice(n, cur = 'USD') {
  if (n == null || Number.isNaN(+n)) return '—';
  const v = +n;
  const digits = Math.abs(v) >= 1000 ? 0 : 2;
  const sign = v < 0 ? '-' : '';
  return `${sign}${currencySymbol(cur)}${Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function fmtNum(n, digits) {
  if (n == null || Number.isNaN(+n)) return '—';
  const v = +n;
  const d = digits != null ? digits : Number.isInteger(v) ? 0 : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtMoney(n, cur = 'USD') {
  if (n == null || Number.isNaN(+n)) return '—';
  const v = +n;
  return `${v < 0 ? '-' : ''}${currencySymbol(cur)}${Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function toDate(iso) {
  if (!iso) return null;
  return new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso);
}

export function fmtDate(iso, opts = {}) {
  const d = toDate(iso);
  if (!d || Number.isNaN(d.getTime())) return '—';
  const day = d.getDate();
  const year = opts.year === false ? '' : `, ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]} ${day}${year}`;
}

export function fmtDateFull(iso) {
  const d = toDate(iso);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function fmtDayDate(iso) {
  const d = toDate(iso);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function fmtMonthYear(d) {
  const date = d instanceof Date ? d : toDate(d);
  if (!date) return '—';
  return `${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`;
}

export function firstOfNextMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export function firstOfThisMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isoDate(d) {
  const date = d instanceof Date ? d : toDate(d);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${day}`;
}

export function signClass(n) {
  if (n == null || Number.isNaN(+n)) return 'muted';
  return +n > 0 ? 'pos' : +n < 0 ? 'neg' : 'flat';
}

export function ratingClass(r) {
  const v = String(r || '').toLowerCase();
  if (v.includes('outperform')) return 'pos';
  if (v.includes('under')) return 'neg';
  return 'amber';
}

export function titleCase(s) {
  return String(s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
