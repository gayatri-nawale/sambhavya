import { fbm, hashString } from './rng';
import {
  REGIONS,
  RES_12KM,
  cellLat,
  cellLon,
  clamp,
  coastProximity,
  landFraction,
  localOffsetKm,
  makeGrid,
  makeGridN,
  smoothstep,
  type Grid,
  type LatLon,
} from './geo';
import { FIELD_META, SCENARIOS, type FieldKind, type Scenario, type ScenarioId } from './scenarios';
import { PATCH_CELLS, getEnsemble, threatBoxes, trackAt, type ThreatBox, type TrackPoint } from './ensemble';
import { memo } from './util';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type Resolution = '12km' | '5km';

export interface Field {
  grid: Grid;
  /** Row-major values, row 0 = north. */
  values: Float32Array;
  kind: FieldKind | 'efi';
  units: string;
  leadH: number;
  resolution: Resolution;
  /** 1-based ensemble member the field belongs to (1 = control). */
  member: number;
  illustrative: true;
}

/** Level of detail: "coarse" mimics what a 12 km model resolves, "fine" adds 5 km structure. */
type Detail = 'coarse' | 'fine';

/** 5 km patch = 128 cells; the matching 12 km input grid has 52 cells over the same box. */
export const COARSE_CELLS = 52;

/* ------------------------------------------------------------------ */
/* Point evaluators                                                     */
/* ------------------------------------------------------------------ */

type Evaluator = (lat: number, lon: number) => number;

interface StormState {
  center: TrackPoint | null;
  /** Heading of motion, radians (0 = east, π/2 = north). */
  heading: number;
}

function stormState(points: readonly TrackPoint[], leadH: number): StormState {
  const center = trackAt(points, leadH);
  const a = trackAt(points, leadH - 6) ?? center;
  const b = trackAt(points, leadH + 6) ?? center;
  const heading = a && b ? Math.atan2(b.lat - a.lat, (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180)) : Math.PI / 2;
  return { center, heading };
}

function gauss2(lat: number, lon: number, c: LatLon, sLat: number, sLon: number): number {
  return Math.exp(-(((lat - c.lat) / sLat) ** 2 + ((lon - c.lon) / sLon) ** 2) / 2);
}

/** Terrain that lifts moist flow (Meghalaya plateau, north-east hills, Eastern Ghats, Arakan). */
function rainTerrain(lat: number, lon: number): number {
  return (
    3.0 * gauss2(lat, lon, { lat: 25.25, lon: 91.6 }, 0.22, 0.75) +
    1.0 * gauss2(lat, lon, { lat: 23.9, lon: 92.8 }, 0.6, 0.45) +
    0.7 * gauss2(lat, lon, { lat: 19.3, lon: 84.0 }, 0.6, 0.5) +
    1.4 * gauss2(lat, lon, { lat: 20.3, lon: 93.6 }, 1.0, 0.35)
  );
}

/** Overall calibration of the synthetic rain amounts (illustrative). */
const RAIN_SCALE = 0.9;
const SWATH_STRETCH = 2.2;

