/**
 * Style constructors return frozen, tagged, serializable data — not objects
 * with behavior. The runtime switches on `kind`, and eager validation makes a
 * misconfigured access method fail at creation rather than mid-session.
 */

export type LoopLimit = number | "infinite";

export interface AutoScanStyle {
  readonly kind: "auto";
  readonly intervalMs: number;
  readonly loops: LoopLimit;
  readonly firstItemPauseMs: number;
  /** Additional recovery time before automatic scanning resumes after selection. */
  readonly transitionTimeMs: number;
}

export interface StepScanRepeat {
  readonly delayMs: number;
  readonly intervalMs: number;
}

export interface StepScanStyle {
  readonly kind: "step";
  readonly repeat: false | StepScanRepeat;
}

export interface SingleSwitchStepScanStyle {
  readonly kind: "singleStep";
  readonly dwellTimeMs: number;
}

export interface InverseScanStyle {
  readonly kind: "inverse";
  readonly intervalMs: number;
  readonly loops: LoopLimit;
  readonly firstItemPauseMs: number;
}

export type ScanStyle =
  AutoScanStyle | StepScanStyle | SingleSwitchStepScanStyle | InverseScanStyle;

export interface AutoScanOptions {
  intervalMs: number;
  loops: LoopLimit;
  firstItemPauseMs?: number;
  transitionTimeMs?: number;
}

export interface StepScanOptions {
  repeat?: false | StepScanRepeat;
}

export interface SingleSwitchStepScanOptions {
  dwellTimeMs: number;
}

export interface InverseScanOptions {
  intervalMs: number;
  loops: LoopLimit;
  firstItemPauseMs?: number;
}

function fail(message: string): never {
  throw new RangeError(`[switch-scanning] ${message}`);
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    fail(`${name} must be a finite number greater than 0 (received ${value})`);
  }
}

function assertNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    fail(`${name} must be a finite number >= 0 (received ${value})`);
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

export function singleSwitchStepScan(
  options: SingleSwitchStepScanOptions,
): SingleSwitchStepScanStyle {
  assertPositive(options.dwellTimeMs, "dwellTimeMs");
  return Object.freeze({
    kind: "singleStep",
    dwellTimeMs: options.dwellTimeMs,
  });
}

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

/** True when a style advances the highlight on a timer of its own. */
export function isTimedStyle(
  style: ScanStyle,
): style is AutoScanStyle | InverseScanStyle {
  return style.kind === "auto" || style.kind === "inverse";
}
