// Hand-rolled SVG line/cumulative-return chart with hover tooltip.
// Used by the ProPicks simulator (strategy vs benchmark) and the stock page.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toDate, fmtDate } from '../format.js';

const PAD = { l: 60, r: 14, t: 14, b: 28 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortAxisDate(iso) {
  const d = toDate(iso);
  if (!d) return '';
  return `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

export default function LineChart({
  dates = [],
  series = [],
  mode = 'pct', // 'pct' = cumulative % from first point, 'value' = raw values
  height = 300,
  valueFormat = null, // (v, seriesIndex) => string for tooltip
  emptyText = 'No chart data available',
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(780);
  const [hover, setHover] = useState(null);
  const gradId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth || 780);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const n = Math.min(...series.map((s) => s.data.length), dates.length || Infinity);

  const toDisplay = useMemo(() => series.map((s) => {
    const slice = s.data.slice(0, n);
    if (mode === 'pct' && slice.length) {
      const base = slice[0] || 1;
      return slice.map((v) => (v / base) * 100 - 100);
    }
    return slice;
  }), [series, mode, n]);

  const bounds = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    toDisplay.forEach((arr) => arr.forEach((v) => {
      if (v < min) min = v;
      if (v > max) max = v;
    }));
    if (!Number.isFinite(min)) return { min: 0, max: 1 };
    if (mode === 'pct') { min = Math.min(min, 0); max = Math.max(max, 0); }
    const pad = (max - min) * 0.08 || 1;
    return { min: min - pad, max: max + pad };
  }, [toDisplay, mode]);

  if (!series.length || n < 2) {
    return (
      <div ref={wrapRef} className="empty" style={{ height }}>
        {emptyText}
      </div>
    );
  }

  const innerW = Math.max(60, width - PAD.l - PAD.r);
  const innerH = Math.max(60, height - PAD.t - PAD.b);
  const x = (i) => PAD.l + (i / (n - 1)) * innerW;
  const y = (v) => PAD.t + innerH - ((v - bounds.min) / (bounds.max - bounds.min)) * innerH;

  const pathFor = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

  const ticks = [];
  const tickCount = 5;
  for (let i = 0; i < tickCount; i++) {
    const v = bounds.min + ((bounds.max - bounds.min) * i) / (tickCount - 1);
    ticks.push(v);
  }
  const xLabelIdx = [];
  const xLabels = Math.min(6, n);
  for (let i = 0; i < xLabels; i++) xLabelIdx.push(Math.round((i / (xLabels - 1)) * (n - 1)));

  const fmtTick = (v) => (mode === 'pct'
    ? `${v > 0 ? '+' : ''}${Math.round(v)}%`
    : (valueFormat ? valueFormat(v, 0) : Math.round(v).toLocaleString('en-US')));

  const handleMove = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - PAD.l) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const fmtTooltip = (v, si) => {
    if (valueFormat) return valueFormat(v, si);
    return mode === 'pct'
      ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
      : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  const tipX = hover != null ? Math.min(Math.max(x(hover) - 80, 0), Math.max(0, width - 170)) : 0;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        width="100%"
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id={`fill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series[0].color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={series[0].color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} stroke="#1f2a41" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill="#6b7893">
              {fmtTick(v)}
            </text>
          </g>
        ))}
        {mode === 'pct' && bounds.min < 0 && bounds.max > 0 && (
          <line x1={PAD.l} x2={width - PAD.r} y1={y(0)} y2={y(0)} stroke="#33415c" strokeWidth="1" strokeDasharray="4 4" />
        )}
        {xLabelIdx.map((i) => (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="10.5" fill="#6b7893">
            {shortAxisDate(dates[i])}
          </text>
        ))}
        <path d={`${pathFor(toDisplay[0])}L${x(n - 1)},${y(Math.max(bounds.min, 0))}L${x(0)},${y(Math.max(bounds.min, 0))}Z`} fill={`url(#fill-${gradId})`} />
        {toDisplay.map((arr, si) => (
          <path
            key={si}
            d={pathFor(arr)}
            fill="none"
            stroke={series[si].color}
            strokeWidth={si === 0 ? 2.2 : 1.7}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={height - PAD.b} stroke="#3b4a6b" strokeWidth="1" strokeDasharray="3 3" />
            {toDisplay.map((arr, si) => (
              <circle key={si} cx={x(hover)} cy={y(arr[hover])} r="3.5" fill={series[si].color} stroke="#0a0e17" strokeWidth="1.5" />
            ))}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="chart-tooltip" style={{ left: tipX, top: 8 }}>
          <div className="tt-date">{fmtDate(dates[hover])}</div>
          {series.map((s, si) => (
            <div className="tt-row" key={si}>
              <span><span className="dot" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color, marginRight: 6 }} />{s.name}</span>
              <b>{fmtTooltip(toDisplay[si][hover], si)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact sparkline for watchlist rows. */
export function Sparkline({ data = [], width = 92, height = 26 }) {
  if (!data || data.length < 2) return <span className="muted">—</span>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const px = (i / (data.length - 1)) * (width - 2) + 1;
    const py = height - 2 - ((v - min) / span) * (height - 4);
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg className="spark" width={width} height={height}>
      <polyline points={pts} fill="none" stroke={up ? '#22c55e' : '#ef4444'} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
