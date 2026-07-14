import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/switch-scanning/",
  plugins: [react()],
  resolve: {
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
        find: "@shayc/switch-scanning/core",
        replacement: resolve(__dirname, "src/core/index.ts"),
      },
      {
        find: /^@shayc\/switch-scanning$/,
        replacement: resolve(__dirname, "src/index.ts"),
      },
    ],
  },
  build: {
    outDir: "demo-dist",
    emptyOutDir: true,
  },
});
