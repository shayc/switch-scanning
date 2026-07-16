import { resolve } from "node:path";

/**
 * Resolve package self-imports to source so the demo, tests, and a fresh
 * checkout (no dist/) all read exactly like consumer code. Shared by the vite,
 * demo, and vitest configs so the alias set cannot drift. Most-specific first.
 */
export const packageSourceAliases: {
  find: string | RegExp;
  replacement: string;
}[] = [
  {
    find: "@shayc/switch-scanning/styles.css",
    replacement: resolve(__dirname, "src/styles.css"),
  },
  {
    find: "@shayc/switch-scanning/react/advanced",
    replacement: resolve(__dirname, "src/react/advanced/index.ts"),
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
    find: /^@shayc\/switch-scanning$/,
    replacement: resolve(__dirname, "src/index.ts"),
  },
];
