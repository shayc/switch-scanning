/** Pure timing state for the quiet/fixed window after a selection. */
export interface SelectionTransitionTiming {
  readonly fixedDueAt: number;
  readonly quietDueAt: number;
  readonly quietDurationMs: number;
  readonly resetOnInput: boolean;
}

/** Build transition timing, or `null` when both configured waits are zero. */
export function createSelectionTransitionTiming(options: {
  now: number;
  fixedDurationMs: number;
  quietDurationMs: number;
  resetOnInput: boolean;
}): SelectionTransitionTiming | null {
  const { now, fixedDurationMs, quietDurationMs, resetOnInput } = options;
  if (fixedDurationMs === 0 && quietDurationMs === 0) return null;
  return {
    fixedDueAt: now + fixedDurationMs,
    quietDueAt: now + quietDurationMs,
    quietDurationMs,
    resetOnInput,
  };
}

/** The scanner waits for the later of fixed recovery and input quiet time. */
export function selectionTransitionDueAt(
  timing: SelectionTransitionTiming,
): number {
  return Math.max(timing.fixedDueAt, timing.quietDueAt);
}

/** Compute the quiet deadline after new input without mutating transition state. */
export function resetSelectionTransitionQuietDueAt(
  timing: SelectionTransitionTiming,
  now: number,
): number {
  return timing.resetOnInput && timing.quietDurationMs > 0
    ? now + timing.quietDurationMs
    : timing.quietDueAt;
}

/** Whether the effective transition deadline has elapsed. */
export function isSelectionTransitionDue(
  timing: SelectionTransitionTiming,
  now: number,
): boolean {
  return selectionTransitionDueAt(timing) <= now;
}
