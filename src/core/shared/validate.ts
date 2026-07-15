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

/** Assert a value is one of the allowed string literals. */
export function assertOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): asserts value is T {
  if (!allowed.includes(value as T)) {
    fail(`${name} must be ${orList(allowed)} (received ${String(value)})`);
  }
}

/** Assert a value is a boolean. Throws a tagged `TypeError`. */
export function assertBoolean(
  value: unknown,
  name: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(
      `[switch-scanning] ${name} must be a boolean (received ${String(value)})`,
    );
  }
}

/** Quote and join literals into a human list: `"a", "b", or "c"`. */
function orList(values: readonly string[]): string {
  const quoted = values.map((value) => `"${value}"`);
  if (quoted.length <= 1) return quoted.join("");
  if (quoted.length === 2) return `${quoted[0]} or ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(", ")}, or ${quoted[quoted.length - 1]}`;
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
