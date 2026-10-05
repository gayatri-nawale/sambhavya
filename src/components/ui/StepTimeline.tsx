import { Check } from 'lucide-react';

export type StepState = 'done' | 'running' | 'waiting';

export interface TimelineStep {
  id: string;
  label: string;
  status: StepState;
  /** 0..1, shown while running. */
  progress?: number;
  detail?: string;
}

/** Vertical sequence of steps with done / running / waiting states. */
export function StepTimeline({ steps, label, className }: { steps: readonly TimelineStep[]; label: string; className?: string }) {
  return (
    <ol aria-label={label} className={`relative ${className ?? ''}`}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.id} className="relative grid grid-cols-[24px_1fr] gap-x-3 pb-3" aria-current={s.status === 'running' ? 'step' : undefined}>
            {!last && (
              <span
                className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${s.status === 'done' ? 'bg-teal' : 'bg-line'}`}
                aria-hidden="true"
              />
            )}
            <span className="relative z-10 mt-0.5 grid h-6 w-6 place-items-center" aria-hidden="true">
              {s.status === 'done' ? (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-teal text-paper">
                  <Check size={14} strokeWidth={3} />
                </span>
              ) : s.status === 'running' ? (
                <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-teal bg-paper">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal motion-safe:animate-pulse" />
                </span>
              ) : (
                <span className="h-6 w-6 rounded-full border-2 border-line bg-paper" />
              )}
            </span>
            <div className="min-w-0">
              <p className={`text-body leading-snug ${s.status === 'running' ? 'font-semibold text-ink' : s.status === 'done' ? 'text-ink' : 'text-ink/60'}`}>
                {s.label}
                <span className="sr-only">
                  {', '}
                  {s.status === 'done' ? 'done' : s.status === 'running' ? 'running' : 'waiting'}
                </span>
              </p>
              {s.status === 'running' && s.progress !== undefined && (
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-mist" aria-hidden="true">
                  <div className="h-full bg-teal" style={{ width: `${Math.round(s.progress * 100)}%` }} />
                </div>
              )}
              {s.detail && <p className="mt-0.5 text-small">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
