import type { ReactNode } from 'react';

export interface MetricTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Secondary line, e.g. a comparison. */
  note?: ReactNode;
  /** Append "(sim)" to mark a simulated number. */
  sim?: boolean;
  tone?: 'ink' | 'teal';
  className?: string;
}

/** A single number with its label. Big figures use Plex Sans Condensed. */
export function MetricTile({ label, value, unit, note, sim, tone = 'ink', className }: MetricTileProps) {
  return (
    <div className={`border-l-2 ${tone === 'teal' ? 'border-teal' : 'border-ink'} py-1 pl-3 ${className ?? ''}`}>
      <p className="text-small">{label}</p>
      <p className={`mt-0.5 font-head text-h3 font-semibold leading-none tabular-nums ${tone === 'teal' ? 'text-teal' : 'text-ink'}`}>
        {value}
        {unit && <span className="ml-1 font-sans text-small font-normal text-ink">{unit}</span>}
        {sim && <span className="ml-1 font-sans text-small font-normal text-ink">(sim)</span>}
      </p>
      {note && <p className="mt-1 text-small">{note}</p>}
    </div>
  );
}
