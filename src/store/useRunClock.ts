import { useEffect } from 'react';
import { useSimStore } from './simStore';

/**
 * Drives the forecast-run state machine with requestAnimationFrame while a run
 * is active. Mount it once on any page that shows the run.
 */
export function useRunClock(): void {
  const status = useSimStore((s) => s.run.status);
  const tick = useSimStore((s) => s.tick);

  useEffect(() => {
    if (status !== 'running') return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      // Clamp long gaps (background tabs) so the run doesn't jump ahead.
      tick(Math.min(250, now - last));
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [status, tick]);
}
