import { resolve } from "node:path";
import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Vitest does not apply TypeScript's `paths` mappings. Resolve package
    // self-imports to source so tests also work in a fresh checkout without
    // a pre-existing dist/ directory.
    alias: [
      {
        find: "@shayc/switch-scanning/styles.css",
        replacement: resolve(__dirname, "src/styles.css"),
      },
      {
        find: "@shayc/switch-scanning/react",
        replacement: resolve(__dirname, "src/react/index.ts"),
      },
      {
        find: "@shayc/switch-scanning/core/testing",
        replacement: resolve(__dirname, "src/core/testing/index.ts"),
      },
      {
        find: "@shayc/switch-scanning/core",
        replacement: resolve(__dirname, "src/core/index.ts"),
      },
      {
        find: /^@shayc\/switch-scanning$/,
        replacement: resolve(__dirname, "src/index.ts"),
      },
    ],
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
        "src/core/{scanner,session,styleRuntime}.ts": {
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
