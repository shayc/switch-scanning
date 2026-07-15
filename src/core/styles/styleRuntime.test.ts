import { describe, expect, it, vi } from "vitest";
import { manualClock } from "../shared/clock.ts";
import { autoScan, inverseScan, stepScan } from "./styles.ts";
import { createStyleRuntime } from "./styleRuntime.ts";

describe("style runtime", () => {
  it("executes automatic timing without knowing the scan tree", () => {
    const clock = manualClock();
    const advance = vi.fn();
    const runtime = createStyleRuntime({
      style: autoScan({ intervalMs: 100, loops: 2, firstItemPauseMs: 50 }),
      clock,
      scheduler: clock,
      isScanning: () => true,
      advance,
      repeat: vi.fn(),
      select: vi.fn(),
    });

    runtime.landed({ firstOfPass: true, armDwell: true });
    clock.advanceBy(149);
    expect(advance).not.toHaveBeenCalled();
    clock.advanceBy(1);
    expect(advance).toHaveBeenCalledOnce();
  });

  it("opens and closes an inverse scan phase", () => {
    const clock = manualClock();
    const advance = vi.fn();
    const runtime = createStyleRuntime({
      style: inverseScan({ intervalMs: 100, loops: "infinite" }),
      clock,
      scheduler: clock,
      isScanning: () => true,
      advance,
      repeat: vi.fn(),
      select: vi.fn(),
    });

    runtime.landed({ firstOfPass: true, armDwell: true });
    expect(clock.pending).toBe(0);
    runtime.scanPress("source", true);
    clock.advanceBy(100);
    expect(advance).toHaveBeenCalledOnce();
    expect(runtime.scanRelease("source")).toBe("closed");
  });

  it("owns step-repeat scheduling and release", () => {
    const clock = manualClock();
    const advance = vi.fn();
    const repeat = vi.fn();
    const runtime = createStyleRuntime({
      style: stepScan({ repeat: { delayMs: 200, intervalMs: 50 } }),
      clock,
      scheduler: clock,
      isScanning: () => true,
      advance,
      repeat,
      select: vi.fn(),
    });

    runtime.maybeStartRepeat("previous", true, "source");
    clock.advanceBy(250);
    expect(repeat).toHaveBeenCalledTimes(2);
    expect(repeat).toHaveBeenNthCalledWith(1, "previous");
    runtime.releaseRepeatOwner("source");
    clock.advanceBy(1000);
    expect(repeat).toHaveBeenCalledTimes(2);
  });
});
