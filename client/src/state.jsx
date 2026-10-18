// App-level React contexts: persisted user state (watchlists, alerts,
// saved screeners/strategies, notes) and the top-bar region selector.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getState, putState } from './api.js';

const StateContext = createContext(null);
const RegionContext = createContext(null);

export const REGIONS = [
  { code: 'ALL', label: 'All' },
  { code: 'US', label: 'US' },
  { code: 'IN', label: 'India' },
  { code: 'EU', label: 'Europe' },
];

/** Region code → strategy market names kept in the ProPicks list. */
export const REGION_MARKETS = {
  ALL: null, // no filter
  US: ['US'],
  IN: ['India'],
  EU: ['Europe', 'UK'],
};

function defaultState() {
  return {
    watchlists: [{ id: 'wl-1', name: 'My Watchlist', tickers: [], createdAt: new Date().toISOString() }],
    alerts: [],
    savedScreeners: [],
    savedStrategies: [],
    notes: {},
  };
}

export function StateProvider({ children }) {
  const [state, setState] = useState(defaultState);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const saveTimer = useRef(null);

  useEffect(() => {
    let alive = true;
    getState()
      .then((s) => {
        if (!alive) return;
        setState({ ...defaultState(), ...s });
        setStatus('ready');
      })
      .catch(() => {
        if (alive) setStatus('ready'); // work with defaults in memory
      });
    return () => { alive = false; };
  }, []);

  // Debounced persistence of the full state (single local user, no auth).
  const persist = useCallback((next) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      putState(next).catch(() => { /* offline: keep working in memory */ });
    }, 350);
  }, []);

  const update = useCallback((fn) => {
    setState((prev) => {
      const next = typeof fn === 'function' ? fn(prev) : { ...prev, ...fn };
      persist(next);
      return next;
    });
  }, [persist]);

  const value = useMemo(() => ({ state, update, status }), [state, update, status]);
  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error('useAppState must be used inside StateProvider');
  return ctx;
}

export function RegionProvider({ children }) {
  const [region, setRegion] = useState('ALL');
  const value = useMemo(() => ({ region, setRegion }), [region]);
  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion() {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error('useRegion must be used inside RegionProvider');
  return ctx;
}

/* ------------------------- shared state helpers ---------------------------- */

export function useWatchlistActions() {
  const { state, update } = useAppState();

  const ensureWatchlist = useCallback(() => {
    let id = null;
    update((s) => {
      if (s.watchlists.length === 0) {
        const wl = { id: `wl-${Date.now()}`, name: 'My Watchlist', tickers: [], createdAt: new Date().toISOString() };
        id = wl.id;
        return { ...s, watchlists: [wl] };
      }
      id = s.watchlists[0].id;
      return s;
    });
    return id;
  }, [update]);

  const addTicker = useCallback((watchlistId, ticker) => {
    update((s) => ({
      ...s,
      watchlists: s.watchlists.map((w) => (w.id === watchlistId && !w.tickers.includes(ticker)
        ? { ...w, tickers: [...w.tickers, ticker] } : w)),
    }));
  }, [update]);

  const removeTicker = useCallback((watchlistId, ticker) => {
    update((s) => ({
      ...s,
      watchlists: s.watchlists.map((w) => (w.id === watchlistId
        ? { ...w, tickers: w.tickers.filter((t) => t !== ticker) } : w)),
    }));
  }, [update]);

  const createWatchlist = useCallback((name) => {
    const id = `wl-${Date.now()}`;
    update((s) => ({ ...s, watchlists: [...s.watchlists, { id, name, tickers: [], createdAt: new Date().toISOString() }] }));
    return id;
  }, [update]);

  const renameWatchlist = useCallback((id, name) => {
    update((s) => ({ ...s, watchlists: s.watchlists.map((w) => (w.id === id ? { ...w, name } : w)) }));
  }, [update]);

  const deleteWatchlist = useCallback((id) => {
    update((s) => ({ ...s, watchlists: s.watchlists.filter((w) => w.id !== id) }));
  }, [update]);

  const toggleFavorite = useCallback((ticker) => {
    // Used by the picks-table star: toggles membership in the first watchlist.
    update((s) => {
      if (s.watchlists.length === 0) {
        return { ...s, watchlists: [{ id: `wl-${Date.now()}`, name: 'My Watchlist', tickers: [ticker], createdAt: new Date().toISOString() }] };
      }
      const first = s.watchlists[0];
      const has = first.tickers.includes(ticker);
      return {
        ...s,
        watchlists: s.watchlists.map((w) => (w.id === first.id
          ? { ...w, tickers: has ? w.tickers.filter((t) => t !== ticker) : [...w.tickers, ticker] }
          : w)),
      };
    });
  }, [update]);

  return { state, ensureWatchlist, addTicker, removeTicker, createWatchlist, renameWatchlist, deleteWatchlist, toggleFavorite };
}
