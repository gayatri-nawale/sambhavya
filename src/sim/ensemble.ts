import { createRng } from './rng';
import {
  REGIONS,
  bboxAround,
  bboxContains,
  bboxOf,
  convexHull,
  haversineKm,
  icosphere,
  isLand,
  nearestPlace,
  type BBox,
  type LatLon,
  type Place,
} from './geo';
import {
  ENSEMBLE_SIZE,
  LEAD_STEP_H,
  SCENARIOS,
  formatUtc,
  validTime,
  type HazardType,
  type Scenario,
  type ScenarioId,
  type ThreatBoxDef,
  type TrackKnot,
} from './scenarios';
import { mean, percentile, round } from './util';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export interface TrackPoint extends LatLon {
  leadH: number;
  /** Wind (km/h) for cyclones, core anomaly (°C) for heat. */
  intensity: number;
}

export interface Landfall extends LatLon {
  leadH: number;
}

export interface MemberTrack {
  /** 1-based member number (1 = control). */
  member: number;
  /** Path the member was generated along (ground truth for the clustering check). */
  designedPath: string;
  /** Index into Ensemble.paths, found by k-means clustering. */
  clusterIndex: number;
  /** Weight from past member performance (illustrative), used for calibrated path probabilities. */
  weight: number;
  points: TrackPoint[];
  landfall: Landfall | null;
}

export interface ScenarioPath {
  index: number;
  key: string;
  label: string;
  members: number[];
  rawProbability: number;
  calibratedProbability: number;
  meanTrack: TrackPoint[];
}

export interface ConeSlice extends LatLon {
  leadH: number;
  radiusKm: number;
}

export interface TubeSlice {
  leadH: number;
  bbox: BBox;
}

export interface ThreatBox extends ThreatBoxDef {
  bbox: BBox;
}

export interface ThreatSummary {
  hazard: HazardType;
  title: string;
  paths: Array<{ label: string; probability: number }>;
  core: LatLon & { place: Place };
  timing: { fromH: number; toH: number; label: string };
  agreement: { count: number; total: number; criterion: string };
  drivers: readonly string[];
  illustrative: true;
}

export interface ScreenedNode extends LatLon {
  id: number;
  /** 0..1 threat score from the GNN screen (illustrative). */
  score: number;
}

export interface Screening {
  meshLevel: number;
  nodes: ScreenedNode[];
  litThreshold: number;
  candidates: ThreatBox[];
  illustrative: true;
}

export interface Ensemble {
  scenarioId: ScenarioId;
  members: MemberTrack[];
  paths: ScenarioPath[];
  mean: TrackPoint[];
  cone: ConeSlice[];
  tube: TubeSlice[];
  threat: ThreatSummary;
  screening: Screening;
  illustrative: true;
}

/** 128 cells × 0.045° — the 5 km patch size used for threat boxes. */
export const PATCH_CELLS = 128;
export const PATCH_DEG = PATCH_CELLS * 0.045;

export function threatBoxes(scenario: Scenario): ThreatBox[] {
  return scenario.threatBoxes.map((b) => ({ ...b, bbox: bboxAround(b.center, PATCH_DEG) }));
}

/* ------------------------------------------------------------------ */
/* Track interpolation                                                  */
/* ------------------------------------------------------------------ */

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Smooth position + linear intensity along control knots. Clamps to the last knot. */
export function controlAt(knots: readonly TrackKnot[], leadH: number): TrackPoint {
  const last = knots[knots.length - 1] as TrackKnot;
  const first = knots[0] as TrackKnot;
  const h = Math.min(Math.max(leadH, first.leadH), last.leadH);
  let k = 0;
  while (k < knots.length - 2 && (knots[k + 1] as TrackKnot).leadH < h) k++;
  const a = knots[k] as TrackKnot;
  const b = knots[k + 1] as TrackKnot;
  const p0 = knots[Math.max(0, k - 1)] as TrackKnot;
  const p3 = knots[Math.min(knots.length - 1, k + 2)] as TrackKnot;
  const t = (h - a.leadH) / (b.leadH - a.leadH);
  return {
    leadH,
    lat: catmullRom(p0.lat, a.lat, b.lat, p3.lat, t),
    lon: catmullRom(p0.lon, a.lon, b.lon, p3.lon, t),
    intensity: a.intensity + (b.intensity - a.intensity) * t,
  };
}

