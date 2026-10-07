import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { geoEquirectangular, geoPath } from 'd3-geo';
import type { Field } from '../../sim';
import type { RGBA } from '../../styles/colormaps';
import { MAP_COLORS, getRaster } from '../map';
import { worldLayers } from '../map/world';

/** Paints a field raster onto a canvas that fills its container (cells stay visible as cells). */
function FieldLayer({ field, colormap, cacheKey }: { field: Field; colormap: (v: number) => RGBA; cacheKey: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const img = getRaster(cacheKey, field, colormap);
    canvas.width = field.grid.nx;
    canvas.height = field.grid.ny;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  }, [field, colormap, cacheKey]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{ imageRendering: 'pixelated' }} aria-hidden="true" />;
}

/** Coastline and borders over the box, in a fixed 1000×1000 viewBox. */
function CoastOverlay({ field }: { field: Field }) {
  const paths = useMemo(() => {
    const b = field.grid.bbox;
    const layers = worldLayers(b);
    const proj = geoEquirectangular().fitSize([1000, 1000], {
      type: 'MultiPoint',
      coordinates: [
        [b.lonMin, b.latMin],
        [b.lonMax, b.latMax],
      ],
    });
    const path = geoPath(proj);
    return { coast: path(layers.coastline) ?? '', borders: path(layers.borders) ?? '' };
  }, [field]);
  return (
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <path d={paths.borders} fill="none" stroke={MAP_COLORS.ink} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="6 4" />
      <path d={paths.coast} fill="none" stroke={MAP_COLORS.ink} strokeOpacity={0.75} strokeWidth={2} />
    </svg>
  );
}

export interface SplitSide {
  field: Field;
  cacheKey: string;
  label: ReactNode;
  footer?: ReactNode;
}

export interface SplitViewProps {
  left: SplitSide;
  right: SplitSide;
  colormap: (v: number) => RGBA;
  /** Accessible description of what is being compared. */
  label: string;
  /** Overlay shown on the right half (e.g. a rejection notice). */
  rightNotice?: ReactNode;
}

/**
 * Before/after comparison: the left image is the 12 km input, the right image
 * the 5 km output. Drag the divider, or focus it and use the arrow keys.
 */
export function SplitView({ left, right, colormap, label, rightNotice }: SplitViewProps) {
  const [pos, setPos] = useState(50);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = (clientX: number) => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - step));
    else if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + step));
    else if (e.key === 'Home') setPos(0);
    else if (e.key === 'End') setPos(100);
    else return;
    e.preventDefault();
  };

  return (
    <figure className="m-0">
      <div
        ref={boxRef}
        className="relative aspect-square w-full touch-none select-none overflow-hidden bg-paper"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={label}
      >
        <FieldLayer field={left.field} colormap={colormap} cacheKey={left.cacheKey} />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <FieldLayer field={right.field} colormap={colormap} cacheKey={right.cacheKey} />
        </div>
        <CoastOverlay field={right.field} />

        <div className="pointer-events-none absolute left-3 top-3 max-w-[44%] truncate rounded-chip bg-paper/95 px-2 py-0.5 text-small font-semibold">{left.label}</div>
        <div className="pointer-events-none absolute right-3 top-3 max-w-[44%] truncate rounded-chip bg-paper/95 px-2 py-0.5 text-small font-semibold">{right.label}</div>
        {left.footer && <div className="pointer-events-none absolute bottom-3 left-3 rounded-chip bg-paper/95 px-2 py-0.5 text-small tabular-nums">{left.footer}</div>}
        {right.footer && <div className="pointer-events-none absolute bottom-3 right-3 rounded-chip bg-paper/95 px-2 py-0.5 text-small tabular-nums">{right.footer}</div>}

        {rightNotice}

        {/* Divider */}
        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-paper shadow-[0_0_0_1px_var(--ink)]" style={{ left: `${pos}%` }} aria-hidden="true" />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Comparison divider: left shows 12 km input, right shows 5 km output"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          aria-valuetext={`${Math.round(pos)}% of the box shows the 12 km input`}
          onKeyDown={onKeyDown}
          className="absolute top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border-2 border-ink bg-paper shadow-[0_4px_12px_-4px_rgba(20,33,61,0.5)]"
          style={{ left: `${pos}%` }}
        >
          <svg width={18} height={12} viewBox="0 0 18 12" aria-hidden="true">
            <path d="M6 1 1 6l5 5M12 1l5 5-5 5" fill="none" stroke={MAP_COLORS.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </figure>
  );
}
