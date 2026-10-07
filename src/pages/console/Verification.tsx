import { usePageTitle } from '../../app/hooks';
import { CONSOLE_PAGES } from '../../content/site';
import { OUTCOME_LABELS, SCENARIOS, getLedger, getMetrics, type Outcome } from '../../sim';
import { useSimStore } from '../../store';
import { MetricTile, Panel, RiskBadge, StatusChip, type Status } from '../../components/ui';

/** Outcome chips use interface colours; risk colours stay reserved for risk levels. */
const OUTCOME_STATUS: Record<Outcome, Status> = { hit: 'pass', miss: 'fail', falseAlarm: 'held' };

export default function Verification() {
  const page = CONSOLE_PAGES.find((p) => p.id === 'verify');
  usePageTitle(page?.name ?? 'Verification');
  const scenarioId = useSimStore((s) => s.scenarioId);

  const ledger = getLedger();
  const m = getMetrics();
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-h3 sm:text-h2">Verification</h1>
        <p className="mt-2 max-w-[70ch] text-body">{page?.summary}</p>
      </div>

      <Panel>
        <p className="font-head text-lead font-semibold sm:text-h3">Scores feed back into calibration.</p>
        <p className="mt-1 max-w-[70ch] text-small">
          Every issued alert is checked against what was observed. The results retune calibration and the alert thresholds for the next runs. All scores on
          this page are illustrative.
        </p>
      </Panel>

      {/* Metric tiles */}
      <Panel title="Scores (illustrative)" description="SAMBHAVYA compared with TempestExtremes and the raw ensemble mean" replay>
        <h3 className="text-small font-semibold">Cyclone track error (km), lower is better</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {m.trackErrorKm.map((t) => (
            <MetricTile
              key={t.leadH}
              label={`At ${t.leadH} h · SAMBHAVYA`}
              value={t.sambhavya}
              unit="km"
              tone="teal"
              note={`TempestExtremes ${t.tempestExtremes} km · raw ensemble mean ${t.rawMean} km`}
            />
          ))}
        </div>
        <h3 className="mt-6 text-small font-semibold">Alert skill across the replay ledger</h3>
        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile label="CSI, higher is better" value={m.csi.sambhavya.toFixed(2)} tone="teal" note={`Raw ensemble ${m.csi.rawEnsemble.toFixed(2)}`} />
          <MetricTile label="False alarm ratio, lower is better" value={m.far.sambhavya.toFixed(2)} tone="teal" note={`Raw ensemble ${m.far.rawEnsemble.toFixed(2)}`} />
          <MetricTile label="Brier score, lower is better" value={m.brier.sambhavya.toFixed(3)} tone="teal" note={`Raw ensemble ${m.brier.rawEnsemble.toFixed(3)}`} />
          <MetricTile
            label="Alert flips per event"
            value={m.flipsPerEvent.blended.toFixed(1)}
            tone="teal"
            note={`Blended runs; single run ${m.flipsPerEvent.singleRun.toFixed(1)}`}
          />
        </div>
        <p className="mt-4 text-small tabular-nums">
          From {ledger.length} replay alerts: {m.counts.hits} hits, {m.counts.misses} misses, {m.counts.falseAlarms} false alarms ({pct(m.counts.hits / ledger.length)} hits).
          Values are illustrative; no measured skill is claimed.
        </p>
      </Panel>

      {/* Ledger */}
      <Panel title="Alert ledger" description="Past replay alerts and what was observed. Rows for the current scenario are highlighted." replay bleed>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-small">
            <thead>
              <tr className="border-b border-line text-left">
                {['Replay', 'Area', 'Run', 'Issued level', 'Lead time', 'Threshold', 'Observed', 'Result'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledger.map((r) => (
                <tr key={r.id} className={`border-b border-line ${r.scenarioId === scenarioId ? 'bg-mist' : ''}`}>
                  <td className="px-4 py-2">{SCENARIOS[r.scenarioId].name}</td>
                  <td className="px-4 py-2">{r.area}</td>
                  <td className="px-4 py-2 tabular-nums">{r.issuedRun}</td>
                  <td className="px-4 py-2">{r.issuedLevel ? <RiskBadge level={r.issuedLevel} size="sm" /> : 'Not issued'}</td>
                  <td className="px-4 py-2 tabular-nums">T+{r.leadH} h</td>
                  <td className="px-4 py-2 tabular-nums">{r.thresholdLabel.replace(/^P\(|\)$/g, '')}</td>
                  <td className="px-4 py-2 tabular-nums">{r.observed}</td>
                  <td className="px-4 py-2">
                    <StatusChip status={OUTCOME_STATUS[r.outcome]} label={OUTCOME_LABELS[r.outcome]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
