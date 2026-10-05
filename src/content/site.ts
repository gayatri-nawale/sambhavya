/**
 * Site copy. Real-world facts are limited to those in docs/PROTOTYPE_SPEC.md
 * Part 1; everything else is product description or marked illustrative.
 */

export const FOOTER_TEXT =
  'SAMBHAVYA tracks extreme weather in India’s 23-member NEPS-G ensemble and sharpens each threat to 5 km, up to ten days ahead. This prototype runs replays shaped after real events; all values are illustrative.';

export const HERO = {
  headline: 'See the storm before it arrives.',
  subline:
    'SAMBHAVYA tracks extreme weather across India’s 23-member ensemble and sharpens each threat to 5 km, up to ten days ahead.',
  primaryCta: 'Watch a forecast run',
  secondaryCta: 'Open the console',
  chartCaption: 'Cyclone replay shaped after Amphan, May 2020: 23 member tracks, 3 scenario paths and the probability cone.',
} as const;

export interface GapRow {
  id: string;
  label: string;
  detail: string;
  fromH: number;
  toH: number;
  tone: 'muted' | 'bay' | 'teal';
}

/** Lead-time coverage. NEPS-R and NEPS-G ranges are the real facts from Part 1. */
export const GAP = {
  title: 'The gap we fill',
  intro:
    'India’s high-resolution ensemble stops at about three days. The 23-member global ensemble reaches ten days, but at 12 km. SAMBHAVYA turns that global ensemble into calibrated 5 km guidance for Days 4 to 10.',
  rows: [
    { id: 'nepsr', label: 'NEPS-R', detail: '4 km regional ensemble, to 75 h', fromH: 0, toH: 75, tone: 'muted' },
    { id: 'nepsg', label: 'NEPS-G', detail: '12 km global ensemble, 23 members, 10 days, runs at 00 and 12 UTC', fromH: 0, toH: 240, tone: 'bay' },
    { id: 'sambhavya', label: 'SAMBHAVYA', detail: '5 km calibrated probabilities, Days 4 to 10', fromH: 72, toH: 240, tone: 'teal' },
  ] satisfies GapRow[],
} as const;

export interface RunStep {
  n: number;
  title: string;
  text: string;
}

export const RUN_STEPS: readonly RunStep[] = [
  { n: 1, title: 'Scan', text: 'Read all 23 NEPS-G members and compute extreme-forecast anomalies against a 30-year ERA5 baseline.' },
  { n: 2, title: 'Track', text: 'A graph network on an icosahedral mesh finds each threat and follows it through every member.' },
  { n: 3, title: 'Calibrate', text: 'Raw members agree more than they should. Calibration fixes that, so a 60% alert comes true about 6 times in 10.' },
  { n: 4, title: 'Sharpen', text: 'A diffusion model sharpens each threat zone from 12 km to 5 km and keeps the peak.' },
  { n: 5, title: 'Check', text: 'Peaks, water balance and agreement with 12 km are checked. If any check fails, the calibrated 12 km forecast is used.' },
  { n: 6, title: 'Review & alert', text: 'A forecaster reviews and approves every alert before the public is warned. Alerts use the CAP 1.2 format.' },
];

export type AudienceId = 'forecasters' | 'response' | 'farming' | 'people';

export interface Audience {
  id: AudienceId;
  title: string;
  text: string;
}

export const AUDIENCES: readonly Audience[] = [
  { id: 'forecasters', title: 'Forecasters', text: 'Tracked threats and calibrated probabilities to review, not raw model output.' },
  { id: 'response', title: 'Disaster response', text: '5 km zones, timing windows and lead time to decide where to act first.' },
  { id: 'farming', title: 'Farming communities', text: 'Crop-relevant advice days before heavy rain or heat reaches the fields.' },
  { id: 'people', title: 'People in at-risk zones', text: 'Short, clear messages in English and Hindi for their own area.' },
];

export const HONEST = {
  title: 'Honest by design',
  points: [
    {
      title: 'Replay data',
      text: 'Everything you see is a replay shaped after real events, with illustrative values. No measured skill is claimed.',
    },
    {
      title: 'Quality gate',
      text: '5 km detail is published only when it passes three physics checks. Otherwise the calibrated 12 km forecast stands.',
    },
    {
      title: 'Human approval',
      text: 'A forecaster approves every alert before any public warning. The system never alerts on its own.',
    },
  ],
} as const;

export type ConsolePageId = 'run' | 'tracker' | 'sharpen' | 'calibration' | 'alerts' | 'verify' | 'sources';

export interface ConsolePage {
  id: ConsolePageId;
  path: string;
  name: string;
  /** Short purpose line, shown under the page title. */
  summary: string;
}

/** Console pages, in rail order (docs/PROTOTYPE_SPEC.md Part 4). */
export const CONSOLE_PAGES: readonly ConsolePage[] = [
  { id: 'run', path: '/console/run', name: 'Forecast run', summary: 'A full NEPS-G run processed end to end, from 23 members to alerts ready for review.' },
  { id: 'tracker', path: '/console/tracker', name: 'Threat tracker', summary: 'Each threat followed in every member, with scenario paths and a probability cone.' },
  { id: 'sharpen', path: '/console/sharpen', name: '5 km downscaling', summary: 'The 12 km input beside the 5 km output, with the peak kept and the quality gate checked.' },
  { id: 'calibration', path: '/console/calibration', name: 'Calibration', summary: 'How far to trust the probabilities: raw against calibrated, by lead time.' },
  { id: 'alerts', path: '/console/alerts', name: 'Risk & review', summary: 'Alerts waiting for a forecaster’s decision, with the 5 km zones they cover.' },
  { id: 'verify', path: '/console/verify', name: 'Verification', summary: 'Past replay alerts scored against what happened.' },
  { id: 'sources', path: '/console/sources', name: 'Data & provenance', summary: 'Inputs, model versions and the checks behind each alert.' },
];
