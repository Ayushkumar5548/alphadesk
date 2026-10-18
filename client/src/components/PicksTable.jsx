// Picks table: Company | Total Return | Why it was picked.
// Star toggles watchlist membership; row click opens the stock page.
import { useNavigate } from 'react-router-dom';
import { fmtPct, fmtCompact, ratingClass } from '../format.js';
import StarButton from './StarButton.jsx';
import RationaleTag from './RationaleTag.jsx';

export default function PicksTable({ picks = [] }) {
  const navigate = useNavigate();
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 34 }} />
            <th>Company</th>
            <th className="num">Total Return</th>
            <th>Rating</th>
            <th>Why it was picked</th>
          </tr>
        </thead>
        <tbody>
          {picks.map((p) => (
            <tr key={p.ticker} className="clickable" onClick={() => navigate(`/stock/${p.ticker}`)}>
              <td><StarButton ticker={p.ticker} /></td>
              <td>
                <div className="company-row">
                  <span className="sector-badge" title={p.sector}>{p.sector}</span>
                  <div className="company-cell">
                    <span className="tk">
                      {p.ticker}
                      {p.live === true && <span className="live-dot" title="Live price from Yahoo Finance" />}
                    </span>
                    <span className="nm">{p.name}</span>
                  </div>
                </div>
              </td>
              <td className={`num ${p.returnPct > 0 ? 'pos' : p.returnPct < 0 ? 'neg' : ''}`}>
                {fmtPct(p.returnPct)}
              </td>
              <td>
                <span className={`rpill ${ratingClass(p.rating)}`}>{p.rating}</span>
                <div className="muted mono" style={{ fontSize: 11, marginTop: 3 }}>
                  score {p.score} · cap {fmtCompact(p.marketCap)}
                </div>
              </td>
              <td>
                <div>
                  {(p.rationaleTags || []).map((t) => <RationaleTag key={t} tag={t} />)}
                </div>
                {p.rationaleText && (
                  <div className="text-2" style={{ fontSize: 12.5, marginTop: 4 }}>{p.rationaleText}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
