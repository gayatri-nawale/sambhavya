import type { ColorStop } from '../../styles/colormaps';

/**
 * Map legend: an optional colour ramp plus a list of symbol entries.
 * Sits on the map (bottom-left) or beside it.
 */

export type LegendSymbol = 'line' | 'thick-line' | 'dashed-line' | 'area' | 'box' | 'swatch' | 'dot';

export interface LegendItem {
  label: string;
  color: string;
  symbol: LegendSymbol;
}

export interface LegendRamp {
  title: string;
  stops: readonly ColorStop[];
  /** Tick values to label under the ramp (data units). */
  ticks: readonly number[];
  units?: string;
}

export interface LegendProps {
  title?: string;
  ramp?: LegendRamp;
  items?: readonly LegendItem[];
  className?: string;
}

function Symbol({ symbol, color }: { symbol: LegendSymbol; color: string }) {
  return (
    <svg width={22} height={12} aria-hidden="true" className="shrink-0">
      {symbol === 'line' && <line x1={1} y1={6} x2={21} y2={6} stroke={color} strokeWidth={1.25} />}
      {symbol === 'thick-line' && <line x1={1} y1={6} x2={21} y2={6} stroke={color} strokeWidth={3} strokeLinecap="round" />}
      {symbol === 'dashed-line' && <line x1={1} y1={6} x2={21} y2={6} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" />}
      {symbol === 'area' && <rect x={1} y={1} width={20} height={10} fill={color} fillOpacity={0.15} stroke={color} />}
      {symbol === 'box' && <rect x={1.5} y={1.5} width={19} height={9} fill="none" stroke={color} strokeWidth={1.5} />}
      {symbol === 'swatch' && <rect x={1} y={1} width={20} height={10} rx={2} fill={color} />}
      {symbol === 'dot' && <circle cx={11} cy={6} r={3.5} fill={color} />}
    </svg>
  );
}

function rampGradient(stops: readonly ColorStop[]): string {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return 'transparent';
  const span = last.at - first.at || 1;
  const parts = stops.map((s) => {
    const hex = s.color;
    const alpha = s.alpha ?? 1;
    const n = parseInt(hex.slice(1), 16);
    const rgba = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    return `${rgba} ${(((s.at - first.at) / span) * 100).toFixed(1)}%`;
  });
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

export function Legend({ title, ramp, items, className }: LegendProps) {
  const first = ramp?.stops[0];
  const last = ramp?.stops[ramp.stops.length - 1];
  const span = first && last ? last.at - first.at || 1 : 1;
  return (
    <div className={`rounded-[8px] border border-[#C9D3DE] bg-white/95 px-3 py-2 text-[13px] text-[#14213D] ${className ?? ''}`}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      {ramp && first && (
        <div className="mb-2 w-[220px] max-w-full">
          <p className="mb-1">
            {ramp.title}
            {ramp.units ? ` (${ramp.units})` : ''}
          </p>
          <div className="h-2.5 rounded-[2px] border border-[#C9D3DE]" style={{ background: rampGradient(ramp.stops) }} />
          <div className="relative mt-0.5 h-4 tabular-nums">
            {ramp.ticks.map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2 text-[12px]"
                style={{ left: `${Math.min(100, Math.max(0, ((t - first.at) / span) * 100))}%` }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
          {items.map((it) => (
            <li key={it.label} className="flex items-center gap-1.5">
              <Symbol symbol={it.symbol} color={it.color} />
              <span>{it.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
