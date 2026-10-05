import { Link } from 'react-router-dom';

/** Product wordmark: a small track glyph and the name. */
export function Wordmark({ tone = 'ink', to = '/' }: { tone?: 'ink' | 'paper'; to?: string }) {
  const color = tone === 'ink' ? 'text-ink' : 'text-paper';
  return (
    <Link to={to} className={`inline-flex items-center gap-2 rounded-chip ${color}`} aria-label="SAMBHAVYA home">
      <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx={12} cy={12} r={3} fill="var(--teal)" />
        <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <path d="M12 20.5A8.5 8.5 0 0 1 3.5 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
      <span className="font-head text-[20px] font-bold tracking-[0.04em]">SAMBHAVYA</span>
    </Link>
  );
}
