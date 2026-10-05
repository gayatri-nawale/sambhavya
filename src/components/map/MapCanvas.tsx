import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { geoEquirectangular, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { BBox, Field, LatLon } from '../../sim';
import { RISK_COLORS, type RGBA } from '../../styles/colormaps';
import { MAP_COLORS, MAX_ZOOM, MIN_ZOOM, SEA_ALPHA } from './mapStyle';
import { getRaster } from './rasterCache';
import { worldLayers } from './world';

/* ------------------------------------------------------------------ */
/* Layer types                                                          */
/* ------------------------------------------------------------------ */

export type MapProjection = 'equirectangular' | 'mercator';
export type ZoneLevel = 'low' | 'moderate' | 'severe';

export interface RasterLayer {
  field: Field;
  colormap: (v: number) => RGBA;
  /** Cache key for the coloured raster, e.g. "cyclone|rain|96". Must change when the field or colormap changes. */
  cacheKey: string;
  opacity?: number;
  /** Smooth (true) or show cells as blocks (false). */
  smooth?: boolean;
}

export interface TrackLayerItem {
  id: string;
  points: readonly LatLon[];
  color: string;
  width?: number;
  opacity?: number;
  dashed?: boolean;
  label?: string;
  onSelect?: () => void;
  selected?: boolean;
}

export interface ZoneItem {
  id: string;
  bbox: BBox;
  level: ZoneLevel;
}

export interface BoxItem {
  id: string;
  bbox: BBox;
  label?: string;
  dashed?: boolean;
}

export type MarkerKind = 'place' | 'core' | 'storm' | 'member';

export interface MarkerItem {
  id: string;
  lat: number;
  lon: number;
  label?: string;
  kind?: MarkerKind;
  color?: string;
}

export interface MapCanvasProps {
  /** Region the map fits on load and on reset. */
  bbox: BBox;
  projection?: MapProjection;
  /** Accessible name, e.g. "Bay of Bengal, member tracks at T+96 h". */
  label: string;
  raster?: RasterLayer | null;
  zones?: readonly ZoneItem[];
  zoneOpacity?: number;
  memberTracks?: readonly TrackLayerItem[];
  scenarioPaths?: readonly TrackLayerItem[];
  /** Closed lat/lon ring for the probability cone. */
  cone?: readonly LatLon[] | null;
  /** The 4D threat box at the current lead time. */
  box?: BoxItem | null;
  /** Other boxes (e.g. candidate regions). */
  boxes?: readonly BoxItem[];
  /** Highlighted outline, e.g. the selected alert's area. */
  outline?: readonly LatLon[] | null;
  markers?: readonly MarkerItem[];
  interactive?: boolean;
  /** Legend or other overlay content, placed bottom-left. */
  legend?: ReactNode;
  /** Custom SVG content drawn above the built-in layers, using the map's projection. */
  overlay?: (api: MapOverlayApi) => ReactNode;
  className?: string;
}

export interface MapOverlayApi {
  toScreen: (p: LatLon) => [number, number] | null;
  width: number;
  height: number;
}

interface View {
  k: number;
  x: number;
  y: number;
}

const IDENTITY: View = { k: 1, x: 0, y: 0 };

/* ------------------------------------------------------------------ */
/* Projection                                                           */
/* ------------------------------------------------------------------ */

function bboxPoints(b: BBox) {
  const pts: Array<[number, number]> = [];
  for (let t = 0; t <= 4; t++) {
    const lon = b.lonMin + ((b.lonMax - b.lonMin) * t) / 4;
    const lat = b.latMin + ((b.latMax - b.latMin) * t) / 4;
    pts.push([lon, b.latMin], [lon, b.latMax], [b.lonMin, lat], [b.lonMax, lat]);
  }
  return { type: 'MultiPoint' as const, coordinates: pts };
}

/**
 * Projection that fits the whole region inside the viewport, centred. The base map
 * extends beyond the region, so the panel is still filled edge to edge.
 */
function makeProjection(kind: MapProjection, b: BBox, w: number, h: number): GeoProjection {
  const make = () => (kind === 'mercator' ? geoMercator() : geoEquirectangular());
  const obj = bboxPoints(b);
  const sw = make().fitWidth(w, obj).scale();
  const sh = make().fitHeight(h, obj).scale();
  const p = make().scale(Math.min(sw, sh) * 0.97).translate([0, 0]);
  const c = p([(b.lonMin + b.lonMax) / 2, 0]);
  const top = p([b.lonMin, b.latMax]);
  const bottom = p([b.lonMin, b.latMin]);
  if (!c || !top || !bottom) return p;
  return p.translate([w / 2 - c[0], h / 2 - (top[1] + bottom[1]) / 2]);
}

function clampView(v: View, w: number, h: number, extent: { x0: number; y0: number; x1: number; y1: number }): View {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k));
  const fit = (t: number, size: number, a: number, b: number) => {
    const lo = size - k * b;
    const hi = -k * a;
    return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, t));
  };
  return { k, x: fit(v.x, w, extent.x0, extent.x1), y: fit(v.y, h, extent.y0, extent.y1) };
}

