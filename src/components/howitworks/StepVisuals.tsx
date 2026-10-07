import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { geoOrthographic, geoPath } from 'd3-geo';
import {
  SCENARIOS,
  boxField12km,
  buildCapXml,
  downscale,
  efiField,
  getAlerts,
  getEnsemble,
  getPipelinePlan,
  icosphere,
  reliability,
  threatBoxes,
} from '../../sim';
import { MAP_COLORS, PATH_COLORS, fieldColormap, getRaster } from '../map';
import { worldLayers } from '../map/world';
import { RiskBadge, StatusChip, type Status } from '../ui';
import type { Field } from '../../sim';

const SCENARIO_ID = 'cyclone' as const;

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Starts once the element scrolls into view; with reduced motion it reports
 * "done" immediately so visuals show their end state.
 */
function usePlayOnce(amount = 0.45) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount });
  const reduce = useReducedMotion() ?? false;
  return { ref, play: inView || reduce, instant: reduce };
}

/** Steps a counter from 0 to `count` every `ms` once `play` is true. */
function useStage(play: boolean, instant: boolean, count: number, ms: number, startDelay = 0): number {
  const [stage, setStage] = useState(instant ? count : 0);
  useEffect(() => {
    if (!play) return;
    if (instant) {
      setStage(count);
      return;
    }
    const timers: number[] = [];
    for (let s = 1; s <= count; s++) timers.push(window.setTimeout(() => setStage(s), startDelay + s * ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [play, instant, count, ms, startDelay]);
  return stage;
}

function Frame({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <figure className="m-0 overflow-hidden rounded-panel border border-line bg-paper">
      <div className="relative">{children}</div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-small">
        <span>{caption}</span>
        <span className="whitespace-nowrap rounded-chip border border-line px-2 py-0.5">Replay · illustrative values</span>
      </figcaption>
    </figure>
  );
}

function RasterCanvas({ field, cacheKey, className, style }: { field: Field; cacheKey: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    c.width = field.grid.nx;
    c.height = field.grid.ny;
    ctx.drawImage(getRaster(cacheKey, field, fieldColormap(field.kind === 'efi' ? 'efi' : SCENARIOS[SCENARIO_ID].fieldKind)), 0, 0);
  }, [field, cacheKey]);
  return <canvas ref={ref} className={className} style={{ imageRendering: 'pixelated', ...style }} aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* 1. Scan: ensemble cube, chunks, EFI                                  */
/* ------------------------------------------------------------------ */

export function ScanVisual() {
  const { ref, play, instant } = usePlayOnce();
  const plan = getPipelinePlan(SCENARIO_ID);
  const efi = efiField(SCENARIO_ID, plan.efiLeadH);
  const slices = 8;
  const cols = 4;
  const rows = 3;
  const w = 168;
  const h = 120;
  const total = slices * cols * rows;
  const t = (i: number) => (instant ? { duration: 0 } : { duration: 0.25, delay: 0.2 + i * 0.012 });
  return (
    <Frame caption={`23 members × 41 lead times, split into chunks; then the EFI at T+${plan.efiLeadH} h`}>
      <div ref={ref} className="flex min-h-[300px] flex-wrap items-center justify-center gap-6 px-4 py-4 sm:h-[300px] sm:flex-nowrap sm:py-0">
        <svg viewBox="0 0 280 240" className="h-auto w-full max-w-[280px] sm:h-full sm:max-h-[260px] sm:w-auto" role="img" aria-label="Ensemble cube: members stacked in depth, each split into chunks that light up as they are processed">
          {Array.from({ length: slices }, (_, s) => {
            const ox = 20 + (slices - 1 - s) * 12;
            const oy = 90 - (slices - 1 - s) * 10;
            return (
              <g key={s} transform={`translate(${ox},${oy})`}>
                <rect width={w} height={h} fill={MAP_COLORS.paper} stroke={MAP_COLORS.ink} strokeWidth={1} />
                {Array.from({ length: cols * rows }, (_, k) => {
                  const i = (slices - 1 - s) * cols * rows + k;
                  return (
                    <motion.rect
                      key={k}
                      x={(k % cols) * (w / cols) + 2}
                      y={Math.floor(k / cols) * (h / rows) + 2}
                      width={w / cols - 4}
                      height={h / rows - 4}
                      fill={MAP_COLORS.teal}
                      initial={{ opacity: instant ? 0.55 : 0.06 }}
                      animate={{ opacity: play ? 0.55 : 0.06 }}
                      transition={t(i)}
                    />
                  );
                })}
              </g>
            );
          })}
          <text x={20} y={232} fontSize={12} fill={MAP_COLORS.ink}>
            Grid (12 km)
          </text>
          <text x={196} y={18} fontSize={12} fill={MAP_COLORS.ink}>
            23 members
          </text>
        </svg>
        <motion.div
          className="w-[150px] shrink-0"
          initial={{ opacity: instant ? 1 : 0 }}
          animate={{ opacity: play ? 1 : 0 }}
          transition={instant ? { duration: 0 } : { duration: 0.8, delay: 0.2 + total * 0.012 + 0.3 }}
        >
          <div className="relative aspect-square w-full overflow-hidden rounded-chip border border-line bg-mist">
            <RasterCanvas field={efi} cacheKey={`${SCENARIO_ID}|efi|${plan.efiLeadH}`} className="absolute inset-0 h-full w-full" style={{ imageRendering: 'auto' }} />
          </div>
          <p className="mt-1 text-small">EFI, max {plan.efiMax.toFixed(2)}</p>
        </motion.div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Track: icosahedral sphere, lit nodes, tracks                       */
/* ------------------------------------------------------------------ */

export function TrackVisual() {
  const { ref, play, instant } = usePlayOnce();
  const W = 420;
  const H = 300;
  const geo = useMemo(() => {
    // Closer than a whole globe so the tracks read, while the curved edge still shows it is a sphere.
    const proj = geoOrthographic().rotate([-87, -16]).scale(205).translate([W / 2, H / 2 + 40]).clipAngle(90);
    const path = geoPath(proj);
    const mesh = icosphere(3);
    const meshPath = path({
      type: 'MultiLineString',
      coordinates: mesh.edges.map(([a, b]) => {
        const na = mesh.nodes[a];
        const nb = mesh.nodes[b];
        return na && nb ? [[na.lon, na.lat], [nb.lon, nb.lat]] : [];
      }),
    });
    const coast = path(worldLayers({ latMin: -5, latMax: 40, lonMin: 55, lonMax: 115 }).coastline);
    const ensemble = getEnsemble(SCENARIO_ID);
    const lit = ensemble.screening.nodes
      .filter((n) => n.score >= ensemble.screening.litThreshold)
      .sort((a, b) => b.score - a.score)
      .map((n) => ({ id: n.id, xy: proj([n.lon, n.lat]) }));
    const tracks = ensemble.members.map((m) => ({
      id: m.member,
      color: PATH_COLORS[m.clusterIndex] ?? MAP_COLORS.ink,
      d: path({ type: 'LineString', coordinates: m.points.map((p) => [p.lon, p.lat]) }) ?? '',
    }));
    return { sphere: path({ type: 'Sphere' }) ?? '', meshPath: meshPath ?? '', coast: coast ?? '', lit, tracks };
  }, []);
  const tracksStart = 0.3 + geo.lit.length * 0.08 + 0.2;
  return (
    <Frame caption="The globe as an icosahedral mesh; nodes light up where a threat is found, then member tracks form">
      <div ref={ref} className="flex h-[300px] items-center justify-center overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto max-h-full w-full max-w-[420px]" role="img" aria-label="Wireframe globe: mesh nodes over the Bay of Bengal light up and 23 cyclone tracks form">
          <path d={geo.sphere} fill={MAP_COLORS.mist} stroke={MAP_COLORS.ink} strokeWidth={1} />
          <path d={geo.coast} fill="none" stroke={MAP_COLORS.ink} strokeOpacity={0.35} strokeWidth={0.8} />
          <path d={geo.meshPath} fill="none" stroke={MAP_COLORS.bay} strokeOpacity={0.3} strokeWidth={0.6} />
          {geo.lit.map((n, i) =>
            n.xy ? (
              <motion.circle
                key={n.id}
                cx={n.xy[0]}
                cy={n.xy[1]}
                r={3.2}
                fill={MAP_COLORS.teal}
                initial={{ opacity: instant ? 1 : 0, scale: instant ? 1 : 0.2 }}
                animate={{ opacity: play ? 1 : 0, scale: play ? 1 : 0.2 }}
                transition={instant ? { duration: 0 } : { duration: 0.3, delay: 0.3 + i * 0.08 }}
              />
            ) : null,
          )}
          {geo.tracks.map((tr, i) => (
            <motion.path
              key={tr.id}
              d={tr.d}
              fill="none"
              stroke={tr.color}
              strokeWidth={1}
              strokeOpacity={0.8}
              initial={{ pathLength: instant ? 1 : 0 }}
              animate={{ pathLength: play ? 1 : 0 }}
              transition={instant ? { duration: 0 } : { duration: 1, delay: tracksStart + i * 0.04 }}
            />
          ))}
        </svg>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Calibrate: reliability curve moves to the diagonal               */
/* ------------------------------------------------------------------ */

export function CalibrateVisual() {
  const { ref, play, instant } = usePlayOnce();
  const rel = reliability(SCENARIO_ID, 5);
  const W = 300;
  const H = 240;
  const pad = 32;
  const sx = (v: number) => pad + v * (W - pad - 12);
  const sy = (v: number) => H - pad - v * (H - pad - 12);
  const line = (key: 'raw' | 'calibrated') => rel.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.forecast).toFixed(1)},${sy(p[key]).toFixed(1)}`).join('');
  const raw = line('raw');
  const cal = line('calibrated');
  const done = instant || play;
  return (
    <Frame caption="Day 5: the raw curve sags below the diagonal; calibration moves it onto the diagonal">
      <div ref={ref} className="flex h-[300px] items-center justify-center px-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto max-h-full w-full max-w-[300px]" role="img" aria-label="Reliability curve moving from over-confident to the diagonal">
          <line x1={pad} y1={H - pad} x2={W - 12} y2={H - pad} stroke={MAP_COLORS.ink} />
          <line x1={pad} y1={12} x2={pad} y2={H - pad} stroke={MAP_COLORS.ink} />
          <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke={MAP_COLORS.ink} strokeDasharray="4 4" />
          <path d={raw} fill="none" stroke={MAP_COLORS.bay} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} />
          <motion.path
            d={done ? cal : raw}
            initial={{ d: instant ? cal : raw }}
            animate={{ d: play ? cal : raw }}
            transition={instant ? { duration: 0 } : { duration: 1.6, delay: 0.5, ease: 'easeInOut' }}
            fill="none"
            stroke={MAP_COLORS.teal}
            strokeWidth={3}
          />
          <text x={sx(0.5)} y={H - 6} fontSize={12} textAnchor="middle" fill={MAP_COLORS.ink}>
            Forecast probability
          </text>
          <text x={10} y={sy(0.5)} fontSize={12} textAnchor="middle" fill={MAP_COLORS.ink} transform={`rotate(-90 10 ${sy(0.5)})`}>
            Observed
          </text>
          <text x={sx(0.62)} y={sy(0.36)} fontSize={12} fill={MAP_COLORS.bay}>
            Raw
          </text>
          <text x={sx(0.5)} y={sy(0.8)} fontSize={12} fill={MAP_COLORS.teal} fontWeight={600}>
            Calibrated
          </text>
        </svg>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Sharpen: 12 km morphs to 5 km, peak label stays high              */
/* ------------------------------------------------------------------ */

export function SharpenVisual() {
  const { ref, play, instant } = usePlayOnce();
  const box = threatBoxes(SCENARIOS[SCENARIO_ID])[0];
  const data = useMemo(() => {
    if (!box) return null;
    // The sample whose peak is closest to the 5 km reference.
    const samples = [0, 1, 2, 3].map((s) => downscale(SCENARIO_ID, box.id, 'diffusion', { sample: s }));
    const best = samples.reduce((a, b) => (Math.abs(b.peakKeptPct - 100) < Math.abs(a.peakKeptPct - 100) ? b : a));
    const input = boxField12km(SCENARIO_ID, box.id);
    const bil = downscale(SCENARIO_ID, box.id, 'bilinear');
    return { best, input, inputPeak: Math.max(...input.values), bil };
  }, [box]);
  const stage = useStage(play, instant, 1, 2100);
  if (!box || !data) return null;
  return (
    <Frame caption={`${box.label}: the 12 km input becomes 5 km detail, and the peak is kept`}>
      <div ref={ref} className="flex min-h-[300px] flex-wrap items-center justify-center gap-5 px-4 py-4 sm:h-[300px] sm:flex-nowrap sm:py-0">
        <div className="relative aspect-square w-[240px] max-w-full overflow-hidden rounded-chip border border-line">
          <RasterCanvas field={data.input} cacheKey={`${SCENARIO_ID}|${box.id}|12km`} className="absolute inset-0 h-full w-full" />
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: instant ? 1 : 0 }}
            animate={{ opacity: play ? 1 : 0 }}
            transition={instant ? { duration: 0 } : { duration: 1.4, delay: 0.6 }}
          >
            <RasterCanvas field={data.best.field} cacheKey={`${SCENARIO_ID}|${box.id}|diffusion|${data.best.sample}`} className="h-full w-full" />
          </motion.div>
        </div>
        <div className="w-[150px] space-y-3 text-small tabular-nums">
          <p className="font-semibold">{stage >= 1 ? '5 km diffusion' : '12 km input'}</p>
          <p>
            Peak{' '}
            <span className="font-head text-h3 font-semibold text-teal">{Math.round(stage >= 1 ? data.best.peak : data.inputPeak)}</span> mm/day
          </p>
          <p>{stage >= 1 ? `${Math.round(data.best.peakKeptPct)}% of the 5 km reference peak kept` : 'Peaks are averaged away at 12 km'}</p>
          <p className="text-ink/75">Bilinear would keep {Math.round(data.bil.peakKeptPct)}%.</p>
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Check: three gate checks, one failing example                    */
/* ------------------------------------------------------------------ */

export function CheckVisual() {
  const { ref, play, instant } = usePlayOnce();
  const box = threatBoxes(SCENARIOS[SCENARIO_ID])[0];
  const ok = box ? downscale(SCENARIO_ID, box.id, 'diffusion').gate : null;
  const bad = box ? downscale(SCENARIO_ID, box.id, 'diffusion', { failing: true }).gate : null;
  const stage = useStage(play, instant, 8, 450, 200);
  if (!ok || !bad) return null;
  const column = (title: string, gate: typeof ok, offset: number) => (
    <div className="min-w-0 flex-1 rounded-chip border border-line p-3">
      <p className="text-small font-semibold">{title}</p>
      <ul className="mt-2 space-y-2">
        {gate.checks.map((c, i) => {
          const s = stage - offset;
          const status: Status = s > i ? (c.pass ? 'pass' : 'fail') : s === i ? 'running' : 'waiting';
          return (
            <li key={c.id} className="flex items-center justify-between gap-2 text-small">
              <span>{c.label}</span>
              <StatusChip status={status} />
            </li>
          );
        })}
      </ul>
      <p className={`mt-3 text-small ${stage - offset > gate.checks.length ? '' : 'invisible'} ${gate.passed ? '' : 'font-semibold'}`}>{gate.message}</p>
    </div>
  );
  return (
    <Frame caption="Every 5 km result is checked; a failing sample falls back to the calibrated 12 km forecast">
      <div ref={ref} className="flex min-h-[300px] flex-col justify-center gap-3 px-4 py-4 sm:h-[300px] sm:flex-row sm:items-center sm:py-0">
        {column('Sample A', ok, 0)}
        {column('Sample B', bad, 4)}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Review & alert: approval, then the CAP preview                   */
/* ------------------------------------------------------------------ */

export function ReviewVisual() {
  const { ref, play, instant } = usePlayOnce();
  const alert = getAlerts(SCENARIO_ID)[0];
  const stage = useStage(play, instant, 2, 1100, 300);
  const xml = useMemo(
    () =>
      alert
        ? buildCapXml(alert, { sentAt: new Date(Date.UTC(2020, 4, 16, 6, 5)) })
            .split('\n')
            .slice(1, 16)
            .join('\n')
        : '',
    [alert],
  );
  if (!alert) return null;
  return (
    <Frame caption="A forecaster approves; only then is a CAP 1.2 message generated (preview, never sent)">
      <div ref={ref} className="grid min-h-[300px] grid-cols-1 gap-3 p-4 sm:h-[300px] sm:grid-cols-2 sm:overflow-hidden">
        <div className="rounded-chip border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge level={alert.level} />
            <span className="text-small font-semibold">{alert.hazardLabel}</span>
          </div>
          <p className="mt-2 text-body">{alert.areaName}</p>
          <p className="text-small tabular-nums">
            T+{alert.leadH} h · {alert.thresholdLabel} {alert.probability.toFixed(2)}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span
              className={`inline-flex h-9 items-center rounded-chip px-3 text-small font-medium transition-colors ${
                stage >= 1 ? 'border border-line bg-mist text-ink' : 'border border-teal bg-teal text-paper'
              }`}
              aria-hidden="true"
            >
              Approve
            </span>
            <StatusChip status={stage >= 1 ? 'approved' : 'pending'} />
          </div>
        </div>
        <motion.pre
          className="m-0 max-h-[260px] overflow-hidden rounded-chip bg-mist p-3 text-[12px] leading-snug"
          initial={{ opacity: instant ? 1 : 0 }}
          animate={{ opacity: stage >= 2 ? 1 : 0 }}
          transition={instant ? { duration: 0 } : { duration: 0.6 }}
          aria-label="CAP 1.2 preview"
        >
          {xml}
        </motion.pre>
      </div>
    </Frame>
  );
}
