import { createRng } from './rng';
import { REGIONS, haversineKm, type BBox } from './geo';
import { ENSEMBLE_SIZE, LEAD_TIMES, SCENARIOS, FIELD_META, type ScenarioId } from './scenarios';
import { getEnsemble, threatBoxes, trackAt, type TrackPoint } from './ensemble';
import { efiField } from './fields';
import { calibrateProbability } from './calibration';
import { DIFFUSION_STEPS, SAMPLES_PER_MEMBER, downscale } from './downscale';
import { getAlerts, getRisk } from './risk';
import { maxOf } from './util';

/**
 * The forecast-run state machine: ten steps, their durations, log lines and
 * live-view data, all derived from the seeded engine. Times are at 1× speed.
 */

export type StepId =
  | 'receive'
  | 'decode'
  | 'efi'
  | 'screen'
  | 'track'
  | 'calibrate'
  | 'sharpen'
  | 'gate'
  | 'risk'
  | 'ready';

export interface StepDef {
  id: StepId;
  label: string;
  durationMs: number;
  /** Simulated GPU-minutes used per second of this step (at 1×). */
  gpuPerSecond: number;
}

export const STEPS: readonly StepDef[] = [
  { id: 'receive', label: 'Receive NEPS-G run', durationMs: 6000, gpuPerSecond: 0 },
  { id: 'decode', label: 'Decode & chunk', durationMs: 4000, gpuPerSecond: 0 },
  { id: 'efi', label: 'Anomaly fields (EFI)', durationMs: 4000, gpuPerSecond: 0.02 },
  { id: 'screen', label: 'Screen globe (GNN)', durationMs: 5000, gpuPerSecond: 0.12 },
  { id: 'track', label: 'Track members', durationMs: 6000, gpuPerSecond: 0.03 },
  { id: 'calibrate', label: 'Calibrate', durationMs: 4000, gpuPerSecond: 0.01 },
  { id: 'sharpen', label: 'Sharpen to 5 km', durationMs: 9000, gpuPerSecond: 0.5 },
  { id: 'gate', label: 'Quality gate', durationMs: 3000, gpuPerSecond: 0.02 },
  { id: 'risk', label: 'Risk scoring', durationMs: 4000, gpuPerSecond: 0.02 },
  { id: 'ready', label: 'Ready for review', durationMs: 1500, gpuPerSecond: 0 },
];

export interface LogLine {
  atMs: number;
  step: StepId;
  text: string;
}

export interface ChunkTile {
  bbox: BBox;
  atMs: number;
}

export interface PatchJob {
  boxId: string;
  leadH: number;
  atMs: number;
}

export interface PipelinePlan {
  scenarioId: ScenarioId;
  steps: Array<StepDef & { startMs: number; endMs: number }>;
  totalMs: number;
  logs: LogLine[];
  /** When each member's data "arrives" (receive step). */
  memberArrivals: Array<{ member: number; atMs: number }>;
  chunkTiles: ChunkTile[];
  chunkCount: number;
  variables: number;
  efiMax: number;
  candidateCount: number;
  calibrationExample: { raw: number; calibrated: number; leadH: number };
  patches: PatchJob[];
  gateLabels: string[];
  gatePassed: boolean;
  zonesScored: number;
  severeZones: number;
  alertsWaiting: number;
  gpuMinutesTotal: number;
  /** Simulated wall-clock start (UTC) of processing; the clock runs CLOCK_SCALE× the elapsed time. */
  processingStart: Date;
  illustrative: true;
}

