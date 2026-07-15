/**
 * Style constructors return frozen, tagged, serializable data — not objects
 * with behavior. The runtime switches on `kind`, and eager validation makes a
 * misconfigured access method fail at creation rather than mid-session.
 */

import {
  assertNonNegative,
  assertPositive,
  fail,
  readNumber,
} from "./validate.ts";

/** How many passes a timed scope makes before completing. */
export type LoopLimit = number | "infinite";

/** Timed style: the highlight advances automatically on an interval. */
export interface AutoScanStyle {
  readonly kind: "auto";
  readonly intervalMs: number;
  readonly loops: LoopLimit;
  readonly firstItemPauseMs: number;
  /** Additional recovery time before automatic scanning resumes after selection. */
  readonly transitionTimeMs: number;
}

/** Auto-repeat timing for a held step switch. */
export interface StepScanRepeat {
  readonly delayMs: number;
  readonly intervalMs: number;
}

/** Manual style: each switch action advances one step. */
export interface StepScanStyle {
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

/** Single-switch style: press advances; dwelling on an item selects it. */
export interface SingleSwitchStepScanStyle {
  readonly kind: "singleStep";
  readonly dwellTimeMs: number;
  readonly suspensionPolicy: DwellSuspensionPolicy;
}

/** Hold-to-scan style: the highlight advances while a switch is held and selects on release. */
export interface InverseScanStyle {
  readonly kind: "inverse";
  readonly intervalMs: number;
  readonly loops: LoopLimit;
  readonly firstItemPauseMs: number;
}

/** Any scan style produced by a style constructor. */
export type ScanStyle =
  AutoScanStyle | StepScanStyle | SingleSwitchStepScanStyle | InverseScanStyle;

/** Options for {@link autoScan}. */
export interface AutoScanOptions {
  intervalMs: number;
  loops: LoopLimit;
  firstItemPauseMs?: number;
  transitionTimeMs?: number;
}

/** Options for {@link stepScan}. */
export interface StepScanOptions {
  repeat?: false | StepScanRepeat;
}

/** Options for {@link singleSwitchStepScan}. */
export interface SingleSwitchStepScanOptions {
  dwellTimeMs: number;
  /** How an armed dwell reacts to environment suspension. Defaults to `"disarm"`. */
  suspensionPolicy?: DwellSuspensionPolicy;
}

/** Options for {@link inverseScan}. */
export interface InverseScanOptions {
  intervalMs: number;
  loops: LoopLimit;
  firstItemPauseMs?: number;
}

function assertSuspensionPolicy(
  value: unknown,
): asserts value is DwellSuspensionPolicy {
  if (value !== "disarm" && value !== "continue") {
    fail(
      `suspensionPolicy must be "disarm" or "continue" (received ${String(value)})`,
    );
  }
}

function assertLoops(loops: LoopLimit): void {
  if (loops === "infinite") return;
  if (!Number.isInteger(loops) || loops <= 0) {
    fail(
      `loops must be "infinite" or a positive integer (received ${String(loops)})`,
    );
  }
}

/** Create an auto-scan style: the highlight advances automatically on a timer. */
export function autoScan(options: AutoScanOptions): AutoScanStyle {
  assertPositive(options.intervalMs, "intervalMs");
  assertLoops(options.loops);
  const firstItemPauseMs = options.firstItemPauseMs ?? 0;
  const transitionTimeMs = options.transitionTimeMs ?? 0;
  assertNonNegative(firstItemPauseMs, "firstItemPauseMs");
  assertNonNegative(transitionTimeMs, "transitionTimeMs");
  return Object.freeze({
    kind: "auto",
    intervalMs: options.intervalMs,
    loops: options.loops,
    firstItemPauseMs,
    transitionTimeMs,
  });
}

/** Create a step-scan style: each switch action advances one step. */
export function stepScan(options: StepScanOptions = {}): StepScanStyle {
  const repeat = options.repeat ?? false;
  if (repeat !== false) {
    assertNonNegative(repeat.delayMs, "repeat.delayMs");
    assertPositive(repeat.intervalMs, "repeat.intervalMs");
    return Object.freeze({
      kind: "step",
      repeat: Object.freeze({
        delayMs: repeat.delayMs,
        intervalMs: repeat.intervalMs,
      }),
    });
  }
  return Object.freeze({ kind: "step", repeat: false as const });
}

/** Create a single-switch step-scan style: press advances; dwelling on an item selects it. */
export function singleSwitchStepScan(
  options: SingleSwitchStepScanOptions,
): SingleSwitchStepScanStyle {
  assertPositive(options.dwellTimeMs, "dwellTimeMs");
  const suspensionPolicy = options.suspensionPolicy ?? "disarm";
  assertSuspensionPolicy(suspensionPolicy);
  return Object.freeze({
    kind: "singleStep",
    dwellTimeMs: options.dwellTimeMs,
    suspensionPolicy,
  });
}

/** Create an inverse-scan style: the highlight advances while a switch is held and selects on release. */
export function inverseScan(options: InverseScanOptions): InverseScanStyle {
  assertPositive(options.intervalMs, "intervalMs");
  assertLoops(options.loops);
  const firstItemPauseMs = options.firstItemPauseMs ?? 0;
  assertNonNegative(firstItemPauseMs, "firstItemPauseMs");
  return Object.freeze({
    kind: "inverse",
    intervalMs: options.intervalMs,
    loops: options.loops,
    firstItemPauseMs,
  });
}

/** @internal Validate structurally supplied style data at the scanner boundary. */
export function assertScanStyle(style: unknown): asserts style is ScanStyle {
  if (typeof style !== "object" || style === null) {
    fail("style must be created with a scan style constructor");
  }

  const candidate = style as Record<string, unknown>;
  switch (candidate.kind) {
    case "auto":
      assertPositive(
        readNumber(candidate, "intervalMs", "intervalMs"),
        "intervalMs",
      );
      assertLoops(candidate.loops as LoopLimit);
      assertNonNegative(
        readNumber(candidate, "firstItemPauseMs", "firstItemPauseMs"),
        "firstItemPauseMs",
      );
      assertNonNegative(
        readNumber(candidate, "transitionTimeMs", "transitionTimeMs"),
        "transitionTimeMs",
      );
      return;
    case "step": {
      const repeat = candidate.repeat;
      if (repeat === false) return;
      if (typeof repeat !== "object" || repeat === null) {
        fail("step style repeat must be false or an object");
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
    case "singleStep":
      assertPositive(
        readNumber(candidate, "dwellTimeMs", "dwellTimeMs"),
        "dwellTimeMs",
      );
      assertSuspensionPolicy(candidate.suspensionPolicy ?? "disarm");
      return;
    case "inverse":
      assertPositive(
        readNumber(candidate, "intervalMs", "intervalMs"),
        "intervalMs",
      );
      assertLoops(candidate.loops as LoopLimit);
      assertNonNegative(
        readNumber(candidate, "firstItemPauseMs", "firstItemPauseMs"),
        "firstItemPauseMs",
      );
      return;
    default:
      fail(`unknown scan style kind "${String(candidate.kind)}"`);
  }
}

/** True when a style advances the highlight on a timer of its own. */
export function isTimedStyle(
  style: ScanStyle,
): style is AutoScanStyle | InverseScanStyle {
  return style.kind === "auto" || style.kind === "inverse";
}
