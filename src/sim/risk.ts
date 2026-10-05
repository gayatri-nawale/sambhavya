import {
  cellLat,
  cellLon,
  convexHull,
  haversineKm,
  isIndia,
  nearestPlace,
  type BBox,
  type LatLon,
  type Place,
} from './geo';
import {
  ENSEMBLE_SIZE,
  HAZARD_LABELS,
  SCENARIOS,
  formatDateEn,
  formatDateHi,
  validTime,
  type HazardType,
  type Scenario,
  type ScenarioId,
} from './scenarios';
import { getEnsemble, threatBoxes, type ThreatBox } from './ensemble';
import { boxField5km } from './fields';
import { calibrateProbability } from './calibration';
import { memo } from './util';

/**
 * 5 km neighbourhood exceedance probabilities → Low / Moderate / Severe zones
 * → alert objects for forecaster review. All values are illustrative.
 */

export type RiskLevel = 'low' | 'moderate' | 'severe';
export const RISK_LEVELS: readonly RiskLevel[] = ['low', 'moderate', 'severe'];

export const RISK_LABELS: Record<RiskLevel, string> = { low: 'Low', moderate: 'Moderate', severe: 'Severe' };

/**
 * Likelihood × impact matrix: a level is raised when its own threshold is
 * reasonably likely, or when the threshold below it is very likely.
 */
export const TRIGGER_PROBABILITY = 0.3;
export const HIGH_LIKELIHOOD = 0.7;

export function levelFromMatrix(cal: readonly [number, number, number]): RiskLevel | null {
  const [pLow, pMod, pSev] = cal;
  if (pSev >= TRIGGER_PROBABILITY || pMod >= HIGH_LIKELIHOOD) return 'severe';
  if (pMod >= TRIGGER_PROBABILITY || pLow >= HIGH_LIKELIHOOD) return 'moderate';
  if (pLow >= TRIGGER_PROBABILITY) return 'low';
  return null;
}

/** A zone is a 4×4 block of 5 km cells (about 20 km across). */
export const ZONE_CELLS = 4;
const HALO = 1;

export interface RiskZone {
  id: string;
  boxId: string;
  /** Zone grid position inside its box. */
  zi: number;
  zj: number;
  bbox: BBox;
  center: LatLon;
  /** Raw member fraction exceeding each threshold [low, moderate, severe]. */
  rawProbability: [number, number, number];
  calibratedProbability: [number, number, number];
  /** Member numbers exceeding each threshold [low, moderate, severe]. */
  membersExceeding: [number[], number[], number[]];
  level: RiskLevel | null;
}

export interface RiskResult {
  scenarioId: ScenarioId;
  zones: RiskZone[];
  counts: Record<RiskLevel, number>;
  scored: number;
  illustrative: true;
}

function levelIndex(level: RiskLevel): 0 | 1 | 2 {
  return level === 'low' ? 0 : level === 'moderate' ? 1 : 2;
}

