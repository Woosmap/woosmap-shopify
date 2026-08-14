import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['app/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // The sync logic, the Shopify mapper, the Admin GraphQL wrapper and the client
      // factory are the tested "backend". sync-runner.ts is the thin main() entry
      // (wiring only), so it stays out.
      include: [
        'app/store-sync.server.ts',
        'app/metaobject-mapping.server.ts',
        'app/admin-graphql.server.ts',
        'app/woosmap.server.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
    },
  },
});