/** Interpolated position of a track at any lead time, or null outside the track. */
export function trackAt(points: readonly TrackPoint[], leadH: number): TrackPoint | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || leadH < first.leadH || leadH > last.leadH) return null;
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k] as TrackPoint;
    const b = points[k + 1] as TrackPoint;
    if (leadH >= a.leadH && leadH <= b.leadH) {
      const t = b.leadH === a.leadH ? 0 : (leadH - a.leadH) / (b.leadH - a.leadH);
      return {
        leadH,
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
        intensity: a.intensity + (b.intensity - a.intensity) * t,
      };
    }
  }
  return { ...last, leadH };
}

/* ------------------------------------------------------------------ */
/* Member generation                                                    */
/* ------------------------------------------------------------------ */

function generateMembers(scenario: Scenario): MemberTrack[] {
  const rng = createRng(`${scenario.seed}/members`);
  const endH = (scenario.controlTrack[scenario.controlTrack.length - 1] as TrackKnot).leadH;
  const isCyclone = scenario.trackKind === 'cyclone';

  // Path assignment: member 1 (control) follows path 0; the rest are shuffled.
  const slots: string[] = [];
  scenario.paths.forEach((p, idx) => {
    for (let k = 0; k < p.members - (idx === 0 ? 1 : 0); k++) slots.push(p.key);
  });
  const firstPath = scenario.paths[0];
  if (!firstPath) throw new Error('Scenario has no paths');
  const assignment = [firstPath.key, ...rng.shuffle(slots)];
  if (assignment.length !== ENSEMBLE_SIZE) throw new Error(`Paths must sum to ${ENSEMBLE_SIZE} members`);

  return assignment.map((pathKey, idx) => {
    const isControl = idx === 0;
    const path = scenario.paths.find((p) => p.key === pathKey);
    if (!path) throw new Error(`Unknown path ${pathKey}`);
    const speed = isControl ? 1 : 1 + rng.normal(0, isCyclone ? 0.05 : 0.04);
    const strength = isControl ? 1 : 1 + rng.normal(0, 0.06);
    const weight = isControl ? 1.25 : 1 + rng.normal(0, 0.08);
    const points: TrackPoint[] = [];
    let nLat = 0;
    let nLon = 0;
    for (let h = 0; h <= endH; h += LEAD_STEP_H) {
      // Spread grows with lead time: AR(1) wobble with growing innovations.
      // Heat cores drift slowly, so their wobble is smoother (more persistent, smaller steps).
      const sd = isControl ? 0 : isCyclone ? 0.015 + 0.0009 * h : 0.004 + 0.0004 * h;
      const phi = isCyclone ? 0.82 : 0.95;
      nLat = phi * nLat + rng.normal(0, sd);
      nLon = phi * nLon + rng.normal(0, sd);
      const c = controlAt(scenario.controlTrack, Math.min(endH, h * speed));
      const intensity =
        c.intensity * path.offset.intensityFactor(h) * (isCyclone ? strength : 1 + (strength - 1) * 0.7);
      points.push({
        leadH: h,
        lat: c.lat + path.offset.dLat(h) + nLat,
        lon: c.lon + path.offset.dLon(h) + nLon,
        intensity: Math.max(0, intensity),
      });
    }
    const member: MemberTrack = {
      member: idx + 1,
      designedPath: pathKey,
      clusterIndex: -1,
      weight: Math.max(0.6, weight),
      points,
      landfall: isCyclone ? findLandfall(points) : null,
    };
    return member;
  });
}