function scoreBox(scenario: Scenario, box: ThreatBox): RiskZone[] {
  const thresholds = scenario.thresholds.values;
  const fields = Array.from({ length: ENSEMBLE_SIZE }, (_, m) => boxField5km(scenario.id, box.id, m + 1));
  const first = fields[0];
  if (!first) return [];
  const g = first.grid;
  const nz = Math.floor(g.nx / ZONE_CELLS);
  const zones: RiskZone[] = [];
  for (let zj = 0; zj < nz; zj++) {
    for (let zi = 0; zi < nz; zi++) {
      const i0 = zi * ZONE_CELLS;
      const j0 = zj * ZONE_CELLS;
      const center = {
        lat: (cellLat(g, j0) + cellLat(g, j0 + ZONE_CELLS - 1)) / 2,
        lon: (cellLon(g, i0) + cellLon(g, i0 + ZONE_CELLS - 1)) / 2,
      };
      if (!isIndia(center.lat, center.lon)) continue;
      const exceeding: [number[], number[], number[]] = [[], [], []];
      fields.forEach((f, m) => {
        let mx = -Infinity;
        for (let j = Math.max(0, j0 - HALO); j < Math.min(g.ny, j0 + ZONE_CELLS + HALO); j++)
          for (let i = Math.max(0, i0 - HALO); i < Math.min(g.nx, i0 + ZONE_CELLS + HALO); i++) {
            const v = f.values[j * g.nx + i] as number;
            if (v > mx) mx = v;
          }
        thresholds.forEach((t, k) => {
          if (mx >= t) (exceeding[k] as number[]).push(m + 1);
        });
      });
      const raw = exceeding.map((e) => e.length / ENSEMBLE_SIZE) as [number, number, number];
      const cal = raw.map((p) => calibrateProbability(p, box.leadH)) as [number, number, number];
      const level = levelFromMatrix(cal);
      zones.push({
        id: `${box.id}-${zi}-${zj}`,
        boxId: box.id,
        zi,
        zj,
        bbox: {
          latMin: center.lat - (ZONE_CELLS * g.dLat) / 2,
          latMax: center.lat + (ZONE_CELLS * g.dLat) / 2,
          lonMin: center.lon - (ZONE_CELLS * g.dLon) / 2,
          lonMax: center.lon + (ZONE_CELLS * g.dLon) / 2,
        },
        center,
        rawProbability: raw,
        calibratedProbability: cal,
        membersExceeding: exceeding,
        level,
      });
    }
  }
  return zones;
}

const riskCache = new Map<ScenarioId, RiskResult>();

export function getRisk(scenarioId: ScenarioId): RiskResult {
  return memo(riskCache, scenarioId, () => {
    const scenario = SCENARIOS[scenarioId];
    const zones = threatBoxes(scenario).flatMap((b) => scoreBox(scenario, b));
    const counts: Record<RiskLevel, number> = { low: 0, moderate: 0, severe: 0 };
    for (const z of zones) if (z.level) counts[z.level]++;
    return { scenarioId, zones, counts, scored: zones.length, illustrative: true };
  });
}

/* ------------------------------------------------------------------ */
/* Alerts                                                               */
/* ------------------------------------------------------------------ */

export type Audience = 'response' | 'agromet';
export type Language = 'en' | 'hi';

export interface Alert {
  id: string;
  scenarioId: ScenarioId;
  level: RiskLevel;
  hazards: HazardType[];
  hazardLabel: string;
  boxId: string;
  place: Place;
  areaName: string;
  areaNameHi: string;
  /** Closed lat/lon ring around the alert's zones (CAP polygon). */
  polygon: LatLon[];
  zoneIds: string[];
  core: LatLon;
  /** Window start and end, hours after the run. */
  leadH: number;
  validToH: number;
  thresholdValue: number;
  thresholdLabel: string;
  probability: number;
  rawProbability: number;
  agreement: { count: number; total: number };
  scenarioPath: string;
  drivers: readonly string[];
  message: Record<Language, string>;
  advice: Record<Audience, string>;
  illustrative: true;
}

