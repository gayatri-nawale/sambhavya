import { useEffect, useMemo } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { usePageTitle } from '../../app/hooks';
import { CONSOLE_PAGES } from '../../content/site';
import { ENSEMBLE_SIZE, LEAD_TIMES, REGIONS, SCENARIOS, clockAt, getPipelinePlan, snapshot, type RunSpeed, type StepId } from '../../sim';
import { useRunClock, useSimStore } from '../../store';
import { Button, LogStream, MetricTile, Panel, StatusChip, StepTimeline, ToggleGroup, type LogEntry, type Status } from '../../components/ui';
import {
  CalibrateView,
  DecodeView,
  EfiView,
  GateView,
  ReadyView,
  ReceiveView,
  RiskView,
  ScreenView,
  SharpenView,
  TrackView,
  type LiveViewProps,
} from '../../components/run/LiveViews';

const VIEWS: Record<StepId, (props: LiveViewProps) => React.ReactNode> = {
  receive: ReceiveView,
  decode: DecodeView,
  efi: EfiView,
  screen: ScreenView,
  track: TrackView,
  calibrate: CalibrateView,
  sharpen: SharpenView,
  gate: GateView,
  risk: RiskView,
  ready: ReadyView,
};

const SPEEDS: Array<{ value: RunSpeed; label: string }> = [
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
];

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function IdleView({ scenarioId }: { scenarioId: LiveViewProps['scenarioId'] }) {
  const scenario = SCENARIOS[scenarioId];
  return (
    <div className="p-4 sm:p-6">
      <p className="font-head text-h3 font-semibold">{scenario.run.label} is ready to process</p>
      <p className="mt-2 max-w-[60ch] text-body">
        Run the forecast to watch every step: data arriving, threats found and tracked, probabilities calibrated, detail sharpened to 5 km and
        checked, and alerts prepared for review.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricTile label="Members" value={ENSEMBLE_SIZE} />
        <MetricTile label="Grid" value="12" unit="km" />
        <MetricTile label="Lead times" value={LEAD_TIMES.length} note="0 to 240 h" />
        <MetricTile label="Region" value={<span className="text-lead">{REGIONS[scenario.regionId].name}</span>} />
      </div>
    </div>
  );
}

export default function ForecastRun() {
  const page = CONSOLE_PAGES.find((p) => p.id === 'run');
  usePageTitle(page?.name ?? 'Forecast run');
  useRunClock();

  const scenarioId = useSimStore((s) => s.scenarioId);
  const run = useSimStore((s) => s.run);
  const startRun = useSimStore((s) => s.startRun);
  const pauseRun = useSimStore((s) => s.pauseRun);
  const resumeRun = useSimStore((s) => s.resumeRun);
  const resetRun = useSimStore((s) => s.resetRun);
  const setRunSpeed = useSimStore((s) => s.setRunSpeed);
  const seekRun = useSimStore((s) => s.seekRun);

  // Dev only: /console/run?at=20 opens the run paused at 20 s (for checking each live view).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const at = new URLSearchParams(window.location.search).get('at');
    if (at !== null && Number.isFinite(Number(at))) seekRun(Number(at) * 1000);
  }, [seekRun]);

  const plan = getPipelinePlan(scenarioId);
  const snap = snapshot(plan, run);
  const idle = run.status === 'idle';
  const done = run.status === 'done';

  // While done, keep showing the last step; while idle, the intro.
  const active = done ? plan.steps.length - 1 : snap.stepIndex;
  const activeStep = plan.steps[active];
  const p = done ? 1 : (snap.steps[active]?.progress ?? 0);
  const View = activeStep ? VIEWS[activeStep.id] : null;

  // Only add entries when the visible log grows, so the list is stable between frames.
  const logCount = snap.logs.length;
  const lines = useMemo<LogEntry[]>(
    () => plan.logs.slice(0, logCount).map((l, i) => ({ key: `${i}`, time: clockAt(plan, l.atMs), text: l.text })),
    [plan, logCount],
  );

  const statusChip: Status = idle ? 'idle' : run.status === 'running' ? 'running' : run.status === 'paused' ? 'paused' : 'done';

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-h3 sm:text-h2">Forecast run</h1>
        <p className="mt-2 max-w-[70ch] text-body">{page?.summary}</p>
      </div>

      {/* Controls */}
      <Panel>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button onClick={startRun} disabled={run.status === 'running' || run.status === 'paused'} icon={<Play size={16} aria-hidden="true" />}>
            {done ? 'Run again' : 'Run forecast'}
          </Button>
          {run.status === 'paused' ? (
            <Button variant="secondary" onClick={resumeRun} icon={<Play size={16} aria-hidden="true" />}>
              Resume
            </Button>
          ) : (
            <Button variant="secondary" onClick={pauseRun} disabled={run.status !== 'running'} icon={<Pause size={16} aria-hidden="true" />}>
              Pause
            </Button>
          )}
          <Button variant="ghost" onClick={resetRun} disabled={idle} icon={<RotateCcw size={16} aria-hidden="true" />}>
            Reset
          </Button>
          <ToggleGroup label="Speed" showLabel options={SPEEDS} value={run.speed} onChange={setRunSpeed} />
          <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-2">
            <StatusChip status={statusChip} />
            <p className="text-small tabular-nums">
              Elapsed <span className="font-head text-lead font-semibold">{formatElapsed(run.elapsedMs)}</span>
            </p>
            <p className="text-small tabular-nums">
              GPU-min <span className="font-head text-lead font-semibold">{snap.gpuMinutes.toFixed(1)}</span> (sim)
            </p>
          </div>
        </div>
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-mist"
          role="progressbar"
          aria-label="Run progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(snap.progress * 100)}
        >
          <div className="h-full bg-teal" style={{ width: `${snap.progress * 100}%` }} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel title="Pipeline" description={`${plan.steps.length} steps · about ${Math.round(plan.totalMs / 1000)} s at 1×`} className="lg:col-span-4">
          <StepTimeline
            label="Pipeline steps"
            steps={snap.steps.map((s) => ({ id: s.id, label: s.label, status: s.status, progress: s.status === 'running' ? s.progress : undefined }))}
          />
        </Panel>
        <Panel
          title={idle ? 'Live view' : `Live view · ${activeStep?.label ?? ''}`}
          description={idle ? 'Shows what each step is doing as it runs' : `Step ${active + 1} of ${plan.steps.length}`}
          replay
          bleed
          className="lg:col-span-8"
        >
          <div aria-live="off">{idle || !View ? <IdleView scenarioId={scenarioId} /> : <View scenarioId={scenarioId} plan={plan} elapsedMs={run.elapsedMs} p={p} />}</div>
        </Panel>
      </div>

      <Panel title="Log" description={`Times are simulated processing time (UTC) for ${SCENARIOS[scenarioId].run.label}`} bleed>
        <LogStream label="Forecast run log" lines={lines} emptyText="No log lines yet. Press Run forecast." className="h-56" />
      </Panel>
    </div>
  );
}
