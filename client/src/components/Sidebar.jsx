import { NavLink } from 'react-router-dom';
import {
  WatchIcon, PicksIcon, FilterIcon, CalendarIcon, ChartIcon, SavedIcon, AiIcon,
} from './Icons.jsx';

const ITEMS = [
  { to: '/watchlist', label: 'Watchlists', Icon: WatchIcon },
  { to: '/propicks', label: 'ProPicks AI', Icon: PicksIcon },
  { to: '/screener', label: 'Screener', Icon: FilterIcon },
  { to: '/calendar', label: 'Economic Calendar', Icon: CalendarIcon },
  { to: '/stock/AAPL', label: 'Charts', Icon: ChartIcon, end: false },
  { to: '/saved', label: 'Saved Work', Icon: SavedIcon },
  { to: '/funds', label: 'Mutual Funds', Icon: ChartIcon },
  { to: '/assistant', label: 'Warren AI', Icon: AiIcon },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <NavLink to="/propicks" className="brand">
        <span className="brand-mark">α</span>
        <span>AlphaDesk <small>PRO+</small></span>
      </NavLink>
      <nav className="side-nav">
        {ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={label}
            to={to}
            className={({ isActive }) => `side-link ${isActive && !to.startsWith('/stock') ? 'active' : ''}`}
          >
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="side-foot">
        AlphaDesk · live prices via Yahoo Finance.<br />
        No paywalls, no real money.
      </div>
    </aside>
  );
}
