/** Small numeric helpers shared by the simulation modules. */

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Linear-interpolated percentile, p in [0, 100]. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const pos = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

export function round(v: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function maxOf(values: ArrayLike<number>): number {
  let m = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number;
    if (v > m) m = v;
  }
  return m;
}

export function meanOf(values: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i] as number;
  return s / values.length;
}

/** Cache helper: memoise by string key. */
export function memo<T>(cache: Map<string, T>, key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = make();
  cache.set(key, value);
  return value;
}

/** Stable short fingerprint of any JSON-able value (FNV-1a over JSON text). */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value, (_k, v: unknown) => {
    if (v instanceof Float32Array || v instanceof Float64Array) {
      // Hash typed arrays by rounded content.
      let h = 0x811c9dc5;
      for (let i = 0; i < v.length; i++) {
        h ^= Math.round((v[i] as number) * 100) | 0;
        h = Math.imul(h, 0x01000193);
      }
      return `typed:${v.length}:${(h >>> 0).toString(16)}`;
    }
    if (typeof v === 'number') return Math.round(v * 1e4) / 1e4;
    return v;
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
