import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temp = mkdtempSync(join(tmpdir(), "switch-scanning-package-"));
const env = { ...process.env, npm_config_cache: join(temp, "npm-cache") };

try {
  const packed = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--pack-destination", temp], {
      cwd: root,
      env,
      encoding: "utf8",
    }),
  )[0];
  const names = new Set(packed.files.map((file) => file.path));
  for (const required of [
    "CONTRIBUTING.md",
    "docs/API.md",
    "docs/SPEC.md",
    "examples/obf/README.md",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/core/testing/index.js",
    "dist/core/testing/index.d.ts",
    "dist/react/index.js",
    "dist/react/index.d.ts",
    "dist/react/advanced/index.js",
    "dist/react/advanced/index.d.ts",
    "dist/styles.css",
    "package.json",
  ]) {
    if (!names.has(required))
      throw new Error(`packed file missing: ${required}`);
  }
  if (![...names].some((name) => name.endsWith(".js.map")))
    throw new Error("packed source maps are missing");

  const fixture = join(temp, "fixture");
  writeFileSync(
    join(temp, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  execFileSync(
    "npm",
    [
      "install",
      join(temp, packed.filename),
      "--ignore-scripts",
      "--offline",
      "--omit=peer",
      "--no-audit",
      "--no-fund",
    ],
    { cwd: temp, env, stdio: "inherit" },
  );

  writeFileSync(
    fixture,
    `
      const root = await import("@shayc/switch-scanning");
      if (typeof root.createScanner !== "function") throw new Error("root core import failed");
      const testing = await import("@shayc/switch-scanning/core/testing");
      if (typeof testing.manualClock !== "function") throw new Error("testing import failed");
    `,
  );
  execFileSync("node", [fixture], { cwd: temp, env, stdio: "inherit" });

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor >= 22) {
    const requireFixture = join(temp, "require-consumer.cjs");
    writeFileSync(
      requireFixture,
      `
        const root = require("@shayc/switch-scanning");
        if (typeof root.createScanner !== "function") throw new Error("root core require failed");
        const testing = require("@shayc/switch-scanning/core/testing");
        if (typeof testing.manualClock !== "function") throw new Error("testing require failed");
      `,
    );
    execFileSync("node", [requireFixture], {
      cwd: temp,
      env,
      stdio: "inherit",
    });
  }

  const typeFixture = join(temp, "core-consumer.ts");
  writeFileSync(
    typeFixture,
    `
      import { autoScan, createScanner, stepScan } from "@shayc/switch-scanning";
      import { manualClock } from "@shayc/switch-scanning/core/testing";
      void createScanner({ method: stepScan(), clock: manualClock() });
      void autoScan({ intervalMs: 100, passes: 1 });
    `,
  );
  execFileSync(
    join(root, "node_modules", ".bin", "tsc"),
    [
      "--noEmit",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      typeFixture,
    ],
    { cwd: temp, env, stdio: "inherit" },
  );

  for (const dependency of ["react"]) {
    const destination = join(temp, "node_modules", dependency);
    if (!existsSync(destination)) {
      symlinkSync(join(root, "node_modules", dependency), destination, "dir");
    }
  }
  writeFileSync(
    fixture,
    `
      const reactEntry = await import("@shayc/switch-scanning/react");
      if (typeof reactEntry.SwitchScanner !== "function") throw new Error("React facade import failed");
      const advanced = await import("@shayc/switch-scanning/react/advanced");
      if (typeof advanced.ScannerProvider !== "function") throw new Error("advanced React import failed");
    `,
  );
  execFileSync("node", [fixture], { cwd: temp, env, stdio: "inherit" });

  writeFileSync(
    typeFixture,
    `
      import { createScanner, stepScan } from "@shayc/switch-scanning";
      import { manualClock } from "@shayc/switch-scanning/core/testing";
      import { SwitchScanner, autoScan, useScanTarget } from "@shayc/switch-scanning/react";
      import { ScannerProvider, useOwnedScanner } from "@shayc/switch-scanning/react/advanced";
      void createScanner({ method: stepScan(), clock: manualClock() });
      void autoScan({ intervalMs: 100, passes: 1 });
      void SwitchScanner;
      void useScanTarget;
      void ScannerProvider;
      void useOwnedScanner;
    `,
  );
  execFileSync(
    join(root, "node_modules", ".bin", "tsc"),
    [
      "--noEmit",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      typeFixture,
    ],
    { cwd: temp, env, stdio: "inherit" },
  );

  const manifest = JSON.parse(
    readFileSync(
      join(temp, "node_modules/@shayc/switch-scanning/package.json"),
    ),
  );
  if (!manifest.exports?.["./styles.css"])
    throw new Error("stylesheet export is missing");
  if (!manifest.exports?.["./react"])
    throw new Error("React export is missing");
  if (!manifest.exports?.["./react/advanced"])
    throw new Error("advanced React export is missing");
  if (manifest.peerDependencies?.react !== "^18.0.0 || ^19.0.0")
    throw new Error("React 18/19 peer range is missing");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
