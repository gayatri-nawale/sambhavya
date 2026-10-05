import { SCENARIOS, validTime } from './scenarios';
import type { Alert, RiskLevel } from './risk';

/**
 * Builds a CAP 1.2 XML document from an alert (the format used by NDMA SACHET).
 * The prototype only previews the XML; nothing is ever sent.
 */

export const CAP_FORMAT_LABEL = 'CAP 1.2 format (as used by NDMA SACHET)';
const CAP_NAMESPACE = 'urn:oasis:names:tc:emergency:cap:1.2';
const SENDER = 'sambhavya-replay@example.invalid';

export interface CapOptions {
  /** Approval time; becomes <sent>. */
  sentAt: Date;
  /** Optional overrides from the forecaster's edits. */
  level?: RiskLevel;
  headline?: string;
  description?: string;
  language?: 'en-IN' | 'hi-IN';
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** CAP date-time: YYYY-MM-DDThh:mm:ss+00:00 (no fractional seconds, explicit offset). */
export function capDateTime(d: Date): string {
  return `${d.toISOString().slice(0, 19)}+00:00`;
}

const SEVERITY: Record<RiskLevel, 'Extreme' | 'Severe' | 'Moderate' | 'Minor'> = {
  severe: 'Severe',
  moderate: 'Moderate',
  low: 'Minor',
};

function certainty(p: number): 'Likely' | 'Possible' | 'Unlikely' {
  if (p > 0.5) return 'Likely';
  if (p >= 0.2) return 'Possible';
  return 'Unlikely';
}

function urgency(hoursAhead: number): 'Immediate' | 'Expected' | 'Future' {
  if (hoursAhead <= 6) return 'Immediate';
  if (hoursAhead <= 72) return 'Expected';
  return 'Future';
}

/** CAP polygon: space-separated "lat,lon" pairs, first point repeated at the end. */
export function capPolygon(alert: Alert): string {
  const pts = alert.polygon.map((p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`);
  if (pts.length > 0 && pts[0] !== pts[pts.length - 1]) pts.push(pts[0] as string);
  return pts.join(' ');
}

export function capIdentifier(alert: Alert, sentAt: Date): string {
  const stamp = capDateTime(sentAt).replace(/[-:+]/g, '').slice(0, 15);
  return `SAMBHAVYA-${alert.scenarioId.toUpperCase()}-${alert.level.toUpperCase()}-${stamp}`;
}

export function buildCapXml(alert: Alert, options: CapOptions): string {
  const scenario = SCENARIOS[alert.scenarioId];
  const level = options.level ?? alert.level;
  const onset = validTime(scenario, alert.leadH);
  const expires = validTime(scenario, alert.validToH);
  const runTime = new Date(scenario.run.initTime);
  const hoursAhead = (onset.getTime() - runTime.getTime()) / 3600_000;
  const event = `${alert.hazardLabel}`;
  const headline = options.headline ?? `${SEVERITY[level]} ${alert.hazardLabel.toLowerCase()} warning for ${alert.areaName}`;
  const description = options.description ?? alert.message.en;
  const lang = options.language ?? 'en-IN';

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<alert xmlns="${CAP_NAMESPACE}">`,
    `  <identifier>${escapeXml(capIdentifier(alert, options.sentAt))}</identifier>`,
    `  <sender>${SENDER}</sender>`,
    `  <sent>${capDateTime(options.sentAt)}</sent>`,
    '  <status>Exercise</status>',
    '  <msgType>Alert</msgType>',
    '  <scope>Public</scope>',
    '  <note>Replay with illustrative values. Preview only; not sent.</note>',
    '  <info>',
    `    <language>${lang}</language>`,
    '    <category>Met</category>',
    `    <event>${escapeXml(event)}</event>`,
    `    <responseType>${level === 'severe' ? 'Shelter' : level === 'moderate' ? 'Prepare' : 'Monitor'}</responseType>`,
    `    <urgency>${urgency(hoursAhead)}</urgency>`,
    `    <severity>${SEVERITY[level]}</severity>`,
    `    <certainty>${certainty(alert.probability)}</certainty>`,
    `    <effective>${capDateTime(options.sentAt)}</effective>`,
    `    <onset>${capDateTime(onset)}</onset>`,
    `    <expires>${capDateTime(expires)}</expires>`,
    '    <senderName>SAMBHAVYA forecast desk (replay)</senderName>',
    `    <headline>${escapeXml(headline)}</headline>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <instruction>${escapeXml(alert.advice.response)}</instruction>`,
    '    <parameter>',
    '      <valueName>exceedanceProbability</valueName>',
    `      <value>${escapeXml(`${alert.thresholdLabel} ${alert.probability.toFixed(2)}`)}</value>`,
    '    </parameter>',
    '    <area>',
    `      <areaDesc>${escapeXml(alert.areaName)}</areaDesc>`,
    `      <polygon>${capPolygon(alert)}</polygon>`,
    '    </area>',
    '  </info>',
    '</alert>',
  ];
  return lines.join('\n');
}
