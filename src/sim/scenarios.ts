import type { LatLon, RegionId } from './geo';

/**
 * The three replay scenarios. Only the strings in `facts` are real-world facts
 * (from docs/PROTOTYPE_SPEC.md Part 1). Everything else is illustrative.
 */

export type ScenarioId = 'cyclone' | 'heatwave' | 'humidHeat';

export type HazardType = 'cyclone' | 'heavyRain' | 'heatwave' | 'humidHeat' | 'coldWave' | 'strongWind';

export const HAZARD_LABELS: Record<HazardType, string> = {
  cyclone: 'Cyclone',
  heavyRain: 'Heavy rain',
  heatwave: 'Heatwave',
  humidHeat: 'Humid heat',
  coldWave: 'Cold wave',
  strongWind: 'Strong wind',
};

export const ALL_HAZARDS: readonly HazardType[] = [
  'cyclone',
  'heavyRain',
  'heatwave',
  'humidHeat',
  'coldWave',
  'strongWind',
];

/** Primary field the scenario is about. */
export type FieldKind = 'rain' | 'temperature' | 'wetBulb';

export interface FieldMeta {
  kind: FieldKind;
  label: string;
  units: string;
  /** Display range for colormaps. */
  displayMin: number;
  displayMax: number;
}

export const FIELD_META: Record<FieldKind, FieldMeta> = {
  rain: { kind: 'rain', label: '24 h rainfall', units: 'mm/day', displayMin: 0, displayMax: 300 },
  temperature: { kind: 'temperature', label: 'Daily maximum temperature', units: '°C', displayMin: 30, displayMax: 50 },
  wetBulb: { kind: 'wetBulb', label: 'Daily maximum wet-bulb temperature', units: '°C', displayMin: 22, displayMax: 33 },
};

export type TrackKind = 'cyclone' | 'heatCore';

/** A control-track knot. `intensity` is wind (km/h) for cyclones, anomaly (°C) for heat cores. */
export interface TrackKnot extends LatLon {
  leadH: number;
  intensity: number;
}

/**
 * Systematic displacement applied to members of one scenario path, as a
 * function of lead time. Members add their own random wobble on top.
 */
export interface PathOffset {
  dLat: (leadH: number) => number;
  dLon: (leadH: number) => number;
  /** Multiplier on the control intensity. */
  intensityFactor: (leadH: number) => number;
}

export interface ScenarioPathDef {
  key: string;
  label: string;
  /** How many of the 23 members are generated along this path. Sums to 23. */
  members: number;
  offset: PathOffset;
}

export interface ThreatBoxDef {
  id: string;
  label: string;
  hazard: HazardType;
  /** Box centre; the box is a 128×128 patch of 5 km cells (5.76°). */
  center: LatLon;
  /** Valid lead time (hours) for the 5 km sharpening and risk scoring. */
  leadH: number;
}

export interface RiskThresholds {
  /** Field values for Low / Moderate / Severe exceedance. */
  values: [number, number, number];
  /** Format a threshold for labels, e.g. "P(>204 mm/24h)". */
  label: (value: number) => string;
}

export interface Scenario {
  id: ScenarioId;
  name: string;
  shortName: string;
  shapedAfter: string;
  /** Real facts we are allowed to state. Everything else is illustrative. */
  facts: readonly string[];
  regionId: RegionId;
  run: {
    model: 'NEPS-G';
    /** Initialisation time, ISO UTC. */
    initTime: string;
    label: string;
  };
  hazards: readonly HazardType[];
  fieldKind: FieldKind;
  trackKind: TrackKind;
  trackIntensityLabel: string;
  trackIntensityUnits: string;
  controlTrack: readonly TrackKnot[];
  paths: readonly ScenarioPathDef[];
  threatBoxes: readonly ThreatBoxDef[];
  thresholds: RiskThresholds;
  defaultLeadH: number;
  threatTitle: string;
  drivers: readonly string[];
  seed: number;
  illustrative: true;
}

function ramp(from: number, to: number, value: number): (leadH: number) => number {
  return (h) => {
    const t = Math.min(1, Math.max(0, (h - from) / (to - from)));
    return value * t * t * (3 - 2 * t);
  };
}

