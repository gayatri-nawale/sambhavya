/**
 * SAMBHAVYA simulation engine. Seeded and deterministic: every load produces
 * identical data. Every dataset is illustrative (`illustrative: true`).
 */

export * from './rng';
export * from './geo';
export * from './scenarios';
export * from './ensemble';
export * from './fields';
export * from './downscale';
export * from './calibration';
export * from './risk';
export * from './cap';
export * from './pipeline';
export * from './verify';
export * from './provenance';
export { fingerprint, percentile, maxOf, meanOf } from './util';

import { clearEnsembleCache } from './ensemble';
import { clearFieldCache } from './fields';
import { clearDownscaleCache } from './downscale';
import { clearCalibrationCache } from './calibration';
import { clearRiskCache } from './risk';
import { clearPipelineCache } from './pipeline';
import { clearVerifyCache } from './verify';

/** Drop every cache so data is regenerated from the seeds (used by the determinism check). */
export function clearAllCaches(): void {
  clearEnsembleCache();
  clearFieldCache();
  clearDownscaleCache();
  clearCalibrationCache();
  clearRiskCache();
  clearPipelineCache();
  clearVerifyCache();
}
