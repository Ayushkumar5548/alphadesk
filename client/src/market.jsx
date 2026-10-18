// Live market-data context: polls GET /api/market/status, exposes the latest
// status plus a `revision` that pages watch so they refetch when the server
// re-scores the universe. Never throws — a missing or failing endpoint simply
// reads as offline/simulated and the last good status is kept.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { getMarketStatus, refreshMarket } from './api.js';

const POLL_MS = 8000;

// Shape used before the first successful poll and for servers that predate the
// live market-data overlay. Everything reads as offline/simulated.
const OFFLINE_STATUS = {
  enabled: false,
  online: false,
  source: null,
  revision: 0,
  startedAt: null,
  lastRefreshAt: null,
  lastError: null,
  quotes: { done: 0, total: 0, asOf: null },
  history: { done: 0, total: 0, asOf: null },
  fundamentals: { done: 0, total: 0, asOf: null },
  coverage: { price: 0, fundamentals: 0, history: 0 },
  totals: { stocks: 0 },
  unresolvedCount: 0,
  unresolved: [],
};

const MarketContext = createContext(null);

function accept(s, setRevision) {
  if (!s || typeof s !== 'object') return;
  setRevision(typeof s.revision === 'number' ? s.revision : 0);
  return { ...OFFLINE_STATUS, ...s };
}

export function MarketProvider({ children }) {
  const [status, setStatus] = useState(OFFLINE_STATUS);
  const [revision, setRevision] = useState(0);

  // Poll on an interval, chaining the next tick so requests never overlap.
  useEffect(() => {
    let alive = true;
    let timer = null;
    const tick = async () => {
      try {
        const s = await getMarketStatus();
        if (alive) {
          const next = accept(s, setRevision);
          if (next) setStatus(next);
        }
      } catch {
        // Keep the last good status but mark the feed offline.
        if (alive) setStatus((prev) => ({ ...prev, online: false }));
      }
      if (alive) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Trigger POST /api/market/refresh and fold the returned status back in.
  const refresh = useCallback(async () => {
    let s = null;
    try {
      s = await refreshMarket();
    } catch {
      s = await getMarketStatus().catch(() => null);
    }
    const next = accept(s, setRevision);
    if (next) setStatus(next);
    return s;
  }, []);

  const value = useMemo(() => ({ status, revision, refresh }), [status, revision, refresh]);
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used inside MarketProvider');
  return ctx;
}
