import { create } from 'zustand';
import {
  DEFAULT_SCENARIO,
  INITIAL_RUN,
  SCENARIOS,
  getAlerts,
  getPipelinePlan,
  runReducer,
  type Audience,
  type DownscaleMethod,
  type HazardType,
  type Language,
  type LeadDay,
  type RiskLevel,
  type RunEvent,
  type RunSpeed,
  type RunState,
  type ScenarioId,
} from '../sim';
import { TOUR_STAGES } from './tour';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type AlertStatus = 'pending' | 'approved' | 'held';

export interface AlertReview {
  status: AlertStatus;
  /** ISO time of approval. */
  approvedAt?: string;
  /** Forecaster edits; undefined means "as generated". */
  level?: RiskLevel;
  messageEn?: string;
  messageHi?: string;
}

export interface MapLayers {
  memberTracks: boolean;
  scenarios: boolean;
  cone: boolean;
  efi: boolean;
}

export interface Selection {
  threatBoxId: string;
  /** Highlighted scenario path (index into Ensemble.paths), or null for none. */
  pathIndex: number | null;
  alertId: string | null;
  member: number;
  sample: number;
  method: DownscaleMethod;
  showFailingGate: boolean;
  calibrationDay: LeadDay;
  layers: MapLayers;
  hazards: HazardType[];
  audience: Audience;
  language: Language;
}

export interface TourState {
  active: boolean;
  stage: number;
}

export interface SimState {
  scenarioId: ScenarioId;
  run: RunState;
  leadH: number;
  leadPlaying: boolean;
  selection: Selection;
  reviews: Record<string, AlertReview>;
  tour: TourState;

  setScenario: (id: ScenarioId) => void;

  startRun: () => void;
  pauseRun: () => void;
  resumeRun: () => void;
  resetRun: () => void;
  setRunSpeed: (speed: RunSpeed) => void;
  tick: (dtMs: number) => void;
  /** Jump to a point in the run and pause there (guided demo, screenshots). */
  seekRun: (elapsedMs: number) => void;

  setLeadH: (leadH: number) => void;
  setLeadPlaying: (playing: boolean) => void;

  select: (patch: Partial<Selection>) => void;
  toggleLayer: (layer: keyof MapLayers) => void;
  toggleHazard: (hazard: HazardType) => void;

  approveAlert: (id: string, at?: Date) => void;
  holdAlert: (id: string) => void;
  editAlert: (id: string, patch: Pick<AlertReview, 'level' | 'messageEn' | 'messageHi'>) => void;
  resetReviews: () => void;

