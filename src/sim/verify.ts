import { createRng } from './rng';
import { SCENARIOS, type ScenarioId } from './scenarios';
import { RISK_LABELS, type RiskLevel } from './risk';
import { stableWarnings } from './calibration';

/**
 * Verification ledger of past replay alerts and illustrative skill metrics.
 * Outcomes are computed from the (illustrative) observed values, so CSI and FAR
 * are consistent with the ledger rows.
 */

export type Outcome = 'hit' | 'miss' | 'falseAlarm';

export const OUTCOME_LABELS: Record<Outcome, string> = { hit: 'Hit', miss: 'Miss', falseAlarm: 'False alarm' };

export interface LedgerRow {
  id: string;
  scenarioId: ScenarioId;
  area: string;
  issuedRun: string;
  /** Issued level, or null when no alert was issued (a miss if the event happened). */
  issuedLevel: RiskLevel | null;
  leadH: number;
  thresholdLabel: string;
  observed: string;
  observedValue: number;
  outcome: Outcome;
  illustrative: true;
}

interface RowTemplate {
  scenarioId: ScenarioId;
  area: string;
  run: string;
  level: RiskLevel | null;
  leadH: number;
  /** Which threshold the event is judged against (0 low, 1 moderate, 2 severe). */
  tier: 0 | 1 | 2;
  /** Mean ratio of observed value to threshold for this row (illustrative). */
  ratio: number;
}

// Rows for each scenario's own run match the alerts that run produces (src/sim/risk.ts);
// other rows come from neighbouring runs of the same replay.
const TEMPLATES: readonly RowTemplate[] = [
  { scenarioId: 'cyclone', area: 'Sagar Island coast', run: '16 May 2020, 00 UTC', level: 'severe', leadH: 96, tier: 2, ratio: 1.16 },
  { scenarioId: 'cyclone', area: 'Haldia coast', run: '16 May 2020, 00 UTC', level: 'moderate', leadH: 96, tier: 1, ratio: 1.22 },
  { scenarioId: 'cyclone', area: 'Kolkata area', run: '16 May 2020, 00 UTC', level: 'low', leadH: 96, tier: 0, ratio: 1.25 },
  { scenarioId: 'cyclone', area: 'Digha coast', run: '16 May 2020, 12 UTC', level: 'severe', leadH: 84, tier: 2, ratio: 1.08 },
  { scenarioId: 'cyclone', area: 'Balasore coast', run: '16 May 2020, 12 UTC', level: 'moderate', leadH: 84, tier: 1, ratio: 0.78 },
  { scenarioId: 'cyclone', area: 'Sundarbans area', run: '17 May 2020, 00 UTC', level: null, leadH: 72, tier: 1, ratio: 1.12 },
  { scenarioId: 'heatwave', area: 'Bikaner area', run: '24 May 2024, 00 UTC', level: 'severe', leadH: 108, tier: 2, ratio: 1.01 },
  { scenarioId: 'heatwave', area: 'Delhi area', run: '24 May 2024, 00 UTC', level: 'low', leadH: 132, tier: 0, ratio: 1.03 },
  { scenarioId: 'heatwave', area: 'Phalodi area', run: '24 May 2024, 12 UTC', level: 'severe', leadH: 108, tier: 2, ratio: 1.02 },
  { scenarioId: 'heatwave', area: 'Jaipur area', run: '25 May 2024, 00 UTC', level: 'moderate', leadH: 96, tier: 1, ratio: 0.985 },
  { scenarioId: 'heatwave', area: 'Churu area', run: '25 May 2024, 00 UTC', level: null, leadH: 96, tier: 1, ratio: 1.02 },
  { scenarioId: 'humidHeat', area: 'Srikakulam coast', run: '10 June 2024, 00 UTC', level: 'severe', leadH: 108, tier: 2, ratio: 1.01 },
  { scenarioId: 'humidHeat', area: 'Gopalpur coast', run: '10 June 2024, 00 UTC', level: 'moderate', leadH: 108, tier: 1, ratio: 1.02 },
  { scenarioId: 'humidHeat', area: 'Visakhapatnam coast', run: '10 June 2024, 00 UTC', level: 'low', leadH: 84, tier: 0, ratio: 1.02 },
  { scenarioId: 'humidHeat', area: 'Kakinada coast', run: '11 June 2024, 00 UTC', level: 'moderate', leadH: 72, tier: 1, ratio: 0.97 },
];

