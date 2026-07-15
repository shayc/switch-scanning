/**
 * Shared validation primitives for the option/style/switch boundaries. Every
 * failure surfaces as a `RangeError` tagged with the library name so hosts can
 * distinguish configuration mistakes from runtime faults.
 */

/** Throw a tagged `RangeError`. Never returns. */
export function fail(message: string): never {
  throw new RangeError(`[switch-scanning] ${message}`);
}

/** Assert a finite number >= 0. */
export function assertNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    fail(`${name} must be a finite number >= 0 (received ${value})`);
  }
}

/** Assert a finite number > 0. */
export function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    fail(`${name} must be a finite number greater than 0 (received ${value})`);
  }
}

/** Read a required numeric field, failing if it is absent or not a number. */
export function readNumber(
  candidate: Record<string, unknown>,
  key: string,
  name: string,
): number {
  const value = candidate[key];
  if (typeof value !== "number") {
    fail(`${name} must be a number (received ${typeof value})`);
  }
  return value;
}

/** Read an optional numeric field, defaulting to 0 when absent. */
export function readOptionalNumber(
  candidate: Record<string, unknown>,
  key: string,
  name: string,
): number {
  return candidate[key] === undefined ? 0 : readNumber(candidate, key, name);
}
