import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import dts from "vite-plugin-dts";
import { packageSourceAliases } from "./alias.config.ts";

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
    // Lib builds never resolve these (nothing in src imports the package
    // name), so the aliases are inert for `vite build`.
    alias: packageSourceAliases,
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        "react/index": resolve(__dirname, "src/react/index.ts"),
        "react/advanced/index": resolve(
          __dirname,
          "src/react/advanced/index.ts",
        ),
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
