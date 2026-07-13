/// <reference types="vitest/config" />
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import dts from "vite-plugin-dts";

function copyStylesheet(): Plugin {
  return {
    name: "switch-scanning:copy-styles",
    apply: "build",
    closeBundle() {
      copyFileSync(
        resolve(__dirname, "src/styles.css"),
        resolve(__dirname, "dist/styles.css"),
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ["src"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test-setup.ts"],
      // Preserve the source folder structure so subpath type entries resolve.
      entryRoot: "src",
    }),
    copyStylesheet(),
  ],
  build: {
    lib: {
      entry: {
        "react/index": resolve(__dirname, "src/react/index.ts"),
        "core/index": resolve(__dirname, "src/core/index.ts"),
        "core/testing/index": resolve(__dirname, "src/core/testing/index.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        // Keep a stable, folder-based layout under dist/.
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
    sourcemap: true,
    target: "es2022",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
