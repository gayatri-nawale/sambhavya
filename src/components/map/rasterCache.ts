import type { Field } from '../../sim';
import type { RGBA } from '../../styles/colormaps';

/**
 * Coloured rasters are rendered to an offscreen canvas once per key (for
 * example scenario + variable + lead time) and reused on every redraw.
 */

const MAX_ENTRIES = 96;
const cache = new Map<string, HTMLCanvasElement>();

export type RasterWarp = 'none' | 'mercator';

function mercY(latDeg: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360));
}

/**
 * Coloured raster for a field. With warp 'mercator', rows are resampled so the
 * raster can be drawn with one drawImage onto a Mercator map.
 */
export function getRaster(key: string, field: Field, colormap: (v: number) => RGBA, warp: RasterWarp = 'none'): HTMLCanvasElement {
  const cacheKey = `${key}|${warp}`;
  const hit = cache.get(cacheKey);
  if (hit) {
    // Refresh recency.
    cache.delete(cacheKey);
    cache.set(cacheKey, hit);
    return hit;
  }
  const { nx, ny } = field.grid;
  const canvas = document.createElement('canvas');
  canvas.width = nx;
  canvas.height = ny;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(nx, ny);
    const { latMax, latMin } = field.grid.bbox;
    const yTop = mercY(latMax);
    const yBottom = mercY(latMin);
    for (let j = 0; j < ny; j++) {
      // Source row for this output row (identity unless warping to Mercator).
      let sj = j;
      if (warp === 'mercator') {
        const y = yTop + ((j + 0.5) / ny) * (yBottom - yTop);
        const lat = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI);
        sj = Math.min(ny - 1, Math.max(0, Math.floor((latMax - lat) / field.grid.dLat)));
      }
      for (let i = 0; i < nx; i++) {
        const [r, g, b, a] = colormap(field.values[sj * nx + i] as number);
        const k = (j * nx + i) * 4;
        img.data[k] = r;
        img.data[k + 1] = g;
        img.data[k + 2] = b;
        img.data[k + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  cache.set(cacheKey, canvas);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return canvas;
}

export function rasterCacheSize(): number {
  return cache.size;
}
