import { feature, mesh } from 'topojson-client';
import type { GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, MultiLineString } from 'geojson';
import { getWorldTopology, type BBox } from '../../sim';

/**
 * Base-map geometry for a region: land, coastline and country borders (no state
 * lines), from the bundled Natural Earth 50m countries. Only countries near the
 * region are kept so redraws during zoom and pan stay fast.
 */
export interface WorldLayers {
  land: FeatureCollection;
  coastline: MultiLineString;
  borders: MultiLineString;
}

const MARGIN_DEG = 15;
const cache = new Map<string, WorldLayers>();

function arcsNear(geometry: GeometryCollection['geometries'][number], box: BBox, bounds: Map<number, BBox>): boolean {
  const arcs = 'arcs' in geometry ? (geometry.arcs as unknown) : undefined;
  const ids: number[] = [];
  const collect = (v: unknown) => {
    if (typeof v === 'number') ids.push(v < 0 ? ~v : v);
    else if (Array.isArray(v)) v.forEach(collect);
  };
  collect(arcs);
  return ids.some((id) => {
    const b = bounds.get(id);
    return b !== undefined && b.lonMax >= box.lonMin && b.lonMin <= box.lonMax && b.latMax >= box.latMin && b.latMin <= box.latMax;
  });
}

/** Decode each arc once and record its lon/lat bounds. */
function arcBounds(): Map<number, BBox> {
  const { topology } = getWorldTopology();
  const out = new Map<number, BBox>();
  const tf = topology.transform;
  topology.arcs.forEach((arc, id) => {
    let x = 0;
    let y = 0;
    let latMin = Infinity;
    let latMax = -Infinity;
    let lonMin = Infinity;
    let lonMax = -Infinity;
    for (const pos of arc) {
      let lon: number;
      let lat: number;
      if (tf) {
        x += pos[0] as number;
        y += pos[1] as number;
        lon = x * tf.scale[0] + tf.translate[0];
        lat = y * tf.scale[1] + tf.translate[1];
      } else {
        lon = pos[0] as number;
        lat = pos[1] as number;
      }
      if (lon < lonMin) lonMin = lon;
      if (lon > lonMax) lonMax = lon;
      if (lat < latMin) latMin = lat;
      if (lat > latMax) latMax = lat;
    }
    out.set(id, { latMin, latMax, lonMin, lonMax });
  });
  return out;
}

let boundsCache: Map<number, BBox> | undefined;

export function worldLayers(region: BBox): WorldLayers {
  const near: BBox = {
    latMin: region.latMin - MARGIN_DEG,
    latMax: region.latMax + MARGIN_DEG,
    lonMin: region.lonMin - MARGIN_DEG,
    lonMax: region.lonMax + MARGIN_DEG,
  };
  const key = `${near.latMin}|${near.latMax}|${near.lonMin}|${near.lonMax}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { topology, countries } = getWorldTopology();
  boundsCache ??= arcBounds();
  const bounds = boundsCache;
  const subset: GeometryCollection = {
    type: 'GeometryCollection',
    geometries: countries.geometries.filter((g) => arcsNear(g, near, bounds)),
  };
  const layers: WorldLayers = {
    land: feature(topology, subset),
    coastline: mesh(topology, subset, (a, b) => a === b),
    borders: mesh(topology, subset, (a, b) => a !== b),
  };
  cache.set(key, layers);
  return layers;
}
