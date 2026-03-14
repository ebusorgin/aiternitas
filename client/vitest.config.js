import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{js,mjs}'],
    environmentMatchGlobs: [
      ['tests/frontend/**', 'jsdom'],
    ],
    setupFiles: ['tests/frontend/setup.js'],
  },
});
