/**
 * Method constructors return frozen, tagged, serializable data — not objects
 * with behavior. The runtime switches on `kind`, and eager validation makes a
 * misconfigured access method fail at creation rather than mid-session.
 */

import {
  assertNonNegative,
  assertOneOf,
  assertPositive,
  fail,
  readNumber,
} from "../shared/validate.ts";

/** How many passes a timed scope makes before completing. */
export type PassLimit = number | "infinite";

/** Timed method: the highlight advances automatically on an interval. */
export interface AutoScanMethod {
  readonly kind: "auto";
  readonly intervalMs: number;
  readonly passes: PassLimit;
  readonly firstItemPauseMs: number;
  /** Additional recovery time before automatic scanning resumes after selection. */
  readonly transitionDurationMs: number;
}

/** Auto-repeat timing for a held step switch. */
export interface StepScanRepeat {
  readonly delayMs: number;
  readonly intervalMs: number;
}

/** Manual method: each switch action advances one step. */
export interface StepScanMethod {
  readonly kind: "step";
  readonly repeat: false | StepScanRepeat;
}

/**
 * What an armed dwell does when the input environment is suspended (tab hidden,
 * window blurred, device locked) between arming and firing. `"disarm"` is the
 * safe default: the highlight is retained, the arming token is consumed, and a
 * fresh navigation is required before dwell can select again. `"continue"`
 * keeps the pre-2026 behavior of letting a pending dwell fire regardless.
 */
export type DwellSuspensionPolicy = "disarm" | "continue";

/** Single-switch method: press advances; dwelling on an item selects it. */
export interface DwellScanMethod {
  readonly kind: "dwell";
  readonly dwellDurationMs: number;
  readonly suspensionPolicy: DwellSuspensionPolicy;
}

/** Hold-to-scan method: the highlight advances while a switch is held and selects on release. */
export interface InverseScanMethod {
  readonly kind: "inverse";
  readonly intervalMs: number;
  readonly passes: PassLimit;
  readonly firstItemPauseMs: number;
}

/** Any scan method produced by a method constructor. */
export type ScanMethod =
  AutoScanMethod | StepScanMethod | DwellScanMethod | InverseScanMethod;

/** Options for {@link autoScan}. */
export interface AutoScanOptions {
  intervalMs: number;
  passes: PassLimit;
  firstItemPauseMs?: number;
  transitionDurationMs?: number;
}

/** Options for {@link stepScan}. */
export interface StepScanOptions {
  repeat?: false | StepScanRepeat;
}

/** Options for {@link dwellScan}. */
export interface DwellScanOptions {
  dwellDurationMs: number;
  /** How an armed dwell reacts to environment suspension. Defaults to `"disarm"`. */
  suspensionPolicy?: DwellSuspensionPolicy;
}

/** Options for {@link inverseScan}. */
export interface InverseScanOptions {
  intervalMs: number;
  passes: PassLimit;
  firstItemPauseMs?: number;
}

function assertPasses(passes: PassLimit): void {
  if (passes === "infinite") return;
  if (!Number.isInteger(passes) || passes <= 0) {
    fail(
      `passes must be "infinite" or a positive integer (received ${String(passes)})`,
    );
  }
}

/** Create an auto-scan method: the highlight advances automatically on a timer. */
export function autoScan(options: AutoScanOptions): AutoScanMethod {
  const method: AutoScanMethod = {
    kind: "auto",
    intervalMs: options.intervalMs,
    passes: options.passes,
    firstItemPauseMs: options.firstItemPauseMs ?? 0,
    transitionDurationMs: options.transitionDurationMs ?? 0,
  };
  assertScanMethod(method);
  return Object.freeze(method);
}

/** Create a step-scan method: each switch action advances one step. */
export function stepScan(options: StepScanOptions = {}): StepScanMethod {
  const repeat = options.repeat ?? false;
  const method: StepScanMethod = {
    kind: "step",
    repeat:
      repeat === false
        ? false
        : Object.freeze({
            delayMs: repeat.delayMs,
            intervalMs: repeat.intervalMs,
          }),
  };
  assertScanMethod(method);
  return Object.freeze(method);
}

/** Create a dwell-scan method: press advances; dwelling on an item selects it. */
export function dwellScan(options: DwellScanOptions): DwellScanMethod {
  const method: DwellScanMethod = {
    kind: "dwell",
    dwellDurationMs: options.dwellDurationMs,
    suspensionPolicy: options.suspensionPolicy ?? "disarm",
  };
  assertScanMethod(method);
  return Object.freeze(method);
}

/** Create an inverse-scan method: the highlight advances while a switch is held and selects on release. */
export function inverseScan(options: InverseScanOptions): InverseScanMethod {
  const method: InverseScanMethod = {
    kind: "inverse",
    intervalMs: options.intervalMs,
    passes: options.passes,
    firstItemPauseMs: options.firstItemPauseMs ?? 0,
  };
  assertScanMethod(method);
  return Object.freeze(method);
}

/** @internal Validate structurally supplied method data at the scanner boundary. */
export function assertScanMethod(
  method: unknown,
): asserts method is ScanMethod {
  if (typeof method !== "object" || method === null) {
    fail("method must be created with a scan method constructor");
  }

  const candidate = method as Record<string, unknown>;
  switch (candidate.kind) {
    case "inverse":
    case "auto":
      assertPositive(
        readNumber(candidate, "intervalMs", "intervalMs"),
        "intervalMs",
      );
      assertPasses(candidate.passes as PassLimit);
      assertNonNegative(
        readNumber(candidate, "firstItemPauseMs", "firstItemPauseMs"),
        "firstItemPauseMs",
      );
      if (candidate.kind === "auto") {
        assertNonNegative(
          readNumber(candidate, "transitionDurationMs", "transitionDurationMs"),
          "transitionDurationMs",
        );
      }
      return;
    case "step": {
      const repeat = candidate.repeat;
      if (repeat === false) return;
      if (typeof repeat !== "object" || repeat === null) {
        fail("step method repeat must be false or an object");
      }
      const repeatOptions = repeat as Record<string, unknown>;
      assertNonNegative(
        readNumber(repeatOptions, "delayMs", "repeat.delayMs"),
        "repeat.delayMs",
      );
      assertPositive(
        readNumber(repeatOptions, "intervalMs", "repeat.intervalMs"),
        "repeat.intervalMs",
      );
      return;
    }
    case "dwell":
      assertPositive(
        readNumber(candidate, "dwellDurationMs", "dwellDurationMs"),
        "dwellDurationMs",
      );
      assertOneOf(
        candidate.suspensionPolicy ?? "disarm",
        ["disarm", "continue"],
        "suspensionPolicy",
      );
      return;
    default:
      fail(`unknown scan method kind "${String(candidate.kind)}"`);
  }
}

/** True when a method advances the highlight on a timer of its own. */
export function isTimedMethod(
  method: ScanMethod,
): method is AutoScanMethod | InverseScanMethod {
  return method.kind === "auto" || method.kind === "inverse";
}
