export type RiskBadgeLevel = 'low' | 'moderate' | 'severe';

const LABEL: Record<RiskBadgeLevel, string> = { low: 'Low', moderate: 'Moderate', severe: 'Severe' };

// Contrast: ink on yellow and orange, paper on red.
const STYLE: Record<RiskBadgeLevel, string> = {
  low: 'bg-warn-low text-ink',
  moderate: 'bg-warn-mod text-ink',
  severe: 'bg-warn-sev text-paper',
};

/** The only component allowed to use the risk colours. */
export function RiskBadge({ level, size = 'md', className }: { level: RiskBadgeLevel; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-chip font-semibold ${size === 'sm' ? 'px-1.5 text-small' : 'px-2 py-0.5 text-small'} ${STYLE[level]} ${className ?? ''}`}
    >
      {LABEL[level]}
    </span>
  );
}
