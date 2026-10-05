import { createRng } from './rng';
import { SCENARIOS, formatUtc, type ScenarioId } from './scenarios';
import { memo } from './util';

/**
 * Raw NEPS-G probabilities are over-confident. An EMOS-style correction maps
 * them to calibrated probabilities. Coefficients and curves are illustrative.
 */

export const LEAD_DAYS = [3, 5, 7, 10] as const;
export type LeadDay = (typeof LEAD_DAYS)[number];

interface EmosParams {
  a: number;
  b: number;
}

const PARAMS: Record<LeadDay, EmosParams> = {
  3: { a: -0.2, b: 0.75 },
  5: { a: -0.3, b: 0.6 },
  7: { a: -0.38, b: 0.5 },
  10: { a: -0.45, b: 0.4 },
};

function logit(p: number): number {
  return Math.log(p / (1 - p));
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** EMOS coefficients interpolated to any lead time (hours). */
export function emosParams(leadH: number): EmosParams {
  const day = Math.min(10, Math.max(3, leadH / 24));
  for (let k = 0; k < LEAD_DAYS.length - 1; k++) {
    const d0 = LEAD_DAYS[k] as LeadDay;
    const d1 = LEAD_DAYS[k + 1] as LeadDay;
    if (day <= d1) {
      const t = (day - d0) / (d1 - d0);
      return { a: PARAMS[d0].a + (PARAMS[d1].a - PARAMS[d0].a) * t, b: PARAMS[d0].b + (PARAMS[d1].b - PARAMS[d0].b) * t };
    }
  }
  return PARAMS[10];
}

/** Map a raw ensemble exceedance fraction to a calibrated probability. 0 stays 0. */
export function calibrateProbability(raw: number, leadH: number): number {
  if (raw <= 0) return 0;
  const { a, b } = emosParams(leadH);
  const p = Math.min(0.99, Math.max(0.01, raw));
  return logistic(a + b * logit(p));
}

/* ------------------------------------------------------------------ */
/* Reliability diagram                                                  */
/* ------------------------------------------------------------------ */

export interface ReliabilityPoint {
  /** Forecast probability (bin centre). */
  forecast: number;
  /** Observed frequency for raw NEPS-G. */
  raw: number;
  /** Observed frequency after calibration. */
  calibrated: number;
  /** Number of forecasts in the bin (sharpness). */
  count: number;
}

export interface ReliabilityData {
  leadDay: LeadDay;
  points: ReliabilityPoint[];
  /** Count-weighted mean |observed − forecast|. */
  rawError: number;
  calibratedError: number;
  brierRaw: number;
  brierCalibrated: number;
  illustrative: true;
}

const relCache = new Map<string, ReliabilityData>();

export function reliability(scenarioId: ScenarioId, leadDay: LeadDay): ReliabilityData {
  return memo(relCache, `${scenarioId}|${leadDay}`, () => {
    const rng = createRng(`${SCENARIOS[scenarioId].seed}/reliability/${leadDay}`);
    const leadH = leadDay * 24;
    const points: ReliabilityPoint[] = [];
    for (let b = 0; b < 10; b++) {
      const f = 0.05 + b * 0.1;
      const raw = Math.min(1, Math.max(0, calibrateProbability(f, leadH) + rng.normal(0, 0.015)));
      const calibrated = Math.min(1, Math.max(0, f + rng.normal(0, 0.008 + leadDay * 0.0015)));
      points.push({ forecast: f, raw, calibrated, count: Math.round(3800 * Math.exp(-3.6 * f)) + 40 });
    }
    const total = points.reduce((s, p) => s + p.count, 0);
    const err = (key: 'raw' | 'calibrated') => points.reduce((s, p) => s + p.count * Math.abs(p[key] - p.forecast), 0) / total;
    // Brier = reliability + resolution/uncertainty terms; base term grows with lead (illustrative).
    const base = 0.09 + leadDay * 0.009;
    return {
      leadDay,
      points,
      rawError: err('raw'),
      calibratedError: err('calibrated'),
      brierRaw: base + err('raw') * 0.35,
      brierCalibrated: base + err('calibrated') * 0.35,
      illustrative: true,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Spread vs error                                                      */
/* ------------------------------------------------------------------ */

export interface SpreadErrorPoint {
  leadH: number;
  error: number;
  rawSpread: number;
  calibratedSpread: number;
}

export interface SpreadErrorData {
  variable: string;
  units: string;
  points: SpreadErrorPoint[];
  illustrative: true;
}

const seCache = new Map<ScenarioId, SpreadErrorData>();

export function spreadError(scenarioId: ScenarioId): SpreadErrorData {
  const hit = seCache.get(scenarioId);
  if (hit) return hit;
  const scenario = SCENARIOS[scenarioId];
  const rng = createRng(`${scenario.seed}/spread-error`);
  const spec =
    scenario.fieldKind === 'rain'
      ? { variable: 'Track position', units: 'km', e0: 35, slope: 1.45 }
      : scenario.fieldKind === 'temperature'
        ? { variable: 'Daily maximum temperature', units: '°C', e0: 0.9, slope: 0.012 }
        : { variable: 'Wet-bulb temperature', units: '°C', e0: 0.5, slope: 0.007 };
  const points: SpreadErrorPoint[] = [];
  for (let h = 24; h <= 240; h += 24) {
    const error = (spec.e0 + spec.slope * h) * (1 + rng.normal(0, 0.03));
    points.push({
      leadH: h,
      error,
      rawSpread: error * (0.52 + rng.normal(0, 0.03)),
      calibratedSpread: error * (1 + rng.normal(0, 0.03)),
    });
  }
  const data: SpreadErrorData = { variable: spec.variable, units: spec.units, points, illustrative: true };
  seCache.set(scenarioId, data);
  return data;
}

/* ------------------------------------------------------------------ */
/* Stable warnings: blending + hysteresis across consecutive runs       */
/* ------------------------------------------------------------------ */

export type WarningLevel = 'none' | 'low' | 'moderate' | 'severe';

export const LEVEL_ORDER: readonly WarningLevel[] = ['none', 'low', 'moderate', 'severe'];

/** Probability bands used by the stable-warnings demo (on P of the Severe threshold). */
export const STABLE_BANDS = { low: 0.1, moderate: 0.25, severe: 0.4 } as const;
export const HYSTERESIS_MARGIN = 0.05;

function levelFor(p: number): WarningLevel {
  if (p >= STABLE_BANDS.severe) return 'severe';
  if (p >= STABLE_BANDS.moderate) return 'moderate';
  if (p >= STABLE_BANDS.low) return 'low';
  return 'none';
}

function thresholdOf(level: WarningLevel): number {
  return level === 'severe' ? STABLE_BANDS.severe : level === 'moderate' ? STABLE_BANDS.moderate : level === 'low' ? STABLE_BANDS.low : 0;
}

export interface RunWarning {
  runLabel: string;
  /** Run initialisation offset from the scenario run (hours, ≤ 0). */
  runOffsetH: number;
  singleProbability: number;
  blendedProbability: number;
  singleLevel: WarningLevel;
  stableLevel: WarningLevel;
}

export interface StableWarningsData {
  runs: RunWarning[];
  flipsSingle: number;
  flipsStable: number;
  illustrative: true;
}

function countFlips(levels: readonly WarningLevel[]): number {
  let flips = 0;
  for (let k = 1; k < levels.length; k++) if (levels[k] !== levels[k - 1]) flips++;
  return flips;
}

const stableCache = new Map<ScenarioId, StableWarningsData>();

/**
 * Six consecutive runs (00 and 12 UTC) leading up to the scenario run.
 * Single-run probabilities wobble across a band edge; the blended (lagged
 * ensemble) probability plus hysteresis keeps the level steady.
 */
export function stableWarnings(scenarioId: ScenarioId): StableWarningsData {
  const hit = stableCache.get(scenarioId);
  if (hit) return hit;
  const scenario = SCENARIOS[scenarioId];
  const rng = createRng(`${scenario.seed}/stable`);
  const n = 6;
  const single: number[] = [];
  for (let k = 0; k < n; k++) {
    const trend = 0.33 + (0.13 * k) / (n - 1);
    const wobble = (k % 2 === 0 ? -1 : 1) * (0.055 + rng.range(0, 0.02));
    single.push(Math.min(0.95, Math.max(0.02, trend + wobble)));
  }
  const weights = [0.5, 0.3, 0.2];
  const runs: RunWarning[] = [];
  let stable: WarningLevel = 'none';
  for (let k = 0; k < n; k++) {
    let s = 0;
    let w = 0;
    for (let lag = 0; lag < weights.length && k - lag >= 0; lag++) {
      s += (weights[lag] as number) * (single[k - lag] as number);
      w += weights[lag] as number;
    }
    const blended = s / w;
    const target = levelFor(blended);
    const up = LEVEL_ORDER.indexOf(target) > LEVEL_ORDER.indexOf(stable);
    if (k === 0 || up) stable = target;
    else if (target !== stable && blended < thresholdOf(stable) - HYSTERESIS_MARGIN) stable = target;
    const offsetH = -(n - 1 - k) * 12;
    runs.push({
      runLabel: `Run ${formatUtc(new Date(Date.parse(scenario.run.initTime) + offsetH * 3600_000))}`,
      runOffsetH: offsetH,
      singleProbability: single[k] as number,
      blendedProbability: blended,
      singleLevel: levelFor(single[k] as number),
      stableLevel: stable,
    });
  }
  const data: StableWarningsData = {
    runs,
    flipsSingle: countFlips(runs.map((r) => r.singleLevel)),
    flipsStable: countFlips(runs.map((r) => r.stableLevel)),
    illustrative: true,
  };
  stableCache.set(scenarioId, data);
  return data;
}

export function clearCalibrationCache(): void {
  relCache.clear();
  seCache.clear();
  stableCache.clear();
}
