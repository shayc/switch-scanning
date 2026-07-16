import { describe, expect, it } from "vitest";
import {
  assertScanMethod,
  autoScan,
  inverseScan,
  isTimedMethod,
  dwellScan,
  stepScan,
} from "./methods.ts";

describe("isTimedMethod", () => {
  it("identifies only methods that advance on their own timer", () => {
    expect(isTimedMethod(autoScan({ intervalMs: 100, passes: 2 }))).toBe(true);
    expect(isTimedMethod(inverseScan({ intervalMs: 100, passes: 2 }))).toBe(
      true,
    );
    expect(isTimedMethod(stepScan())).toBe(false);
    expect(isTimedMethod(dwellScan({ dwellDurationMs: 100 }))).toBe(false);
  });
});

describe("method constructor validation", () => {
  it("accepts valid timing, including a finite or infinite pass limit", () => {
    expect(() => autoScan({ intervalMs: 1, passes: 1 })).not.toThrow();
    expect(() =>
      autoScan({ intervalMs: 100, passes: "infinite" }),
    ).not.toThrow();
    expect(() =>
      autoScan({ intervalMs: 100, passes: 3, firstItemPauseMs: 0 }),
    ).not.toThrow();
    expect(() => dwellScan({ dwellDurationMs: 1 })).not.toThrow();
    expect(() =>
      stepScan({ repeat: { delayMs: 0, intervalMs: 1 } }),
    ).not.toThrow();
  });

  it("rejects a non-positive, non-finite, or NaN interval", () => {
    for (const intervalMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => autoScan({ intervalMs, passes: 2 })).toThrow(RangeError);
      expect(() => inverseScan({ intervalMs, passes: 2 })).toThrow(RangeError);
    }
  });

  it("rejects a non-positive-integer pass limit", () => {
    for (const passes of [0, -1, 1.5, Number.NaN] as const) {
      expect(() => autoScan({ intervalMs: 100, passes })).toThrow(RangeError);
    }
  });

  it("rejects a negative first-item pause and transition time", () => {
    expect(() =>
      autoScan({ intervalMs: 100, passes: 2, firstItemPauseMs: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      autoScan({ intervalMs: 100, passes: 2, transitionDurationMs: -1 }),
    ).toThrow(RangeError);
  });

  it("rejects a non-positive dwell time and an unknown suspension policy", () => {
    for (const dwellDurationMs of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => dwellScan({ dwellDurationMs })).toThrow(RangeError);
    }
    expect(() =>
      dwellScan({
        dwellDurationMs: 100,
        // @ts-expect-error exercising a runtime guard against a bad value
        suspensionPolicy: "nope",
      }),
    ).toThrow(RangeError);
  });

  it("rejects step auto-repeat with a negative delay or non-positive interval", () => {
    expect(() =>
      stepScan({ repeat: { delayMs: -1, intervalMs: 100 } }),
    ).toThrow(RangeError);
    expect(() => stepScan({ repeat: { delayMs: 0, intervalMs: 0 } })).toThrow(
      RangeError,
    );
  });

  it("rejects structurally invalid method data at the scanner boundary", () => {
    expect(() => assertScanMethod(null)).toThrow(RangeError);
    expect(() => assertScanMethod({})).toThrow(RangeError);
    expect(() => assertScanMethod({ kind: "mystery" })).toThrow(RangeError);
    expect(() => assertScanMethod({ kind: "auto", passes: 2 })).toThrow(
      RangeError,
    );
  });
});
