/** Map colours, all taken from the spec tokens (docs/PROTOTYPE_SPEC.md Part 2). */
export const MAP_COLORS = {
  ink: '#14213D',
  bay: '#0F4C75',
  mist: '#EEF2F6',
  paper: '#FFFFFF',
  teal: '#1F8A84',
  line: '#C9D3DE',
} as const;

/** Sea is a light wash of --bay so tracks and labels stay readable on top of it. */
export const SEA_ALPHA = 0.14;

/** Scenario paths, most likely first. Uses the three non-risk interface colours. */
export const PATH_COLORS: readonly string[] = [MAP_COLORS.teal, MAP_COLORS.bay, MAP_COLORS.ink];

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
