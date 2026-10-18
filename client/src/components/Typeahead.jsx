// Debounced search typeahead hitting GET /api/stocks?q=.
// Used by the top bar, the Watchlist add-stock box, and elsewhere.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchStocks } from '../api.js';
import { fmtPrice, fmtPct } from '../format.js';
import { SearchIcon } from './Icons.jsx';

export default function Typeahead({
  placeholder = 'Search stocks…',
  limit = 8,
  onSelect = null,
  autoFocus = false,
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setItems([]); setLoading(false); return undefined; }
    setLoading(true);
    let alive = true;
    const timer = setTimeout(() => {
      searchStocks(term, limit)
        .then((res) => { if (alive) { setItems(Array.isArray(res) ? res : []); setLoading(false); } })
        .catch(() => { if (alive) { setItems([]); setLoading(false); } });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [q, limit]);

  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const choose = (item) => {
    setOpen(false);
    setQ('');
    setItems([]);
    if (onSelect) onSelect(item);
    else navigate(`/stock/${item.ticker}`);
  };

  const show = open && q.trim().length > 0;

  return (
    <div className="search-wrap" ref={boxRef}>
      <span className="search-icon"><SearchIcon /></span>
      <input
        className="search-input"
        type="text"
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && items.length) choose(items[0]);
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {show && (
        <div className="search-drop">
          {loading && <div className="search-empty">Searching…</div>}
          {!loading && items.length === 0 && <div className="search-empty">No matches</div>}
          {!loading && items.map((it) => (
            <button type="button" className="search-item" key={it.ticker} onClick={() => choose(it)}>
              <span className="tk">
                {it.ticker}
                {it.live === true && <span className="live-dot" title="Live price from Yahoo Finance" />}
              </span>
              <span className="nm">{it.name}</span>
              <span className="nowrap mono" style={{ fontSize: 12 }}>{fmtPrice(it.price, it.currency)}</span>
              <span className={`nowrap mono ${it.changePct > 0 ? 'pos' : it.changePct < 0 ? 'neg' : 'muted'}`} style={{ fontSize: 12 }}>
                {fmtPct(it.changePct)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