/** Largest 8-connected group of zones (within one box) from a candidate list. */
function largestComponent(zones: readonly RiskZone[]): RiskZone[] {
  const byKey = new Map(zones.map((z) => [`${z.boxId}|${z.zi}|${z.zj}`, z]));
  const seen = new Set<string>();
  let best: RiskZone[] = [];
  for (const start of zones) {
    const sk = `${start.boxId}|${start.zi}|${start.zj}`;
    if (seen.has(sk)) continue;
    const comp: RiskZone[] = [];
    const stack = [start];
    seen.add(sk);
    while (stack.length) {
      const z = stack.pop() as RiskZone;
      comp.push(z);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const k = `${z.boxId}|${z.zi + di}|${z.zj + dj}`;
        const nb = byKey.get(k);
        if (nb && !seen.has(k)) {
          seen.add(k);
          stack.push(nb);
        }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  return best;
}

interface Wording {
  hazardLabel: string;
  hazards: HazardType[];
  en: string;
  hi: string;
  agromet: string;
}

function wording(scenario: Scenario, level: RiskLevel, dateEn: string, dateHi: string): Wording {
  if (scenario.id === 'cyclone') {
    if (level === 'severe')
      return {
        hazardLabel: 'Heavy rain + wind',
        hazards: ['heavyRain', 'strongWind', 'cyclone'],
        en: `very heavy rain and strong winds likely on ${dateEn}. Stay indoors in a safe building and follow local authority instructions.`,
        hi: `${dateHi} को बहुत भारी बारिश और तेज़ हवा की आशंका। पक्के मकान में रहें, प्रशासन के निर्देश मानें।`,
        agromet: `Harvest mature crops and move produce to safe storage before ${dateEn}. Clear field drains; postpone spraying and fertiliser.`,
      };
    if (level === 'moderate')
      return {
        hazardLabel: 'Heavy rain',
        hazards: ['heavyRain'],
        en: `heavy rain likely on ${dateEn}. Avoid low-lying areas and stay alert.`,
        hi: `${dateHi} को भारी बारिश की आशंका। निचले इलाकों से दूर रहें, सतर्क रहें।`,
        agromet: `Keep field drains open and postpone irrigation and spraying around ${dateEn}.`,
      };
    return {
      hazardLabel: 'Heavy rain',
      hazards: ['heavyRain'],
      en: `heavy rain possible on ${dateEn}. Keep checking weather updates.`,
      hi: `${dateHi} को भारी बारिश संभव। मौसम की जानकारी लेते रहें।`,
      agromet: `Postpone irrigation and keep harvested produce covered around ${dateEn}.`,
    };
  }
  if (scenario.id === 'heatwave') {
    if (level === 'severe')
      return {
        hazardLabel: 'Heatwave',
        hazards: ['heatwave'],
        en: `severe heatwave likely from ${dateEn}. Avoid going out in the afternoon and drink plenty of water.`,
        hi: `${dateHi} से भीषण लू की आशंका। दोपहर में बाहर न निकलें, खूब पानी पिएं।`,
        agromet: `Irrigate in the evening, give livestock shade and water, and avoid field work from noon to 4 pm from ${dateEn}.`,
      };
    if (level === 'moderate')
      return {
        hazardLabel: 'Heatwave',
        hazards: ['heatwave'],
        en: `heatwave likely from ${dateEn}. Stay out of the afternoon sun and keep drinking water.`,
        hi: `${dateHi} से लू की आशंका। दोपहर की धूप से बचें, पानी पीते रहें।`,
        agromet: `Give light, frequent irrigation and keep livestock in shade from ${dateEn}.`,
      };
    return {
      hazardLabel: 'Heatwave',
      hazards: ['heatwave'],
      en: `very hot days possible from ${dateEn}. Avoid the sun and keep drinking water.`,
      hi: `${dateHi} से तेज़ गर्मी संभव। धूप से बचें, पानी पीते रहें।`,
      agromet: `Plan field work for early morning from ${dateEn}.`,
    };
  }
  if (level === 'severe')
    return {
      hazardLabel: 'Humid heat',
      hazards: ['humidHeat'],
      en: `dangerous humid heat likely from ${dateEn}. Avoid heavy work, rest in the shade and drink water often.`,
      hi: `${dateHi} से बहुत उमस भरी गर्मी की आशंका। भारी काम न करें, छाया में आराम करें, पानी पीते रहें।`,
      agromet: `Shift field work to early morning and give livestock shade and water from ${dateEn}.`,
    };
  if (level === 'moderate')
    return {
      hazardLabel: 'Humid heat',
      hazards: ['humidHeat'],
      en: `humid heat likely from ${dateEn}. Rest in the afternoon and keep drinking water.`,
      hi: `${dateHi} से उमस भरी गर्मी की आशंका। दोपहर में आराम करें, पानी पीते रहें।`,
      agromet: `Avoid afternoon field work and keep animals cool from ${dateEn}.`,
    };
  return {
    hazardLabel: 'Humid heat',
    hazards: ['humidHeat'],
    en: `humid heat possible from ${dateEn}. Keep drinking water.`,
    hi: `${dateHi} से उमस भरी गर्मी संभव। पानी पीते रहें।`,
    agromet: `Water crops and animals in the cooler hours from ${dateEn}.`,
  };
}

function buildAlert(scenario: Scenario, level: RiskLevel, zones: readonly RiskZone[]): Alert | null {
  const comp = largestComponent(zones);
  if (comp.length === 0) return null;
  const k = levelIndex(level);
  const core = comp.reduce((a, b) => ((b.calibratedProbability[k] ?? 0) > (a.calibratedProbability[k] ?? 0) ? b : a));
  const box = threatBoxes(scenario).find((b) => b.id === core.boxId);
  if (!box) return null;
  const centroid = {
    lat: comp.reduce((s, z) => s + z.center.lat, 0) / comp.length,
    lon: comp.reduce((s, z) => s + z.center.lon, 0) / comp.length,
  };
  const place = nearestPlace(centroid, (p) => p.country === 'IN');
  const coastal = place.coastal && haversineKm(place, centroid) < 120;
  const areaName = `${place.name} ${coastal ? 'coast' : 'area'}`;
  const areaNameHi = `${place.hi} ${coastal ? 'तट' : 'क्षेत्र'}`;
  const corners = comp.flatMap((z) => [
    { lat: z.bbox.latMin, lon: z.bbox.lonMin },
    { lat: z.bbox.latMin, lon: z.bbox.lonMax },
    { lat: z.bbox.latMax, lon: z.bbox.lonMin },
    { lat: z.bbox.latMax, lon: z.bbox.lonMax },
  ]);
  const hull = convexHull(corners);
  const polygon = hull[0] ? [...hull, hull[0]] : hull;

  const leadH = Math.max(0, box.leadH - 12);
  const validToH = box.leadH + 12;
  const date = validTime(scenario, box.leadH);
  const w = wording(scenario, level, formatDateEn(date), formatDateHi(date));
  const members = core.membersExceeding[k] ?? [];
  const ensemble = getEnsemble(scenario.id);
  const pathCounts = new Map<number, number>();
  for (const m of members) {
    const c = ensemble.members[m - 1]?.clusterIndex ?? 0;
    pathCounts.set(c, (pathCounts.get(c) ?? 0) + 1);
  }
  const topPath = [...pathCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const thresholdValue = scenario.thresholds.values[k];

  return {
    id: `${scenario.id}-${level}`,
    scenarioId: scenario.id,
    level,
    hazards: w.hazards,
    hazardLabel: w.hazardLabel,
    boxId: box.id,
    place,
    areaName,
    areaNameHi,
    polygon,
    zoneIds: comp.map((z) => z.id),
    core: core.center,
    leadH,
    validToH,
    thresholdValue,
    thresholdLabel: scenario.thresholds.label(thresholdValue),
    probability: core.calibratedProbability[k],
    rawProbability: core.rawProbability[k],
    agreement: { count: members.length, total: ENSEMBLE_SIZE },
    scenarioPath: ensemble.paths[topPath]?.label ?? '',
    drivers: scenario.drivers,
    message: { en: `${areaName}: ${w.en}`, hi: `${areaNameHi}: ${w.hi}` },
    advice: {
      response: `${HAZARD_LABELS[w.hazards[0] as HazardType]} threat for ${comp.length} zones (5 km cells) around ${areaName}. Window T+${leadH} to T+${validToH} h. Core point ${core.center.lat.toFixed(2)}°N ${core.center.lon.toFixed(2)}°E.`,
      agromet: w.agromet,
    },
    illustrative: true,
  };
}

const alertCache = new Map<ScenarioId, Alert[]>();

/** Exactly one alert per level (Severe, Moderate, Low) per scenario, most severe first. */
export function getAlerts(scenarioId: ScenarioId): Alert[] {
  return memo(alertCache, scenarioId, () => {
    const scenario = SCENARIOS[scenarioId];
    const { zones } = getRisk(scenarioId);
    const out: Alert[] = [];
    for (const level of ['severe', 'moderate', 'low'] as const) {
      const a = buildAlert(scenario, level, zones.filter((z) => z.level === level));
      if (a) out.push(a);
    }
    return out;
  });
}

export function clearRiskCache(): void {
  riskCache.clear();
  alertCache.clear();
}
