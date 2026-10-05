import { hashString, fbm } from './rng';
import { makeGridN, type Grid } from './geo';
import { SCENARIOS, type FieldKind, type ScenarioId } from './scenarios';
import { COARSE_CELLS, blockAverage, boxField12km, boxField5km, type Field } from './fields';
import { maxOf, meanOf, memo } from './util';

/**
 * 12 km → 5 km downscaling, three ways:
 * - bilinear: smooth interpolation, peak lost;
 * - plain U-Net: recovers some structure but regresses to the mean, peak lost;
 * - SAMBHAVYA diffusion: adds realistic fine detail, keeps the peak, differs slightly per sample.
 * All values are illustrative.
 */

export type DownscaleMethod = 'bilinear' | 'unet' | 'diffusion';

export const METHODS: readonly DownscaleMethod[] = ['bilinear', 'unet', 'diffusion'];

export const METHOD_LABELS: Record<DownscaleMethod, string> = {
  bilinear: 'Bilinear',
  unet: 'Plain U-Net',
  diffusion: 'SAMBHAVYA (diffusion)',
};

export const SAMPLES_PER_MEMBER = 4;
export const DIFFUSION_STEPS = 2;

export type GateCheckId = 'peaks' | 'balance' | 'matches';

export interface GateCheck {
  id: GateCheckId;
  label: string;
  pass: boolean;
  value: number;
  threshold: number;
  detail: string;
}

export interface GateResult {
  checks: GateCheck[];
  passed: boolean;
  fallback: 'none' | 'calibrated-12km';
  message: string;
  illustrative: true;
}

export interface DownscaleResult {
  method: DownscaleMethod;
  sample: number;
  member: number;
  field: Field;
  peak: number;
  /** Peak kept vs the 5 km reference, in %. Rain: ratio of maxima; temperature: ratio of (max − box mean). */
  peakKeptPct: number;
  gate: GateResult;
  illustrative: true;
}

export interface DownscaleOptions {
  member?: number;
  sample?: number;
  /** Inject a hallucinated artefact so the quality gate fails (fallback demo). */
  failing?: boolean;
}

/* ------------------------------------------------------------------ */
/* Array helpers                                                        */
/* ------------------------------------------------------------------ */

/** Bilinear interpolation from a cell-centred coarse grid to a fine grid over the same box. */
export function bilinearUpsample(coarse: Float32Array, cg: Grid, fg: Grid): Float32Array {
  const out = new Float32Array(fg.nx * fg.ny);
  for (let j = 0; j < fg.ny; j++) {
    const y = ((j + 0.5) * fg.dLat) / cg.dLat - 0.5;
    const y0 = Math.max(0, Math.min(cg.ny - 1, Math.floor(y)));
    const y1 = Math.min(cg.ny - 1, y0 + 1);
    const ty = Math.max(0, Math.min(1, y - y0));
    for (let i = 0; i < fg.nx; i++) {
      const x = ((i + 0.5) * fg.dLon) / cg.dLon - 0.5;
      const x0 = Math.max(0, Math.min(cg.nx - 1, Math.floor(x)));
      const x1 = Math.min(cg.nx - 1, x0 + 1);
      const tx = Math.max(0, Math.min(1, x - x0));
      const a = coarse[y0 * cg.nx + x0] as number;
      const b = coarse[y0 * cg.nx + x1] as number;
      const c = coarse[y1 * cg.nx + x0] as number;
      const d = coarse[y1 * cg.nx + x1] as number;
      out[j * fg.nx + i] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

export function gaussianBlur(src: Float32Array, nx: number, ny: number, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 3);
  const kernel: number[] = [];
  let ks = 0;
  for (let k = -r; k <= r; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(w);
    ks += w;
  }
  const kn = kernel.map((w) => w / ks);
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) {
        const ii = Math.min(nx - 1, Math.max(0, i + k));
        s += (src[j * nx + ii] as number) * (kn[k + r] as number);
      }
      tmp[j * nx + i] = s;
    }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) {
        const jj = Math.min(ny - 1, Math.max(0, j + k));
        s += (tmp[jj * nx + i] as number) * (kn[k + r] as number);
      }
      out[j * nx + i] = s;
    }
  return out;
}

