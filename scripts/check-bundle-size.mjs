import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const dist = resolve("dist");
const files = walk(dist).filter((file) => file.endsWith(".js"));
const gzipBytes = files.reduce(
  (total, file) => total + gzipSync(readFileSync(file)).byteLength,
  0,
);
// The 0.2 declarative React entry adds the application-level scanner boundary,
// contextual controls, and gesture compiler to the published surface.
const limit = 21_000;

console.log(
  `[switch-scanning] ESM bundle baseline: ${gzipBytes} gzip bytes across ${files.length} files (limit ${limit})`,
);
if (gzipBytes > limit) {
  throw new Error(
    `bundle-size regression: ${gzipBytes} gzip bytes exceeds ${limit}`,
  );
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