const one = () => 1;
const zero = () => 0;

/* ------------------------------------------------------------------ */
/* Cyclone replay — shaped after Amphan, May 2020                       */
/* ------------------------------------------------------------------ */

const cyclone: Scenario = {
  id: 'cyclone',
  name: 'Cyclone replay',
  shortName: 'Cyclone',
  shapedAfter: 'Cyclone Amphan, May 2020, Bay of Bengal',
  facts: [
    'Landfall on 20 May 2020 between Digha (West Bengal) and Hatiya (Bangladesh).',
    'Gusts up to about 185 km/h.',
  ],
  regionId: 'bayOfBengal',
  run: { model: 'NEPS-G', initTime: '2020-05-16T00:00:00Z', label: 'NEPS-G run 16 May 2020, 00 UTC' },
  hazards: ['cyclone', 'heavyRain', 'strongWind'],
  fieldKind: 'rain',
  trackKind: 'cyclone',
  trackIntensityLabel: 'Sustained wind',
  trackIntensityUnits: 'km/h',
  // Approximate path: genesis near 10°N 87°E, recurving north to the Digha–Sundarbans coast.
  controlTrack: [
    { leadH: 0, lat: 10.4, lon: 87.0, intensity: 45 },
    { leadH: 12, lat: 10.9, lon: 86.6, intensity: 60 },
    { leadH: 24, lat: 11.7, lon: 86.3, intensity: 80 },
    { leadH: 36, lat: 12.7, lon: 86.2, intensity: 125 },
    { leadH: 48, lat: 13.9, lon: 86.4, intensity: 185 },
    { leadH: 60, lat: 15.2, lon: 86.7, intensity: 230 },
    { leadH: 72, lat: 16.7, lon: 87.1, intensity: 240 },
    { leadH: 84, lat: 18.3, lon: 87.5, intensity: 215 },
    { leadH: 96, lat: 19.9, lon: 87.8, intensity: 190 },
    { leadH: 108, lat: 21.6, lon: 88.1, intensity: 160 },
    { leadH: 120, lat: 23.1, lon: 88.5, intensity: 95 },
    { leadH: 132, lat: 24.5, lon: 89.0, intensity: 60 },
    { leadH: 144, lat: 25.7, lon: 89.6, intensity: 40 },
  ],
  paths: [
    {
      key: 'digha',
      label: 'Landfall near Digha',
      members: 11,
      offset: { dLat: zero, dLon: ramp(36, 108, -0.45), intensityFactor: one },
    },
    {
      key: 'sundarbans',
      label: 'Landfall near Sundarbans',
      members: 9,
      offset: { dLat: ramp(60, 120, -0.2), dLon: ramp(36, 108, 0.75), intensityFactor: one },
    },
    {
      key: 'recurve',
      label: 'Recurve east',
      members: 3,
      offset: {
        dLat: ramp(60, 132, -1.1),
        dLon: ramp(48, 132, 3.0),
        intensityFactor: (h) => 1 - ramp(96, 132, 0.15)(h),
      },
    },
  ],
  threatBoxes: [
    {
      id: 'cyc-coast',
      label: 'Digha–Sundarbans coast',
      hazard: 'heavyRain',
      center: { lat: 21.7, lon: 88.2 },
      leadH: 108,
    },
    {
      id: 'cyc-northeast',
      label: 'Meghalaya and Barak valley',
      hazard: 'heavyRain',
      center: { lat: 24.9, lon: 91.0 },
      leadH: 132,
    },
  ],
  thresholds: { values: [64, 115, 204], label: (v) => `P(>${v} mm/24h)` },
  defaultLeadH: 96,
  threatTitle: 'Severe cyclonic storm',
  drivers: [
    'Very warm sea surface in the Bay of Bengal',
    'Low vertical wind shear along the path',
    'Onshore flow and coastal convergence at landfall',
  ],
  seed: 20200516,
  illustrative: true,
};

/* ------------------------------------------------------------------ */
/* Heatwave replay — north-west India, late May 2024                    */
/* ------------------------------------------------------------------ */

