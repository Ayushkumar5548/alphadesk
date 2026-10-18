// Color-coded "why it was picked" rationale tags.
const TONES = [
  { keys: ['momentum', 'breakout', 'relative strength'], cls: 0 },
  { keys: ['valuation', 'undervalued', 'fair price', 'fair value', 'cheap'], cls: 1 },
  { keys: ['risk', 'leverage', 'balance sheet', 'liquidity'], cls: 2 },
  { keys: ['growth', 'earnings', 'acceleration', 'expansion'], cls: 3 },
  { keys: ['profit', 'efficient', 'quality', 'leader', 'compound'], cls: 4 },
  { keys: ['return', 'cash', 'shareholder', 'dividend', 'income'], cls: 5 },
];

export function toneFor(tag) {
  const t = String(tag || '').toLowerCase();
  for (const tone of TONES) {
    if (tone.keys.some((k) => t.includes(k))) return tone.cls;
  }
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 97;
  return 1 + (h % 5);
}

export default function RationaleTag({ tag }) {
  return <span className={`tag tag-${toneFor(tag)}`}>{tag}</span>;
}
