import { usePageTitle } from '../app/hooks';
import { RUN_STEPS } from '../content/site';

/** Placeholder until the scroll story (docs/PROTOTYPE_SPEC.md Part 5.2) is built. */
export default function HowItWorks() {
  usePageTitle('How it works');
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
      <h1 className="text-h2 sm:text-h1">How a forecast run works</h1>
      <p className="mt-5 max-w-[62ch] text-lead">Six steps take a NEPS-G run from 23 raw members to alerts a forecaster can approve.</p>
      <ol className="mt-10 max-w-[70ch] divide-y divide-line border-y border-line">
        {RUN_STEPS.map((s) => (
          <li key={s.n} className="grid grid-cols-[40px_1fr] gap-x-4 py-5">
            <span className="font-head text-h3 font-bold text-teal tabular-nums">{s.n}</span>
            <div>
              <h2 className="text-lead font-semibold">{s.title}</h2>
              <p className="mt-1 text-body">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
