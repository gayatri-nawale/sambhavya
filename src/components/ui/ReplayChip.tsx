/** Honesty marker shown on every data view. */
export function ReplayChip({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-chip border border-line bg-paper px-2 py-0.5 text-small text-ink ${className ?? ''}`}
      title="Replay shaped after real events. Values are illustrative; no measured skill is claimed."
    >
      Replay · illustrative values
    </span>
  );
}
