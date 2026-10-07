import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/* Switch                                                               */
/* ------------------------------------------------------------------ */

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

/** On / off switch (role="switch"). */
export function Toggle({ checked, onChange, label, description, disabled, className }: ToggleProps) {
  const id = useId();
  return (
    <div className={`flex items-start gap-3 ${className ?? ''}`}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${checked ? 'border-teal bg-teal' : 'border-line bg-mist'}`}
      >
        <span
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-paper shadow-[0_0_0_1px_var(--line)] transition-[left] ${checked ? 'left-[18px]' : 'left-0.5'}`}
          aria-hidden="true"
        />
      </button>
      <div>
        <label htmlFor={id} className="text-body">
          {label}
        </label>
        {description && (
          <p id={`${id}-d`} className="text-small">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pressed-state button (layer toggles, filters)                        */
/* ------------------------------------------------------------------ */

export function ToggleButton({
  pressed,
  onClick,
  children,
  disabled,
  className,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-chip border px-2.5 text-small disabled:cursor-not-allowed disabled:opacity-50 ${
        pressed ? 'border-teal bg-teal text-paper' : 'border-line bg-paper text-ink hover:border-ink'
      } ${className ?? ''}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented choice (one of several)                                    */
/* ------------------------------------------------------------------ */

export interface ToggleGroupOption<T extends string | number> {
  value: T;
  label: string;
}

export interface ToggleGroupProps<T extends string | number> {
  label: string;
  options: readonly ToggleGroupOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Show the group label visibly (otherwise it is for screen readers only). */
  showLabel?: boolean;
  className?: string;
}

/** Radio group drawn as joined buttons. Arrow keys move the selection. */
export function ToggleGroup<T extends string | number>({ label, options, value, onChange, showLabel, className }: ToggleGroupProps<T>) {
  const labelId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    const opt = options[next];
    if (opt) {
      onChange(opt.value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      <span id={labelId} className={showLabel ? 'text-small' : 'sr-only'}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="inline-flex max-w-full flex-wrap rounded-chip border border-line bg-paper p-0.5" onKeyDown={onKeyDown}>
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={`h-7 min-w-9 whitespace-nowrap rounded-[3px] px-2.5 text-small font-medium tabular-nums ${on ? 'bg-ink text-paper' : 'text-ink hover:bg-mist'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
