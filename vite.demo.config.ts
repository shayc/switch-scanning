import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { packageSourceAliases } from "./alias.config.ts";

export default defineConfig({
  base: "/switch-scanning/",
  plugins: [react()],
  resolve: {
    alias: packageSourceAliases,
  },
  build: {
    outDir: "demo-dist",
    emptyOutDir: true,
  },
});
