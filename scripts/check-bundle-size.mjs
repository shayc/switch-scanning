import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const dist = resolve("dist");
const files = walk(dist).filter((file) => file.endsWith(".js"));
const gzipBytes = files.reduce(
  (total, file) => total + gzipSync(readFileSync(file)).byteLength,
  0,
);
const limit = 20_000;

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
