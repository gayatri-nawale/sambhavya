import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

// Dev-only pages are dropped from production builds.
const SimCheckPage = import.meta.env.DEV ? lazy(() => import('../pages/dev/SimCheckPage')) : null;
const KitPage = import.meta.env.DEV ? lazy(() => import('../pages/dev/KitPage')) : null;

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {SimCheckPage && <Route path="/_sim" element={<SimCheckPage />} />}
          {KitPage && <Route path="/_kit" element={<KitPage />} />}
          <Route path="*" element={null} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