  startTour: () => void;
  nextStage: () => void;
  prevStage: () => void;
  goToStage: (stage: number) => void;
  exitTour: () => void;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                             */
/* ------------------------------------------------------------------ */

function defaultSelection(id: ScenarioId, keep?: Selection): Selection {
  const scenario = SCENARIOS[id];
  return {
    threatBoxId: scenario.threatBoxes[0]?.id ?? '',
    pathIndex: null,
    alertId: null,
    member: 1,
    sample: 0,
    method: 'diffusion',
    showFailingGate: false,
    calibrationDay: 5,
    layers: keep?.layers ?? { memberTracks: true, scenarios: true, cone: true, efi: false },
    hazards: [...scenario.hazards],
    audience: keep?.audience ?? 'response',
    language: keep?.language ?? 'en',
  };
}

function initialReviews(): Record<string, AlertReview> {
  return {};
}

/* ------------------------------------------------------------------ */
/* Store                                                                */
/* ------------------------------------------------------------------ */

export const useSimStore = create<SimState>()((set, get) => {
  const dispatch = (event: RunEvent) => {
    const { run, scenarioId } = get();
    // Building the plan is cached per scenario; only the first call does work.
    const next = runReducer(run, event, getPipelinePlan(scenarioId).totalMs);
    if (next !== run) set({ run: next });
  };

  return {
    scenarioId: DEFAULT_SCENARIO,
    run: INITIAL_RUN,
    leadH: SCENARIOS[DEFAULT_SCENARIO].defaultLeadH,
    leadPlaying: false,
    selection: defaultSelection(DEFAULT_SCENARIO),
    reviews: initialReviews(),
    tour: { active: false, stage: 0 },

    setScenario: (id) =>
      set((s) =>
        s.scenarioId === id
          ? s
          : {
              scenarioId: id,
              run: { ...INITIAL_RUN, speed: s.run.speed },
              leadH: SCENARIOS[id].defaultLeadH,
              leadPlaying: false,
              selection: defaultSelection(id, s.selection),
            },
      ),

    startRun: () => dispatch({ type: 'start' }),
    pauseRun: () => dispatch({ type: 'pause' }),
    resumeRun: () => dispatch({ type: 'resume' }),
    resetRun: () => dispatch({ type: 'reset' }),
    setRunSpeed: (speed) => dispatch({ type: 'setSpeed', speed }),
    tick: (dtMs) => dispatch({ type: 'tick', dtMs }),
    seekRun: (elapsedMs) =>
      set((s) => {
        const total = getPipelinePlan(s.scenarioId).totalMs;
        const e = Math.max(0, Math.min(total, elapsedMs));
        return { run: { ...s.run, elapsedMs: e, status: e >= total ? 'done' : 'paused' } };
      }),

    setLeadH: (leadH) => set({ leadH: Math.max(0, Math.min(240, Math.round(leadH / 6) * 6)) }),
    setLeadPlaying: (leadPlaying) => set({ leadPlaying }),

    select: (patch) => set((s) => ({ selection: { ...s.selection, ...patch } })),
    toggleLayer: (layer) =>
      set((s) => ({ selection: { ...s.selection, layers: { ...s.selection.layers, [layer]: !s.selection.layers[layer] } } })),
    toggleHazard: (hazard) =>
      set((s) => {
        const has = s.selection.hazards.includes(hazard);
        return {
          selection: {
            ...s.selection,
            hazards: has ? s.selection.hazards.filter((h) => h !== hazard) : [...s.selection.hazards, hazard],
          },
        };
      }),

    approveAlert: (id, at = new Date()) =>
      set((s) => ({
        reviews: { ...s.reviews, [id]: { ...s.reviews[id], status: 'approved', approvedAt: at.toISOString() } },
      })),
    holdAlert: (id) =>
      set((s) => {
        const prev = s.reviews[id];
        const next: AlertReview = { ...prev, status: 'held' };
        delete next.approvedAt;
        return { reviews: { ...s.reviews, [id]: next } };
      }),
    editAlert: (id, patch) =>
      set((s) => ({ reviews: { ...s.reviews, [id]: { status: 'pending', ...s.reviews[id], ...patch } } })),
    resetReviews: () => set({ reviews: initialReviews() }),

    startTour: () => set({ tour: { active: true, stage: 0 } }),
    nextStage: () =>
      set((s) =>
        s.tour.stage >= TOUR_STAGES.length - 1
          ? { tour: { active: false, stage: 0 } }
          : { tour: { active: true, stage: s.tour.stage + 1 } },
      ),
    prevStage: () => set((s) => ({ tour: { ...s.tour, stage: Math.max(0, s.tour.stage - 1) } })),
    goToStage: (stage) => set({ tour: { active: true, stage: Math.max(0, Math.min(TOUR_STAGES.length - 1, stage)) } }),
    exitTour: () => set({ tour: { active: false, stage: 0 } }),
  };
});

/* ------------------------------------------------------------------ */
/* Selectors                                                            */
/* ------------------------------------------------------------------ */

export function useScenario() {
  return SCENARIOS[useSimStore((s) => s.scenarioId)];
}

/** Review state for an alert, defaulting to pending. */
export function reviewOf(reviews: Record<string, AlertReview>, id: string): AlertReview {
  return reviews[id] ?? { status: 'pending' };
}

/** Alerts for the current scenario still waiting for a decision. */
export function pendingAlertCount(scenarioId: ScenarioId, reviews: Record<string, AlertReview>): number {
  return getAlerts(scenarioId).filter((a) => reviewOf(reviews, a.id).status === 'pending').length;
}