/* ------------------------------------------------------------------ */
/* Label placement                                                      */
/* ------------------------------------------------------------------ */

interface LabelRequest {
  key: string;
  text: string;
  color: string;
  weight: number;
  /** Candidate baseline-left positions, tried in order. */
  candidates: Array<[number, number]>;
  /** Optional labels are dropped when no candidate fits; required ones use their first candidate. */
  optional: boolean;
}

interface PlacedLabel {
  key: string;
  x: number;
  y: number;
  text: string;
  color: string;
  weight: number;
}

const LABEL_CHAR_W = 6.9;
const LABEL_H = 14;

/** Greedy placement in priority order: each label takes the first spot that overlaps nothing placed so far. */
function layoutLabels(requests: readonly LabelRequest[], w: number, h: number): PlacedLabel[] {
  const placed: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  const out: PlacedLabel[] = [];
  for (const r of requests) {
    const tw = r.text.length * LABEL_CHAR_W;
    const rect = ([x, y]: [number, number]) => ({ x0: x - 2, y0: y - LABEL_H + 3, x1: x + tw + 2, y1: y + 4 });
    const fits = (c: [number, number]) => {
      const b = rect(c);
      if (b.x0 < 0 || b.x1 > w || b.y0 < 0 || b.y1 > h) return false;
      return placed.every((q) => b.x1 < q.x0 || b.x0 > q.x1 || b.y1 < q.y0 || b.y0 > q.y1);
    };
    const spot = r.candidates.find(fits) ?? (r.optional ? undefined : r.candidates[0]);
    if (!spot) continue;
    placed.push(rect(spot));
    out.push({ key: r.key, x: spot[0], y: spot[1], text: r.text, color: r.color, weight: r.weight });
  }
  return out;
}