function rmse(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += ((a[k] as number) - (b[k] as number)) ** 2;
  return Math.sqrt(s / a.length);
}

function std(a: Float32Array): number {
  const m = meanOf(a);
  let s = 0;
  for (let k = 0; k < a.length; k++) s += ((a[k] as number) - m) ** 2;
  return Math.sqrt(s / a.length);
}

/* ------------------------------------------------------------------ */
/* Quality gate                                                         */
/* ------------------------------------------------------------------ */

export const GATE_FAIL_MESSAGE = 'Gate failed, publishing calibrated 12 km instead.';
export const GATE_PASS_MESSAGE = 'All checks passed, publishing 5 km detail.';

/** The three physics checks applied to every 5 km output before it can be published. */
export function runGate(input12: Field, output5: Field, kind: FieldKind): GateResult {
  const inPeak = maxOf(input12.values);
  const outPeak = maxOf(output5.values);
  const inMean = meanOf(input12.values);
  const outMean = meanOf(output5.values);
  const isRain = kind === 'rain';

  // Peaks kept: the 5 km peak must not fall below the 12 km peak, nor jump implausibly above it.
  const peakRatio = isRain ? outPeak / Math.max(1e-6, inPeak) : outPeak - inPeak;
  const peaks: GateCheck = isRain
    ? {
        id: 'peaks',
        label: 'Peaks kept',
        pass: peakRatio >= 0.98 && peakRatio <= 1.8,
        value: peakRatio,
        threshold: 0.98,
        detail: `5 km peak is ${peakRatio.toFixed(2)}× the 12 km peak (allowed 0.98–1.8×)`,
      }
    : {
        id: 'peaks',
        label: 'Peaks kept',
        pass: peakRatio >= -0.2 && peakRatio <= 2.5,
        value: peakRatio,
        threshold: -0.2,
        detail: `5 km peak is ${peakRatio >= 0 ? '+' : ''}${peakRatio.toFixed(1)} °C vs the 12 km peak (allowed −0.2 to +2.5 °C)`,
      };

  // Balance: area total of rain (or area-mean temperature) must match the 12 km input.
  const balanceValue = isRain ? Math.abs(outMean - inMean) / Math.max(1e-6, inMean) : Math.abs(outMean - inMean);
  const balance: GateCheck = isRain
    ? {
        id: 'balance',
        label: 'Water balance',
        pass: balanceValue <= 0.02,
        value: balanceValue,
        threshold: 0.02,
        detail: `Area rain total differs by ${(balanceValue * 100).toFixed(1)}% (allowed 2%)`,
      }
    : {
        id: 'balance',
        label: 'Area mean kept',
        pass: balanceValue <= 0.2,
        value: balanceValue,
        threshold: 0.2,
        detail: `Area mean differs by ${balanceValue.toFixed(2)} °C (allowed 0.2 °C)`,
      };

  // Matches 12 km: the 5 km output, averaged back to 12 km, must reproduce the input.
  const back = blockAverage(output5.values, output5.grid, input12.grid);
  const matchValue = rmse(back, input12.values) / Math.max(1e-6, std(input12.values));
  const matches: GateCheck = {
    id: 'matches',
    label: 'Matches 12 km',
    pass: matchValue <= 0.2,
    value: matchValue,
    threshold: 0.2,
    detail: `Error after averaging back to 12 km is ${(matchValue * 100).toFixed(0)}% of the field's variability (allowed 20%)`,
  };

  const checks = [peaks, balance, matches];
  const passed = checks.every((c) => c.pass);
  return {
    checks,
    passed,
    fallback: passed ? 'none' : 'calibrated-12km',
    message: passed ? GATE_PASS_MESSAGE : GATE_FAIL_MESSAGE,
    illustrative: true,
  };
}

/* ------------------------------------------------------------------ */
/* Methods                                                              */
/* ------------------------------------------------------------------ */

const cache = new Map<string, DownscaleResult>();

function peakKept(kind: FieldKind, out: Float32Array, ref: Float32Array): number {
  if (kind === 'rain') return (100 * maxOf(out)) / maxOf(ref);
  return (100 * (maxOf(out) - meanOf(out))) / (maxOf(ref) - meanOf(ref));
}

