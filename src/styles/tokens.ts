/**
 * Design tokens as TypeScript, mirroring tokens.css (docs/PROTOTYPE_SPEC.md Part 2).
 * Use these where CSS variables cannot reach (canvas, SVG attributes, charts).
 */

export const COLORS = {
  ink: '#14213D',
  bay: '#0F4C75',
  mist: '#EEF2F6',
  paper: '#FFFFFF',
  teal: '#1F8A84',
  line: '#C9D3DE',
} as const;

/** Risk colours. Used only for risk, never for decoration. */
export const RISK_COLORS = {
  low: '#F2C230',
  moderate: '#EF8A24',
  severe: '#D62839',
} as const;

export const TYPE_SCALE = [14, 16, 20, 28, 40, 64] as const;
export const LEADING = { body: 1.55, head: 1.05 } as const;
export const RADII = { chip: 4, panel: 8, map: 0 } as const;

export { RAIN_STOPS, DIVERGING_STOPS } from './colormaps';