function rainEvaluator(points: readonly TrackPoint[], leadH: number, detail: Detail, seed: number): Evaluator {
  const { center, heading } = stormState(points, leadH);
  const fine = detail === 'fine';
  const octaves = fine ? 6 : 3;
  const ringWidth = fine ? 22 : 40;
  const bandSharp = fine ? 6 : 2;
  const drift = leadH * 0.04;
  if (!center) {
    return (lat, lon) => {
      const n = fbm(lon * 0.8 + drift, lat * 0.8, seed, octaves);
      return Math.max(0, 6 * (n - 0.45) * (1 + rainTerrain(lat, lon)));
    };
  }
  const I = clamp(center.intensity / 240, 0, 1);
  const frontRight = heading - Math.PI / 4;
  return (lat, lon) => {
    const { dx, dy } = localOffsetKm(center, lat, lon);
    const r = Math.hypot(dx, dy);
    if (r > 1100) return 0;
    const theta = Math.atan2(dy, dx);
    // A day's rain is a swath along the track, so stretch the core along the motion.
    const along = dx * Math.cos(heading) + dy * Math.sin(heading);
    const across = -dx * Math.sin(heading) + dy * Math.cos(heading);
    const rs = Math.hypot(along / SWATH_STRETCH, across);
    const shield = 95 * Math.max(I, 0.3) ** 0.8 * Math.exp(-((rs / 170) ** 2));
    const ring = 105 * I * Math.exp(-(((rs - 40) / ringWidth) ** 2));
    const phase = theta - Math.log(Math.max(r, 30) / 40) / 0.3;
    const band =
      (0.5 + 0.5 * Math.cos(2 * phase)) ** bandSharp *
      85 *
      Math.max(I, 0.3) ** 0.7 *
      Math.exp(-r / 330) *
      smoothstep(50, 120, r);
    const asym = 1 + 0.35 * Math.cos(theta - frontRight);
    const coast = 1 + 0.5 * coastProximity(lat, lon);
    // Moist inflow feeding orographic rain well away from the centre.
    const oro = 42 * rainTerrain(lat, lon) * Math.exp(-((r / 480) ** 2));
    const n = fbm(lon * 0.9 + drift, lat * 0.9, seed, octaves);
    // Convective cells (~7 km) average out at 12 km but set the 5 km peaks.
    const cells = fine ? 0.6 + 0.8 * smoothstep(0.3, 0.72, fbm(lon * 16 + drift, lat * 16, seed + 77, 2)) : 1;
    return Math.max(0, RAIN_SCALE * ((shield + ring + band) * asym * coast + oro) * (0.5 + n) * cells);
  };
}

