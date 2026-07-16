import { coverageConfigDefaults, defineConfig } from "vitest/config";
import { packageSourceAliases } from "./alias.config.ts";

export default defineConfig({
  resolve: {
    // Vitest does not apply TypeScript's `paths` mappings, so the shared
    // aliases stand in for them here.
    alias: packageSourceAliases,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "examples/**/*.test.ts",
      "examples/**/*.test.tsx",
    ],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        ...coverageConfigDefaults.exclude,
        "src/**/*.test.{ts,tsx}",
        "src/test-setup.ts",
        "src/**/index.ts",
        "src/core/types.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
        "src/core/scanner/scanner.ts": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        "src/core/model/session.ts": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        "src/core/methods/methodRuntime.ts": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        "src/core/input/gestures.ts": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        "src/react/{registry,registryTree,domHost}.ts": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        "src/react/hooks/{useKeyboardSwitches,usePointerSwitch}.ts": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
