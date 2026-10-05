import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Geometry, Position } from 'geojson';
import countriesRaw from 'world-atlas/countries-50m.json?raw';

/* ------------------------------------------------------------------ */
/* Basic geometry                                                       */
/* ------------------------------------------------------------------ */

export interface LatLon {
  lat: number;
  lon: number;
}

export interface BBox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export type RegionId = 'bayOfBengal' | 'northWestIndia' | 'eastCoast';

export interface Region {
  id: RegionId;
  name: string;
  bbox: BBox;
}

export const REGIONS: Record<RegionId, Region> = {
  bayOfBengal: {
    id: 'bayOfBengal',
    name: 'Bay of Bengal',
    bbox: { latMin: 5, latMax: 28, lonMin: 78, lonMax: 98 },
  },
  northWestIndia: {
    id: 'northWestIndia',
    name: 'North-west India',
    bbox: { latMin: 22, latMax: 32, lonMin: 68, lonMax: 80 },
  },
  eastCoast: {
    id: 'eastCoast',
    name: 'East coast',
    bbox: { latMin: 13, latMax: 23, lonMin: 79, lonMax: 89 },
  },
};

export const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Fast local distance (km) for small separations; used inside field loops. */
export function localOffsetKm(origin: LatLon, lat: number, lon: number): { dx: number; dy: number } {
  const dy = (lat - origin.lat) * 111.2;
  const dx = (lon - origin.lon) * 111.2 * Math.cos(origin.lat * DEG);
  return { dx, dy };
}

export function bboxCenter(b: BBox): LatLon {
  return { lat: (b.latMin + b.latMax) / 2, lon: (b.lonMin + b.lonMax) / 2 };
}

export function bboxAround(center: LatLon, sizeDeg: number): BBox {
  const h = sizeDeg / 2;
  return { latMin: center.lat - h, latMax: center.lat + h, lonMin: center.lon - h, lonMax: center.lon + h };
}

export function bboxContains(b: BBox, p: LatLon): boolean {
  return p.lat >= b.latMin && p.lat <= b.latMax && p.lon >= b.lonMin && p.lon <= b.lonMax;
}

