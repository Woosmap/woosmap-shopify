import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["app/**/*.test.ts", "extensions/**/src/**/*.test.ts"],
    environment: "node",
    // A deterministic 32-byte key so the settings crypto has something to work with.
    env: { SETTINGS_ENC_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "app/woosmap-settings.server.ts",
        "app/woosmap-checkout.server.ts",
        "app/publish-app-url.server.ts",
        "extensions/woosmap-address-autocomplete/src/backend.ts",
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
