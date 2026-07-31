import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Resolve the core package to its source so tests always exercise the latest
// code without a rebuild step.
const coreSrc = fileURLToPath(new URL('../localities-client/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@woosmap/localities-client': coreSrc,
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
    },
  },
});
