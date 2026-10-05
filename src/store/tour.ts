/** Guided demo stages (docs/PROTOTYPE_SPEC.md Part 5.11). Captions are verbatim from the spec. */

export interface TourStage {
  route: string;
  caption: string;
}

export const TOUR_STAGES: readonly TourStage[] = [
  { route: '/console/run', caption: 'A new NEPS-G run arrives: 23 members, 12 km, 10 days.' },
  { route: '/console/tracker', caption: 'The GNN finds the cyclone and follows it in every member.' },
  { route: '/console/calibration', caption: 'Raw probabilities are over-confident; we correct them first.' },
  { route: '/console/sharpen', caption: 'Diffusion sharpens the threat to 5 km and keeps the peak.' },
  { route: '/console/sharpen', caption: 'If a check fails, the calibrated 12 km forecast is used instead.' },
  { route: '/console/alerts', caption: 'A forecaster approves; a CAP alert is generated for the 5 km zone.' },
  { route: '/console/verify', caption: 'Afterwards, every alert is scored against what happened.' },
];