export function bboxOf(points: readonly LatLon[], marginDeg = 0): BBox {
  let latMin = Infinity;
  let latMax = -Infinity;
  let lonMin = Infinity;
  let lonMax = -Infinity;
  for (const p of points) {
    latMin = Math.min(latMin, p.lat);
    latMax = Math.max(latMax, p.lat);
    lonMin = Math.min(lonMin, p.lon);
    lonMax = Math.max(lonMax, p.lon);
  }
  return {
    latMin: latMin - marginDeg,
    latMax: latMax + marginDeg,
    lonMin: lonMin - marginDeg,
    lonMax: lonMax + marginDeg,
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Convex hull (monotone chain) of lat/lon points, returned as an open ring. */
export function convexHull(points: readonly LatLon[]): LatLon[] {
  const pts = points
    .slice()
    .sort((a, b) => (a.lon === b.lon ? a.lat - b.lat : a.lon - b.lon));
  if (pts.length < 3) return pts;
  const cross = (o: LatLon, a: LatLon, b: LatLon) =>
    (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon);
  const lower: LatLon[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2] as LatLon, lower[lower.length - 1] as LatLon, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: LatLon[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i] as LatLon;
    while (upper.length >= 2 && cross(upper[upper.length - 2] as LatLon, upper[upper.length - 1] as LatLon, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/* ------------------------------------------------------------------ */
/* Grids                                                                */
/* ------------------------------------------------------------------ */

/** ~12 km NEPS-G grid spacing and ~5 km target spacing, in degrees. */
export const RES_12KM = 0.11;
export const RES_5KM = 0.045;

/** Cell-centred regular lat/lon grid. Row 0 is the northernmost row. */
export interface Grid {
  bbox: BBox;
  nx: number;
  ny: number;
  /** Cell size in degrees (x and y). */
  dLon: number;
  dLat: number;
}

/** Grid that fits `bbox` with roughly `resDeg` spacing (exact spacing adjusted to fit). */
export function makeGrid(bbox: BBox, resDeg: number): Grid {
  const nx = Math.max(1, Math.round((bbox.lonMax - bbox.lonMin) / resDeg));
  const ny = Math.max(1, Math.round((bbox.latMax - bbox.latMin) / resDeg));
  return { bbox, nx, ny, dLon: (bbox.lonMax - bbox.lonMin) / nx, dLat: (bbox.latMax - bbox.latMin) / ny };
}

/** Grid with an exact cell count (used for 128×128 5 km patches). */
export function makeGridN(bbox: BBox, nx: number, ny: number): Grid {
  return { bbox, nx, ny, dLon: (bbox.lonMax - bbox.lonMin) / nx, dLat: (bbox.latMax - bbox.latMin) / ny };
}

export function cellLat(g: Grid, j: number): number {
  return g.bbox.latMax - (j + 0.5) * g.dLat;
}

export function cellLon(g: Grid, i: number): number {
  return g.bbox.lonMin + (i + 0.5) * g.dLon;
}

/* ------------------------------------------------------------------ */
/* Places                                                               */
/* ------------------------------------------------------------------ */

export interface Place extends LatLon {
  name: string;
  /** Hindi name, for SMS previews. */
  hi: string;
  country: 'IN' | 'BD';
  coastal: boolean;
}

export const PLACES: readonly Place[] = [
  // East coast and Bay head
  { name: 'Digha', hi: 'दीघा', lat: 21.63, lon: 87.51, country: 'IN', coastal: true },
  { name: 'Sagar Island', hi: 'सागर द्वीप', lat: 21.65, lon: 88.08, country: 'IN', coastal: true },
  { name: 'Sundarbans', hi: 'सुंदरबन', lat: 21.95, lon: 88.75, country: 'IN', coastal: true },
  { name: 'Haldia', hi: 'हल्दिया', lat: 22.06, lon: 88.07, country: 'IN', coastal: true },
  { name: 'Kolkata', hi: 'कोलकाता', lat: 22.57, lon: 88.36, country: 'IN', coastal: false },
  { name: 'Balasore', hi: 'बालासोर', lat: 21.49, lon: 86.93, country: 'IN', coastal: true },
  { name: 'Paradip', hi: 'पारादीप', lat: 20.32, lon: 86.61, country: 'IN', coastal: true },
  { name: 'Puri', hi: 'पुरी', lat: 19.81, lon: 85.83, country: 'IN', coastal: true },
  { name: 'Bhubaneswar', hi: 'भुवनेश्वर', lat: 20.3, lon: 85.82, country: 'IN', coastal: false },
  { name: 'Gopalpur', hi: 'गोपालपुर', lat: 19.26, lon: 84.91, country: 'IN', coastal: true },
  { name: 'Srikakulam', hi: 'श्रीकाकुलम', lat: 18.3, lon: 83.9, country: 'IN', coastal: true },
  { name: 'Visakhapatnam', hi: 'विशाखापत्तनम', lat: 17.69, lon: 83.22, country: 'IN', coastal: true },
  { name: 'Kakinada', hi: 'काकीनाडा', lat: 16.99, lon: 82.25, country: 'IN', coastal: true },
  { name: 'Machilipatnam', hi: 'मछलीपट्टनम', lat: 16.17, lon: 81.13, country: 'IN', coastal: true },
  { name: 'Vijayawada', hi: 'विजयवाड़ा', lat: 16.51, lon: 80.65, country: 'IN', coastal: false },
  { name: 'Ongole', hi: 'ओंगोल', lat: 15.5, lon: 80.05, country: 'IN', coastal: true },
  { name: 'Nellore', hi: 'नेल्लोर', lat: 14.44, lon: 79.99, country: 'IN', coastal: true },
  // North-east
  { name: 'Sohra', hi: 'सोहरा', lat: 25.28, lon: 91.72, country: 'IN', coastal: false },
  { name: 'Shillong', hi: 'शिलांग', lat: 25.58, lon: 91.89, country: 'IN', coastal: false },
  { name: 'Guwahati', hi: 'गुवाहाटी', lat: 26.14, lon: 91.74, country: 'IN', coastal: false },
  { name: 'Silchar', hi: 'सिलचर', lat: 24.83, lon: 92.78, country: 'IN', coastal: false },
  { name: 'Agartala', hi: 'अगरतला', lat: 23.83, lon: 91.29, country: 'IN', coastal: false },
  // Bangladesh (map labels only, never alert areas)
  { name: 'Hatiya', hi: 'हातिया', lat: 22.28, lon: 91.1, country: 'BD', coastal: true },
  { name: 'Khulna', hi: 'खुलना', lat: 22.82, lon: 89.55, country: 'BD', coastal: false },
  // North-west India
  { name: 'Jaisalmer', hi: 'जैसलमेर', lat: 26.92, lon: 70.91, country: 'IN', coastal: false },
  { name: 'Barmer', hi: 'बाड़मेर', lat: 25.75, lon: 71.39, country: 'IN', coastal: false },
  { name: 'Phalodi', hi: 'फलोदी', lat: 27.13, lon: 72.36, country: 'IN', coastal: false },
  { name: 'Jodhpur', hi: 'जोधपुर', lat: 26.24, lon: 73.02, country: 'IN', coastal: false },
  { name: 'Bikaner', hi: 'बीकानेर', lat: 28.02, lon: 73.31, country: 'IN', coastal: false },
  { name: 'Sri Ganganagar', hi: 'श्रीगंगानगर', lat: 29.9, lon: 73.88, country: 'IN', coastal: false },
  { name: 'Churu', hi: 'चूरू', lat: 28.3, lon: 74.95, country: 'IN', coastal: false },
  { name: 'Hisar', hi: 'हिसार', lat: 29.15, lon: 75.72, country: 'IN', coastal: false },
  { name: 'Jaipur', hi: 'जयपुर', lat: 26.91, lon: 75.79, country: 'IN', coastal: false },
  { name: 'Delhi', hi: 'दिल्ली', lat: 28.61, lon: 77.21, country: 'IN', coastal: false },
  { name: 'Agra', hi: 'आगरा', lat: 27.18, lon: 78.01, country: 'IN', coastal: false },
];

export function placeByName(name: string): Place {
  const p = PLACES.find((x) => x.name === name);
  if (!p) throw new Error(`Unknown place: ${name}`);
  return p;
}

export function nearestPlace(p: LatLon, filter?: (pl: Place) => boolean): Place {
  let best: Place | undefined;
  let bestD = Infinity;
  for (const pl of PLACES) {
    if (filter && !filter(pl)) continue;
    const d = haversineKm(p, pl);
    if (d < bestD) {
      bestD = d;
      best = pl;
    }
  }
  if (!best) throw new Error('No place matches filter');
  return best;
}

/* ------------------------------------------------------------------ */
/* Land / India mask (rasterised once from the bundled world atlas)     */
/* ------------------------------------------------------------------ */

const MASK_BBOX: BBox = { latMin: 3, latMax: 35, lonMin: 64, lonMax: 101 };
const MASK_RES = RES_5KM;
const INDIA_ID = '356';

export const MASK_NONE = 0;
export const MASK_LAND = 1;
export const MASK_INDIA = 2;

interface SurfaceMask {
  grid: Grid;
  /** 0 = sea, 1 = land (other country), 2 = India. */
  cells: Uint8Array;
  /** Land fraction smoothed over ~35 km, 0..1. */
  landSmooth: Float32Array;
}

let maskCache: SurfaceMask | undefined;

function ringsOf(geometry: Geometry): Position[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

/** Even-odd scanline fill of polygon rings into the mask. */
function rasterise(cells: Uint8Array, grid: Grid, rings: Position[][], value: number): void {
  const edges: number[] = [];
  for (const ring of rings) {
    for (let k = 0; k < ring.length - 1; k++) {
      const a = ring[k] as Position;
      const b = ring[k + 1] as Position;
      const ax = a[0] as number;
      const ay = a[1] as number;
      const bx = b[0] as number;
      const by = b[1] as number;
      if (Math.abs(bx - ax) > 180) continue; // antimeridian seam
      if (Math.max(ay, by) < grid.bbox.latMin || Math.min(ay, by) > grid.bbox.latMax) continue;
      edges.push(ax, ay, bx, by);
    }
  }
  if (edges.length === 0) return;
  const xs: number[] = [];
  for (let j = 0; j < grid.ny; j++) {
    const lat = cellLat(grid, j);
    xs.length = 0;
    for (let e = 0; e < edges.length; e += 4) {
      const ay = edges[e + 1] as number;
      const by = edges[e + 3] as number;
      if ((ay > lat) === (by > lat)) continue;
      const ax = edges[e] as number;
      const bx = edges[e + 2] as number;
      xs.push(ax + ((lat - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = xs[k] as number;
      const x1 = xs[k + 1] as number;
      const i0 = Math.max(0, Math.ceil((x0 - grid.bbox.lonMin) / grid.dLon - 0.5));
      const i1 = Math.min(grid.nx - 1, Math.floor((x1 - grid.bbox.lonMin) / grid.dLon - 0.5));
      for (let i = i0; i <= i1; i++) cells[j * grid.nx + i] = value;
    }
  }
}

function boxBlur(src: Float32Array, nx: number, ny: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let j = 0; j < ny; j++) {
    let acc = 0;
    let n = 0;
    for (let i = -r; i < nx + r; i++) {
      if (i + r < nx && i + r >= 0) {
        acc += src[j * nx + i + r] as number;
        n++;
      }
      if (i - r - 1 >= 0 && i - r - 1 < nx) {
        acc -= src[j * nx + i - r - 1] as number;
        n--;
      }
      if (i >= 0 && i < nx) tmp[j * nx + i] = acc / n;
    }
  }
  for (let i = 0; i < nx; i++) {
    let acc = 0;
    let n = 0;
    for (let j = -r; j < ny + r; j++) {
      if (j + r < ny && j + r >= 0) {
        acc += tmp[(j + r) * nx + i] as number;
        n++;
      }
      if (j - r - 1 >= 0 && j - r - 1 < ny) {
        acc -= tmp[(j - r - 1) * nx + i] as number;
        n--;
      }
      if (j >= 0 && j < ny) out[j * nx + i] = acc / n;
    }
  }
  return out;
}

function isTopology(value: unknown): value is Topology {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'Topology';
}

function surfaceMask(): SurfaceMask {
  if (maskCache) return maskCache;
  const parsed: unknown = JSON.parse(countriesRaw);
  if (!isTopology(parsed)) throw new Error('world-atlas data is not a TopoJSON topology');
  const countries = parsed.objects['countries'] as GeometryCollection;
  const fc = feature(parsed, countries);
  const grid = makeGrid(MASK_BBOX, MASK_RES);
  const cells = new Uint8Array(grid.nx * grid.ny);
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const rings = ringsOf(f.geometry);
    // Skip countries nowhere near the mask box.
    let near = false;
    for (const ring of rings) {
      for (const p of ring) {
        const lon = p[0] as number;
        const lat = p[1] as number;
        if (lon > MASK_BBOX.lonMin - 2 && lon < MASK_BBOX.lonMax + 2 && lat > MASK_BBOX.latMin - 2 && lat < MASK_BBOX.latMax + 2) {
          near = true;
          break;
        }
      }
      if (near) break;
    }
    if (!near) continue;
    rasterise(cells, grid, rings, String(f.id) === INDIA_ID ? MASK_INDIA : MASK_LAND);
  }
  const land = new Float32Array(cells.length);
  for (let k = 0; k < cells.length; k++) land[k] = (cells[k] as number) > 0 ? 1 : 0;
  maskCache = { grid, cells, landSmooth: boxBlur(land, grid.nx, grid.ny, 7) };
  return maskCache;
}

function maskIndex(lat: number, lon: number): number {
  const m = surfaceMask();
  const i = Math.floor((lon - m.grid.bbox.lonMin) / m.grid.dLon);
  const j = Math.floor((m.grid.bbox.latMax - lat) / m.grid.dLat);
  if (i < 0 || j < 0 || i >= m.grid.nx || j >= m.grid.ny) return -1;
  return j * m.grid.nx + i;
}

/** Surface class at a point: MASK_NONE (sea), MASK_LAND or MASK_INDIA. */
export function surfaceAt(lat: number, lon: number): number {
  const k = maskIndex(lat, lon);
  return k < 0 ? MASK_NONE : (surfaceMask().cells[k] as number);
}

export function isLand(lat: number, lon: number): boolean {
  return surfaceAt(lat, lon) !== MASK_NONE;
}

export function isIndia(lat: number, lon: number): boolean {
  return surfaceAt(lat, lon) === MASK_INDIA;
}

/** Smoothed land fraction (0 = open sea, 1 = well inland). */
export function landFraction(lat: number, lon: number): number {
  const k = maskIndex(lat, lon);
  return k < 0 ? 0 : (surfaceMask().landSmooth[k] as number);
}

/** 0..1, highest within ~35 km of a coastline. */
export function coastProximity(lat: number, lon: number): number {
  const f = landFraction(lat, lon);
  return 1 - Math.abs(2 * f - 1);
}

/* ------------------------------------------------------------------ */
/* Icosahedral mesh (for the GNN screening visual)                      */
/* ------------------------------------------------------------------ */

export interface MeshNode extends LatLon {
  id: number;
}

export interface IcoMesh {
  subdivisions: number;
  nodes: MeshNode[];
  /** Pairs of node ids. */
  edges: Array<[number, number]>;
}

const meshCache = new Map<number, IcoMesh>();

/** Subdivided icosahedron on the unit sphere. Level 3 = 642 nodes, level 4 = 2,562. */
export function icosphere(subdivisions: number): IcoMesh {
  const cached = meshCache.get(subdivisions);
  if (cached) return cached;
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: Array<[number, number, number]> = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  let faces: Array<[number, number, number]> = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const normalise = (v: [number, number, number]): [number, number, number] => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  for (let k = 0; k < verts.length; k++) verts[k] = normalise(verts[k] as [number, number, number]);
  for (let s = 0; s < subdivisions; s++) {
    const midCache = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = midCache.get(key);
      if (hit !== undefined) return hit;
      const va = verts[a] as [number, number, number];
      const vb = verts[b] as [number, number, number];
      verts.push(normalise([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]));
      midCache.set(key, verts.length - 1);
      return verts.length - 1;
    };
    const next: Array<[number, number, number]> = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const edgeSet = new Set<string>();
  const edges: Array<[number, number]> = [];
  for (const [a, b, c] of faces) {
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push(p < q ? [p, q] : [q, p]);
      }
    }
  }
  const nodes = verts.map(([x, y, z], id) => ({
    id,
    lat: Math.asin(z) / DEG,
    lon: Math.atan2(y, x) / DEG,
  }));
  const mesh: IcoMesh = { subdivisions, nodes, edges };
  meshCache.set(subdivisions, mesh);
  return mesh;
}
