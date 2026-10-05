/**
 * Colormaps from docs/PROTOTYPE_SPEC.md Part 2, as TS arrays for canvas rendering.
 * Mirrored as CSS variables in tokens.css.
 */

export type RGBA = [number, number, number, number];

export interface ColorStop {
  /** Position in data units (rain) or normalised units (diverging). */
  at: number;
  color: string;
  alpha?: number;
}

/** Rain (mm/day): transparent → #C6E2F5 → #6BAED6 → #2171B5 → #6A51A3 → #C51B8A. */
export const RAIN_STOPS: readonly ColorStop[] = [
  { at: 1, color: '#C6E2F5', alpha: 0 },
  { at: 5, color: '#C6E2F5' },
  { at: 20, color: '#6BAED6' },
  { at: 64, color: '#2171B5' },
  { at: 115, color: '#6A51A3' },
  { at: 204, color: '#C51B8A' },
];

/** Temperature / anomaly, diverging: #2166AC → #F7F7F7 → #B2182B over -1..1. */
export const DIVERGING_STOPS: readonly ColorStop[] = [
  { at: -1, color: '#2166AC' },
  { at: 0, color: '#F7F7F7' },
  { at: 1, color: '#B2182B' },
];

/** Risk colours, used only for risk (defined in tokens.ts). */
export { RISK_COLORS } from './tokens';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Interpolate a colour at `value` along stops (clamped at both ends). */
export function colorAt(stops: readonly ColorStop[], value: number): RGBA {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return [0, 0, 0, 0];
  if (value <= first.at) return [...hexToRgb(first.color), Math.round((first.alpha ?? 1) * 255)];
  if (value >= last.at) return [...hexToRgb(last.color), Math.round((last.alpha ?? 1) * 255)];
  for (let k = 0; k < stops.length - 1; k++) {
    const a = stops[k] as ColorStop;
    const b = stops[k + 1] as ColorStop;
    if (value <= b.at) {
      const t = (value - a.at) / (b.at - a.at);
      const ca = hexToRgb(a.color);
      const cb = hexToRgb(b.color);
      const alpha = (a.alpha ?? 1) + ((b.alpha ?? 1) - (a.alpha ?? 1)) * t;
      return [
        Math.round(ca[0] + (cb[0] - ca[0]) * t),
        Math.round(ca[1] + (cb[1] - ca[1]) * t),
        Math.round(ca[2] + (cb[2] - ca[2]) * t),
        Math.round(alpha * 255),
      ];
    }
  }
  return [...hexToRgb(last.color), 255];
}

export function rainColor(mmPerDay: number): RGBA {
  return colorAt(RAIN_STOPS, mmPerDay);
}

/** Diverging colour for a value mapped into [-1, 1] around `center` with half-range `span`. */
export function divergingColor(value: number, center = 0, span = 1): RGBA {
  return colorAt(DIVERGING_STOPS, (value - center) / span);
}
