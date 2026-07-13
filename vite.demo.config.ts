import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/switch-scanning/",
  plugins: [react()],
  resolve: {
    alias: {
      "@shayc/switch-scanning/styles.css": resolve(__dirname, "src/styles.css"),
      "@shayc/switch-scanning/core": resolve(__dirname, "src/core/index.ts"),
      "@shayc/switch-scanning": resolve(__dirname, "src/react/index.ts"),
    },
  },
  build: {
    outDir: "demo-dist",
    emptyOutDir: true,
  },
});