export function downscale(
  scenarioId: ScenarioId,
  boxId: string,
  method: DownscaleMethod,
  options: DownscaleOptions = {},
): DownscaleResult {
  const member = options.member ?? 1;
  const sample = method === 'diffusion' ? (options.sample ?? 0) : 0;
  const failing = method === 'diffusion' && options.failing === true;
  const key = `${scenarioId}|${boxId}|${method}|${member}|${sample}|${failing ? 'f' : 'ok'}`;
  return memo(cache, key, () => {
    const scenario = SCENARIOS[scenarioId];
    const kind = scenario.fieldKind;
    const ref = boxField5km(scenarioId, boxId, member);
    const input = boxField12km(scenarioId, boxId, member);
    const fg = ref.grid;
    const n = fg.nx;
    const up = bilinearUpsample(input.values, input.grid, fg);
    const residual = new Float32Array(up.length);
    for (let k = 0; k < up.length; k++) residual[k] = (ref.values[k] as number) - (up[k] as number);

    let values: Float32Array;
    if (method === 'bilinear') {
      values = up;
    } else if (method === 'unet') {
      // Deterministic regression: recovers only the smoother part of the detail and pulls extremes in.
      const smoothRes = gaussianBlur(residual, n, n, 2.2);
      const m = meanOf(up);
      values = new Float32Array(up.length);
      for (let k = 0; k < up.length; k++) {
        const v = (up[k] as number) + 0.45 * (smoothRes[k] as number);
        values[k] = m + (v - m) * 0.93;
      }
    } else {
      // Diffusion sample: full-detail residual with sample-specific texture.
      const seed = hashString(`${scenario.seed}/diffusion/${boxId}/${member}/${sample}`);
      const scale = kind === 'rain' ? 0.06 : 0.3;
      values = new Float32Array(up.length);
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const k = j * n + i;
          const texture = fbm(i / 9, j / 9, seed, 3) - 0.5;
          const jitter = 1 + 0.4 * texture;
          const base = (up[k] as number) + (residual[k] as number) * jitter;
          const extra = kind === 'rain' ? scale * Math.abs(base) * texture : scale * texture;
          values[k] = base + extra;
        }
      // Constraint layer: keep the 12 km area total (rain) or area mean (temperature).
      const target = meanOf(input.values);
      const current = meanOf(values);
      if (kind === 'rain') {
        const f = target / Math.max(1e-6, current);
        for (let k = 0; k < values.length; k++) values[k] = Math.max(0, (values[k] as number) * f);
      } else {
        const d = target - current;
        for (let k = 0; k < values.length; k++) values[k] = (values[k] as number) + d;
      }
      if (failing) {
        // A hallucinated storm cell far from the real core, added after the constraint layer.
        const peak = maxOf(values);
        // Placed in the right half of the box, where the split view shows the output.
        const ci = Math.round(n * 0.78);
        const cj = Math.round(n * 0.3);
        const amp = kind === 'rain' ? peak * 0.9 : 4.5;
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const d2 = (i - ci) ** 2 + (j - cj) ** 2;
            const k = j * n + i;
            values[k] = (values[k] as number) + amp * Math.exp(-d2 / (2 * 9 * 9));
          }
      }
    }
    for (let k = 0; k < values.length; k++) if (kind === 'rain' && (values[k] as number) < 0) values[k] = 0;

    const field: Field = { ...ref, values };
    return {
      method,
      sample,
      member,
      field,
      peak: maxOf(values),
      peakKeptPct: peakKept(kind, values, ref.values),
      gate: runGate(input, field, kind),
      illustrative: true,
    };
  });
}

export interface MethodMetric {
  method: DownscaleMethod | 'input12km' | 'reference';
  label: string;
  peak: number;
  peakKeptPct: number;
}

export interface DownscaleComparison {
  input: Field;
  reference: Field;
  results: Record<DownscaleMethod, DownscaleResult>;
  metrics: MethodMetric[];
  illustrative: true;
}

