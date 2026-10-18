// "Previous Winning Stocks" carousel with scroll arrows.
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { fmtDate, fmtPct } from '../format.js';
import { ChevronLeft, ChevronRight } from './Icons.jsx';

export default function WinnersCarousel({ items = [] }) {
  const trackRef = useRef(null);
  const scrollBy = (dir) => {
    trackRef.current?.scrollBy({ left: dir * 460, behavior: 'smooth' });
  };
  if (!items.length) return null;
  return (
    <div className="carousel-wrap">
      <button type="button" className="carousel-nav left" aria-label="Scroll left" onClick={() => scrollBy(-1)}>
        <ChevronLeft />
      </button>
      <div className="carousel-track" ref={trackRef}>
        {items.map((w, i) => (
          <Link to={`/stock/${w.ticker}`} className="win-card" key={`${w.ticker}-${i}`}>
            <div className="tk">{w.ticker}</div>
            <div className="nm">{w.name}</div>
            <div className="dates">{fmtDate(w.dateAdded)} → {fmtDate(w.dateRemoved)}</div>
            <div className={`ret ${w.totalReturnPct >= 0 ? 'pos' : 'neg'}`}>{fmtPct(w.totalReturnPct)}</div>
          </Link>
        ))}
      </div>
      <button type="button" className="carousel-nav right" aria-label="Scroll right" onClick={() => scrollBy(1)}>
        <ChevronRight />
      </button>
    </div>
  );
}
