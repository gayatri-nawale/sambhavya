import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TOUR_STAGES, useSimStore } from '../store';

/** Sets the document title as "<page> · SAMBHAVYA". */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · SAMBHAVYA` : 'SAMBHAVYA';
  }, [title]);
}

/** Starts the guided demo and opens its first stage. */
export function useStartTour(): () => void {
  const navigate = useNavigate();
  const startTour = useSimStore((s) => s.startTour);
  return useCallback(() => {
    startTour();
    const first = TOUR_STAGES[0];
    if (first) navigate(first.route);
  }, [navigate, startTour]);
}
