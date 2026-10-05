import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PublicLayout } from '../components/layout/PublicLayout';
import Home from '../pages/Home';
import HowItWorks from '../pages/HowItWorks';
import Science from '../pages/Science';
import NotFound from '../pages/NotFound';

// The console pulls in the simulation engine and world map, so it loads on demand.
const ConsoleLayout = lazy(() => import('../components/layout/ConsoleLayout').then((m) => ({ default: m.ConsoleLayout })));
const ConsolePlaceholder = lazy(() => import('../pages/console/ConsolePlaceholder'));
const ForecastRun = lazy(() => import('../pages/console/ForecastRun'));
const ThreatTracker = lazy(() => import('../pages/console/ThreatTracker'));
const Sharpen = lazy(() => import('../pages/console/Sharpen'));

// Dev-only pages are dropped from production builds.
const SimCheckPage = import.meta.env.DEV ? lazy(() => import('../pages/dev/SimCheckPage')) : null;
const KitPage = import.meta.env.DEV ? lazy(() => import('../pages/dev/KitPage')) : null;

/** Scroll to the top on page change, or to the #hash target when there is one. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <Suspense fallback={null}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="science" element={<Science />} />
          </Route>
          <Route path="console" element={<ConsoleLayout />}>
            <Route index element={<Navigate to="run" replace />} />
            <Route path="run" element={<ForecastRun />} />
            <Route path="tracker" element={<ThreatTracker />} />
            <Route path="sharpen" element={<Sharpen />} />
            <Route path="calibration" element={<ConsolePlaceholder id="calibration" />} />
            <Route path="alerts" element={<ConsolePlaceholder id="alerts" />} />
            <Route path="verify" element={<ConsolePlaceholder id="verify" />} />
            <Route path="sources" element={<ConsolePlaceholder id="sources" />} />
          </Route>
          {SimCheckPage && <Route path="_sim" element={<SimCheckPage />} />}
          {KitPage && <Route path="_kit" element={<KitPage />} />}
          <Route element={<PublicLayout />}>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
