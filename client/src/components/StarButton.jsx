// Star toggle used in picks tables: adds/removes the ticker from the
// primary watchlist (all lists are manageable on the Watchlist page).
import { useWatchlistActions } from '../state.jsx';
import { StarFilled, StarOutline } from './Icons.jsx';

export default function StarButton({ ticker }) {
  const { state, toggleFavorite } = useWatchlistActions();
  const on = state.watchlists.some((w) => w.tickers.includes(ticker));
  return (
    <button
      type="button"
      className={`star ${on ? 'on' : ''}`}
      title={on ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`}
      aria-label={on ? 'Remove from watchlist' : 'Add to watchlist'}
      onClick={(e) => { e.stopPropagation(); toggleFavorite(ticker); }}
    >
      {on ? <StarFilled /> : <StarOutline />}
    </button>
  );
}
