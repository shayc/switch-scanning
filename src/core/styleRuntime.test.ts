import { describe, expect, it, vi } from "vitest";
import { manualClock } from "./clock.ts";
import { autoScan, inverseScan, stepScan } from "./styles.ts";
import { createStyleRuntime } from "./styleRuntime.ts";

describe("style runtime", () => {
  it("executes automatic timing without knowing the scan tree", () => {
    const clock = manualClock();
    const advance = vi.fn();
    const runtime = createStyleRuntime({
      style: autoScan({ intervalMs: 100, loops: 2, firstItemPauseMs: 50 }),
      scheduler: clock,
      isScanning: () => true,
      advance,
      select: vi.fn(),
    });

    runtime.landed(true);
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
      scheduler: clock,
      isScanning: () => true,
      advance,
      select: vi.fn(),
    });

    runtime.landed(true);
    expect(clock.pending).toBe(0);
    runtime.scanPress("source", true);
    clock.advanceBy(100);
    expect(advance).toHaveBeenCalledOnce();
    expect(runtime.scanRelease("source")).toBe("closed");
  });

  it("owns step-repeat scheduling and release", () => {
    const clock = manualClock();
    const advance = vi.fn();
    const runtime = createStyleRuntime({
      style: stepScan({ repeat: { delayMs: 200, intervalMs: 50 } }),
      scheduler: clock,
      isScanning: () => true,
      advance,
      select: vi.fn(),
    });

    runtime.maybeStartRepeat(true, "source");
    clock.advanceBy(250);
    expect(advance).toHaveBeenCalledTimes(2);
    runtime.releaseRepeatOwner("source");
    clock.advanceBy(1000);
    expect(advance).toHaveBeenCalledTimes(2);
  });
});
