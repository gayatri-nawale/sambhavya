import { useEffect, useRef } from 'react';

export interface LogEntry {
  key: string;
  time: string;
  text: string;
}

export interface LogStreamProps {
  lines: readonly LogEntry[];
  label: string;
  emptyText?: string;
  className?: string;
}

/**
 * Timestamped log that follows new lines, unless the reader has scrolled up
 * to look at earlier ones.
 */
export function LogStream({ lines, label, emptyText = 'No log lines yet.', className }: LogStreamProps) {
  const ref = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const onScroll = () => {
    const el = ref.current;
    if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      role="log"
      aria-label={label}
      aria-live="polite"
      aria-relevant="additions"
      tabIndex={0}
      className={`overflow-y-auto bg-paper px-4 py-2 text-small tabular-nums ${className ?? 'h-48'}`}
    >
      {lines.length === 0 ? (
        <p className="py-1 text-ink/70">{emptyText}</p>
      ) : (
        <ol>
          {lines.map((l) => (
            <li key={l.key} className="grid grid-cols-[76px_1fr] gap-x-3 py-0.5">
              <time className="text-bay">{l.time}</time>
              <span>{l.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
