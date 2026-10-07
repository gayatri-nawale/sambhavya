import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../app/hooks';
import { ButtonLink } from '../components/ui/Button';
import { ContourBackground } from '../components/layout/ContourBackground';

// The visuals need the simulation engine and world map, so they load after the text.
const visuals = () => import('../components/howitworks/StepVisuals');
const ScanVisual = lazy(() => visuals().then((m) => ({ default: m.ScanVisual })));
const TrackVisual = lazy(() => visuals().then((m) => ({ default: m.TrackVisual })));
const CalibrateVisual = lazy(() => visuals().then((m) => ({ default: m.CalibrateVisual })));
const SharpenVisual = lazy(() => visuals().then((m) => ({ default: m.SharpenVisual })));
const CheckVisual = lazy(() => visuals().then((m) => ({ default: m.CheckVisual })));
const ReviewVisual = lazy(() => visuals().then((m) => ({ default: m.ReviewVisual })));

interface Step {
  n: number;
  title: string;
  lead: string;
  body: string;
  console: { to: string; label: string };
  Visual: React.ComponentType;
}

const STEPS: readonly Step[] = [
  {
    n: 1,
    title: 'Scan',
    lead: 'Read every member of the run and find where conditions are extreme.',
    body: 'NCMRWF’s NEPS-G ensemble runs at 00 and 12 UTC, producing 23 forecasts of the next ten days on a 12 km grid. SAMBHAVYA splits each run into chunks it can process in parallel, then compares every member with a 30-year ERA5 baseline. The Extreme Forecast Index (EFI) shows where the forecast is unusual for the time of year.',
    console: { to: '/console/run', label: 'Watch a run in the console' },
    Visual: ScanVisual,
  },
  {
    n: 2,
    title: 'Track',
    lead: 'Find each threat and follow it through every member.',
    body: 'A graph neural network works on an icosahedral mesh that covers the globe evenly. It screens all members for candidate threats, then links each threat through time. Member tracks are grouped into a few scenarios, each with a probability, so a forecaster sees the likely outcomes, not 23 lines.',
    console: { to: '/console/tracker', label: 'Open the threat tracker' },
    Visual: TrackVisual,
  },
  {
    n: 3,
    title: 'Calibrate',
    lead: 'Make the probabilities mean what they say.',
    body: 'Raw ensemble members agree more than they should, so their probabilities are over-confident. Calibration corrects them lead time by lead time, so a 60% alert comes true about 6 times in 10. Blending consecutive runs keeps warnings from flipping back and forth.',
    console: { to: '/console/calibration', label: 'See calibration' },
    Visual: CalibrateVisual,
  },
  {
    n: 4,
    title: 'Sharpen',
    lead: 'Add the 5 km detail that a 12 km grid cannot see.',
    body: 'Inside each threat zone, a diffusion model adds realistic fine detail on top of the 12 km forecast. Simple interpolation smooths the field and loses the peak, which is often the number that matters most. The diffusion model keeps it, and draws several samples so the detail carries its own uncertainty.',
    console: { to: '/console/sharpen', label: 'Compare methods' },
    Visual: SharpenVisual,
  },
  {
    n: 5,
    title: 'Check',
    lead: 'Never publish detail that breaks the physics.',
    body: 'Every 5 km result must pass three checks: the peak is kept, the area total matches (water balance), and the result averages back to the 12 km forecast. If any check fails, SAMBHAVYA publishes the calibrated 12 km forecast instead.',
    console: { to: '/console/sharpen', label: 'See a failing case' },
    Visual: CheckVisual,
  },
  {
    n: 6,
    title: 'Review & alert',
    lead: 'A forecaster decides. Always.',
    body: 'Each alert arrives with its 5 km zone, probability, timing, member agreement and the scenario behind it. The forecaster approves, edits or holds it. Only after approval is it formatted as a CAP 1.2 message, the format used by NDMA’s SACHET platform. This prototype previews the message and never sends it.',
    console: { to: '/console/alerts', label: 'Review alerts' },
    Visual: ReviewVisual,
  },
];

function VisualFallback() {
  return <div className="h-[342px] rounded-panel border border-line bg-paper" aria-hidden="true" />;
}

export default function HowItWorks() {
  usePageTitle('How it works');
  return (
    <>
      <section className="relative overflow-hidden">
        <ContourBackground cx={0.85} cy={0.3} className="opacity-60" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
          <h1 className="text-h2 sm:text-h1">How a forecast run works</h1>
          <p className="mt-5 max-w-[62ch] text-lead">
            Six steps take a NEPS-G run from 23 raw members to alerts a forecaster can approve. Each step below runs on the cyclone replay, shaped
            after Amphan (May 2020), with illustrative values.
          </p>
          <ol className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-body" aria-label="Steps">
            {STEPS.map((s) => (
              <li key={s.n}>
                <a href={`#step-${s.n}`} className="underline-offset-4 hover:text-teal hover:underline">
                  <span className="font-head font-semibold text-teal tabular-nums">{s.n}</span> {s.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {STEPS.map((s, i) => (
        <section key={s.n} id={`step-${s.n}`} className={`scroll-mt-4 border-t border-line ${i % 2 === 1 ? 'bg-paper' : ''}`}>
          <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:items-center">
            <div className="min-w-0 lg:col-span-5">
              <p className="font-head text-h2 font-bold leading-none text-teal tabular-nums">{s.n}</p>
              <h2 className="mt-2 text-h3 sm:text-h2">{s.title}</h2>
              <p className="mt-3 text-lead font-medium">{s.lead}</p>
              <p className="mt-3 max-w-[60ch] text-body">{s.body}</p>
              <Link to={s.console.to} className="mt-4 inline-block font-medium text-teal underline underline-offset-4 hover:text-ink">
                {s.console.label}
              </Link>
            </div>
            <div className="min-w-0 lg:col-span-7">
              <Suspense fallback={<VisualFallback />}>
                <s.Visual />
              </Suspense>
            </div>
          </div>
        </section>
      ))}

      <section className="border-t border-line bg-ink text-paper">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-4 py-12 sm:px-6">
          <p className="max-w-[48ch] font-head text-h3 font-semibold">Watch all six steps run on a real-shaped replay.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/console/run">Open the forecast run</ButtonLink>
            <ButtonLink to="/science" variant="secondary" className="border-paper bg-transparent text-paper hover:bg-paper/10">
              Methods, data and limits
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
