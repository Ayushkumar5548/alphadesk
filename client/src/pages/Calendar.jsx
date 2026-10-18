// Economic Calendar: month navigation, country + importance filters,
// rows colored by importance with actual vs forecast vs previous.
import { useEffect, useState } from 'react';
import { getCalendar } from '../api.js';
import { fmtMonthYear, isoDate, fmtDayDate } from '../format.js';
import { Spinner, EmptyState } from '../components/UI.jsx';
import { ChevronLeft, ChevronRight } from '../components/Icons.jsx';

const COUNTRIES = [
  { code: '', name: 'All countries' },
  { code: 'US', name: 'United States' },
  { code: 'EU', name: 'Euro Area' },
  { code: 'IN', name: 'India' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
];

const IMPORTANCE = [
  { value: '', label: 'All importance' },
  { value: '3', label: '●●● High impact' },
  { value: '2', label: '●● Medium impact' },
  { value: '1', label: '● Low impact' },
];

function ImpDots({ level }) {
  return (
    <span className="imp-dots" title={['Low', 'Medium', 'High'][level - 1]}>
      {[1, 2, 3].map((i) => <span key={i} className={`imp-dot ${i <= level ? `i${level}` : ''}`} />)}
    </span>
  );
}

export default function CalendarPage() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [country, setCountry] = useState('');
  const [importance, setImportance] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const from = isoDate(new Date(month.getFullYear(), month.getMonth(), 1));
    const to = isoDate(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    getCalendar({ from, to, country, importance })
      .then((r) => { if (alive) setEvents(r.events || []); })
      .catch(() => { if (alive) setEvents([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month, country, importance]);

  const shift = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <>
      <h1>Economic Calendar</h1>
      <p className="page-sub">
        Rate decisions, inflation, jobs and growth prints — simulated but deterministic.
      </p>

      <div className="panel">
        <div className="toolbar">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></button>
          <h2 style={{ margin: 0, minWidth: 170, textAlign: 'center' }}>{fmtMonthYear(month)}</h2>
          <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { const n = new Date(); setMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }}
          >
            Today
          </button>
          <div className="spacer" />
          <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <select className="select" value={importance} onChange={(e) => setImportance(e.target.value)}>
            {IMPORTANCE.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>

        {loading && <Spinner label="Loading calendar…" />}
        {!loading && events.length === 0 && (
          <EmptyState
            title="No events"
            hint="No scheduled events for this month with the current filters."
            action={(
              <button type="button" className="btn btn-sm" onClick={() => { setCountry(''); setImportance(''); }}>
                Clear filters
              </button>
            )}
          />
        )}
        {!loading && events.length > 0 && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Country</th>
                  <th>Impact</th>
                  <th>Indicator</th>
                  <th className="num">Previous</th>
                  <th className="num">Forecast</th>
                  <th className="num">Actual</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className={`imp-${e.importance}`}>
                    <td className="cal-day">{fmtDayDate(e.date)}</td>
                    <td className="mono muted">{e.time || '—'}</td>
                    <td><span className="sector-badge" title={e.countryName || e.country}>{e.country}</span></td>
                    <td><ImpDots level={e.importance} /></td>
                    <td>{e.indicator}</td>
                    <td className="num prev-val">{e.previous ?? '—'}{e.unit || ''}</td>
                    <td className="num forecast-val">{e.forecast ?? '—'}{e.unit || ''}</td>
                    <td className="num">
                      {e.actual == null
                        ? <span className="muted">—</span>
                        : <span className="actual-val">{e.actual}{e.unit || ''}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
