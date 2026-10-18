// Watchlists: multiple named lists, add via search typeahead, live quotes
// with sparklines, per-ticker alerts (price above/below) and notes.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getQuotes } from '../api.js';
import { useWatchlistActions } from '../state.jsx';
import { useMarket } from '../market.jsx';
import { fmtPrice, fmtPct, signClass } from '../format.js';
import Typeahead from '../components/Typeahead.jsx';
import { Sparkline } from '../components/LineChart.jsx';
import { Spinner, EmptyState } from '../components/UI.jsx';
import { BellIcon, NoteIcon, TrashIcon, XIcon } from '../components/Icons.jsx';

function AlertEditor({ ticker, onSave, onDone }) {
  const [condition, setCondition] = useState('above');
  const [value, setValue] = useState('');
  return (
    <span className="inline-form">
      <BellIcon />
      <select className="select" value={condition} onChange={(e) => setCondition(e.target.value)} style={{ padding: '5px 8px' }}>
        <option value="above">Price above</option>
        <option value="below">Price below</option>
      </select>
      <input
        className="input num"
        type="number"
        style={{ width: 110, padding: '5px 8px' }}
        placeholder="value"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && value) { onSave(condition, Number(value)); } }}
      />
      <button type="button" className="btn btn-sm btn-primary" disabled={!value} onClick={() => onSave(condition, Number(value))}>Set</button>
      <button type="button" className="btn btn-sm" onClick={onDone}>Cancel</button>
      <span className="muted" style={{ fontSize: 12 }}>for {ticker}</span>
    </span>
  );
}

