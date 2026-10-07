import { hashString } from './rng';
import { SCENARIOS, ENSEMBLE_SIZE, type ScenarioId } from './scenarios';
import { downscale, type GateCheck } from './downscale';
import type { Alert } from './risk';

/**
 * Data inputs, model registry and run provenance (docs/PROTOTYPE_SPEC.md Part 5.10).
 * Status values, versions, hashes and training notes are illustrative.
 */

export type InputStatus = 'received' | 'cached' | 'training' | 'verification';

export const INPUT_STATUS_LABELS: Record<InputStatus, string> = {
  received: 'Received',
  cached: 'Cached',
  training: 'Training data',
  verification: 'Verification data',
};

export interface DataInput {
  id: string;
  name: string;
  role: string;
  resolution: string;
  status: InputStatus;
}

export const DATA_INPUTS: readonly DataInput[] = [
  { id: 'nepsg', name: 'NEPS-G', role: 'Operational ensemble forecast: 23 members, 10 days, runs at 00 and 12 UTC', resolution: '12 km', status: 'received' },
  { id: 'era5', name: 'ERA5', role: '30-year climatology baseline for the Extreme Forecast Index', resolution: '0.25°', status: 'cached' },
  { id: 'imdaa', name: 'IMDAA', role: 'Regional reanalysis for training the threat tracker', resolution: '12 km', status: 'training' },
  { id: 'ncum', name: 'NCUM-G / NCUM-R pairs', role: 'Matched coarse and fine forecasts for training the downscaler', resolution: '12 km / 4 km', status: 'training' },
  { id: 'imerg', name: 'IMERG', role: 'Satellite rainfall for calibration and verification', resolution: '0.1°', status: 'verification' },
  { id: 'chirps', name: 'CHIRPS', role: 'Gauge-blended rainfall for verification over land', resolution: '0.05°', status: 'verification' },
  { id: 'ibtracs', name: 'IBTrACS', role: 'Best-track cyclone positions for track labels and track error', resolution: 'Track points', status: 'verification' },
  { id: 'srtm', name: 'SRTM', role: 'Terrain height for the downscaler and physics checks', resolution: '30 m', status: 'cached' },
];

export interface ModelEntry {
  id: 'tracker' | 'calibration' | 'downscaler';
  name: string;
  version: string;
  method: string;
  hash: string;
  trainingNote: string;
  illustrative: true;
}

function shortHash(text: string): string {
  return hashString(text).toString(16).padStart(8, '0').slice(0, 7);
}

export const MODEL_REGISTRY: readonly ModelEntry[] = [
  {
    id: 'tracker',
    name: 'Threat tracker',
    version: 'v0.4',
    method: 'Graph neural network on an icosahedral mesh',
    hash: shortHash('tracker-v0.4'),
    trainingNote: 'Trained on IMDAA and NEPS-G hindcasts, with IBTrACS track labels',
    illustrative: true,
  },
  {
    id: 'calibration',
    name: 'Calibration',
    version: 'v0.2',
    method: 'EMOS per lead time, with blending and hysteresis',
    hash: shortHash('calibration-v0.2'),
    trainingNote: 'Fitted on past NEPS-G runs against IMERG and gauge observations',
    illustrative: true,
  },
  {
    id: 'downscaler',
    name: '5 km downscaler',
    version: 'v0.3',
    method: 'Residual diffusion with physics constraints',
    hash: shortHash('downscaler-v0.3'),
    trainingNote: 'Trained on NCUM-G / NCUM-R pairs with SRTM terrain',
    illustrative: true,
  },
];

export interface ProvenanceRecord {
  alertId: string;
  run: string;
  membersUsed: number;
  membersTotal: number;
  models: readonly ModelEntry[];
  gateChecks: GateCheck[];
  gatePassed: boolean;
  illustrative: true;
}

/** Which run, members, model versions and checks produced an alert. */
export function provenanceFor(scenarioId: ScenarioId, alert: Alert): ProvenanceRecord {
  const gate = downscale(scenarioId, alert.boxId, 'diffusion').gate;
  return {
    alertId: alert.id,
    run: SCENARIOS[scenarioId].run.label,
    membersUsed: ENSEMBLE_SIZE,
    membersTotal: ENSEMBLE_SIZE,
    models: MODEL_REGISTRY,
    gateChecks: gate.checks,
    gatePassed: gate.passed,
    illustrative: true,
  };
}
