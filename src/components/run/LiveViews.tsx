import { useEffect, useMemo, useRef } from 'react';
import { Check } from 'lucide-react';
import {
  ENSEMBLE_SIZE,
  LEAD_TIMES,
  REGIONS,
  SCENARIOS,
  boxField12km,
  downscale,
  efiField,
  getAlerts,
  getEnsemble,
  getRisk,
  icosphere,
  threatBoxes,
  type PipelinePlan,
  type ScenarioId,
} from '../../sim';
import { MAP_COLORS, MapCanvas, PATH_COLORS, getRaster, type BoxItem, type TrackLayerItem, type ZoneItem } from '../map';
import { fieldColormap, fieldRamp } from '../map/fieldColor';
import { ButtonLink, Legend, RiskBadge, StatusChip, type Status } from '../ui';

/**
 * One live view per pipeline step (docs/PROTOTYPE_SPEC.md Part 5.4). Each view
 * is driven by `p`, the active step's progress (0..1), and the run's elapsed time.
 */
export interface LiveViewProps {
  scenarioId: ScenarioId;
  plan: PipelinePlan;
  elapsedMs: number;
  p: number;
}

const MAP_H = 'h-[340px] sm:h-[400px]';

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="border-t border-line px-4 py-2 text-small tabular-nums">{children}</p>;
}

function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/* 1. Receive ------------------------------------------------------------ */

