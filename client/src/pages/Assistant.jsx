// Warren AI: deterministic research assistant over the live dataset.
// Suggestion chips, message history, references linking to stock/strategy pages.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { askAssistant } from '../api.js';
import { AiIcon } from '../components/Icons.jsx';

const DEFAULT_SUGGESTIONS = [
  'Should I buy AAPL? Give a full analysis',
  'Best small cap mutual fund?',
  'Compare HDFC Flexi Cap and Parag Parikh Flexi Cap',
  'SIP 5000 for 10 years in Nippon India Small Cap',
  'Best performing strategy?',
];

const GREETING = {
  role: 'ai',
  text: 'Hi, I’m Warren AI — AlphaDesk’s research assistant.\n\nAsk me about any stock (valuation, quality, growth, risk, technicals, peers), any mutual fund (returns, risk, expense, comparisons, SIP maths), an AlphaPicks AI basket, or the macro calendar. I answer with the full dataset behind each figure. Try a prompt below.',
  references: [],
  suggestions: DEFAULT_SUGGESTIONS,
};

function renderRich(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4
    ? <strong key={i}>{p.slice(2, -2)}</strong>
    : p));
}

function ReferenceChips({ references = [] }) {
  if (!references.length) return null;
  return (
    <div className="ref-chips">
      {references.map((r, i) => {
        if (r.ticker) return <Link key={i} to={`/stock/${r.ticker}`} className="ref-chip">↗ {r.ticker}</Link>;
        if (r.type === 'fund') return <Link key={i} to="/funds" className="ref-chip">◆ {r.label}</Link>;
        return <Link key={i} to={`/propicks/${r.slug}`} className="ref-chip">↗ {r.label || r.slug}</Link>;
      })}
    </div>
  );
}

export default function Assistant() {
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  const suggestions = [...(messages[messages.length - 1]?.suggestions || []), ...DEFAULT_SUGGESTIONS]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 4);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const r = await askAssistant(q);
      setMessages((m) => [...m, {
        role: 'ai',
        text: r.answer || 'I could not find anything relevant in the simulated dataset.',
        references: r.references || [],
        suggestions: r.suggestions || [],
      }]);
    } catch {
      setMessages((m) => [...m, {
        role: 'ai',
        text: 'The assistant service is unreachable right now. Please try again shortly.',
        references: [],
        suggestions: DEFAULT_SUGGESTIONS,
      }]);
    }
    setBusy(false);
  };

  return (
    <>
      <h1>Warren AI</h1>
      <p className="page-sub">
        <span className="flex"><AiIcon /> Full research on any stock or mutual fund — valuation, quality, risk, comparisons and SIP maths.</span>
      </p>

      <div className="chat">
        <div className="chat-scroll" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
              <span className="who">{m.role === 'user' ? 'You' : 'Warren AI'}</span>
              <div className="bubble">{renderRich(m.text)}</div>
              <ReferenceChips references={m.references} />
            </div>
          ))}
          {busy && (
            <div className="msg ai">
              <span className="who">Warren AI</span>
              <div className="bubble"><span className="typing"><i /><i /><i /></span></div>
            </div>
          )}
        </div>

        <div>
          <div className="sugg-row">
            {suggestions.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
          <form
            className="chat-input-row"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <input
              className="input"
              placeholder="Ask Warren AI… (e.g. Is RELIANCE expensive?)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
          </form>
        </div>
      </div>
    </>
  );
}
