import { FIELD_META, type FieldKind } from '../../sim';
import { DIVERGING_STOPS, RAIN_STOPS, divergingColor, rainColor, type ColorStop, type RGBA } from '../../styles/colormaps';

/** Colormap for a field kind: rain colormap for rain, diverging for temperature, wet-bulb and EFI. */
export function fieldColormap(kind: FieldKind | 'efi'): (v: number) => RGBA {
  if (kind === 'rain') return rainColor;
  if (kind === 'efi')
    // EFI near 0 means nothing unusual: fade it out so only anomalies show.
    return (v) => {
      const c = divergingColor(v);
      return [c[0], c[1], c[2], Math.round(255 * Math.min(1, Math.max(0, Math.abs(v) - 0.12) * 2.8))];
    };
  const meta = FIELD_META[kind];
  const center = (meta.displayMin + meta.displayMax) / 2;
  const span = (meta.displayMax - meta.displayMin) / 2;
  return (v) => divergingColor(v, center, span);
}

/** Legend ramp matching fieldColormap, in data units. */
export function fieldRamp(kind: FieldKind | 'efi'): { title: string; units?: string; stops: readonly ColorStop[]; ticks: number[] } {
  if (kind === 'rain') return { title: '24 h rainfall', units: 'mm/day', stops: RAIN_STOPS, ticks: [5, 64, 115, 204] };
  if (kind === 'efi') return { title: 'Extreme Forecast Index', stops: DIVERGING_STOPS, ticks: [-1, 0, 1] };
  const meta = FIELD_META[kind];
  const center = (meta.displayMin + meta.displayMax) / 2;
  const span = (meta.displayMax - meta.displayMin) / 2;
  return {
    title: meta.label,
    units: meta.units,
    stops: DIVERGING_STOPS.map((s) => ({ ...s, at: center + s.at * span })),
    ticks: [meta.displayMin, center, meta.displayMax],
  };
}
