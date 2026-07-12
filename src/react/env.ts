/**
 * Whether we are in a development build. Consumers' bundlers replace
 * `process.env.NODE_ENV`; when `process` is absent (unbundled browser) we
 * default to development so diagnostics are not silently lost.
 */
export function isDevelopment(): boolean {
  try {
    if (typeof process !== "undefined" && process.env && process.env.NODE_ENV) {
      return process.env.NODE_ENV !== "production";
    }
  } catch {
    /* ignore */
  }
  return true;
}