const heatwave: Scenario = {
  id: 'heatwave',
  name: 'Heatwave replay',
  shortName: 'Heatwave',
  shapedAfter: 'North-west India heat, late May 2024',
  facts: ['A severe heatwave affected north-west India in late May 2024.'],
  regionId: 'northWestIndia',
  run: { model: 'NEPS-G', initTime: '2024-05-24T00:00:00Z', label: 'NEPS-G run 24 May 2024, 00 UTC' },
  hazards: ['heatwave'],
  fieldKind: 'temperature',
  trackKind: 'heatCore',
  trackIntensityLabel: 'Core anomaly',
  trackIntensityUnits: '°C',
  controlTrack: [
    { leadH: 0, lat: 26.9, lon: 71.8, intensity: 2.6 },
    { leadH: 24, lat: 27.0, lon: 72.3, intensity: 3.2 },
    { leadH: 48, lat: 27.2, lon: 72.9, intensity: 3.9 },
    { leadH: 72, lat: 27.4, lon: 73.5, intensity: 4.6 },
    { leadH: 96, lat: 27.6, lon: 74.1, intensity: 5.1 },
    { leadH: 120, lat: 27.8, lon: 74.6, intensity: 5.3 },
    { leadH: 144, lat: 28.0, lon: 75.1, intensity: 4.9 },
    { leadH: 168, lat: 28.1, lon: 75.6, intensity: 4.3 },
    { leadH: 192, lat: 28.2, lon: 76.0, intensity: 3.4 },
    { leadH: 216, lat: 28.3, lon: 76.3, intensity: 2.6 },
    { leadH: 240, lat: 28.4, lon: 76.6, intensity: 1.9 },
  ],
  paths: [
    {
      key: 'persist',
      label: 'Persists over west Rajasthan',
      members: 13,
      offset: { dLat: zero, dLon: ramp(48, 168, -0.6), intensityFactor: (h) => 1 + ramp(120, 192, 0.25)(h) },
    },
    {
      key: 'east',
      label: 'Spreads east to Haryana and Delhi',
      members: 7,
      offset: { dLat: ramp(48, 168, 0.5), dLon: ramp(48, 168, 1.9), intensityFactor: one },
    },
    {
      key: 'relief',
      label: 'Early relief',
      members: 3,
      offset: { dLat: zero, dLon: zero, intensityFactor: (h) => 1 - ramp(72, 144, 0.55)(h) },
    },
  ],
  threatBoxes: [
    {
      id: 'heat-west',
      label: 'West Rajasthan',
      hazard: 'heatwave',
      center: { lat: 27.4, lon: 73.2 },
      leadH: 120,
    },
    {
      id: 'heat-east',
      label: 'Haryana and Delhi',
      hazard: 'heatwave',
      center: { lat: 28.7, lon: 76.6 },
      leadH: 144,
    },
  ],
  thresholds: { values: [46.5, 48.5, 50.5], label: (v) => `P(Tmax>${v} °C)` },
  defaultLeadH: 96,
  threatTitle: 'Heatwave',
  drivers: [
    'Persistent upper-level ridge over north-west India',
    'Dry north-westerly winds, clear skies',
    'Low soil moisture ahead of the monsoon',
  ],
  seed: 20240524,
  illustrative: true,
};

/* ------------------------------------------------------------------ */
/* Humid-heat replay — east coast                                       */
/* ------------------------------------------------------------------ */

