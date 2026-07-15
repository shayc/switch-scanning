/**
 * Whether diagnostics should also be surfaced on the development console.
 * Bundlers conventionally replace `process.env.NODE_ENV`; an unbundled browser
 * defaults to development so integration mistakes are not silently hidden.
 */
export function isDevelopment(): boolean {
  try {
    if (typeof process !== "undefined" && process.env?.NODE_ENV) {
      return process.env.NODE_ENV !== "production";
    }
  } catch {
    /* Some browser shims expose a throwing `process` proxy. */
  }
  return true;
}
