// Saved Work: saved screeners, saved strategies, watchlists overview,
// notes, and a JSON export of the whole local state.
import { Link, useNavigate } from 'react-router-dom';
import { useAppState } from '../state.jsx';
import { fmtDateFull } from '../format.js';
import { EmptyState } from '../components/UI.jsx';
import { DownloadIcon, TrashIcon } from '../components/Icons.jsx';

export default function Saved() {
  const { state, update } = useAppState();
  const navigate = useNavigate();

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alphadesk-state.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const noteEntries = Object.entries(state.notes);

  return (
    <>
      <div className="toolbar">
        <div>
          <h1 style={{ marginBottom: 2 }}>Saved Work</h1>
          <p className="page-sub" style={{ margin: 0 }}>Everything you saved on this device — exportable as JSON.</p>
        </div>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={exportJson}>
          <DownloadIcon /> Export JSON
        </button>
      </div>

      <div className="panel saved-section">
        <div className="panel-head">
          <h2 className="panel-title">Saved Screeners ({state.savedScreeners.length})</h2>
          <span className="muted">load a screener straight back into the builder</span>
        </div>
        {state.savedScreeners.length === 0 && (
          <EmptyState title="No saved screeners" hint="Build criteria on the Screener page and hit “Save screener”." />
        )}
        {state.savedScreeners.map((s) => (
          <div className="saved-item" key={s.id}>
            <div className="grow">
              <div className="nm">{s.name}</div>
              <div className="meta">
                {(s.state?.filters?.length || 0)} filter{(s.state?.filters?.length || 0) === 1 ? '' : 's'} ·
                match {s.state?.combine === 'or' ? 'any' : 'all'} · saved {fmtDateFull(s.createdAt)}
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => navigate('/screener', { state: { loadScreener: s.state } })}>
              Load
            </button>
            <button
              type="button"
              className="icon-btn danger"
              onClick={() => update((st) => ({ ...st, savedScreeners: st.savedScreeners.filter((x) => x.id !== s.id) }))}
              title="Delete"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>

      <div className="panel saved-section">
        <div className="panel-head">
          <h2 className="panel-title">Saved Strategies ({state.savedStrategies.length})</h2>
          <span className="muted">saved from strategy detail pages</span>
        </div>
        {state.savedStrategies.length === 0 && (
          <EmptyState title="No saved strategies" hint="Open any strategy and press “Save strategy”." />
        )}
        {state.savedStrategies.map((slug) => (
          <div className="saved-item" key={slug}>
            <div className="grow">
              <Link className="nm" to={`/propicks/${slug}`}>{slug}</Link>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => navigate(`/propicks/${slug}`)}>Open</button>
            <button
              type="button"
              className="icon-btn danger"
              onClick={() => update((st) => ({ ...st, savedStrategies: st.savedStrategies.filter((x) => x !== slug) }))}
              title="Remove"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>

      <div className="panel saved-section">
        <div className="panel-head">
          <h2 className="panel-title">Watchlists ({state.watchlists.length})</h2>
          <span className="muted">{state.alerts.length} alert{state.alerts.length === 1 ? '' : 's'} across all lists</span>
        </div>
        {state.watchlists.length === 0 && (
          <EmptyState title="No watchlists" hint="Star a pick on ProPicks AI to create one automatically." />
        )}
        {state.watchlists.map((w) => (
          <div className="saved-item" key={w.id}>
            <div className="grow">
              <div className="nm">{w.name}</div>
              <div className="meta">
                {w.tickers.length
                  ? w.tickers.slice(0, 10).join(', ') + (w.tickers.length > 10 ? ` +${w.tickers.length - 10} more` : '')
                  : 'empty'}
              </div>
            </div>
            <span className="mono muted">{w.tickers.length}</span>
            <button type="button" className="btn btn-sm" onClick={() => navigate('/watchlist')}>Open</button>
          </div>
        ))}
      </div>

      <div className="panel saved-section mb0">
        <div className="panel-head">
          <h2 className="panel-title">Notes ({noteEntries.length})</h2>
          <span className="muted">private per-stock notes</span>
        </div>
        {noteEntries.length === 0 && (
          <EmptyState title="No notes yet" hint="Add notes from the Watchlist page’s note column." />
        )}
        {noteEntries.map(([key, text]) => {
          const ticker = key.startsWith('stock:') ? key.slice(6) : null;
          return (
            <div className="saved-item" key={key} style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                {ticker
                  ? <Link className="nm mono" to={`/stock/${ticker}`}>{ticker}</Link>
                  : <span className="nm">{key}</span>}
                <div className="note-item">{text}</div>
              </div>
              <button
                type="button"
                className="icon-btn danger"
                title="Delete note"
                onClick={() => update((st) => {
                  const notes = { ...st.notes };
                  delete notes[key];
                  return { ...st, notes };
                })}
              >
                <TrashIcon />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
