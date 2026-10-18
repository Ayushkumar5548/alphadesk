// ProPicks AI landing page — hero, featured strategy with picks table,
// performance simulator, previous winners carousel, strategy cards,
// and the how-to strip.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStrategies, getStrategy, getFeatured } from '../api.js';
import { REGION_MARKETS, useRegion } from '../state.jsx';
import { fmtDateFull, firstOfNextMonth, firstOfThisMonth } from '../format.js';
import PicksTable from '../components/PicksTable.jsx';
import SimulatorCard from '../components/SimulatorCard.jsx';
import WinnersCarousel from '../components/WinnersCarousel.jsx';
import StrategyCard from '../components/StrategyCard.jsx';
import { Spinner, ErrorBox, EmptyState } from '../components/UI.jsx';

const HOW_TO = [
  { t: 'Scan the strategies', d: 'Browse the AI-built strategies for your region and open any one to inspect this month’s full holdings.' },
  { t: 'Read the rationale', d: 'Every pick ships with plain-language tags explaining what scored — momentum, valuation, risk and more.' },
  { t: 'Run the simulator', d: 'Adjust the invested amount and time range to see how the strategy would have behaved against its benchmark.' },
  { t: 'Act and track', d: 'Star picks into a watchlist, set price alerts, and check back after the monthly rebalance on the 1st.' },
];

export default function Propicks() {
  const { region } = useRegion();
  const [list, setList] = useState(null);
  const [featured, setFeatured] = useState(null);
  const [error, setError] = useState(null);
  const [market, setMarket] = useState('ALL');

  const markets = REGION_MARKETS[region];

  useEffect(() => {
    let alive = true;
    setList(null);
    setFeatured(null);
    setError(null);
    getStrategies()
      .then((l) => {
        if (!alive) return null;
        setList(l);
        const filtered = (l.strategies || []).filter((s) => !markets || markets.includes(s.market));
        if (!filtered.length) return null;
        // Region ALL uses the designated featured endpoint; otherwise show the
        // top strategy of the selected region.
        return region === 'ALL' ? getFeatured() : getStrategy(filtered[0].slug);
      })
      .then((f) => { if (alive && f) setFeatured(f); })
      .catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [region, markets]);

  const allStrategies = useMemo(() => {
    const arr = list?.strategies || [];
    return arr.filter((s) => !markets || markets.includes(s.market));
  }, [list, markets]);

  const shownCards = useMemo(
    () => allStrategies.filter((s) => market === 'ALL' || s.market === market),
    [allStrategies, market],
  );

  const marketChips = useMemo(() => {
    const seen = [];
    allStrategies.forEach((s) => { if (!seen.includes(s.market)) seen.push(s.market); });
    return ['ALL', ...seen];
  }, [allStrategies]);

  const nextUpdate = firstOfNextMonth();
  const updated = firstOfThisMonth();

  return (
    <>
      <h1>AlphaPicks AI — Find Winning Stocks with AI</h1>
      <p className="page-sub">
        <span>Next update {fmtDateFull(nextUpdate)} · Picks updated {fmtDateFull(updated)}</span>
        <Link to="/propicks/methodology">About AlphaPicks AI →</Link>
      </p>

      <ErrorBox error={error} />

      {!list && !error && <Spinner label="Loading strategies…" />}

      {list && allStrategies.length === 0 && !error && (
        <div className="panel">
          <EmptyState
            title="No strategies for this region"
            hint="Switch the region selector in the top bar back to All to see every market."
          />
        </div>
      )}

      {featured && (
        <>
          <div className="panel">
            <div className="strat-hero">
              <div style={{ flex: 1, minWidth: 280 }}>
                <div className="flex" style={{ marginBottom: 6 }}>
                  <span className="code-badge">{featured.strategy.code}</span>
                  <h2 style={{ margin: 0 }}>{featured.strategy.name}</h2>
                  <span className="tag tag-1">{featured.strategy.market}</span>
                </div>
                <p className="panel-sub">{featured.strategy.description}</p>
                <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
                  vs {featured.strategy.benchmark} · {featured.strategy.pickCount} stocks ·
                  rebalanced monthly · updated {fmtDateFull(featured.strategy.updated)}
                </p>
              </div>
              <div className="stat-grid" style={{ flex: '0 1 420px' }}>
                <div className="stat-card">
                  <div className="label">Return 1Y</div>
                  <div className={`value ${featured.strategy.return1y >= 0 ? 'pos' : 'neg'}`}>{featured.strategy.return1y > 0 ? '+' : ''}{featured.strategy.return1y.toFixed(1)}%</div>
                </div>
                <div className="stat-card">
                  <div className="label">Return 5Y</div>
                  <div className={`value ${featured.strategy.return5y >= 0 ? 'pos' : 'neg'}`}>{featured.strategy.return5y > 0 ? '+' : ''}{featured.strategy.return5y.toFixed(1)}%</div>
                </div>
                <div className="stat-card">
                  <div className="label">Max</div>
                  <div className={`value ${featured.strategy.returnMax >= 0 ? 'pos' : 'neg'}`}>{featured.strategy.returnMax > 0 ? '+' : ''}{featured.strategy.returnMax.toFixed(1)}%</div>
                </div>
              </div>
            </div>

            <h3 className="mt">This month’s picks</h3>
            {featured.picks.length
              ? <PicksTable picks={featured.picks} />
              : <EmptyState title="No picks this month" hint="The strategy holds no stocks right now." />}
          </div>

          <SimulatorCard
            slug={featured.strategy.slug}
            yearStart={featured.strategy.yearStart}
            strategyName={`${featured.strategy.code} strategy`}
            benchmarkName={featured.strategy.benchmark}
          />

          {featured.previousWinners?.length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Previous Winning Stocks</h2>
                <span className="muted">past picks that delivered before rotating out</span>
              </div>
              <WinnersCarousel items={featured.previousWinners} />
            </div>
          )}
        </>
      )}

      {list && (
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Explore Different Strategies</h2>
            <div className="spacer" />
            <div className="flex">
              {marketChips.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`chip ${market === m ? 'on' : ''}`}
                  onClick={() => setMarket(m)}
                >
                  {m === 'ALL' ? 'All Markets' : m}
                </button>
              ))}
            </div>
          </div>
          {shownCards.length
            ? <div className="cards-grid">{shownCards.map((s) => <StrategyCard key={s.slug} strategy={s} />)}</div>
            : <EmptyState title="Nothing here yet" hint="Try a different market chip." />}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">How to Use AlphaPicks AI</h2>
        </div>
        <div className="steps">
          {HOW_TO.map((s, i) => (
            <div className="step" key={s.t}>
              <div className="step-num">{i + 1}</div>
              <div>
                <h4>{s.t}</h4>
                <p>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