export default function Watchlist() {
  const {
    state, update, createWatchlist, renameWatchlist, deleteWatchlist, addTicker, removeTicker,
  } = useWatchlistActions();
  const { revision } = useMarket();
  const [activeId, setActiveId] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [editingAlert, setEditingAlert] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const quotesKey = useRef('');

  const lists = state.watchlists;
  const active = useMemo(
    () => lists.find((w) => w.id === activeId) || lists[0] || null,
    [lists, activeId],
  );

  useEffect(() => {
    if (lists.length && !lists.some((w) => w.id === activeId)) setActiveId(lists[0].id);
  }, [lists, activeId]);

  useEffect(() => {
    const tickers = active?.tickers || [];
    if (!tickers.length) { quotesKey.current = ''; setQuotes({}); return undefined; }
    let alive = true;
    // Only show the loading state for a genuinely new list — a market
    // re-score refreshes the same tickers in place.
    const key = tickers.join(',');
    if (quotesKey.current !== key) setQuotesLoading(true);
    getQuotes(tickers)
      .then((r) => {
        if (!alive) return;
        quotesKey.current = key;
        const map = {};
        (r.quotes || []).forEach((q) => { map[q.ticker] = q; });
        setQuotes(map);
      })
      .catch(() => { if (alive) setQuotes({}); })
      .finally(() => { if (alive) setQuotesLoading(false); });
    return () => { alive = false; };
  }, [active?.tickers, revision]);

  if (!lists.length) {
    return (
      <>
        <h1>Watchlists</h1>
        <div className="panel">
          <EmptyState
            title="No watchlists yet"
            hint="Create one to start tracking stocks, alerts and notes."
            action={(
              <button type="button" className="btn btn-primary" onClick={() => createWatchlist('My Watchlist')}>
                Create watchlist
              </button>
            )}
          />
        </div>
      </>
    );
  }

  const alertsFor = (ticker) => state.alerts.filter((a) => a.ticker === ticker);

  const saveAlert = (ticker, condition, value) => {
    update((s) => ({
      ...s,
      alerts: [...s.alerts, {
        id: `al-${Date.now()}`, ticker, type: 'price', condition, value,
        createdAt: new Date().toISOString(), active: true,
      }],
    }));
    setEditingAlert(null);
  };

  const openNote = (ticker) => {
    setEditingNote(ticker);
    setNoteDraft(state.notes[`stock:${ticker}`] || '');
  };

  return (
    <>
      <h1>Watchlists</h1>
      <p className="page-sub">
        Track picks, set price alerts and keep private notes. {lists.length} list{lists.length === 1 ? '' : 's'} ·
        {' '}{state.alerts.filter((a) => a.active).length} active alert{state.alerts.filter((a) => a.active).length === 1 ? '' : 's'}.
      </p>

      <div className="wl-layout">
        <div>
          <div className="wl-lists">
            {lists.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`wl-item ${active?.id === w.id ? 'on' : ''}`}
                onClick={() => setActiveId(w.id)}
              >
                {w.name}
                <span className="count">{w.tickers.length}</span>
              </button>
            ))}
          </div>
          <div className="mt inline-form">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                const name = window.prompt('Name the new watchlist', `Watchlist ${lists.length + 1}`);
                if (name) setActiveId(createWatchlist(name));
              }}
            >
              + New list
            </button>
            {active && (
              <>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    const name = window.prompt('Rename watchlist', active.name);
                    if (name) renameWatchlist(active.id, name);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => {
                    if (window.confirm(`Delete "${active.name}"?`)) deleteWatchlist(active.id);
                  }}
                >
                  <TrashIcon />
                </button>
              </>
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">{active?.name}</h2>
              <span className="muted">{active?.tickers.length} stocks</span>
            </div>
            <div style={{ maxWidth: 460, marginBottom: 6 }}>
              <Typeahead
                placeholder="Add a stock by ticker or name…"
                limit={6}
                onSelect={(item) => addTicker(active.id, item.ticker)}
              />
            </div>

            {!active.tickers.length && (
              <EmptyState
                title="This list is empty"
                hint="Use the box above to add stocks, or star picks on the ProPicks AI page."
              />
            )}
            {active.tickers.length > 0 && quotesLoading && <Spinner label="Loading quotes…" />}
            {active.tickers.length > 0 && !quotesLoading && (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th className="num">Price</th>
                      <th className="num">Change</th>
                      <th>Trend</th>
                      <th>Alerts</th>
                      <th>Note</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {active.tickers.map((t) => {
                      const q = quotes[t];
                      const alerts = alertsFor(t);
                      return (
                        <Fragment key={t}>
                          <tr>
                            <td>
                              <Link to={`/stock/${t}`} className="mono" style={{ fontWeight: 700 }}>{t}</Link>
                              {q?.live === true && <span className="live-dot" title="Live price from Yahoo Finance" />}
                            </td>
                            <td className="num">{q ? fmtPrice(q.price) : '—'}</td>
                            <td className={`num ${q ? signClass(q.changePct) : 'muted'}`}>{q ? fmtPct(q.changePct) : '—'}</td>
                            <td>{q ? <Sparkline data={q.spark} /> : '—'}</td>
                            <td>
                              {alerts.map((a) => (
                                <span
                                  key={a.id}
                                  className={`alert-chip ${a.active ? '' : 'off'}`}
                                  title="Click to enable/disable"
                                  onClick={() => update((s) => ({
                                    ...s,
                                    alerts: s.alerts.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)),
                                  }))}
                                >
                                  {a.condition === 'above' ? '▲' : '▼'} {a.value}
                                  <button
                                    type="button"
                                    className="linklike"
                                    style={{ color: 'inherit' }}
                                    title="Delete alert"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      update((s) => ({ ...s, alerts: s.alerts.filter((x) => x.id !== a.id) }));
                                    }}
                                  >
                                    <XIcon />
                                  </button>
                                </span>
                              ))}
                              {editingAlert === t ? (
                                <AlertEditor ticker={t} onDone={() => setEditingAlert(null)} onSave={(c, v) => saveAlert(t, c, v)} />
                              ) : (
                                <button type="button" className="linklike muted" onClick={() => setEditingAlert(t)}>
                                  + alert
                                </button>
                              )}
                            </td>
                            <td className="note-cell">
                              {editingNote === t ? (
                                <span className="inline-form" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                  <textarea
                                    className="input"
                                    rows={2}
                                    placeholder={`Note about ${t}…`}
                                    value={noteDraft}
                                    autoFocus
                                    onChange={(e) => setNoteDraft(e.target.value)}
                                  />
                                  <span className="inline-form">
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-primary"
                                      onClick={() => {
                                        update((s) => {
                                          const notes = { ...s.notes };
                                          const key = `stock:${t}`;
                                          if (noteDraft.trim()) notes[key] = noteDraft.trim();
                                          else delete notes[key];
                                          return { ...s, notes };
                                        });
                                        setEditingNote(null);
                                      }}
                                    >
                                      Save note
                                    </button>
                                    <button type="button" className="btn btn-sm" onClick={() => setEditingNote(null)}>Cancel</button>
                                  </span>
                                </span>
                              ) : (
                                <button type="button" className="linklike" onClick={() => openNote(t)} title="Edit note">
                                  {state.notes[`stock:${t}`]
                                    ? <span className="note-preview"><NoteIcon style={{ verticalAlign: -2 }} /> {state.notes[`stock:${t}`]}</span>
                                    : <span className="muted"><NoteIcon /></span>}
                                </button>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="icon-btn danger"
                                title={`Remove ${t} from ${active.name}`}
                                onClick={() => removeTicker(active.id, t)}
                              >
                                <XIcon />
                              </button>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
