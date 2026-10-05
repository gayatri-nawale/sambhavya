import {
  ENSEMBLE_SIZE,
  LEAD_DAYS,
  METHODS,
  SAMPLES_PER_MEMBER,
  STEPS,
  GATE_FAIL_MESSAGE,
  boxField12km,
  boxField5km,
  buildCapXml,
  clearAllCaches,
  compareMethods,
  downscale,
  fingerprint,
  getAlerts,
  getEnsemble,
  getLedger,
  getMetrics,
  getPipelinePlan,
  getRisk,
  isIndia,
  maxOf,
  meanOf,
  regionField,
  reliability,
  spreadError,
  spreadKm,
  stableWarnings,
  SCENARIOS,
  type ScenarioId,
} from './index';

/**
 * Unit-style sanity checks for the dev-only /_sim page. Not used by the product pages.
 */

export interface CheckResult {
  label: string;
  pass: boolean;
  detail: string;
}

const PEAK_RANGE: Record<string, [number, number]> = {
  rain: [80, 450],
  temperature: [44, 53],
  wetBulb: [29, 34],
};

/** A compact digest of everything the engine produces for a scenario. */
export function scenarioDigest(id: ScenarioId): string {
  const e = getEnsemble(id);
  const boxes = SCENARIOS[id].threatBoxes.map((b) => [boxField5km(id, b.id).values, boxField12km(id, b.id).values]);
  const plan = getPipelinePlan(id);
  return fingerprint({
    tracks: e.members.map((m) => m.points),
    paths: e.paths.map((p) => [p.members, p.calibratedProbability]),
    boxes,
    diffusion: SCENARIOS[id].threatBoxes.map((b) => downscale(id, b.id, 'diffusion').field.values),
    alerts: getAlerts(id).map((a) => [a.level, a.areaName, a.probability, a.polygon]),
    logs: plan.logs.map((l) => [l.atMs, l.text]),
    ledger: getLedger().map((r) => [r.observedValue, r.outcome]),
  });
}

