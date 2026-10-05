import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, LifeBuoy, MapPin, Radar, ShieldCheck, Sprout, UserCheck, type LucideIcon } from 'lucide-react';
import { ContourBackground } from '../components/layout/ContourBackground';
import { Button, ButtonLink } from '../components/ui/Button';
import { usePageTitle, useStartTour } from '../app/hooks';
import { AUDIENCES, GAP, HERO, HONEST, RUN_STEPS, type AudienceId, type GapRow } from '../content/site';

// The hero chart needs the simulation engine and world map; the page text renders first.
const HeroChart = lazy(() => import('../components/home/HeroChart').then((m) => ({ default: m.HeroChart })));

function HeroChartFallback() {
  return <div className="h-[452px] rounded-panel border border-line bg-paper sm:h-[552px]" aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* The gap we fill                                                      */
/* ------------------------------------------------------------------ */

const MAX_H = 240;
const BAR_TONE: Record<GapRow['tone'], string> = {
  muted: 'bg-line',
  bay: 'bg-bay',
  teal: 'bg-teal',
};

function GapChart() {
  const ticks = [0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 240];
  const pos = (h: number) => `${(h / MAX_H) * 100}%`;
  return (
    <div>
      {/* Axis */}
      <div className="grid gap-x-6 md:grid-cols-[220px_1fr]">
        <div className="hidden md:block" />
        <div className="relative mb-2 h-5 text-small tabular-nums" aria-hidden="true">
          {[0, 75, 240].map((h) => (
            <span key={h} className={`absolute whitespace-nowrap ${h === 0 ? '' : h === MAX_H ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: pos(h) }}>
              {h} h
            </span>
          ))}
        </div>
      </div>
      <ul className="flex flex-col gap-5">
        {GAP.rows.map((row) => (
          <li key={row.id} className="grid items-center gap-x-6 gap-y-1 md:grid-cols-[220px_1fr]">
            <div>
              <p className={`font-head text-lead font-semibold ${row.tone === 'teal' ? 'text-teal' : 'text-ink'}`}>{row.label}</p>
              <p className="text-small">{row.detail}</p>
            </div>
            <div className="relative h-7" aria-hidden="true">
              {ticks.map((h) => (
                <span key={h} className="absolute inset-y-0 w-px bg-line/70" style={{ left: pos(h) }} />
              ))}
              <span
                className={`absolute inset-y-1 rounded-chip ${BAR_TONE[row.tone]}`}
                style={{ left: pos(row.fromH), width: `${((row.toH - row.fromH) / MAX_H) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid gap-x-6 md:grid-cols-[220px_1fr]">
        <div className="hidden md:block" />
        <div className="relative h-5 text-small tabular-nums" aria-hidden="true">
          {ticks.map((h, k) => (
            <span key={h} className={`absolute ${k === 0 ? '' : k === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'} ${k % 2 === 1 ? 'hidden sm:inline' : ''}`} style={{ left: pos(h) }}>
              {k === 0 ? 'Day 0' : `D${h / 24}`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section helpers                                                      */
/* ------------------------------------------------------------------ */

function Divider() {
  // Contour-line section divider (the recurring motif).
  return (
    <svg viewBox="0 0 1200 24" preserveAspectRatio="none" className="block h-6 w-full" aria-hidden="true">
      {[6, 12, 18].map((y, i) => (
        <path
          key={y}
          d={`M0,${y} C200,${y - 5 + i} 400,${y + 6 - i} 600,${y} S1000,${y - 6 + i} 1200,${y}`}
          fill="none"
          stroke="var(--line)"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

const AUDIENCE_ICONS: Record<AudienceId, LucideIcon> = {
  forecasters: Radar,
  response: LifeBuoy,
  farming: Sprout,
  people: MapPin,
};

const HONEST_ICONS: LucideIcon[] = [CheckCircle2, ShieldCheck, UserCheck];

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function Home() {
  usePageTitle('');
  const startTour = useStartTour();

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-mist">
        <ContourBackground className="opacity-70" />
        <div className="relative mx-auto grid max-w-[1200px] gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <h1 className="text-[40px] leading-[1.05] sm:text-h1">{HERO.headline}</h1>
            <p className="mt-5 max-w-[46ch] text-lead">{HERO.subline}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={startTour}>{HERO.primaryCta}</Button>
              <ButtonLink to="/console" variant="secondary">
                {HERO.secondaryCta}
              </ButtonLink>
            </div>
          </div>
          <div className="lg:col-span-7">
            <Suspense fallback={<HeroChartFallback />}>
              <HeroChart />
            </Suspense>
          </div>
        </div>
      </section>

      {/* The gap we fill */}
      <section className="bg-paper">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-12">
            <h2 className="text-h3 sm:text-h2 lg:col-span-4">{GAP.title}</h2>
            <p className="max-w-[62ch] text-lead lg:col-span-8">{GAP.intro}</p>
          </div>
          <div className="mt-10">
            <GapChart />
          </div>
        </div>
      </section>

      <Divider />

      {/* How a run works */}
      <section>
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-h3 sm:text-h2">How a run works</h2>
            <Link to="/how-it-works" className="text-body font-medium text-teal underline underline-offset-4 hover:text-ink">
              The full sequence, step by step
            </Link>
          </div>
          <ol className="mt-10 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-6">
            {RUN_STEPS.map((s) => (
              <li key={s.n} className="border-t-2 border-ink pt-3">
                <p className="font-head text-h3 font-bold text-teal tabular-nums">{s.n}</p>
                <h3 className="mt-1 text-lead font-semibold">{s.title}</h3>
                <p className="mt-2 text-small">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Who it serves */}
      <section className="bg-paper">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 className="text-h3 sm:text-h2">Who it serves</h2>
            <p className="mt-4 max-w-[40ch] text-body">One forecast, worded for each person who has to act on it.</p>
          </div>
          <ul className="divide-y divide-line border-y border-line lg:col-span-8">
            {AUDIENCES.map((a) => {
              const Icon = AUDIENCE_ICONS[a.id];
              return (
                <li key={a.id} className="grid grid-cols-[32px_1fr] items-baseline gap-x-4 py-5 sm:grid-cols-[32px_220px_1fr]">
                  <Icon size={22} className="translate-y-1 text-teal" aria-hidden="true" />
                  <h3 className="font-head text-lead font-semibold">{a.title}</h3>
                  <p className="col-start-2 text-body sm:col-start-3">{a.text}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Honest by design */}
      <section className="relative overflow-hidden bg-ink text-paper">
        <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
          <h2 className="text-h3 sm:text-h2">{HONEST.title}</h2>
          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {HONEST.points.map((p, i) => {
              const Icon = HONEST_ICONS[i] ?? CheckCircle2;
              return (
                <li key={p.title}>
                  <Icon size={22} className="text-teal" aria-hidden="true" />
                  <h3 className="mt-3 text-lead font-semibold">{p.title}</h3>
                  <p className="mt-2 max-w-[40ch] text-body text-paper/85">{p.text}</p>
                </li>
              );
            })}
          </ul>
          <div className="mt-12 flex flex-wrap gap-3">
            <Button onClick={startTour}>{HERO.primaryCta}</Button>
            <ButtonLink to="/science" variant="secondary" className="border-paper bg-transparent text-paper hover:bg-paper/10">
              Methods, data and limits
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
