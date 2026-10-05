import { useMemo } from 'react';

/**
 * The recurring motif: isobar-like contour lines. Deterministic (no randomness),
 * drawn in --line. Decorative only.
 */
export interface ContourBackgroundProps {
  /** Centre of the rings, as a fraction of the box (0..1). */
  cx?: number;
  cy?: number;
  rings?: number;
  className?: string;
}

const W = 1200;
const H = 700;

function ringPath(cx: number, cy: number, r: number, i: number): string {
  const n = 160;
  let d = '';
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * Math.PI * 2;
    // Low-order wobble so rings look like a pressure system, not circles.
    const wobble = 1 + 0.07 * Math.sin(3 * t + i * 0.55) + 0.045 * Math.sin(5 * t - i * 0.8) + 0.03 * Math.cos(2 * t + i * 0.3);
    const x = cx + r * 1.35 * wobble * Math.cos(t);
    const y = cy + r * wobble * Math.sin(t);
    d += `${k === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return `${d}Z`;
}

export function ContourBackground({ cx = 0.72, cy = 0.45, rings = 14, className }: ContourBackgroundProps) {
  const paths = useMemo(
    () => Array.from({ length: rings }, (_, i) => ringPath(cx * W, cy * H, 34 + i * 34 + i * i * 1.6, i)),
    [cx, cy, rings],
  );
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ''}`}
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--line)" strokeWidth={i % 4 === 3 ? 1.4 : 0.9} opacity={0.75} />
      ))}
    </svg>
  );
}