export function runChecks(id: ScenarioId): CheckResult[] {
  const out: CheckResult[] = [];
  const check = (label: string, pass: boolean, detail: string) => out.push({ label, pass, detail });
  const scenario = SCENARIOS[id];

  // Determinism: regenerate from seeds and compare.
  const before = scenarioDigest(id);
  clearAllCaches();
  const after = scenarioDigest(id);
  check('Deterministic (regenerated from seeds)', before === after, `${before} vs ${after}`);

  // Ensemble
  const e = getEnsemble(id);
  check(`${ENSEMBLE_SIZE} members, member 1 is the control`, e.members.length === ENSEMBLE_SIZE && e.members[0]?.member === 1, `${e.members.length} members`);
  const spread = spreadKm(e);
  const early = spread.find((s) => s.leadH === 24)?.spreadKm ?? 0;
  const late = spread.filter((s) => s.leadH >= 96).reduce((m, s) => Math.max(m, s.spreadKm), 0);
  check('Spread grows with lead time', late > early * 4, `T+24 h ${early.toFixed(0)} km → max after T+96 h ${late.toFixed(0)} km`);
  const sumRaw = e.paths.reduce((s, p) => s + p.rawProbability, 0);
  const sumCal = e.paths.reduce((s, p) => s + p.calibratedProbability, 0);
  check('3 scenario paths, probabilities sum to 1', e.paths.length === 3 && Math.abs(sumRaw - 1) < 1e-9 && Math.abs(sumCal - 1) < 1e-9, e.paths.map((p) => `${p.label} ${(p.calibratedProbability * 100).toFixed(0)}%`).join(' · '));
  const agree = e.members.filter((m) => e.paths[m.clusterIndex]?.key === m.designedPath).length;
  check('Clustering recovers the designed paths (≥ 80%)', agree / e.members.length >= 0.8, `${agree} of ${e.members.length} members`);

  // Fields
  const rf = regionField(id, scenario.defaultLeadH);
  const peak = maxOf(rf.values);
  const [lo, hi] = PEAK_RANGE[scenario.fieldKind] ?? [0, Infinity];
  check('12 km region peak in a plausible range', peak >= lo && peak <= hi, `${peak.toFixed(1)} ${rf.units} (expected ${lo}–${hi})`);
  const anyNaN = [rf.values, ...scenario.threatBoxes.map((b) => boxField5km(id, b.id).values)].some((v) => v.some((x) => !Number.isFinite(x)));
  check('No NaN or infinite values in fields', !anyNaN, anyNaN ? 'found non-finite values' : 'all finite');
  const b0 = scenario.threatBoxes[0];
  if (b0) {
    const m5 = meanOf(boxField5km(id, b0.id).values);
    const m12 = meanOf(boxField12km(id, b0.id).values);
    check('12 km input conserves the 5 km area mean', Math.abs(m5 - m12) <= Math.abs(m5) * 0.005 + 1e-6, `${m5.toFixed(2)} vs ${m12.toFixed(2)}`);

    // Downscaling
    const cmp = compareMethods(id, b0.id);
    const pk = (m: (typeof METHODS)[number]) => cmp.results[m].peakKeptPct;
    check(
      'Diffusion keeps the peak; bilinear and U-Net lose it',
      pk('diffusion') >= 90 && pk('diffusion') - pk('bilinear') >= 10 && pk('diffusion') - pk('unet') >= 10,
      METHODS.map((m) => `${m} ${pk(m).toFixed(0)}%`).join(' · '),
    );
    const samplePeaks = Array.from({ length: SAMPLES_PER_MEMBER }, (_, s) => downscale(id, b0.id, 'diffusion', { sample: s }).peak);
    const distinct = new Set(samplePeaks.map((p) => p.toFixed(3))).size;
    check(`${SAMPLES_PER_MEMBER} diffusion samples differ slightly`, distinct > 1 && Math.max(...samplePeaks) / Math.min(...samplePeaks) < 1.25, samplePeaks.map((p) => p.toFixed(1)).join(', '));
    const gate = downscale(id, b0.id, 'diffusion').gate;
    check('Quality gate passes for the diffusion output', gate.passed, gate.checks.map((c) => `${c.label} ${c.pass ? 'pass' : 'fail'}`).join(' · '));
    const failing = downscale(id, b0.id, 'diffusion', { failing: true }).gate;
    check('Failing case falls back to calibrated 12 km', !failing.passed && failing.fallback === 'calibrated-12km' && failing.message === GATE_FAIL_MESSAGE, failing.message);
  }

  // Calibration
  const relOk = LEAD_DAYS.every((d) => {
    const r = reliability(id, d);
    return r.calibratedError < r.rawError && r.brierCalibrated < r.brierRaw;
  });
  check('Calibrated reliability beats raw at Day 3/5/7/10', relOk, LEAD_DAYS.map((d) => `D${d} ${reliability(id, d).rawError.toFixed(3)}→${reliability(id, d).calibratedError.toFixed(3)}`).join(' · '));
  const se = spreadError(id).points;
  const rawRatio = meanOf(se.map((p) => p.rawSpread / p.error));
  const calRatio = meanOf(se.map((p) => p.calibratedSpread / p.error));
  check('Spread matches error after calibration', rawRatio < 0.7 && Math.abs(calRatio - 1) < 0.1, `spread/error raw ${rawRatio.toFixed(2)}, calibrated ${calRatio.toFixed(2)}`);
  const sw = stableWarnings(id);
  check('Blending + hysteresis reduce alert flips', sw.flipsStable < sw.flipsSingle, `${sw.flipsSingle} flips single run → ${sw.flipsStable} blended`);

  // Risk and alerts
  const risk = getRisk(id);
  const alerts = getAlerts(id);
  check(
    '3 alerts: Severe, Moderate, Low',
    alerts.map((a) => a.level).join(',') === 'severe,moderate,low',
    alerts.map((a) => `${a.level} · ${a.areaName} · ${a.zoneIds.length} zones`).join(' | '),
  );
  const zonesById = new Map(risk.zones.map((z) => [z.id, z]));
  const allIndia = alerts.every((a) => a.zoneIds.every((zid) => {
    const z = zonesById.get(zid);
    return z !== undefined && isIndia(z.center.lat, z.center.lon);
  }));
  check('All alert zones are on Indian land', allIndia, `${risk.scored} zones scored`);

  // CAP
  const first = alerts[0];
  if (first) {
    const xml = buildCapXml(first, { sentAt: new Date(Date.UTC(2020, 4, 16, 7, 10)) });
    let wellFormed = true;
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      wellFormed = doc.getElementsByTagName('parsererror').length === 0;
    }
    const required = ['identifier', 'sender', 'sent', 'status', 'msgType', 'event', 'urgency', 'severity', 'certainty', 'polygon'];
    const missing = required.filter((t) => !xml.includes(`<${t}>`));
    check('CAP 1.2 XML is well-formed with required fields', wellFormed && missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : 'identifier, sent, status, msgType, info, area polygon');
  }

  // Pipeline
  const plan = getPipelinePlan(id);
  const sorted = plan.logs.every((l, k) => k === 0 || (plan.logs[k - 1]?.atMs ?? 0) <= l.atMs);
  check(
    '10-step pipeline, 40–60 s at 1×',
    plan.steps.length === STEPS.length && STEPS.length === 10 && plan.totalMs >= 40_000 && plan.totalMs <= 60_000 && sorted,
    `${(plan.totalMs / 1000).toFixed(1)} s · ${plan.logs.length} log lines`,
  );
  check('Run ends with alerts waiting for review', plan.alertsWaiting === alerts.length && plan.logs[plan.logs.length - 1]?.text.includes('alerts waiting for review') === true, plan.logs[plan.logs.length - 1]?.text ?? '');

  // Verification
  const metrics = getMetrics();
  const ledger = getLedger();
  const { hits, misses, falseAlarms } = metrics.counts;
  check('Ledger outcomes agree with CSI and FAR', Math.abs(metrics.csi.sambhavya - hits / (hits + misses + falseAlarms)) < 1e-9 && ledger.length === hits + misses + falseAlarms, `CSI ${metrics.csi.sambhavya.toFixed(2)} · FAR ${metrics.far.sambhavya.toFixed(2)} · ${ledger.length} rows`);

  // Honesty flag
  const flagged = [e, rf, risk, plan, metrics, ...alerts, ...ledger].every((d) => d.illustrative === true);
  check('Every dataset is marked illustrative', flagged, 'illustrative: true');

  return out;
}
