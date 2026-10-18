// Strategy detail: header + stats, full picks table, simulator, NAV history.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getStrategy, copyStrategyToWatchlist } from '../api.js';
import { useAppState, useWatchlistActions } from '../state.jsx';
import { fmtDateFull } from '../format.js';
import PicksTable from '../components/PicksTable.jsx';
import BasketChanges from '../components/BasketChanges.jsx';
import SimulatorCard from '../components/SimulatorCard.jsx';
import WinnersCarousel from '../components/WinnersCarousel.jsx';
import MonthlyBacktest from '../components/MonthlyBacktest.jsx';
import { Spinner, ErrorBox, EmptyState } from '../components/UI.jsx';

function SaveStrategyButton({ slug, name }) {
  const { state, update } = useAppState();
  const saved = state.savedStrategies.includes(slug);
  return (
    <button
      type="button"
      className={`btn btn-sm ${saved ? '' : 'btn-primary'}`}
      onClick={() => update((s) => ({
        ...s,
        savedStrategies: saved
          ? s.savedStrategies.filter((x) => x !== slug)
          : [...s.savedStrategies, slug],
      }))}
      title={saved ? 'Remove from Saved Work' : 'Save to Saved Work'}
    >
      {saved ? `Saved ✓ · ${name}` : 'Save strategy'}
    </button>
  );
}

function CopyToWatchlistButton({ slug }) {
  const { state } = useWatchlistActions();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (state.watchlists.length === 0) return null;
  return (
    <span className="inline-form">
      <select
        className="select"
        defaultValue=""
        disabled={busy}
        onChange={async (e) => {
          const id = e.target.value;
          e.target.value = '';
          if (!id) return;
          setBusy(true);
          try {
            await copyStrategyToWatchlist(id, slug);
            setMsg('Copied ✓');
          } catch { setMsg('Copy failed'); }
          setTimeout(() => setMsg(''), 2000);
          setBusy(false);
        }}
      >
        <option value="" disabled>Copy picks to watchlist…</option>
        {state.watchlists.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      {msg && <span className="pos" style={{ fontSize: 12.5 }}>{msg}</span>}
    </span>
  );
}

export default function StrategyDetail() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    getStrategy(slug)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [slug]);

  if (error) {
    return (
      <>
        <ErrorBox error={error} />
        <Link to="/propicks">← Back to AlphaPicks AI</Link>
      </>
    );
  }
  if (!data) return <Spinner label="Loading strategy…" />;

  const { strategy, picks, history, previousWinners, basketChanges } = data;

  return (
    <>
      <p className="page-sub" style={{ marginBottom: 6 }}>
        <Link to="/propicks">← AlphaPicks AI</Link>
        <span>/</span>
        <span>{strategy.code}</span>
      </p>
      <div className="flex" style={{ marginBottom: 6 }}>
        <span className="code-badge">{strategy.code}</span>
        <h1 style={{ margin: 0 }}>{strategy.name}</h1>
        <span className="tag tag-1">{strategy.market}</span>
        <span className="rpill amber">{strategy.pickCount} stocks · monthly</span>
      </div>
      <p className="page-sub">{strategy.description}</p>

      <div className="toolbar">
        <SaveStrategyButton slug={strategy.slug} name={strategy.code} />
        <CopyToWatchlistButton slug={strategy.slug} />
        <span className={`tag ${strategy.dataSource === 'real' ? 'tag-live' : 'tag-sim'}`}
          title={strategy.dataSource === 'real'
            ? 'Backtested on real historical market prices (point-in-time, no look-ahead)'
            : 'Offline: simulated price history (no real data available)'}>
          {strategy.dataSource === 'real' ? 'REAL MARKET DATA' : 'SIMULATED'}
        </span>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12.5 }}>
          Updated {fmtDateFull(strategy.updated)} · next rebalance {fmtDateFull(strategy.nextUpdate)}
        </span>
      </div>

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <div className="stat-card">
          <div className="label">Total Return (Max)</div>
          <div className={`value ${strategy.returnMax >= 0 ? 'pos' : 'neg'}`}>{strategy.returnMax > 0 ? '+' : ''}{strategy.returnMax.toFixed(1)}%</div>
          <div className="hint">since {strategy.yearStart}</div>
        </div>
        <div className="stat-card">
          <div className="label">Outperformance</div>
          <div className={`value ${strategy.outperformance >= 0 ? 'pos' : 'neg'}`}>{strategy.outperformance > 0 ? '+' : ''}{strategy.outperformance.toFixed(1)}%</div>
          <div className="hint">vs {strategy.benchmark}</div>
        </div>
        <div className="stat-card">
          <div className="label">Annualized</div>
          <div className={`value ${strategy.annualized >= 0 ? 'pos' : 'neg'}`}>{strategy.annualized > 0 ? '+' : ''}{strategy.annualized.toFixed(1)}%</div>
          <div className="hint">CAGR, {strategy.dataSource === 'real' ? 'real' : 'simulated'}</div>
        </div>
        <div className="stat-card">
          <div className="label">Beta</div>
          <div className="value">{strategy.beta.toFixed(2)}</div>
          <div className="hint">vs benchmark</div>
        </div>
        <div className="stat-card">
          <div className="label">Return 1Y</div>
          <div className={`value ${strategy.return1y >= 0 ? 'pos' : 'neg'}`}>{strategy.return1y > 0 ? '+' : ''}{strategy.return1y.toFixed(1)}%</div>
        </div>
        <div className="stat-card">
          <div className="label">{strategy.windowMonths && strategy.windowMonths < 60 ? `Return ${strategy.windowMonths}M` : 'Return 5Y'}</div>
          <div className={`value ${strategy.return5y >= 0 ? 'pos' : 'neg'}`}>{strategy.return5y > 0 ? '+' : ''}{strategy.return5y.toFixed(1)}%</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Current Picks ({picks.length})</h2>
          <span className="muted">click a row for the full stock breakdown</span>
        </div>
        {picks.length
          ? <PicksTable picks={picks} />
          : <EmptyState title="No picks right now" />}
      </div>

      {basketChanges && (
        <BasketChanges
          additions={basketChanges.additions}
          removals={basketChanges.removals}
          exitPnL={basketChanges.exitPnL}
        />
      )}

      <MonthlyBacktest
        history={history}
        monthly={data.monthlyLedger || []}
        benchmarkName={strategy.benchmark}
      />

      <SimulatorCard
        slug={strategy.slug}
        yearStart={strategy.yearStart}
        strategyName={`${strategy.code} strategy`}
        benchmarkName={strategy.benchmark}
      />

      {previousWinners?.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Previous Winning Stocks</h2>
          </div>
          <WinnersCarousel items={previousWinners} />
        </div>
      )}
    </>
  );
}