/** Positions around a point anchor: to the right at increasing vertical offsets, then the same on the left. */
function aroundPoint(x: number, y: number, gap: number, text: string): Array<[number, number]> {
  const tw = text.length * LABEL_CHAR_W;
  const rows = [y + 4, y - 12, y + 20, y - 28, y + 36];
  return [...rows.map((r): [number, number] => [x + gap, r]), ...rows.map((r): [number, number] => [x - gap - tw, r])];
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

const RISK_RGB: Record<ZoneLevel, string> = RISK_COLORS;

/**
 * Offline map: Natural Earth 50m land, coastline and country borders on a
 * canvas, data rasters and risk zones on the same canvas, and an SVG overlay
 * for tracks, cones, boxes and labels. Wheel to zoom, drag to pan; keyboard:
 * + / − to zoom, arrow keys to pan, 0 to reset.
 */
export function MapCanvas(props: MapCanvasProps) {
  const {
    bbox,
    projection = 'equirectangular',
    label,
    raster,
    zones,
    zoneOpacity = 0.8,
    memberTracks,
    scenarioPaths,
    cone,
    box,
    boxes,
    outline,
    markers,
    interactive = true,
    legend,
    overlay,
    className,
  } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>(IDENTITY);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  // Track container size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const proj = useMemo(
    () => (size.w > 0 && size.h > 0 ? makeProjection(projection, bbox, size.w, size.h) : null),
    [projection, bbox, size.w, size.h],
  );

  // Reset the view when the region or projection changes.
  useEffect(() => setView(IDENTITY), [bbox, projection]);

  const extent = useMemo(() => {
    if (!proj) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    const a = proj([bbox.lonMin, bbox.latMax]) ?? [0, 0];
    const b = proj([bbox.lonMax, bbox.latMin]) ?? [0, 0];
    return { x0: a[0], y0: a[1], x1: b[0], y1: b[1] };
  }, [proj, bbox]);

  const world = useMemo(() => worldLayers(bbox), [bbox]);

  /** Project lon/lat to screen pixels under the current zoom and pan. */
  const toScreen = useCallback(
    (p: LatLon): [number, number] | null => {
      const xy = proj?.([p.lon, p.lat]);
      return xy ? [xy[0] * view.k + view.x, xy[1] * view.k + view.y] : null;
    },
    [proj, view],
  );

  /* ---------------- canvas: base map, raster, zones ---------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !proj || size.w === 0) return;
    const frame = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) {
        canvas.width = Math.round(size.w * dpr);
        canvas.height = Math.round(size.h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.fillStyle = MAP_COLORS.paper;
      ctx.fillRect(0, 0, size.w, size.h);
      ctx.globalAlpha = SEA_ALPHA;
      ctx.fillStyle = MAP_COLORS.bay;
      ctx.fillRect(0, 0, size.w, size.h);
      ctx.globalAlpha = 1;

      ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y);
      const path = geoPath(proj, ctx);

      // Land
      ctx.beginPath();
      path(world.land);
      ctx.fillStyle = MAP_COLORS.paper;
      ctx.fill();

      // Raster field
      if (raster) {
        // Mercator stretches latitude, so that raster is pre-warped (and cached) to draw in one go.
        const img = getRaster(raster.cacheKey, raster.field, raster.colormap, projection === 'mercator' ? 'mercator' : 'none');
        const g = raster.field.grid;
        ctx.globalAlpha = raster.opacity ?? 0.85;
        ctx.imageSmoothingEnabled = raster.smooth ?? true;
        const a = proj([g.bbox.lonMin, g.bbox.latMax]);
        const b = proj([g.bbox.lonMax, g.bbox.latMin]);
        if (a && b) ctx.drawImage(img, a[0], a[1], b[0] - a[0], b[1] - a[1]);
        ctx.globalAlpha = 1;
      }

      // Risk zones
      if (zones && zones.length > 0) {
        ctx.globalAlpha = zoneOpacity;
        for (const z of zones) {
          const a = proj([z.bbox.lonMin, z.bbox.latMax]);
          const b = proj([z.bbox.lonMax, z.bbox.latMin]);
          if (!a || !b) continue;
          ctx.fillStyle = RISK_RGB[z.level];
          ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        }
        ctx.globalAlpha = 1;
      }

      // Country borders, then coastline on top
      ctx.beginPath();
      path(world.borders);
      ctx.strokeStyle = MAP_COLORS.ink;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 0.7 / view.k;
      ctx.setLineDash([3 / view.k, 2 / view.k]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      path(world.coastline);
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 0.9 / view.k;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    return () => cancelAnimationFrame(frame);
  }, [proj, projection, size, view, world, raster, zones, zoneOpacity]);

  /* ---------------- interaction ---------------- */

  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      setView((v) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
        const r = k / v.k;
        return clampView({ k, x: px - (px - v.x) * r, y: py - (py - v.y) * r }, size.w, size.h, extent);
      });
    },
    [size, extent],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !interactive) return;
    // Non-passive so the page does not scroll while zooming the map.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [interactive, zoomAt]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || e.button !== 0) return;
    // Let clicks on interactive overlay items (paths, buttons) through.
    if ((e.target as Element).closest('[data-map-control]')) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    drag.current = { id: d.id, x: e.clientX, y: e.clientY };
    setView((v) => clampView({ k: v.k, x: v.x + dx, y: v.y + dy }, size.w, size.h, extent));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const step = 48;
    const pan = (dx: number, dy: number) => setView((v) => clampView({ k: v.k, x: v.x + dx, y: v.y + dy }, size.w, size.h, extent));
    switch (e.key) {
      case '+':
      case '=':
        zoomAt(1.4, size.w / 2, size.h / 2);
        break;
      case '-':
      case '_':
        zoomAt(1 / 1.4, size.w / 2, size.h / 2);
        break;
      case '0':
        setView(IDENTITY);
        break;
      case 'ArrowLeft':
        pan(step, 0);
        break;
      case 'ArrowRight':
        pan(-step, 0);
        break;
      case 'ArrowUp':
        pan(0, step);
        break;
      case 'ArrowDown':
        pan(0, -step);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  /* ---------------- SVG overlay ---------------- */

  const linePath = useCallback(
    (points: readonly LatLon[], close = false): string => {
      let d = '';
      let pen = false;
      for (const p of points) {
        const s = toScreen(p);
        if (!s) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${s[0].toFixed(1)},${s[1].toFixed(1)}`;
        pen = true;
      }
      return close && d ? `${d}Z` : d;
    },
    [toScreen],
  );

  const boxPath = useCallback(
    (b: BBox) =>
      linePath(
        [
          { lat: b.latMax, lon: b.lonMin },
          { lat: b.latMax, lon: b.lonMax },
          { lat: b.latMin, lon: b.lonMax },
          { lat: b.latMin, lon: b.lonMin },
        ],
        true,
      ),
    [linePath],
  );

  const renderTrack = (t: TrackLayerItem, thick: boolean) => {
    const d = linePath(t.points);
    if (!d) return null;
    return (
      <g key={t.id}>
        {t.onSelect && (
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={14}
            data-map-control
            className="cursor-pointer"
            style={{ pointerEvents: 'stroke' }}
            onClick={t.onSelect}
          />
        )}
        <path
          d={d}
          fill="none"
          stroke={t.color}
          strokeWidth={(t.width ?? (thick ? 3 : 1)) + (t.selected ? 1.5 : 0)}
          strokeOpacity={t.opacity ?? 1}
          strokeDasharray={t.dashed ? '5 4' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  };

  // All labels are placed together so they never overlap: box, scenario paths, storm and core markers, then places.
  const labels = useMemo(() => {
    if (!proj) return [];
    const inView = (s: [number, number] | null): s is [number, number] =>
      s !== null && s[0] >= 0 && s[0] <= size.w && s[1] >= 0 && s[1] <= size.h;
    const reqs: LabelRequest[] = [];
    if (box?.label) {
      const tl = toScreen({ lat: box.bbox.latMax, lon: box.bbox.lonMin });
      const br = toScreen({ lat: box.bbox.latMin, lon: box.bbox.lonMax });
      if (tl && br)
        reqs.push({
          key: 'box',
          text: box.label,
          color: MAP_COLORS.ink,
          weight: 600,
          candidates: [
            [tl[0], tl[1] - 6],
            [tl[0] + 4, tl[1] + 15],
            [tl[0], br[1] + 16],
          ],
          optional: false,
        });
    }
    for (const b of boxes ?? []) {
      const tl = toScreen({ lat: b.bbox.latMax, lon: b.bbox.lonMin });
      if (b.label && tl)
        reqs.push({
          key: `b-${b.id}`,
          text: b.label,
          color: MAP_COLORS.ink,
          weight: 500,
          candidates: [
            [tl[0] + 4, tl[1] + 15],
            [tl[0], tl[1] - 6],
          ],
          optional: true,
        });
    }
    for (const t of scenarioPaths ?? []) {
      if (!t.label) continue;
      // Anchor at the last point still on screen.
      let anchor: [number, number] | null = null;
      for (let k = t.points.length - 1; k >= 0 && !anchor; k--) {
        const s = toScreen(t.points[k] as LatLon);
        if (inView(s)) anchor = s;
      }
      if (anchor)
        reqs.push({
          key: `p-${t.id}`,
          text: t.label,
          color: t.color,
          weight: t.selected ? 600 : 500,
          candidates: aroundPoint(anchor[0], anchor[1], 7, t.label),
          optional: false,
        });
    }
    const ranked = (markers ?? [])
      .filter((m) => m.label)
      .slice()
      .sort((a, b) => (a.kind === 'place' || a.kind === undefined ? 1 : 0) - (b.kind === 'place' || b.kind === undefined ? 1 : 0));
    for (const m of ranked) {
      const s = toScreen(m);
      if (!inView(s) || !m.label) continue;
      const minor = m.kind === 'place' || m.kind === undefined;
      reqs.push({
        key: `m-${m.id}`,
        text: m.label,
        color: m.color ?? MAP_COLORS.ink,
        weight: minor ? 400 : 600,
        candidates: aroundPoint(s[0], s[1], m.kind === 'storm' ? 12 : 7, m.label),
        optional: minor,
      });
    }
    return layoutLabels(reqs, size.w, size.h);
  }, [proj, toScreen, size, box, boxes, scenarioPaths, markers]);

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden select-none touch-none outline-none focus-visible:ring-2 focus-visible:ring-[#1F8A84] focus-visible:ring-inset ${interactive ? 'cursor-grab active:cursor-grabbing' : ''} ${className ?? ''}`}
      role="region"
      aria-roledescription="map"
      aria-label={label}
      tabIndex={interactive ? 0 : -1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      {proj && (
        <svg width={size.w} height={size.h} className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <style>{`.map-label{font-size:13px;paint-order:stroke;stroke:${MAP_COLORS.paper};stroke-width:3px;stroke-linejoin:round;font-variant-numeric:tabular-nums}`}</style>
          {cone && cone.length > 2 && (
            <path d={linePath(cone, true)} fill={MAP_COLORS.teal} fillOpacity={0.12} stroke={MAP_COLORS.teal} strokeOpacity={0.7} strokeWidth={1} />
          )}
          {boxes?.map((b) => (
            <path key={b.id} d={boxPath(b.bbox)} fill="none" stroke={MAP_COLORS.ink} strokeWidth={1} strokeDasharray={b.dashed === false ? undefined : '4 3'} />
          ))}
          <g style={{ pointerEvents: 'auto' }}>{memberTracks?.map((t) => renderTrack(t, false))}</g>
          <g style={{ pointerEvents: 'auto' }}>{scenarioPaths?.map((t) => renderTrack(t, true))}</g>
          {box && <path d={boxPath(box.bbox)} fill="none" stroke={MAP_COLORS.ink} strokeWidth={1.75} strokeDasharray={box.dashed ? '6 4' : undefined} />}
          {outline && outline.length > 2 && (
            <path d={linePath(outline, true)} fill="none" stroke={MAP_COLORS.ink} strokeWidth={2.5} strokeLinejoin="round" />
          )}
          {markers?.map((m) => {
            const s = toScreen(m);
            if (!s) return null;
            const color = m.color ?? MAP_COLORS.ink;
            return (
              <g key={m.id} transform={`translate(${s[0].toFixed(1)},${s[1].toFixed(1)})`}>
                {m.kind === 'storm' ? (
                  <g stroke={color} fill="none" strokeWidth={2}>
                    <circle r={4} fill={color} />
                    <path d="M0,-9 A9,9 0 0 1 9,0" />
                    <path d="M0,9 A9,9 0 0 1 -9,0" />
                  </g>
                ) : m.kind === 'core' ? (
                  <circle r={6} fill="none" stroke={color} strokeWidth={2} />
                ) : m.kind === 'member' ? (
                  <circle r={2.2} fill={color} />
                ) : (
                  <circle r={3} fill={MAP_COLORS.paper} stroke={color} strokeWidth={1.5} />
                )}
              </g>
            );
          })}
          {labels.map((l) => (
            <text key={l.key} x={l.x.toFixed(1)} y={l.y.toFixed(1)} className="map-label" fill={l.color} fontWeight={l.weight}>
              {l.text}
            </text>
          ))}
        </svg>
      )}
      {proj && overlay && (
        <svg width={size.w} height={size.h} className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {overlay({ toScreen, width: size.w, height: size.h })}
        </svg>
      )}
      {interactive && (
        <div className="absolute right-3 top-3 flex flex-col gap-1" data-map-control>
          {[
            { icon: Plus, label: 'Zoom in', act: () => zoomAt(1.4, size.w / 2, size.h / 2) },
            { icon: Minus, label: 'Zoom out', act: () => zoomAt(1 / 1.4, size.w / 2, size.h / 2) },
            { icon: RotateCcw, label: 'Reset view', act: () => setView(IDENTITY) },
          ].map(({ icon: Icon, label: l, act }) => (
            <button
              key={l}
              type="button"
              aria-label={l}
              title={l}
              onClick={act}
              className="grid h-8 w-8 place-items-center rounded-[4px] border border-[#C9D3DE] bg-white text-[#14213D] hover:bg-[#EEF2F6] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1F8A84]"
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {legend && (
        <div className="absolute bottom-3 left-3 max-w-[calc(100%-24px)]" data-map-control>
          {legend}
        </div>
      )}
    </div>
  );
}