export function compareMethods(scenarioId: ScenarioId, boxId: string, member = 1, sample = 0): DownscaleComparison {
  const kind = SCENARIOS[scenarioId].fieldKind;
  const input = boxField12km(scenarioId, boxId, member);
  const reference = boxField5km(scenarioId, boxId, member);
  const results = {
    bilinear: downscale(scenarioId, boxId, 'bilinear', { member }),
    unet: downscale(scenarioId, boxId, 'unet', { member }),
    diffusion: downscale(scenarioId, boxId, 'diffusion', { member, sample }),
  };
  const metrics: MethodMetric[] = [
    { method: 'input12km', label: '12 km input', peak: maxOf(input.values), peakKeptPct: peakKept(kind, input.values, reference.values) },
    ...METHODS.map((m) => ({ method: m, label: METHOD_LABELS[m], peak: results[m].peak, peakKeptPct: results[m].peakKeptPct })),
    { method: 'reference', label: '5 km reference', peak: maxOf(reference.values), peakKeptPct: 100 },
  ];
  return { input, reference, results, metrics, illustrative: true };
}

/* ------------------------------------------------------------------ */
/* Radially averaged power spectrum                                     */
/* ------------------------------------------------------------------ */

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] as number;
      re[i] = re[j] as number;
      re[j] = tr;
      const ti = im[i] as number;
      im[i] = im[j] as number;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] as number) * cr - (im[b] as number) * ci;
        const xi = (re[b] as number) * ci + (im[b] as number) * cr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Radially averaged power spectrum of a square power-of-two field (Hann-windowed). */
export function radialSpectrum(values: Float32Array, n: number): number[] {
  const m = meanOf(values);
  const re: Float64Array[] = [];
  const im: Float64Array[] = [];
  for (let j = 0; j < n; j++) {
    const r = new Float64Array(n);
    const wj = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / (n - 1));
    for (let i = 0; i < n; i++) {
      const wi = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      r[i] = ((values[j * n + i] as number) - m) * wi * wj;
    }
    const iRow = new Float64Array(n);
    fft(r, iRow);
    re.push(r);
    im.push(iRow);
  }
  const power = new Float64Array(n / 2 + 1);
  const count = new Uint32Array(n / 2 + 1);
  const colR = new Float64Array(n);
  const colI = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      colR[j] = (re[j] as Float64Array)[i] as number;
      colI[j] = (im[j] as Float64Array)[i] as number;
    }
    fft(colR, colI);
    const kx = i <= n / 2 ? i : i - n;
    for (let j = 0; j < n; j++) {
      const ky = j <= n / 2 ? j : j - n;
      const k = Math.round(Math.hypot(kx, ky));
      if (k > n / 2) continue;
      power[k] = (power[k] as number) + (colR[j] as number) ** 2 + (colI[j] as number) ** 2;
      count[k] = (count[k] as number) + 1;
    }
  }
  return Array.from(power, (p, k) => p / Math.max(1, count[k] as number));
}

export interface SpectrumPoint {
  /** Wavenumber (cycles per patch). */
  k: number;
  wavelengthKm: number;
  reference: number;
  bilinear: number;
  unet: number;
  diffusion: number;
}

const spectrumCache = new Map<string, SpectrumPoint[]>();

/** log10 power per wavenumber for the reference and the three methods. */
export function spectrum(scenarioId: ScenarioId, boxId: string, member = 1, sample = 0): SpectrumPoint[] {
  return memo(spectrumCache, `${scenarioId}|${boxId}|${member}|${sample}`, () => {
    const cmp = compareMethods(scenarioId, boxId, member, sample);
    const n = cmp.reference.grid.nx;
    const patchKm = n * 5;
    const ref = radialSpectrum(cmp.reference.values, n);
    const bil = radialSpectrum(cmp.results.bilinear.field.values, n);
    const un = radialSpectrum(cmp.results.unet.field.values, n);
    const dif = radialSpectrum(cmp.results.diffusion.field.values, n);
    const out: SpectrumPoint[] = [];
    for (let k = 1; k <= n / 2; k++) {
      const lg = (arr: number[]) => Math.log10(Math.max(1e-12, arr[k] as number));
      out.push({ k, wavelengthKm: patchKm / k, reference: lg(ref), bilinear: lg(bil), unet: lg(un), diffusion: lg(dif) });
    }
    return out;
  });
}

/** Grid of the 12 km input over a box (exported for renderers). */
export function coarseGridFor(field: Field): Grid {
  return makeGridN(field.grid.bbox, COARSE_CELLS, COARSE_CELLS);
}

export function clearDownscaleCache(): void {
  cache.clear();
  spectrumCache.clear();
}
