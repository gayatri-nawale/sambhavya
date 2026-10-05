import { Check, Circle, Clock, Loader2, Pause, X, type LucideIcon } from 'lucide-react';

/**
 * Process and review states. Uses interface colours only — never the risk
 * colours, which are reserved for Low / Moderate / Severe.
 */
export type Status = 'idle' | 'waiting' | 'running' | 'paused' | 'done' | 'pass' | 'fail' | 'pending' | 'approved' | 'held';

const STYLES: Record<Status, { label: string; icon: LucideIcon; className: string; spin?: boolean }> = {
  idle: { label: 'Idle', icon: Circle, className: 'border-line bg-paper text-ink' },
  waiting: { label: 'Waiting', icon: Circle, className: 'border-line bg-mist text-ink' },
  running: { label: 'Running', icon: Loader2, className: 'border-teal bg-paper text-teal', spin: true },
  paused: { label: 'Paused', icon: Pause, className: 'border-bay bg-paper text-bay' },
  done: { label: 'Done', icon: Check, className: 'border-ink bg-paper text-ink' },
  pass: { label: 'Pass', icon: Check, className: 'border-teal bg-teal text-paper' },
  fail: { label: 'Fail', icon: X, className: 'border-ink bg-ink text-paper' },
  pending: { label: 'Waiting for review', icon: Clock, className: 'border-bay bg-paper text-bay' },
  approved: { label: 'Approved', icon: Check, className: 'border-teal bg-teal text-paper' },
  held: { label: 'On hold', icon: Pause, className: 'border-ink bg-mist text-ink' },
};

export function StatusChip({ status, label, className }: { status: Status; label?: string; className?: string }) {
  const s = STYLES[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip border px-2 py-0.5 text-small font-medium ${s.className} ${className ?? ''}`}>
      <Icon size={14} aria-hidden="true" className={s.spin ? 'animate-spin motion-reduce:animate-none' : ''} />
      {label ?? s.label}
    </span>
  );
}
