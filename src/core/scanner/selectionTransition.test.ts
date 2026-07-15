import { describe, expect, it } from "vitest";
import {
  createSelectionTransitionTiming,
  isSelectionTransitionDue,
  resetSelectionTransitionQuietDueAt,
  selectionTransitionDueAt,
} from "./selectionTransition.ts";

describe("selection transition timing", () => {
  it("omits a transition when neither wait is configured", () => {
    expect(
      createSelectionTransitionTiming({
        now: 10,
        fixedDurationMs: 0,
        quietDurationMs: 0,
        resetOnInput: true,
      }),
    ).toBeNull();
  });

  it("uses the later fixed or quiet deadline", () => {
    const timing = createSelectionTransitionTiming({
      now: 10,
      fixedDurationMs: 80,
      quietDurationMs: 40,
      resetOnInput: true,
    })!;
    expect(selectionTransitionDueAt(timing)).toBe(90);
    expect(isSelectionTransitionDue(timing, 89)).toBe(false);
    expect(isSelectionTransitionDue(timing, 90)).toBe(true);
  });

  it("resets only an enabled nonzero quiet window", () => {
    const resetting = createSelectionTransitionTiming({
      now: 0,
      fixedDurationMs: 100,
      quietDurationMs: 50,
      resetOnInput: true,
    })!;
    expect(resetSelectionTransitionQuietDueAt(resetting, 80)).toBe(130);

    const fixed = { ...resetting, resetOnInput: false };
    expect(resetSelectionTransitionQuietDueAt(fixed, 80)).toBe(50);
  });
});