/** Distance (degrees) from a point to a segment, for the Aravalli ridge. */
function segmentDistance(lat: number, lon: number, a: LatLon, b: LatLon): number {
  const vx = b.lon - a.lon;
  const vy = b.lat - a.lat;
  const t = clamp(((lon - a.lon) * vx + (lat - a.lat) * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(lon - (a.lon + t * vx), lat - (a.lat + t * vy));
}

const ARAVALLI_A: LatLon = { lat: 24.6, lon: 72.8 };
const ARAVALLI_B: LatLon = { lat: 28.4, lon: 76.9 };

/** Late-May climatological Tmax over north-west India (illustrative). */
function heatBaseline(lat: number, lon: number, detail: Detail): number {
  const lf = landFraction(lat, lon);
  const desert = 2.2 * gauss2(lat, lon, { lat: 26.8, lon: 72.5 }, 2.3, 3.2);
  const hills = -9 * smoothstep(30.2, 32, lat) * smoothstep(74.8, 76.5, lon);
  const ridgeD = segmentDistance(lat, lon, ARAVALLI_A, ARAVALLI_B);
  const ridge = detail === 'fine' ? -2.2 * Math.exp(-((ridgeD / 0.16) ** 2)) : -1.1 * Math.exp(-((ridgeD / 0.32) ** 2));
  const urban =
    detail === 'fine'
      ? 0.9 * gauss2(lat, lon, { lat: 28.61, lon: 77.21 }, 0.12, 0.14) + 0.6 * gauss2(lat, lon, { lat: 26.91, lon: 75.79 }, 0.08, 0.08)
      : 0.3 * gauss2(lat, lon, { lat: 28.61, lon: 77.21 }, 0.25, 0.25);
  const land = 41 + desert + hills + ridge + urban;
  return lf * land + (1 - lf) * 33;
}

function heatEvaluator(points: readonly TrackPoint[], leadH: number, detail: Detail, seed: number): Evaluator {
  const core = trackAt(points, leadH);
  const octaves = detail === 'fine' ? 6 : 3;
  const amp = detail === 'fine' ? 1.6 : 1.0;
  return (lat, lon) => {
    let anomaly = 0;
    if (core) {
      const { dx, dy } = localOffsetKm(core, lat, lon);
      anomaly = core.intensity * Math.exp(-((dx / 1.25) ** 2 + dy * dy) / (2 * 300 * 300));
    }
    const n = fbm(lon * 1.1 + leadH * 0.01, lat * 1.1, seed, octaves) - 0.5;
    // Local hot pockets (bare sand, depressions) only resolved at 5 km.
    const pockets = detail === 'fine' ? 3.2 * (smoothstep(0.55, 0.8, fbm(lon * 20, lat * 20, seed + 91, 2)) - 0.18) : 0;
    return heatBaseline(lat, lon, detail) + anomaly * landFraction(lat, lon) + amp * n + pockets;
  };
}

/** Climatological daily maximum wet-bulb temperature on the east coast (illustrative). */
function wetBulbBaseline(lat: number, lon: number, detail: Detail): number {
  const lf = landFraction(lat, lon);
  const coast = coastProximity(lat, lon);
  const ghats = (detail === 'fine' ? -1.6 : -0.8) * gauss2(lat, lon, { lat: 18.3, lon: 82.8 }, detail === 'fine' ? 0.35 : 0.6, 0.45);
  const deltas =
    detail === 'fine'
      ? 0.6 * gauss2(lat, lon, { lat: 16.7, lon: 82.0 }, 0.25, 0.3) + 0.5 * gauss2(lat, lon, { lat: 20.3, lon: 86.2 }, 0.25, 0.3)
      : 0.25 * gauss2(lat, lon, { lat: 16.7, lon: 82.0 }, 0.5, 0.5);
  return 27.6 - 2.6 * smoothstep(0.55, 1, lf) + 0.9 * coast + ghats + deltas;
}

function wetBulbEvaluator(points: readonly TrackPoint[], leadH: number, detail: Detail, seed: number): Evaluator {
  const core = trackAt(points, leadH);
  const octaves = detail === 'fine' ? 6 : 3;
  const amp = detail === 'fine' ? 0.8 : 0.5;
  return (lat, lon) => {
    let anomaly = 0;
    if (core) {
      const { dx, dy } = localOffsetKm(core, lat, lon);
      const along = Math.exp(-(dx * dx + dy * dy) / (2 * 240 * 240));
      anomaly = core.intensity * along * (0.35 + 0.65 * coastProximity(lat, lon));
    }
    const n = fbm(lon * 1.3 + leadH * 0.01, lat * 1.3, seed, octaves) - 0.5;
    // Sea-breeze convergence lines and creeks: fine-scale humid pockets.
    const pockets = detail === 'fine' ? 1.5 * (smoothstep(0.55, 0.8, fbm(lon * 20, lat * 20, seed + 91, 2)) - 0.18) * (0.4 + coastProximity(lat, lon)) : 0;
    return wetBulbBaseline(lat, lon, detail) + anomaly + amp * n + pockets;
  };
}

function memberPoints(scenarioId: ScenarioId, member: number): readonly TrackPoint[] {
  const m = getEnsemble(scenarioId).members[member - 1];
  if (!m) throw new Error(`No member ${member}`);
  return m.points;
}

function evaluator(scenario: Scenario, member: number, leadH: number, detail: Detail): Evaluator {
  const pts = memberPoints(scenario.id, member);
  const seed = hashString(`${scenario.seed}/field/${member}`);
  switch (scenario.fieldKind) {
    case 'rain':
      return rainEvaluator(pts, leadH, detail, seed);
    case 'temperature':
      return heatEvaluator(pts, leadH, detail, seed);
    case 'wetBulb':
      return wetBulbEvaluator(pts, leadH, detail, seed);
  }
}

function baselineEvaluator(scenario: Scenario): Evaluator {
  switch (scenario.fieldKind) {
    case 'rain':
      return () => 8; // climatological daily rain (illustrative)
    case 'temperature':
      return (lat, lon) => heatBaseline(lat, lon, 'coarse');
    case 'wetBulb':
      return (lat, lon) => wetBulbBaseline(lat, lon, 'coarse');
  }
}

/* ------------------------------------------------------------------ */
/* Grid sampling                                                        */
/* ------------------------------------------------------------------ */

function sample(grid: Grid, f: Evaluator): Float32Array {
  const out = new Float32Array(grid.nx * grid.ny);
  for (let j = 0; j < grid.ny; j++) {
    const lat = cellLat(grid, j);
    for (let i = 0; i < grid.nx; i++) out[j * grid.nx + i] = f(lat, cellLon(grid, i));
  }
  return out;
}

/** Area-average a fine grid onto a coarser grid covering the same box. */
export function blockAverage(fine: Float32Array, fg: Grid, cg: Grid): Float32Array {
  const sum = new Float32Array(cg.nx * cg.ny);
  const cnt = new Uint16Array(cg.nx * cg.ny);
  for (let j = 0; j < fg.ny; j++) {
    const cj = Math.min(cg.ny - 1, Math.floor(((j + 0.5) * fg.dLat) / cg.dLat));
    for (let i = 0; i < fg.nx; i++) {
      const ci = Math.min(cg.nx - 1, Math.floor(((i + 0.5) * fg.dLon) / cg.dLon));
      const k = cj * cg.nx + ci;
      sum[k] = (sum[k] as number) + (fine[j * fg.nx + i] as number);
      cnt[k] = (cnt[k] as number) + 1;
    }
  }
  for (let k = 0; k < sum.length; k++) sum[k] = (sum[k] as number) / Math.max(1, cnt[k] as number);
  return sum;
}

const fieldCache = new Map<string, Field>();

function makeField(grid: Grid, values: Float32Array, scenario: Scenario, leadH: number, resolution: Resolution, member: number): Field {
  const meta = FIELD_META[scenario.fieldKind];
  return { grid, values, kind: meta.kind, units: meta.units, leadH, resolution, member, illustrative: true };
}

/** 12 km field over the scenario's whole region (what NEPS-G resolves). */
export function regionField(scenarioId: ScenarioId, leadH: number, member = 1): Field {
  return memo(fieldCache, `region|${scenarioId}|${leadH}|${member}`, () => {
    const scenario = SCENARIOS[scenarioId];
    const grid = makeGrid(REGIONS[scenario.regionId].bbox, RES_12KM);
    return makeField(grid, sample(grid, evaluator(scenario, member, leadH, 'coarse')), scenario, leadH, '12km', member);
  });
}

/** Extreme Forecast Index-style field in [-1, 1] vs the climatological baseline (illustrative). */
export function efiField(scenarioId: ScenarioId, leadH: number): Field {
  return memo(fieldCache, `efi|${scenarioId}|${leadH}`, () => {
    const scenario = SCENARIOS[scenarioId];
    const src = regionField(scenarioId, leadH);
    const base = sample(src.grid, baselineEvaluator(scenario));
    const scale = scenario.fieldKind === 'rain' ? 150 : scenario.fieldKind === 'temperature' ? 4 : 1.8;
    const values = new Float32Array(src.values.length);
    for (let k = 0; k < values.length; k++) values[k] = Math.tanh(((src.values[k] as number) - (base[k] as number)) / scale);
    return { ...src, values, kind: 'efi', units: 'EFI' };
  });
}

export function getBox(scenarioId: ScenarioId, boxId: string): ThreatBox {
  const box = threatBoxes(SCENARIOS[scenarioId]).find((b) => b.id === boxId);
  if (!box) throw new Error(`Unknown threat box ${boxId}`);
  return box;
}

/** Reference 5 km field over a threat box (the "truth" the downscalers aim for). */
export function boxField5km(scenarioId: ScenarioId, boxId: string, member = 1, leadH?: number): Field {
  const box = getBox(scenarioId, boxId);
  const h = leadH ?? box.leadH;
  return memo(fieldCache, `box5|${scenarioId}|${boxId}|${member}|${h}`, () => {
    const scenario = SCENARIOS[scenarioId];
    const grid = makeGridN(box.bbox, PATCH_CELLS, PATCH_CELLS);
    return makeField(grid, sample(grid, evaluator(scenario, member, h, 'fine')), scenario, h, '5km', member);
  });
}

/** 12 km input over a threat box: the 5 km reference averaged to 12 km cells. */
export function boxField12km(scenarioId: ScenarioId, boxId: string, member = 1, leadH?: number): Field {
  const box = getBox(scenarioId, boxId);
  const h = leadH ?? box.leadH;
  return memo(fieldCache, `box12|${scenarioId}|${boxId}|${member}|${h}`, () => {
    const fine = boxField5km(scenarioId, boxId, member, h);
    const grid = makeGridN(box.bbox, COARSE_CELLS, COARSE_CELLS);
    return { ...fine, grid, values: blockAverage(fine.values, fine.grid, grid), resolution: '12km' };
  });
}

export function clearFieldCache(): void {
  fieldCache.clear();
}
