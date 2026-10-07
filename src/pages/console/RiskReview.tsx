import { useEffect, useId, useMemo, useState } from 'react';
import { usePageTitle } from '../../app/hooks';
import { CONSOLE_PAGES } from '../../content/site';
import {
  CAP_FORMAT_LABEL,
  CLOCK_SCALE,
  PLACES,
  RISK_LABELS,
  SCENARIOS,
  bboxContains,
  buildCapXml,
  formatUtc,
  getAlerts,
  getBox,
  getPipelinePlan,
  getRisk,
  validTime,
  type Alert,
  type Audience,
  type Language,
  type RiskLevel,
  type ScenarioId,
} from '../../sim';
import { reviewOf, useSimStore, type AlertReview } from '../../store';
import { MAP_COLORS, MapCanvas, type MarkerItem, type ZoneItem } from '../../components/map';
import { Button, Legend, Panel, PhoneFrame, RiskBadge, StatusChip, ToggleGroup, type Status } from '../../components/ui';
import { RISK_COLORS } from '../../styles/tokens';

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const APP_START = performance.now();

/**
 * Replay clock for approvals: the end of the simulated processing run, plus the
 * real time since the app opened. Keeps approval times inside the replayed event.
 */
function replayNow(scenarioId: ScenarioId): Date {
  const plan = getPipelinePlan(scenarioId);
  return new Date(plan.processingStart.getTime() + plan.totalMs * CLOCK_SCALE + (performance.now() - APP_START));
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${formatUtc(d).replace(/, (\d\d) UTC$/, '')}, ${d.toISOString().slice(11, 16)} UTC`;
}

const STATUS: Record<AlertReview['status'], Status> = { pending: 'pending', approved: 'approved', held: 'held' };

const LEVEL_OPTIONS: Array<{ value: RiskLevel; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
];

/** The alert as the forecaster currently has it: generated values with any edits applied. */
function effective(alert: Alert, review: AlertReview) {
  return {
    level: review.level ?? alert.level,
    en: review.messageEn ?? alert.message.en,
    hi: review.messageHi ?? alert.message.hi,
    edited: review.level !== undefined || review.messageEn !== undefined || review.messageHi !== undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Edit form                                                            */
/* ------------------------------------------------------------------ */

function EditForm({ alert, review, onDone }: { alert: Alert; review: AlertReview; onDone: () => void }) {
  const editAlert = useSimStore((s) => s.editAlert);
  const eff = effective(alert, review);
  const [level, setLevel] = useState<RiskLevel>(eff.level);
  const [en, setEn] = useState(eff.en);
  const [hi, setHi] = useState(eff.hi);
  const enId = useId();
  const hiId = useId();
  const field = 'mt-1 w-full rounded-chip border border-line bg-paper px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-teal';
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        editAlert(alert.id, { level, messageEn: en.trim(), messageHi: hi.trim() });
        onDone();
      }}
    >
      <ToggleGroup label="Severity" showLabel options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
      <div>
        <label htmlFor={enId} className="text-small font-semibold">
          Message in English
        </label>
        <textarea id={enId} className={field} rows={3} value={en} onChange={(e) => setEn(e.target.value)} required />
      </div>
      <div>
        <label htmlFor={hiId} className="text-small font-semibold">
          Message in Hindi
        </label>
        <textarea id={hiId} lang="hi" className={field} rows={3} value={hi} onChange={(e) => setHi(e.target.value)} required />
      </div>
      <p className="text-small">Saving sends the alert back to the queue for approval.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Save changes</Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function RiskReview() {
  const page = CONSOLE_PAGES.find((p) => p.id === 'alerts');
  usePageTitle(page?.name ?? 'Risk & review');

  const scenarioId = useSimStore((s) => s.scenarioId);
  const sel = useSimStore((s) => s.selection);
  const select = useSimStore((s) => s.select);
  const reviews = useSimStore((s) => s.reviews);
  const approveAlert = useSimStore((s) => s.approveAlert);
  const holdAlert = useSimStore((s) => s.holdAlert);
  const [editing, setEditing] = useState(false);

  const scenario = SCENARIOS[scenarioId];
  const alerts = getAlerts(scenarioId);
  const alert = alerts.find((a) => a.id === sel.alertId) ?? alerts[0];

  // Dev only: ?review=approve approves the first alert; ?lang=hi shows the Hindi SMS (for screenshots).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const q = new URLSearchParams(window.location.search);
    const first = getAlerts(scenarioId)[0];
    if (q.get('review') === 'approve' && first) approveAlert(first.id, replayNow(scenarioId));
    if (q.get('lang') === 'hi') select({ language: 'hi' });
  }, [scenarioId, approveAlert, select]);

  // Leave edit mode when another alert or scenario is selected.
  useEffect(() => setEditing(false), [alert?.id]);

  const box = alert ? getBox(scenarioId, alert.boxId) : null;
  const risk = getRisk(scenarioId);
  const zones = useMemo<ZoneItem[]>(
    () => risk.zones.flatMap((z) => (z.level && (!box || z.boxId === box.id) ? [{ id: z.id, bbox: z.bbox, level: z.level }] : [])),
    [risk, box],
  );
  const markers = useMemo<MarkerItem[]>(() => {
    if (!box || !alert) return [];
    const out: MarkerItem[] = PLACES.filter((p) => p.country === 'IN' && bboxContains(box.bbox, p) && scenario.mapPlaces.includes(p.name)).map((p) => ({
      id: p.name,
      lat: p.lat,
      lon: p.lon,
      label: p.name,
      kind: 'place',
    }));
    out.push({ id: 'core', lat: alert.core.lat, lon: alert.core.lon, kind: 'core', label: `${alert.areaName} core` });
    return out;
  }, [box, alert, scenario]);

  const pending = alerts.filter((a) => reviewOf(reviews, a.id).status === 'pending').length;

  if (!alert || !box) {
    return <p className="text-body">No alerts in this run.</p>;
  }

  const review = reviewOf(reviews, alert.id);
  const eff = effective(alert, review);
  const capXml =
    review.status === 'approved' && review.approvedAt
      ? buildCapXml(alert, { sentAt: new Date(review.approvedAt), level: eff.level, description: eff.en })
      : null;
  const from = formatUtc(validTime(scenario, alert.leadH));
  const to = formatUtc(validTime(scenario, alert.validToH));

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-h3 sm:text-h2">Risk &amp; review</h1>
        <p className="mt-2 max-w-[70ch] text-body">{page?.summary} A forecaster approves every alert before any public warning.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Queue */}
        <Panel title={`Alert queue (${pending} waiting)`} description={scenario.run.label} replay className="xl:col-span-4" bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {alerts.map((a) => {
              const r = reviewOf(reviews, a.id);
              const e = effective(a, r);
              const on = a.id === alert.id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => select({ alertId: a.id })}
                    className={`block w-full px-4 py-3 text-left ${on ? 'bg-mist shadow-[inset_3px_0_0_var(--ink)]' : 'hover:bg-mist/60'}`}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <RiskBadge level={e.level} />
                        <span className="font-semibold">{a.hazardLabel}</span>
                      </span>
                      <StatusChip status={STATUS[r.status]} />
                    </span>
                    <span className="mt-1 block text-body">{a.areaName}</span>
                    <span className="block text-small tabular-nums">
                      T+{a.leadH} h · {a.thresholdLabel} {a.probability.toFixed(2)}
                      {e.edited ? ' · edited' : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-4 xl:col-span-8">
          {/* Map */}
          <Panel title={`5 km risk zones · ${box.label}`} description="The selected alert's area is outlined" replay bleed>
            <MapCanvas
              bbox={box.bbox}
              label={`${box.label}: 5 km risk zones, ${alert.areaName} outlined`}
              zones={zones}
              zoneOpacity={0.75}
              outline={alert.polygon}
              markers={markers}
              legend={
                <Legend
                  items={[
                    { label: 'Low', color: RISK_COLORS.low, symbol: 'swatch' },
                    { label: 'Moderate', color: RISK_COLORS.moderate, symbol: 'swatch' },
                    { label: 'Severe', color: RISK_COLORS.severe, symbol: 'swatch' },
                    { label: 'Selected alert area', color: MAP_COLORS.ink, symbol: 'box' },
                  ]}
                />
              }
              className="h-[340px] sm:h-[400px]"
            />
          </Panel>

          {/* Detail */}
          <Panel
            title="Alert detail"
            replay
            actions={
              <ToggleGroup<Audience>
                label="View for"
                showLabel
                options={[
                  { value: 'response', label: 'Disaster response' },
                  { value: 'agromet', label: 'Agromet advisory' },
                ]}
                value={sel.audience}
                onChange={(v) => select({ audience: v })}
              />
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <RiskBadge level={eff.level} />
              <h3 className="font-head text-lead font-semibold">
                {alert.hazardLabel} · {alert.areaName}
              </h3>
              <StatusChip status={STATUS[review.status]} />
            </div>
            {review.status === 'approved' && review.approvedAt && (
              <p className="mt-1 text-small tabular-nums">Approved {formatTime(review.approvedAt)} (replay time)</p>
            )}
            {eff.level !== alert.level && (
              <p className="mt-1 text-small">
                Severity changed by the forecaster from {RISK_LABELS[alert.level]} to {RISK_LABELS[eff.level]}.
              </p>
            )}

            {editing ? (
              <div className="mt-4 border-t border-line pt-4">
                <EditForm alert={alert} review={review} onDone={() => setEditing(false)} />
              </div>
            ) : (
              <>
                <dl className="mt-4 grid gap-x-6 gap-y-3 text-body sm:grid-cols-2">
                  <div>
                    <dt className="text-small">Probability (calibrated)</dt>
                    <dd className="tabular-nums">
                      {alert.thresholdLabel} <strong>{alert.probability.toFixed(2)}</strong>
                      <span className="block text-small">Raw member fraction {alert.rawProbability.toFixed(2)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-small">Lead time and window</dt>
                    <dd className="tabular-nums">
                      T+{alert.leadH} to T+{alert.validToH} h
                      <span className="block text-small">
                        {from} to {to}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-small">Member agreement</dt>
                    <dd className="tabular-nums">
                      {alert.agreement.count} of {alert.agreement.total} members exceed the threshold in the core zone
                    </dd>
                  </div>
                  <div>
                    <dt className="text-small">Scenario</dt>
                    <dd>{alert.scenarioPath}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-small">Drivers</dt>
                    <dd>{alert.drivers.join(' · ')}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-small">{sel.audience === 'response' ? 'For disaster response' : 'Agromet advisory'}</dt>
                    <dd>{sel.audience === 'response' ? alert.advice.response : alert.advice.agromet}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                  <Button onClick={() => approveAlert(alert.id, replayNow(scenarioId))} disabled={review.status === 'approved'}>
                    {review.status === 'approved' ? 'Approved' : 'Approve'}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => holdAlert(alert.id)} disabled={review.status === 'held'}>
                    Hold
                  </Button>
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* CAP preview */}
        <Panel
          title={CAP_FORMAT_LABEL}
          description={capXml ? 'Generated from the approved alert. Preview only; nothing is sent.' : 'Generated when the alert is approved.'}
          replay
          bleed
          className="xl:col-span-7"
        >
          {capXml ? (
            <pre className="max-h-[440px] overflow-auto bg-mist px-4 py-3 text-small leading-relaxed" tabIndex={0} aria-label="CAP 1.2 XML preview">
              <code>{capXml}</code>
            </pre>
          ) : (
            <p className="px-4 py-6 text-body">
              {review.status === 'held' ? 'This alert is on hold. Approve it to generate the CAP message.' : 'Approve the alert to generate its CAP 1.2 message.'}
            </p>
          )}
        </Panel>

        {/* Phone preview */}
        <Panel
          title="What people in the zone see"
          description="SMS preview in English or Hindi"
          replay
          actions={
            <ToggleGroup<Language>
              label="Language"
              options={[
                { value: 'en', label: 'English' },
                { value: 'hi', label: 'हिन्दी' },
              ]}
              value={sel.language}
              onChange={(v) => select({ language: v })}
            />
          }
          className="xl:col-span-5"
        >
          <div className="flex justify-center py-2">
            <PhoneFrame
              sender="Weather alert"
              time={review.approvedAt ? new Date(review.approvedAt).toISOString().slice(11, 16) : '06:00'}
              lang={sel.language}
              footer={review.status === 'approved' ? 'Preview only. Not sent.' : 'Preview. Shown to people only after approval.'}
            >
              {sel.language === 'hi' ? eff.hi : eff.en}
            </PhoneFrame>
          </div>
        </Panel>
      </div>
    </div>
  );
}
