import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The simulation chunk bundles the Natural Earth 50m atlas (~750 kB raw, ~270 kB gzip)
    // because the app must work offline. It is lazy-loaded; everything else stays small.
    chunkSizeWarningLimit: 900,
  },
});