/** First sea-to-land crossing, searched at 1 h resolution. */
function findLandfall(points: readonly TrackPoint[]): Landfall | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  let wasSea = !isLand(first.lat, first.lon);
  for (let h = first.leadH + 1; h <= last.leadH; h++) {
    const p = trackAt(points, h);
    if (!p) break;
    const land = isLand(p.lat, p.lon);
    if (wasSea && land) return { leadH: h, lat: p.lat, lon: p.lon };
    wasSea = !land;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Clustering (k-means on positions at key lead times)                  */
/* ------------------------------------------------------------------ */

function featureLeads(scenario: Scenario): number[] {
  return scenario.trackKind === 'cyclone' ? [72, 96, 108, 120, 132] : [96, 144, 192];
}

function features(scenario: Scenario, m: MemberTrack): number[] {
  const out: number[] = [];
  // Heat paths differ mainly in strength, so include intensity there, scaled so
  // the scenario's peak anomaly weighs like ~3° of displacement.
  const peak = Math.max(...scenario.controlTrack.map((k) => k.intensity));
  for (const h of featureLeads(scenario)) {
    const p = trackAt(m.points, h) ?? (m.points[m.points.length - 1] as TrackPoint);
    out.push(p.lat, p.lon);
    if (scenario.trackKind === 'heatCore') out.push((p.intensity / peak) * 3);
  }
  return out;
}

function dist2(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += ((a[i] as number) - (b[i] as number)) ** 2;
  return s;
}

/** Deterministic k-means with farthest-point initialisation from the control member. */
export function kMeans(vectors: readonly number[][], k: number, iterations = 25): number[] {
  const first = vectors[0];
  if (!first) return [];
  const centroids: number[][] = [first.slice()];
  while (centroids.length < k) {
    let best = 0;
    let bestD = -1;
    vectors.forEach((v, i) => {
      const d = Math.min(...centroids.map((c) => dist2(v, c)));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    });
    centroids.push((vectors[best] as number[]).slice());
  }
  let labels = vectors.map(() => 0);
  for (let it = 0; it < iterations; it++) {
    labels = vectors.map((v) => {
      let bi = 0;
      let bd = Infinity;
      centroids.forEach((c, ci) => {
        const d = dist2(v, c);
        if (d < bd) {
          bd = d;
          bi = ci;
        }
      });
      return bi;
    });
    for (let ci = 0; ci < k; ci++) {
      const mine = vectors.filter((_, i) => labels[i] === ci);
      if (mine.length === 0) continue;
      centroids[ci] = first.map((_, d) => mean(mine.map((v) => v[d] as number)));
    }
  }
  return labels;
}

function meanTrack(members: readonly MemberTrack[]): TrackPoint[] {
  const ref = members[0];
  if (!ref) return [];
  return ref.points.map((p) => {
    const at = members.map((m) => trackAt(m.points, p.leadH)).filter((x): x is TrackPoint => x !== null);
    return {
      leadH: p.leadH,
      lat: mean(at.map((x) => x.lat)),
      lon: mean(at.map((x) => x.lon)),
      intensity: mean(at.map((x) => x.intensity)),
    };
  });
}

function buildPaths(scenario: Scenario, members: MemberTrack[]): ScenarioPath[] {
  const labels = kMeans(
    members.map((m) => features(scenario, m)),
    scenario.paths.length,
  );
  members.forEach((m, i) => {
    m.clusterIndex = labels[i] ?? 0;
  });
  const totalWeight = members.reduce((s, m) => s + m.weight, 0);
  const clusters = scenario.paths.map((_, ci) => members.filter((m) => m.clusterIndex === ci));

  // Name each cluster by the designed path most of its members follow.
  const used = new Set<string>();
  const named = clusters.map((cm) => {
    const counts = new Map<string, number>();
    for (const m of cm) counts.set(m.designedPath, (counts.get(m.designedPath) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
    const key = ranked.find((x) => !used.has(x)) ?? scenario.paths.find((p) => !used.has(p.key))?.key ?? '';
    used.add(key);
    return key;
  });

  const paths = clusters.map((cm, ci) => {
    const key = named[ci] ?? '';
    const def = scenario.paths.find((p) => p.key === key);
    return {
      index: ci,
      key,
      label: def?.label ?? key,
      members: cm.map((m) => m.member),
      rawProbability: cm.length / members.length,
      calibratedProbability: cm.reduce((s, m) => s + m.weight, 0) / totalWeight,
      meanTrack: meanTrack(cm),
    };
  });
  // Most likely path first, re-indexing members to match.
  const order = paths.slice().sort((a, b) => b.calibratedProbability - a.calibratedProbability);
  const remap = new Map(order.map((p, newIdx) => [p.index, newIdx]));
  members.forEach((m) => {
    m.clusterIndex = remap.get(m.clusterIndex) ?? m.clusterIndex;
  });
  return order.map((p, i) => ({ ...p, index: i }));
}

/* ------------------------------------------------------------------ */
/* Cone, tube, threat summary, screening                                */
/* ------------------------------------------------------------------ */

function buildCone(members: readonly MemberTrack[], meanPts: readonly TrackPoint[]): ConeSlice[] {
  return meanPts.map((c) => {
    const d = members
      .map((m) => trackAt(m.points, c.leadH))
      .filter((x): x is TrackPoint => x !== null)
      .map((p) => haversineKm(c, p));
    return { leadH: c.leadH, lat: c.lat, lon: c.lon, radiusKm: Math.max(30, percentile(d, 67)) };
  });
}

/**
 * Closed lat/lon ring around the cone. 'track' follows the path (left side out,
 * right side back) and suits moving storms; 'envelope' is the outline of all
 * slices' circles and suits slow-moving heat cores whose path doubles back.
 */
export function conePolygon(cone: readonly ConeSlice[], shape: 'track' | 'envelope' = 'track'): LatLon[] {
  if (shape === 'envelope') {
    const pts: LatLon[] = [];
    for (const s of cone) {
      const cosLat = Math.cos((s.lat * Math.PI) / 180);
      const r = s.radiusKm / 111.2;
      for (let k = 0; k < 24; k++) {
        const t = (k / 24) * Math.PI * 2;
        pts.push({ lat: s.lat + r * Math.sin(t), lon: s.lon + (r * Math.cos(t)) / cosLat });
      }
    }
    const hull = convexHull(pts);
    return hull[0] ? [...hull, hull[0]] : hull;
  }
  const left: LatLon[] = [];
  const right: LatLon[] = [];
  cone.forEach((s, i) => {
    const prev = cone[Math.max(0, i - 1)] as ConeSlice;
    const next = cone[Math.min(cone.length - 1, i + 1)] as ConeSlice;
    const cosLat = Math.cos((s.lat * Math.PI) / 180);
    let dx = (next.lon - prev.lon) * cosLat;
    let dy = next.lat - prev.lat;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const rDeg = s.radiusKm / 111.2;
    left.push({ lat: s.lat + dx * rDeg, lon: s.lon - (dy * rDeg) / cosLat });
    right.push({ lat: s.lat - dx * rDeg, lon: s.lon + (dy * rDeg) / cosLat });
  });
  const ring = [...left, ...right.reverse()];
  if (ring[0]) ring.push(ring[0]);
  return ring;
}

function buildTube(members: readonly MemberTrack[], scenario: Scenario): TubeSlice[] {
  const ref = members[0];
  if (!ref) return [];
  const margin = scenario.trackKind === 'cyclone' ? 1.2 : 1.8;
  return ref.points.map((p) => {
    const at = members.map((m) => trackAt(m.points, p.leadH)).filter((x): x is TrackPoint => x !== null);
    return { leadH: p.leadH, bbox: bboxOf(at, margin) };
  });
}

function timingLabel(scenario: Scenario, fromH: number, toH: number): string {
  return `${formatUtc(validTime(scenario, fromH))} to ${formatUtc(validTime(scenario, toH))}`;
}

function heatCoreThreshold(scenario: Scenario): number {
  return scenario.fieldKind === 'wetBulb' ? 2.0 : 4.5;
}

function buildThreat(scenario: Scenario, members: readonly MemberTrack[], paths: readonly ScenarioPath[]): ThreatSummary {
  const lead = paths[0];
  if (!lead) throw new Error('No scenario paths');
  const pathList = paths.map((p) => ({ label: p.label, probability: p.calibratedProbability }));
  const hazard = scenario.hazards[0] as HazardType;

  if (scenario.trackKind === 'cyclone') {
    const landfalls = members.map((m) => m.landfall).filter((x): x is Landfall => x !== null);
    const mainLandfalls = members
      .filter((m) => m.clusterIndex === 0)
      .map((m) => m.landfall)
      .filter((x): x is Landfall => x !== null);
    const core = { lat: percentile(mainLandfalls.map((l) => l.lat), 50), lon: percentile(mainLandfalls.map((l) => l.lon), 50) };
    const radius = 150;
    const count = landfalls.filter((l) => haversineKm(l, core) <= radius).length;
    const fromH = Math.floor(percentile(landfalls.map((l) => l.leadH), 10) / 3) * 3;
    const toH = Math.ceil(percentile(landfalls.map((l) => l.leadH), 90) / 3) * 3;
    return {
      hazard,
      title: scenario.threatTitle,
      paths: pathList,
      core: { ...core, place: nearestPlace(core, (p) => p.country === 'IN') },
      timing: { fromH, toH, label: `Landfall ${timingLabel(scenario, fromH, toH)}` },
      agreement: { count, total: members.length, criterion: `landfall within ${radius} km of the core point` },
      drivers: scenario.drivers,
      illustrative: true,
    };
  }

  // Heat: core at the main path's peak; timing from members' time above the anomaly threshold.
  const thr = heatCoreThreshold(scenario);
  const peak = lead.meanTrack.reduce((a, b) => (b.intensity > a.intensity ? b : a));
  const onsets: number[] = [];
  const ends: number[] = [];
  let count = 0;
  for (const m of members) {
    const above = m.points.filter((p) => p.intensity >= thr);
    const first = above[0];
    const last = above[above.length - 1];
    if (first && last) {
      onsets.push(first.leadH);
      ends.push(last.leadH);
    }
    const atPeak = trackAt(m.points, peak.leadH);
    if (atPeak && atPeak.intensity >= thr && haversineKm(atPeak, peak) <= 250) count++;
  }
  const fromH = Math.floor(percentile(onsets, 10) / 6) * 6;
  const toH = Math.ceil(percentile(ends, 90) / 6) * 6;
  return {
    hazard,
    title: scenario.threatTitle,
    paths: pathList,
    core: { lat: peak.lat, lon: peak.lon, place: nearestPlace(peak, (p) => p.country === 'IN') },
    timing: { fromH, toH, label: timingLabel(scenario, fromH, toH) },
    agreement: {
      count,
      total: members.length,
      criterion: `core anomaly above ${thr} °C within 250 km of the core point at peak`,
    },
    drivers: scenario.drivers,
    illustrative: true,
  };
}

const MESH_LEVEL = 5;

function buildScreening(scenario: Scenario, members: readonly MemberTrack[]): Screening {
  const region = REGIONS[scenario.regionId].bbox;
  const pad = 4;
  const area: BBox = {
    latMin: region.latMin - pad,
    latMax: region.latMax + pad,
    lonMin: region.lonMin - pad,
    lonMax: region.lonMax + pad,
  };
  const peakIntensity = Math.max(...scenario.controlTrack.map((k) => k.intensity));
  const radiusKm = scenario.trackKind === 'cyclone' ? 260 : 380;
  const samples: TrackPoint[] = [];
  for (const m of members) for (const p of m.points) if (p.leadH % 12 === 0) samples.push(p);
  const nodes = icosphere(MESH_LEVEL)
    .nodes.filter((n) => bboxContains(area, n))
    .map((n) => {
      let score = 0;
      for (const p of samples) {
        const d = haversineKm(n, p);
        if (d > radiusKm * 2.5) continue;
        const s = (p.intensity / peakIntensity) * Math.exp(-((d / radiusKm) ** 2));
        if (s > score) score = s;
      }
      return { id: n.id, lat: n.lat, lon: n.lon, score: round(Math.min(1, score), 3) };
    });
  return { meshLevel: MESH_LEVEL, nodes, litThreshold: 0.35, candidates: threatBoxes(scenario), illustrative: true };
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

const cache = new Map<ScenarioId, Ensemble>();

export function getEnsemble(id: ScenarioId): Ensemble {
  const hit = cache.get(id);
  if (hit) return hit;
  const scenario = SCENARIOS[id];
  const members = generateMembers(scenario);
  const paths = buildPaths(scenario, members);
  const meanPts = meanTrack(members);
  const ensemble: Ensemble = {
    scenarioId: id,
    members,
    paths,
    mean: meanPts,
    cone: buildCone(members, meanPts),
    tube: buildTube(members, scenario),
    threat: buildThreat(scenario, members, paths),
    screening: buildScreening(scenario, members),
    illustrative: true,
  };
  cache.set(id, ensemble);
  return ensemble;
}

/** Ensemble spread (mean distance from ensemble mean, km) at each lead time. */
export function spreadKm(ensemble: Ensemble): Array<{ leadH: number; spreadKm: number }> {
  return ensemble.mean.map((c) => {
    const d = ensemble.members
      .map((m) => trackAt(m.points, c.leadH))
      .filter((x): x is TrackPoint => x !== null)
      .map((p) => haversineKm(c, p));
    return { leadH: c.leadH, spreadKm: mean(d) };
  });
}

/** Drop cached ensembles (used by the determinism self-check). */
export function clearEnsembleCache(): void {
  cache.clear();
}
