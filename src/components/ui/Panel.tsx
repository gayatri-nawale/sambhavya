import type { ReactNode } from 'react';
import { ReplayChip } from './ReplayChip';

export interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Controls placed at the right of the header. */
  actions?: ReactNode;
  /** Show the Replay chip in the header (required on every data view). */
  replay?: boolean;
  /** No body padding, for maps and canvases that run edge to edge. */
  bleed?: boolean;
  headingLevel?: 2 | 3;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

/** Surface for console content: 1 px --line border, 8 px radius, no shadow. */
export function Panel({ title, description, actions, replay, bleed, headingLevel = 2, className, bodyClassName, children }: PanelProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const hasHeader = title !== undefined || actions !== undefined || replay;
  return (
    <section className={`overflow-hidden rounded-panel border border-line bg-paper ${className ?? ''}`}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title !== undefined && <Heading className="font-sans text-body font-semibold leading-snug">{title}</Heading>}
            {description !== undefined && <p className="mt-0.5 text-small">{description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {replay && <ReplayChip />}
          </div>
        </header>
      )}
      <div className={`${bleed ? '' : 'p-4'} ${bodyClassName ?? ''}`}>{children}</div>
    </section>
  );
}
