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
    "dist/core/index.js",
    "dist/core/index.d.ts",
    "dist/react/index.js",
    "dist/react/index.d.ts",
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
      const core = await import("@shayc/switch-scanning/core");
      if (typeof core.createScanner !== "function") throw new Error("core import failed");
      const testing = await import("@shayc/switch-scanning/core/testing");
      if (typeof testing.manualClock !== "function") throw new Error("testing import failed");
    `,
  );
  execFileSync("node", [fixture], { cwd: temp, env, stdio: "inherit" });

  for (const dependency of ["react", "react-dom"]) {
    const destination = join(temp, "node_modules", dependency);
    if (!existsSync(destination)) {
      symlinkSync(join(root, "node_modules", dependency), destination, "dir");
    }
  }
  writeFileSync(
    fixture,
    `
      const reactEntry = await import("@shayc/switch-scanning");
      if (typeof reactEntry.ScannerProvider !== "function") throw new Error("React import failed");
    `,
  );
  execFileSync("node", [fixture], { cwd: temp, env, stdio: "inherit" });

  const manifest = JSON.parse(
    readFileSync(
      join(temp, "node_modules/@shayc/switch-scanning/package.json"),
    ),
  );
  if (!manifest.exports?.["./styles.css"])
    throw new Error("stylesheet export is missing");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
