import Typeahead from './Typeahead.jsx';
import MarketStatus from './MarketStatus.jsx';
import { REGIONS, useRegion } from '../state.jsx';

export default function TopBar() {
  const { region, setRegion } = useRegion();
  return (
    <header className="topbar">
      <div className="topbar-title">
        Alpha Desk
        <span className="pro-badge">PRO+ · UNLOCKED</span>
      </div>
      <Typeahead placeholder="Search any stock (e.g. AAPL, RELIANCE)…" limit={8} />
      <div className="seg" title="Region filter for ProPicks strategies">
        {REGIONS.map((r) => (
          <button
            key={r.code}
            type="button"
            className={`seg-btn ${region === r.code ? 'on' : ''}`}
            onClick={() => setRegion(r.code)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <MarketStatus />
    </header>
  );
}