export function ReceiveView({ plan, elapsedMs }: LiveViewProps) {
  const arrived = plan.memberArrivals.filter((a) => a.atMs <= elapsedMs).length;
  return (
    <div>
      <div className="p-4">
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label="Ensemble members">
          {plan.memberArrivals.map((a) => {
            const here = a.atMs <= elapsedMs;
            return (
              <li
                key={a.member}
                className={`rounded-chip border px-2 py-2 transition-colors ${here ? 'border-teal bg-paper' : 'border-dashed border-line bg-mist text-ink/50'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-head text-lead font-semibold tabular-nums">{String(a.member).padStart(2, '0')}</span>
                  {here && <Check size={14} className="text-teal" aria-label="received" />}
                </div>
                <p className="text-small leading-tight">{a.member === 1 ? 'Control' : 'Member'}</p>
                <p className="text-small leading-tight">{here ? '12 km · 41 leads' : 'Waiting'}</p>
              </li>
            );
          })}
        </ul>
      </div>
      <Caption>
        {arrived} of {ENSEMBLE_SIZE} members received · 12 km grid · {LEAD_TIMES.length} lead times each (0 to 240 h, 6-hourly)
      </Caption>
    </div>
  );
}

/* 2. Decode & chunk ------------------------------------------------------ */

export function DecodeView({ scenarioId, plan, elapsedMs, p }: LiveViewProps) {
  const region = REGIONS[SCENARIOS[scenarioId].regionId];
  const shown = plan.chunkTiles.filter((t) => t.atMs <= elapsedMs).length;
  const boxes = useMemo<BoxItem[]>(
    () => plan.chunkTiles.slice(0, shown).map((t, i) => ({ id: `chunk${i}`, bbox: t.bbox, dashed: false })),
    [plan, shown],
  );
  const written = Math.round(plan.chunkCount * ease(p / 0.92));
  return (
    <div>
      <MapCanvas bbox={region.bbox} interactive={false} label={`${region.name} split into 10° by 10° chunks`} boxes={boxes} className={MAP_H} />
      <Caption>
        {shown} of {plan.chunkTiles.length} spatial chunks per field · {plan.variables} variables × {LEAD_TIMES.length} lead times ·{' '}
        {written.toLocaleString('en-IN')} of {plan.chunkCount.toLocaleString('en-IN')} chunks written
      </Caption>
    </div>
  );
}

/* 3. Anomaly fields (EFI) ------------------------------------------------- */

export function EfiView({ scenarioId, plan, p }: LiveViewProps) {
  const region = REGIONS[SCENARIOS[scenarioId].regionId];
  const field = efiField(scenarioId, plan.efiLeadH);
  const opacity = Math.round(ease(p / 0.8) * 20) / 20;
  const raster = useMemo(
    () => ({ field, colormap: fieldColormap('efi'), cacheKey: `${scenarioId}|efi|${plan.efiLeadH}`, opacity: 0.05 + 0.75 * opacity }),
    [field, scenarioId, plan.efiLeadH, opacity],
  );
  return (
    <div>
      <MapCanvas
        bbox={region.bbox}
        interactive={false}
        label={`Extreme Forecast Index at T+${plan.efiLeadH} h`}
        raster={raster}
        legend={<Legend ramp={fieldRamp('efi')} />}
        className={MAP_H}
      />
      <Caption>
        EFI against the 30-year baseline at T+{plan.efiLeadH} h · maximum {p > 0.9 ? plan.efiMax.toFixed(2) : '…'}
      </Caption>
    </div>
  );
}

/* 4. Screen globe (GNN) ------------------------------------------------- */

export function ScreenView({ scenarioId, p }: LiveViewProps) {
  const scenario = SCENARIOS[scenarioId];
  const region = REGIONS[scenario.regionId];
  const screening = getEnsemble(scenarioId).screening;
  const ranked = useMemo(() => screening.nodes.slice().sort((a, b) => b.score - a.score), [screening]);
  const litTotal = ranked.filter((n) => n.score >= screening.litThreshold).length;
  const lit = Math.round(ease(p / 0.75) * litTotal);
  const litIds = useMemo(() => new Set(ranked.slice(0, lit).map((n) => n.id)), [ranked, lit]);
  const edges = useMemo(() => {
    const ids = new Set(screening.nodes.map((n) => n.id));
    return icosphere(screening.meshLevel).edges.filter(([a, b]) => ids.has(a) && ids.has(b));
  }, [screening]);
  const byId = useMemo(() => new Map(screening.nodes.map((n) => [n.id, n])), [screening]);
  const showBoxes = p >= 0.8;
  const boxes = useMemo<BoxItem[]>(
    () => (showBoxes ? screening.candidates.map((c, i) => ({ id: c.id, bbox: c.bbox, label: `Candidate ${i + 1}: ${c.label}`, dashed: false })) : []),
    [showBoxes, screening],
  );
  return (
    <div>
      <MapCanvas
        bbox={region.bbox}
        interactive={false}
        label="Icosahedral mesh nodes over the region, lighting up where threats are found"
        boxes={boxes}
        overlay={(api) => (
          <g>
            {edges.map(([a, b]) => {
              const na = byId.get(a);
              const nb = byId.get(b);
              const sa = na ? api.toScreen(na) : null;
              const sb = nb ? api.toScreen(nb) : null;
              return sa && sb ? <line key={`${a}-${b}`} x1={sa[0]} y1={sa[1]} x2={sb[0]} y2={sb[1]} stroke={MAP_COLORS.ink} strokeOpacity={0.18} /> : null;
            })}
            {screening.nodes.map((n) => {
              const s = api.toScreen(n);
              if (!s) return null;
              const on = litIds.has(n.id);
              return <circle key={n.id} cx={s[0]} cy={s[1]} r={on ? 3 + 3 * n.score : 1.8} fill={on ? MAP_COLORS.teal : MAP_COLORS.ink} fillOpacity={on ? 0.9 : 0.35} />;
            })}
          </g>
        )}
        className={MAP_H}
      />
      <Caption>
        Mesh level {screening.meshLevel} · {lit} of {screening.nodes.length} nodes above threat score {screening.litThreshold} ·{' '}
        {showBoxes ? `${screening.candidates.length} candidate regions` : 'screening…'}
      </Caption>
    </div>
  );
}

/* 5. Track members ------------------------------------------------------ */

export function TrackView({ scenarioId, p }: LiveViewProps) {
  const region = REGIONS[SCENARIOS[scenarioId].regionId];
  const ensemble = getEnsemble(scenarioId);
  const drawn = Math.min(ENSEMBLE_SIZE, Math.ceil(ease(p / 0.7) * ENSEMBLE_SIZE));
  const clustered = p >= 0.75;
  const tracks = useMemo<TrackLayerItem[]>(
    () =>
      ensemble.members.slice(0, drawn).map((m) => ({
        id: `m${m.member}`,
        points: m.points,
        color: clustered ? (PATH_COLORS[m.clusterIndex] ?? MAP_COLORS.ink) : MAP_COLORS.ink,
        opacity: clustered ? 0.4 : 0.7,
      })),
    [ensemble, drawn, clustered],
  );
  const paths = useMemo<TrackLayerItem[]>(
    () =>
      clustered
        ? ensemble.paths.map((path) => ({
            id: path.key,
            points: path.meanTrack,
            color: PATH_COLORS[path.index] ?? MAP_COLORS.ink,
            label: `${path.label} · ${path.members.length}`,
          }))
        : [],
    [ensemble, clustered],
  );
  return (
    <div>
      <MapCanvas bbox={region.bbox} interactive={false} label="Member tracks linked one by one, then clustered into scenarios" memberTracks={tracks} scenarioPaths={paths} className={MAP_H} />
      <Caption>
        {drawn} of {ENSEMBLE_SIZE} member tracks linked{clustered ? ` · clustered into ${ensemble.paths.length} scenarios` : ''}
      </Caption>
    </div>
  );
}

/* 6. Calibrate ----------------------------------------------------------- */

export function CalibrateView({ scenarioId, p }: LiveViewProps) {
  const alerts = getAlerts(scenarioId);
  const t = ease((p - 0.15) / 0.7);
  return (
    <div>
      <ul className="space-y-5 p-4">
        {alerts.map((a) => {
          const value = a.rawProbability + (a.probability - a.rawProbability) * t;
          return (
            <li key={a.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-small">
                <span className="flex items-center gap-2">
                  <RiskBadge level={a.level} size="sm" />
                  <span>
                    {a.areaName} · {a.thresholdLabel}
                  </span>
                </span>
                <span className="tabular-nums">
                  raw {a.rawProbability.toFixed(2)} → <strong>{value.toFixed(2)}</strong>
                </span>
              </div>
              <div className="relative mt-1.5 h-3 rounded-chip bg-mist" aria-hidden="true">
                <div className="absolute inset-y-0 left-0 rounded-chip border border-ink/40" style={{ width: `${a.rawProbability * 100}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-chip bg-teal" style={{ width: `${value * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <Caption>Raw member fractions are over-confident. EMOS calibration maps them to probabilities that come true as often as they say (illustrative coefficients).</Caption>
    </div>
  );
}

/* 7. Sharpen to 5 km ----------------------------------------------------- */

const SHARP_TILES = 4;

export function SharpenView({ scenarioId, plan, elapsedMs }: LiveViewProps) {
  const scenario = SCENARIOS[scenarioId];
  const box = threatBoxes(scenario)[0];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const patchNow = plan.patches.filter((q) => q.atMs <= elapsedMs).length;
  // Tiles follow the sampler: each tile turns sharp as its share of the patches completes.
  const revealed = Math.min(SHARP_TILES * SHARP_TILES, Math.floor((patchNow / Math.max(1, plan.patches.length)) * SHARP_TILES * SHARP_TILES + 0.001));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !box) return;
    const coarse = boxField12km(scenarioId, box.id);
    const sharp = downscale(scenarioId, box.id, 'diffusion').field;
    const cmap = fieldColormap(scenario.fieldKind);
    const coarseImg = getRaster(`${scenarioId}|${box.id}|12km`, coarse, cmap);
    const sharpImg = getRaster(`${scenarioId}|${box.id}|diffusion|0`, sharp, cmap);
    const size = canvas.width;
    ctx.fillStyle = MAP_COLORS.paper;
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(coarseImg, 0, 0, size, size);
    // 5 km tiles are drawn smoothly so the extra detail reads as detail, not as smaller blocks.
    ctx.imageSmoothingEnabled = true;
    const src = sharp.grid.nx / SHARP_TILES;
    const dst = size / SHARP_TILES;
    for (let k = 0; k < revealed; k++) {
      // Fill in row by row, like patches coming back from the sampler.
      const i = k % SHARP_TILES;
      const j = Math.floor(k / SHARP_TILES);
      ctx.drawImage(sharpImg, i * src, j * src, src, src, i * dst, j * dst, dst, dst);
    }
    ctx.strokeStyle = MAP_COLORS.paper;
    ctx.lineWidth = 2;
    for (let k = 1; k < SHARP_TILES; k++) {
      ctx.beginPath();
      ctx.moveTo(k * dst, 0);
      ctx.lineTo(k * dst, size);
      ctx.moveTo(0, k * dst);
      ctx.lineTo(size, k * dst);
      ctx.stroke();
    }
  }, [scenarioId, scenario.fieldKind, box, revealed]);

  return (
    <div>
      <div className="flex flex-wrap items-start gap-4 p-4">
        <canvas
          ref={canvasRef}
          width={512}
          height={512}
          className="aspect-square w-full max-w-[340px] rounded-chip border border-line"
          role="img"
          aria-label={`${box?.label ?? 'Threat box'}: ${revealed} of ${SHARP_TILES * SHARP_TILES} tiles sharpened from 12 km to 5 km`}
        />
        <div className="min-w-[180px] flex-1 space-y-3 text-small">
          <p className="font-semibold">{box?.label}</p>
          <p>Blocky tiles are the 12 km input. Each sharp tile is a 5 km diffusion sample.</p>
          <p className="tabular-nums">
            {patchNow} of {plan.patches.length} patches sampled · 128 × 128 cells each · 4 samples · 2 steps
          </p>
          <Legend ramp={fieldRamp(scenario.fieldKind)} />
        </div>
      </div>
      <Caption>
        {box?.label}: {revealed} of {SHARP_TILES * SHARP_TILES} tiles sharpened from 12 km to 5 km
      </Caption>
    </div>
  );
}

/* 8. Quality gate -------------------------------------------------------- */

export function GateView({ scenarioId, p }: LiveViewProps) {
  const box = threatBoxes(SCENARIOS[scenarioId])[0];
  const gate = box ? downscale(scenarioId, box.id, 'diffusion').gate : null;
  if (!gate) return null;
  return (
    <div>
      <ul className="divide-y divide-line p-4">
        {gate.checks.map((c, i) => {
          const start = 0.1 + i * 0.25;
          const status: Status = p < start ? 'waiting' : p < start + 0.2 ? 'running' : c.pass ? 'pass' : 'fail';
          return (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-body font-semibold">{c.label}</p>
                <p className="text-small">{status === 'pass' || status === 'fail' ? c.detail : 'Checking…'}</p>
              </div>
              <StatusChip status={status} />
            </li>
          );
        })}
      </ul>
      <Caption>{p >= 0.9 ? gate.message : 'Every 5 km output is checked before it can be used.'}</Caption>
    </div>
  );
}

/* 9. Risk scoring -------------------------------------------------------- */

export function RiskView({ scenarioId, p }: LiveViewProps) {
  const box = threatBoxes(SCENARIOS[scenarioId])[0];
  const risk = getRisk(scenarioId);
  const ordered = useMemo(
    () => risk.zones.filter((z) => z.boxId === box?.id && z.level).sort((a, b) => a.zj - b.zj || a.zi - b.zi),
    [risk, box],
  );
  const shown = Math.round(ease(p / 0.85) * ordered.length);
  const zones = useMemo<ZoneItem[]>(
    () => ordered.slice(0, shown).flatMap((z) => (z.level ? [{ id: z.id, bbox: z.bbox, level: z.level }] : [])),
    [ordered, shown],
  );
  const scored = Math.round(ease(p / 0.85) * risk.scored);
  const severe = zones.filter((z) => z.level === 'severe').length;
  if (!box) return null;
  return (
    <div>
      <MapCanvas bbox={box.bbox} interactive={false} label={`${box.label}: 5 km zones coloured by risk`} zones={zones} className={MAP_H} />
      <Caption>
        {scored} of {risk.scored} zones scored · {severe} Severe in {box.label}
      </Caption>
    </div>
  );
}

/* 10. Ready for review ---------------------------------------------------- */

export function ReadyView({ scenarioId }: LiveViewProps) {
  const alerts = getAlerts(scenarioId);
  return (
    <div className="p-4 sm:p-6">
      <p className="font-head text-h3 font-semibold sm:text-h2">{alerts.length} alerts waiting for review</p>
      <p className="mt-2 max-w-[60ch] text-body">Nothing is issued until a forecaster approves it.</p>
      <ul className="mt-5 divide-y divide-line border-y border-line">
        {alerts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-body">
            <RiskBadge level={a.level} />
            <span className="font-semibold">{a.hazardLabel}</span>
            <span>{a.areaName}</span>
            <span className="tabular-nums">T+{a.leadH} h</span>
            <span className="tabular-nums">
              {a.thresholdLabel} {a.probability.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      <ButtonLink to="/console/alerts" className="mt-5">
        Review the alerts
      </ButtonLink>
    </div>
  );
}
