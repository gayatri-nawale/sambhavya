import { useEffect, useId } from 'react';
import { Pause, Play } from 'lucide-react';

export interface LeadTimeSliderProps {
  value: number;
  onChange: (leadH: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Milliseconds per 6-hour step while playing. */
  stepMs?: number;
  /** Valid-time text for a lead time, e.g. "20 May 2020, 00 UTC". */
  formatValid?: (leadH: number) => string;
  className?: string;
}

/**
 * Lead-time scrubber, T+0 to T+240 h in 6-hour steps, with play / pause.
 * Uses a native range input, so it works with the keyboard and screen readers.
 */
export function LeadTimeSlider({
  value,
  onChange,
  playing,
  onPlayingChange,
  min = 0,
  max = 240,
  step = 6,
  stepMs = 450,
  formatValid,
  className,
}: LeadTimeSliderProps) {
  const id = useId();

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const next = value + step;
      if (next > max) onPlayingChange(false);
      else onChange(next);
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [playing, value, step, max, stepMs, onChange, onPlayingChange]);

  const togglePlay = () => {
    // Restart from the beginning when play is pressed at the end.
    if (!playing && value >= max) onChange(min);
    onPlayingChange(!playing);
  };

  const days: number[] = [];
  for (let h = min; h <= max; h += 24) days.push(h);
  const pct = ((value - min) / (max - min)) * 100;
  const valid = formatValid?.(value);

  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? 'Pause lead-time playback' : 'Play lead-time playback'}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[4px] border border-[#1F8A84] bg-[#1F8A84] text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]"
      >
        {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[14px] text-[#14213D] tabular-nums">
          <label htmlFor={id} className="font-semibold">
            Lead time T+{value} h
          </label>
          {valid && <span>Valid {valid}</span>}
        </div>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={`T plus ${value} hours${valid ? `, valid ${valid}` : ''}`}
          className="lead-slider w-full"
          style={{ background: `linear-gradient(to right, #1F8A84 ${pct}%, #C9D3DE ${pct}%)` }}
        />
        <div className="relative mt-1 h-4 text-[12px] text-[#14213D] tabular-nums" aria-hidden="true">
          {days.map((h) => (
            <span
              key={h}
              className={`absolute ${h === min ? '' : h === max ? '-translate-x-full' : '-translate-x-1/2'}`}
              style={{ left: `${((h - min) / (max - min)) * 100}%` }}
            >
              {h === min ? 'T+0' : `D${h / 24}`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
