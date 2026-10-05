import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

// Dev-only pages are dropped from production builds.
const SimCheckPage = import.meta.env.DEV ? lazy(() => import('../pages/dev/SimCheckPage')) : null;

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {SimCheckPage && <Route path="/_sim" element={<SimCheckPage />} />}
          <Route path="*" element={null} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
