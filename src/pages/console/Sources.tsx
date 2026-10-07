import { usePageTitle } from '../../app/hooks';
import { CONSOLE_PAGES } from '../../content/site';
import {
  DATA_INPUTS,
  INPUT_STATUS_LABELS,
  MODEL_REGISTRY,
  SCENARIOS,
  formatUtc,
  getAlerts,
  provenanceFor,
  validTime,
  type InputStatus,
} from '../../sim';
import { reviewOf, useSimStore } from '../../store';
import { ButtonLink, Panel, RiskBadge, StatusChip, StepTimeline, ToggleGroup, type Status } from '../../components/ui';

const INPUT_STATUS: Record<InputStatus, Status> = { received: 'pass', cached: 'done', training: 'idle', verification: 'idle' };

export default function Sources() {
  const page = CONSOLE_PAGES.find((p) => p.id === 'sources');
  usePageTitle(page?.name ?? 'Data & provenance');

  const scenarioId = useSimStore((s) => s.scenarioId);
  const alertId = useSimStore((s) => s.selection.alertId);
  const select = useSimStore((s) => s.select);
  const reviews = useSimStore((s) => s.reviews);

  const scenario = SCENARIOS[scenarioId];
  const alerts = getAlerts(scenarioId);
  const alert = alerts.find((a) => a.id === alertId) ?? alerts[0];
  const prov = alert ? provenanceFor(scenarioId, alert) : null;
  const review = alert ? reviewOf(reviews, alert.id) : null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-h3 sm:text-h2">Data &amp; provenance</h1>
        <p className="mt-2 max-w-[70ch] text-body">{page?.summary}</p>
      </div>

      <Panel title="Inputs" description="Data sources, what each is used for, and their status in this replay" replay bleed>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-small">
            <thead>
              <tr className="border-b border-line text-left">
                {['Dataset', 'Role', 'Resolution', 'Status'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DATA_INPUTS.map((d) => (
                <tr key={d.id} className="border-b border-line">
                  <td className="px-4 py-2 font-semibold">{d.name}</td>
                  <td className="px-4 py-2">{d.role}</td>
                  <td className="px-4 py-2 tabular-nums">{d.resolution}</td>
                  <td className="px-4 py-2">
                    <StatusChip status={INPUT_STATUS[d.status]} label={INPUT_STATUS_LABELS[d.status]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Model registry" description="Versions in use for this run. Hashes and training notes are illustrative." replay bleed>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-small">
            <thead>
              <tr className="border-b border-line text-left">
                {['Model', 'Version', 'Hash', 'Method', 'Training data'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODEL_REGISTRY.map((mdl) => (
                <tr key={mdl.id} className="border-b border-line">
                  <td className="px-4 py-2 font-semibold">{mdl.name}</td>
                  <td className="px-4 py-2 tabular-nums">{mdl.version}</td>
                  <td className="px-4 py-2 tabular-nums">{mdl.hash}</td>
                  <td className="px-4 py-2">{mdl.method}</td>
                  <td className="px-4 py-2">{mdl.trainingNote} (illustrative)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {alert && prov && review && (
        <Panel
          title="Run provenance"
          description="Everything that produced the selected alert"
          replay
          actions={
            <ToggleGroup
              label="Alert"
              showLabel
              options={alerts.map((a) => ({ value: a.id, label: `${a.level === 'severe' ? 'Severe' : a.level === 'moderate' ? 'Moderate' : 'Low'} · ${a.areaName}` }))}
              value={alert.id}
              onChange={(v) => select({ alertId: v })}
            />
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge level={alert.level} />
            <span className="font-head text-lead font-semibold">
              {alert.hazardLabel} · {alert.areaName}
            </span>
            <span className="text-small tabular-nums">
              {alert.thresholdLabel} {alert.probability.toFixed(2)} · valid {formatUtc(validTime(scenario, alert.leadH))} to {formatUtc(validTime(scenario, alert.validToH))}
            </span>
          </div>

          <StepTimeline
            className="mt-5"
            label="Provenance of the selected alert"
            steps={[
              { id: 'run', label: `Input: ${prov.run}`, status: 'done', detail: `${prov.membersUsed} of ${prov.membersTotal} members used · 12 km · EFI against the 30-year ERA5 baseline` },
              ...prov.models.map((mdl) => ({
                id: mdl.id,
                label: `${mdl.name} ${mdl.version} (${mdl.hash})`,
                status: 'done' as const,
                detail:
                  mdl.id === 'tracker'
                    ? `Most likely scenario for this zone: ${alert.scenarioPath}`
                    : mdl.id === 'calibration'
                      ? `Raw member fraction ${alert.rawProbability.toFixed(2)} calibrated to ${alert.probability.toFixed(2)}`
                      : `Sharpened ${alert.zoneIds.length} zones of 5 km cells in this box`,
              })),
              {
                id: 'gate',
                label: `Quality gate: ${prov.gatePassed ? 'passed' : 'failed, 12 km used'}`,
                status: 'done',
                detail: prov.gateChecks.map((c) => `${c.label} ${c.pass ? 'pass' : 'fail'}`).join(' · '),
              },
              {
                id: 'review',
                label:
                  review.status === 'approved'
                    ? `Forecaster review: approved`
                    : review.status === 'held'
                      ? 'Forecaster review: on hold'
                      : 'Forecaster review: waiting',
                status: review.status === 'approved' ? 'done' : 'running',
                detail:
                  review.status === 'approved' && review.approvedAt
                    ? `Approved ${new Date(review.approvedAt).toISOString().slice(0, 16).replace('T', ', ')} UTC (replay time). CAP 1.2 preview generated; not sent.`
                    : 'No public alert until a forecaster approves it.',
              },
            ]}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ButtonLink to="/console/alerts" variant="secondary" size="sm" onClick={() => select({ alertId: alert.id })}>
              Open this alert in Risk &amp; review
            </ButtonLink>
            <StatusChip status={review.status === 'approved' ? 'approved' : review.status === 'held' ? 'held' : 'pending'} />
          </div>
        </Panel>
      )}
    </div>
  );
}
