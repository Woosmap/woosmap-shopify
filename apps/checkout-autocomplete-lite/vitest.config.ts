import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['extensions/**/src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // The two target entrypoints (suggest.ts / format-suggestion.ts) are thin glue
      // over the global `shopify` object and are exercised on a dev store, not here.
      // woosmap.ts holds the backend-less logic worth unit-testing.
      include: ['extensions/woosmap-address-autocomplete/src/woosmap.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
    },
  },
});
