import { describe, expect, it } from "vitest";
import {
  autoScan,
  inverseScan,
  isTimedStyle,
  singleSwitchStepScan,
  stepScan,
} from "./styles.ts";

describe("isTimedStyle", () => {
  it("identifies only styles that advance on their own timer", () => {
    expect(isTimedStyle(autoScan({ intervalMs: 100, loops: 2 }))).toBe(true);
    expect(isTimedStyle(inverseScan({ intervalMs: 100, loops: 2 }))).toBe(true);
    expect(isTimedStyle(stepScan())).toBe(false);
    expect(isTimedStyle(singleSwitchStepScan({ dwellTimeMs: 100 }))).toBe(
      false,
    );
  });
});