/** Simulated clock: 1 s of demo = 30 s of processing (illustrative). */
export const CLOCK_SCALE = 30;
const VARIABLES = ['10 m wind u', '10 m wind v', 'Mean sea-level pressure', 'Precipitation', '2 m temperature', '2 m humidity', '500 hPa height', '850 hPa wind'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatClock(d: Date): string {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

export function clockAt(plan: PipelinePlan, elapsedMs: number): string {
  return formatClock(new Date(plan.processingStart.getTime() + elapsedMs * CLOCK_SCALE));
}

function tilesFor(b: BBox): BBox[] {
  const out: BBox[] = [];
  for (let lat = Math.floor(b.latMin / 10) * 10; lat < b.latMax; lat += 10)
    for (let lon = Math.floor(b.lonMin / 10) * 10; lon < b.lonMax; lon += 10)
      out.push({ latMin: lat, latMax: lat + 10, lonMin: lon, lonMax: lon + 10 });
  return out;
}

const planCache = new Map<ScenarioId, PipelinePlan>();

export function getPipelinePlan(scenarioId: ScenarioId): PipelinePlan {
  const hit = planCache.get(scenarioId);
  if (hit) return hit;
  const scenario = SCENARIOS[scenarioId];
  const rng = createRng(`${scenario.seed}/pipeline`);
  let t = 0;
  const steps = STEPS.map((s) => {
    const startMs = t;
    t += s.durationMs;
    return { ...s, startMs, endMs: t };
  });
  const span = (id: StepId) => {
    const s = steps.find((x) => x.id === id);
    if (!s) throw new Error(id);
    return s;
  };
  const logs: LogLine[] = [];
  const log = (step: StepId, frac: number, text: string) => {
    const s = span(step);
    logs.push({ atMs: Math.round(s.startMs + frac * s.durationMs), step, text });
  };
  const nLeads = LEAD_TIMES.length;
  const ensemble = getEnsemble(scenarioId);
  const region = REGIONS[scenario.regionId];

  // 1. Receive
  log('receive', 0, `${scenario.run.label} announced · ${ENSEMBLE_SIZE} members expected`);
  const memberArrivals: Array<{ member: number; atMs: number }> = [];
  const receive = span('receive');
  for (let m = 1; m <= ENSEMBLE_SIZE; m++) {
    const frac = Math.min(0.97, 0.04 + (0.9 * (m - 1)) / (ENSEMBLE_SIZE - 1) + rng.range(-0.012, 0.012));
    const atMs = Math.round(receive.startMs + frac * receive.durationMs);
    memberArrivals.push({ member: m, atMs });
    logs.push({ atMs, step: 'receive', text: `Received member ${pad2(m)}/${ENSEMBLE_SIZE} · 12 km · ${nLeads} lead times` });
  }

  // 2. Decode & chunk
  const tiles = tilesFor(region.bbox);
  const chunkCount = nLeads * VARIABLES.length * tiles.length;
  const decode = span('decode');
  const chunkTiles = tiles.map((bbox, k) => ({ bbox, atMs: Math.round(decode.startMs + ((k + 1) / (tiles.length + 1)) * decode.durationMs * 0.8) }));
  log('decode', 0.02, `Decoding GRIB2 · ${VARIABLES.length} variables × ${nLeads} lead times`);
  log('decode', 0.3, `Splitting ${region.name} into ${tiles.length} chunks of 10°×10° per field`);
  log('decode', 0.92, `Wrote ${chunkCount.toLocaleString('en-IN')} chunks to Zarr store`);

  // 3. EFI
  const kindLabel = scenario.fieldKind === 'rain' ? 'rain' : scenario.fieldKind === 'temperature' ? 'Tmax' : 'wet-bulb';
  let efiMax = -1;
  let efiLead = 0;
  for (const h of LEAD_TIMES) {
    if (h % 24 !== 0) continue;
    const v = maxOf(efiField(scenarioId, h).values);
    if (v > efiMax) {
      efiMax = v;
      efiLead = h;
    }
  }
  log('efi', 0.05, 'Loading 30-yr ERA5 baseline for this calendar window');
  log('efi', 0.55, `${FIELD_META[scenario.fieldKind].label}: anomalies for ${nLeads} lead times`);
  log('efi', 0.95, `EFI computed vs 30-yr baseline · max ${efiMax.toFixed(2)} (${kindLabel}, T+${efiLead} h)`);

  // 4. Screen
  const scr = ensemble.screening;
  const lit = scr.nodes.filter((n) => n.score >= scr.litThreshold).length;
  log('screen', 0.04, `Icosahedral mesh level ${scr.meshLevel} · ${scr.nodes.length} nodes over the region`);
  log('screen', 0.55, `${lit} nodes above threat score ${scr.litThreshold}`);
  log('screen', 0.8, `Tier-1 screening: ${scr.candidates.length} candidate regions`);
  scr.candidates.forEach((c, k) => log('screen', 0.86 + k * 0.06, `Candidate ${k + 1}: ${c.label} · T+${c.leadH} h`));

  // 5. Track
  const track = span('track');
  ensemble.members.forEach((m, k) => {
    if (k % 4 !== 0 && k !== ensemble.members.length - 1) return;
    logs.push({
      atMs: Math.round(track.startMs + (0.05 + 0.6 * (k / ensemble.members.length)) * track.durationMs),
      step: 'track',
      text: `Linked member ${pad2(m.member)} · ${m.points.length} fixes`,
    });
  });
  log('track', 0.75, `Linked ${ENSEMBLE_SIZE} member tracks · ${ensemble.paths.length} scenarios`);
  ensemble.paths.forEach((p, k) => log('track', 0.8 + k * 0.06, `${p.label}: ${p.members.length} members`));

  // 6. Calibrate — the alert core with the highest raw exceedance, raw → calibrated
  const alerts = getAlerts(scenarioId);
  const lead = alerts.reduce<(typeof alerts)[number] | undefined>((best, x) => (!best || x.rawProbability > best.rawProbability ? x : best), undefined);
  const calLead = lead ? lead.leadH + 12 : 96;
  const rawEx = lead ? lead.rawProbability : 0.5;
  const calibrationExample = { raw: rawEx, calibrated: calibrateProbability(rawEx, calLead), leadH: calLead };
  log('calibrate', 0.05, `EMOS coefficients loaded for lead day ${Math.round(calLead / 24)}`);
  log('calibrate', 0.45, 'Spread inflated to match past errors · member weights applied');
  log('calibrate', 0.9, `Calibrated exceedance: ${calibrationExample.raw.toFixed(2)} → ${calibrationExample.calibrated.toFixed(2)}`);

  // 7. Sharpen — one 128×128 patch per box per lead time the threat touches it
  const boxes = threatBoxes(scenario);
  const jobs: Array<{ boxId: string; leadH: number }> = [];
  for (const b of boxes) {
    for (const h of LEAD_TIMES) {
      const near = ensemble.members.some((m) => {
        const p: TrackPoint | null = trackAt(m.points, h);
        return p !== null && haversineKm(p, b.center) < (scenario.trackKind === 'cyclone' ? 520 : 420);
      });
      if (near && Math.abs(h - b.leadH) <= 48) jobs.push({ boxId: b.id, leadH: h });
    }
  }
  const sharpen = span('sharpen');
  const patches: PatchJob[] = jobs.map((j, k) => ({
    ...j,
    atMs: Math.round(sharpen.startMs + (0.04 + (0.92 * (k + 1)) / jobs.length) * sharpen.durationMs),
  }));
  log('sharpen', 0.01, `Diffusion downscaler · ${patches.length} patches of 128×128 · ${SAMPLES_PER_MEMBER} samples per member`);
  patches.forEach((p, k) =>
    logs.push({
      atMs: p.atMs,
      step: 'sharpen',
      text: `Patch ${pad2(k + 1)}/${patches.length} sampled · ${SAMPLES_PER_MEMBER} samples · ${DIFFUSION_STEPS} steps`,
    }),
  );

  // 8. Gate
  const first = boxes[0];
  const gate = first ? downscale(scenarioId, first.id, 'diffusion').gate : null;
  const gateLabels = gate ? gate.checks.map((c) => `${c.label} ${c.pass ? '✓' : '✗'}`) : [];
  gate?.checks.forEach((c, k) => log('gate', 0.15 + k * 0.25, `${c.label}: ${c.detail}`));
  log('gate', 0.95, gateLabels.join(' · '));

  // 9. Risk
  const risk = getRisk(scenarioId);
  log('risk', 0.1, `Neighbourhood exceedance on 5 km cells · thresholds ${scenario.thresholds.values.join(' / ')} ${FIELD_META[scenario.fieldKind].units}`);
  log('risk', 0.6, `Moderate ${risk.counts.moderate} · Low ${risk.counts.low}`);
  log('risk', 0.9, `${risk.scored} zones scored · ${risk.counts.severe} Severe`);

  // 10. Ready
  log('ready', 0.3, `${alerts.length} alerts waiting for review`);

  logs.sort((a, b) => a.atMs - b.atMs);
  const gpuMinutesTotal = steps.reduce((s, st) => s + (st.gpuPerSecond * st.durationMs) / 1000, 0);
  // Data typically lands a few hours after initialisation (illustrative).
  const processingStart = new Date(Date.parse(scenario.run.initTime) + (5 * 60 + 40) * 60_000);

  const plan: PipelinePlan = {
    scenarioId,
    steps,
    totalMs: t,
    logs,
    memberArrivals,
    chunkTiles,
    chunkCount,
    variables: VARIABLES.length,
    efiMax,
    candidateCount: scr.candidates.length,
    calibrationExample,
    patches,
    gateLabels,
    gatePassed: gate?.passed ?? false,
    zonesScored: risk.scored,
    severeZones: risk.counts.severe,
    alertsWaiting: alerts.length,
    gpuMinutesTotal,
    processingStart,
    illustrative: true,
  };
  planCache.set(scenarioId, plan);
  return plan;
}

/* ------------------------------------------------------------------ */
/* Run state machine                                                    */
/* ------------------------------------------------------------------ */

export type RunStatus = 'idle' | 'running' | 'paused' | 'done';
export type RunSpeed = 1 | 2 | 4;

export interface RunState {
  status: RunStatus;
  elapsedMs: number;
  speed: RunSpeed;
}

export type RunEvent =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'reset' }
  | { type: 'setSpeed'; speed: RunSpeed }
  | { type: 'tick'; dtMs: number };

export const INITIAL_RUN: RunState = { status: 'idle', elapsedMs: 0, speed: 1 };

/** Pure transition function. `totalMs` comes from the active plan. */
export function runReducer(state: RunState, event: RunEvent, totalMs: number): RunState {
  switch (event.type) {
    case 'start':
      if (state.status === 'running') return state;
      return { ...state, status: 'running', elapsedMs: state.status === 'done' ? 0 : state.elapsedMs };
    case 'pause':
      return state.status === 'running' ? { ...state, status: 'paused' } : state;
    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'running' } : state;
    case 'reset':
      return { ...INITIAL_RUN, speed: state.speed };
    case 'setSpeed':
      return { ...state, speed: event.speed };
    case 'tick': {
      if (state.status !== 'running') return state;
      const elapsedMs = Math.min(totalMs, state.elapsedMs + event.dtMs * state.speed);
      return { ...state, elapsedMs, status: elapsedMs >= totalMs ? 'done' : 'running' };
    }
  }
}

