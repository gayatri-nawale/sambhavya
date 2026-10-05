import { useEffect, useId } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Activity, ClipboardCheck, Database, Gauge, Grid3x3, PlayCircle, Radar, ShieldAlert, type LucideIcon } from 'lucide-react';
import { SCENARIOS, SCENARIO_IDS, formatUtc, stableWarnings, type ScenarioId } from '../../sim';
import { useSimStore } from '../../store';
import { CONSOLE_PAGES, type ConsolePageId } from '../../content/site';
import { useStartTour } from '../../app/hooks';
import { Button } from '../ui/Button';
import { ReplayChip } from '../ui/ReplayChip';
import { Wordmark } from './Wordmark';

const ICONS: Record<ConsolePageId, LucideIcon> = {
  run: Activity,
  tracker: Radar,
  sharpen: Grid3x3,
  calibration: Gauge,
  alerts: ShieldAlert,
  verify: ClipboardCheck,
  sources: Database,
};

const selectClass =
  'h-9 rounded-chip border border-line bg-paper px-2 text-small text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal';

function ScenarioSwitcher() {
  const id = useId();
  const scenarioId = useSimStore((s) => s.scenarioId);
  const setScenario = useSimStore((s) => s.setScenario);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only sm:not-sr-only text-small">
        Scenario
      </label>
      <select id={id} className={selectClass} value={scenarioId} onChange={(e) => setScenario(e.target.value as ScenarioId)}>
        {SCENARIO_IDS.map((s) => (
          <option key={s} value={s}>
            {SCENARIOS[s].name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Run selector. Only the scenario's own run is replayed; earlier runs are
 * listed for context and disabled, so nothing pretends to have data it lacks.
 */
function RunSelector() {
  const id = useId();
  const scenarioId = useSimStore((s) => s.scenarioId);
  const scenario = SCENARIOS[scenarioId];
  const earlier = stableWarnings(scenarioId)
    .runs.filter((r) => r.runOffsetH < 0)
    .slice(-2)
    .reverse();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only sm:not-sr-only text-small">
        Run
      </label>
      <select id={id} className={`${selectClass} max-w-[260px]`} value="current" onChange={() => undefined}>
        <option value="current">{scenario.run.label}</option>
        {earlier.map((r) => (
          <option key={r.runOffsetH} value={r.runOffsetH} disabled>
            NEPS-G run {formatUtc(new Date(Date.parse(scenario.run.initTime) + r.runOffsetH * 3600_000))} (not in this replay)
          </option>
        ))}
      </select>
    </div>
  );
}

function railLink({ isActive }: { isActive: boolean }): string {
  return `flex items-center gap-3 rounded-chip px-3 py-2 text-body ${
    isActive ? 'bg-paper/10 font-semibold text-paper shadow-[inset_3px_0_0_var(--teal)]' : 'text-paper/80 hover:bg-paper/5 hover:text-paper'
  }`;
}

function barLink({ isActive }: { isActive: boolean }): string {
  return `grid h-14 flex-1 place-items-center ${isActive ? 'text-paper shadow-[inset_0_3px_0_var(--teal)]' : 'text-paper/70'}`;
}

export function ConsoleLayout() {
  const startTour = useStartTour();
  const setScenario = useSimStore((s) => s.setScenario);

  // Dev only: ?scenario=heatwave opens the console on that scenario (for screenshots).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const id = new URLSearchParams(window.location.search).get('scenario');
    if (id && (SCENARIO_IDS as readonly string[]).includes(id)) setScenario(id as ScenarioId);
  }, [setScenario]);
  return (
    <div className="min-h-screen bg-mist">
      <a href="#console-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-chip focus:bg-paper focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Left rail (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col bg-ink lg:flex" aria-label="Console">
        <div className="flex h-16 items-center px-4">
          <Wordmark tone="paper" />
        </div>
        <nav aria-label="Console pages" className="flex-1 px-3 py-2">
          <ul className="flex flex-col gap-1">
            {CONSOLE_PAGES.map((p) => {
              const Icon = ICONS[p.id];
              return (
                <li key={p.id}>
                  <NavLink to={p.path} className={railLink}>
                    <Icon size={18} aria-hidden="true" />
                    {p.name}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="px-4 pb-4 text-small text-paper/70">Replay mode. Values are illustrative.</p>
      </aside>

      <div className="lg:pl-[240px]">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-line bg-paper">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
            <div className="lg:hidden">
              <Wordmark />
            </div>
            <ScenarioSwitcher />
            <RunSelector />
            <ReplayChip />
            <Button size="sm" className="ml-auto" icon={<PlayCircle size={16} aria-hidden="true" />} onClick={startTour}>
              Play guided demo
            </Button>
          </div>
        </header>

        <main id="console-main" className="px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Bottom bar (mobile) */}
      <nav aria-label="Console pages" className="fixed inset-x-0 bottom-0 z-30 flex bg-ink lg:hidden">
        {CONSOLE_PAGES.map((p) => {
          const Icon = ICONS[p.id];
          return (
            <NavLink key={p.id} to={p.path} className={barLink} aria-label={p.name} title={p.name}>
              <Icon size={20} aria-hidden="true" />
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