const humidHeat: Scenario = {
  id: 'humidHeat',
  name: 'Humid-heat replay',
  shortName: 'Humid heat',
  shapedAfter: 'Coastal humid heat, east coast',
  facts: ['Wet-bulb temperature is the measure an IMD study recommends for heat stress.'],
  regionId: 'eastCoast',
  run: { model: 'NEPS-G', initTime: '2024-06-10T00:00:00Z', label: 'NEPS-G run 10 June 2024, 00 UTC' },
  hazards: ['humidHeat'],
  fieldKind: 'wetBulb',
  trackKind: 'heatCore',
  trackIntensityLabel: 'Core anomaly',
  trackIntensityUnits: '°C',
  controlTrack: [
    { leadH: 0, lat: 16.3, lon: 81.6, intensity: 1.2 },
    { leadH: 24, lat: 16.7, lon: 82.1, intensity: 1.6 },
    { leadH: 48, lat: 17.2, lon: 82.7, intensity: 2.0 },
    { leadH: 72, lat: 17.8, lon: 83.4, intensity: 2.4 },
    { leadH: 96, lat: 18.5, lon: 84.1, intensity: 2.7 },
    { leadH: 120, lat: 19.2, lon: 84.8, intensity: 2.8 },
    { leadH: 144, lat: 19.8, lon: 85.5, intensity: 2.6 },
    { leadH: 168, lat: 20.4, lon: 86.2, intensity: 2.1 },
    { leadH: 192, lat: 20.9, lon: 86.7, intensity: 1.6 },
    { leadH: 216, lat: 21.3, lon: 87.0, intensity: 1.1 },
    { leadH: 240, lat: 21.6, lon: 87.3, intensity: 0.8 },
  ],
  paths: [
    {
      key: 'north',
      label: 'Moves north to the Odisha coast',
      members: 12,
      offset: { dLat: zero, dLon: zero, intensityFactor: one },
    },
    {
      key: 'stall',
      label: 'Stalls over the north Andhra coast',
      members: 8,
      offset: { dLat: ramp(48, 144, -1.3), dLon: ramp(48, 144, -1.3), intensityFactor: (h) => 1 + ramp(96, 168, 0.15)(h) },
    },
    {
      key: 'relief',
      label: 'Rain brings early relief',
      members: 3,
      offset: { dLat: zero, dLon: zero, intensityFactor: (h) => 1 - ramp(60, 120, 0.6)(h) },
    },
  ],
  threatBoxes: [
    {
      id: 'humid-odisha',
      label: 'South Odisha coast',
      hazard: 'humidHeat',
      center: { lat: 19.4, lon: 84.9 },
      leadH: 120,
    },
    {
      id: 'humid-andhra',
      label: 'North Andhra coast',
      hazard: 'humidHeat',
      center: { lat: 17.4, lon: 82.6 },
      leadH: 96,
    },
  ],
  thresholds: { values: [28.5, 30, 31.5], label: (v) => `P(wet-bulb>${v} °C)` },
  defaultLeadH: 96,
  threatTitle: 'Humid heat',
  drivers: [
    'Moist onshore winds from the Bay of Bengal',
    'Delayed sea breeze and warm nights',
    'Weak monsoon flow over the east coast',
  ],
  seed: 20240610,
  illustrative: true,
};

export const SCENARIOS: Record<ScenarioId, Scenario> = { cyclone, heatwave, humidHeat };
export const SCENARIO_IDS: readonly ScenarioId[] = ['cyclone', 'heatwave', 'humidHeat'];
export const DEFAULT_SCENARIO: ScenarioId = 'cyclone';

/** Lead times of a NEPS-G run: 0..240 h, 6-hourly (41 steps). */
export const LEAD_STEP_H = 6;
export const MAX_LEAD_H = 240;
export const LEAD_TIMES: readonly number[] = Array.from({ length: MAX_LEAD_H / LEAD_STEP_H + 1 }, (_, i) => i * LEAD_STEP_H);
export const ENSEMBLE_SIZE = 23;

export function getScenario(id: ScenarioId): Scenario {
  return SCENARIOS[id];
}

export function getThreatBox(scenario: Scenario, boxId: string): ThreatBoxDef {
  const box = scenario.threatBoxes.find((b) => b.id === boxId);
  if (!box) throw new Error(`Unknown threat box ${boxId} in ${scenario.id}`);
  return box;
}

/** Valid time for a lead time, as a Date. */
export function validTime(scenario: Scenario, leadH: number): Date {
  return new Date(Date.parse(scenario.run.initTime) + leadH * 3600_000);
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];

export function formatDateEn(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]}`;
}

export function formatDateHi(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS_HI[d.getUTCMonth()]}`;
}

export function formatUtc(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `${formatDateEn(d)} ${d.getUTCFullYear()}, ${hh} UTC`;
}