export type StepStatus = 'done' | 'running' | 'waiting';

export interface RunSnapshot {
  /** Index of the active step; equals steps.length when the run is done. */
  stepIndex: number;
  steps: Array<{ id: StepId; label: string; status: StepStatus; progress: number }>;
  progress: number;
  logs: LogLine[];
  gpuMinutes: number;
  clock: string;
}

export function snapshot(plan: PipelinePlan, run: RunState): RunSnapshot {
  const e = run.elapsedMs;
  const started = run.status !== 'idle';
  let stepIndex = plan.steps.findIndex((s) => e < s.endMs);
  if (stepIndex < 0) stepIndex = plan.steps.length;
  let gpu = 0;
  const steps = plan.steps.map((s, k) => {
    const progress = Math.min(1, Math.max(0, (e - s.startMs) / s.durationMs));
    gpu += (s.gpuPerSecond * s.durationMs * progress) / 1000;
    const status: StepStatus = !started ? 'waiting' : k < stepIndex ? 'done' : k === stepIndex ? 'running' : 'waiting';
    return { id: s.id, label: s.label, status, progress: started ? progress : 0 };
  });
  return {
    stepIndex: started ? stepIndex : -1,
    steps,
    progress: e / plan.totalMs,
    logs: started ? plan.logs.filter((l) => l.atMs <= e) : [],
    gpuMinutes: gpu,
    clock: clockAt(plan, e),
  };
}

export function clearPipelineCache(): void {
  planCache.clear();
}
