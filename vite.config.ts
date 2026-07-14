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
  resolve: {
    // Let the demo import the package by name so its source reads exactly like
    // consumer code. Lib builds never resolve these (nothing in src imports the
    // package name), so this is inert for `vite build`. Most-specific first.
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
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
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
});
