export default function Footer() {
  return (
    <footer className="footer">
      <span>© {new Date().getFullYear()} AlphaDesk — product demonstration.</span>
      <span>
        Live prices and company fundamentals come from Yahoo Finance and may be
        delayed or unavailable for a small number of symbols. AlphaPicks AI picks,
        ratings, fair values and the economic calendar are AlphaDesk’s own model
        output computed from that data.
      </span>
      <span>Nothing on AlphaDesk is investment advice.</span>
    </footer>
  );
}
