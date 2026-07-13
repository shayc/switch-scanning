import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
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
        "src/core/{scanner,session,gestures,styleRuntime}.ts": {
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
        "src/react/{useKeyboardSwitches,usePointerSwitch}.ts": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
