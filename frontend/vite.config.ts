import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The data the site is built from lives in the repository's data/ folder, shared with tools/.
  resolve: { alias: { '@data': fileURLToPath(new URL('../data', import.meta.url)) } },
  // Declared up front so the dev server does not reload the page when the map first loads.
  optimizeDeps: { include: ['pixi.js'] },
  server: { host: '127.0.0.1', fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    css: false,
  },
});