let ledgerCache: LedgerRow[] | undefined;

export function getLedger(): LedgerRow[] {
  if (ledgerCache) return ledgerCache;
  const rng = createRng('verification-ledger');
  ledgerCache = TEMPLATES.map((t, k) => {
    const scenario = SCENARIOS[t.scenarioId];
    const thr = scenario.thresholds.values[t.tier];
    const isRain = scenario.fieldKind === 'rain';
    const observedValue = isRain ? thr * (t.ratio + rng.normal(0, 0.02)) : thr * t.ratio + rng.normal(0, 0.05);
    const happened = observedValue >= thr;
    const outcome: Outcome = t.level ? (happened ? 'hit' : 'falseAlarm') : 'miss';
    const units = isRain ? 'mm in 24 h' : '°C';
    const what = isRain ? 'Observed rain' : scenario.fieldKind === 'temperature' ? 'Observed Tmax' : 'Observed wet-bulb';
    return {
      id: `ledger-${k + 1}`,
      scenarioId: t.scenarioId,
      area: t.area,
      issuedRun: t.run,
      issuedLevel: t.level,
      leadH: t.leadH,
      thresholdLabel: scenario.thresholds.label(thr),
      observed: `${what} ${observedValue.toFixed(isRain ? 0 : 1)} ${units}`,
      observedValue,
      outcome,
      illustrative: true,
    };
  });
  return ledgerCache;
}

export function levelLabel(level: RiskLevel | null): string {
  return level ? RISK_LABELS[level] : 'Not issued';
}

export interface TrackErrorRow {
  leadH: 48 | 72 | 120;
  sambhavya: number;
  tempestExtremes: number;
  rawMean: number;
}

export interface Metrics {
  trackErrorKm: TrackErrorRow[];
  csi: { sambhavya: number; rawEnsemble: number };
  far: { sambhavya: number; rawEnsemble: number };
  brier: { sambhavya: number; rawEnsemble: number };
  /** Alert-level changes per event across consecutive runs. */
  flipsPerEvent: { singleRun: number; blended: number };
  counts: { hits: number; misses: number; falseAlarms: number };
  illustrative: true;
}

let metricsCache: Metrics | undefined;

export function getMetrics(): Metrics {
  if (metricsCache) return metricsCache;
  const ledger = getLedger();
  const hits = ledger.filter((r) => r.outcome === 'hit').length;
  const misses = ledger.filter((r) => r.outcome === 'miss').length;
  const falseAlarms = ledger.filter((r) => r.outcome === 'falseAlarm').length;
  const csi = hits / Math.max(1, hits + misses + falseAlarms);
  const far = falseAlarms / Math.max(1, hits + falseAlarms);
  const ids: ScenarioId[] = ['cyclone', 'heatwave', 'humidHeat'];
  const flips = ids.map((id) => stableWarnings(id));
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  metricsCache = {
    trackErrorKm: [
      { leadH: 48, sambhavya: 78, tempestExtremes: 96, rawMean: 104 },
      { leadH: 72, sambhavya: 114, tempestExtremes: 141, rawMean: 152 },
      { leadH: 120, sambhavya: 206, tempestExtremes: 262, rawMean: 281 },
    ],
    csi: { sambhavya: csi, rawEnsemble: csi * 0.78 },
    far: { sambhavya: far, rawEnsemble: Math.min(0.9, far * 1.6 + 0.08) },
    brier: { sambhavya: 0.118, rawEnsemble: 0.152 },
    flipsPerEvent: { singleRun: avg(flips.map((f) => f.flipsSingle)), blended: avg(flips.map((f) => f.flipsStable)) },
    counts: { hits, misses, falseAlarms },
    illustrative: true,
  };
  return metricsCache;
}

export function clearVerifyCache(): void {
  ledgerCache = undefined;
  metricsCache = undefined;
}
