import { COLORS } from '../../styles/tokens';

/** Map colours: the spec tokens. */
export const MAP_COLORS = COLORS;

/** Sea is a light wash of --bay so tracks and labels stay readable on top of it. */
export const SEA_ALPHA = 0.14;

/** Scenario paths, most likely first. Uses the three non-risk interface colours. */
export const PATH_COLORS: readonly string[] = [MAP_COLORS.teal, MAP_COLORS.bay, MAP_COLORS.ink];

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
