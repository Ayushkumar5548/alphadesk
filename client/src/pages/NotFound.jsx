import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="empty" style={{ paddingTop: 90 }}>
      <div className="empty-icon">◌</div>
      <h3>Page not found</h3>
      <p className="muted">The page you are looking for does not exist in AlphaDesk.</p>
      <div style={{ marginTop: 14 }}>
        <Link className="btn btn-primary" to="/propicks">Go to AlphaPicks AI</Link>
      </div>
    </div>
  );
}
