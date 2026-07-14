import { describe, expect, it, vi } from "vitest";
import { manualClock, systemClock } from "./clock.ts";

describe("manual clock validation and ordering", () => {
  it("falls back to Date when performance timing is unavailable", () => {
    vi.stubGlobal("performance", undefined);
    vi.spyOn(Date, "now").mockReturnValue(1234);
    expect(systemClock().now()).toBe(1234);
  });

  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects invalid initial time %s",
    (value) => {
      expect(() => manualClock(value)).toThrow(/initial time.*finite/);
    },
  );

  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects invalid advances %s without changing time or pending work",
    (value) => {
      const clock = manualClock(10);
      const callback = vi.fn();
      clock.schedule(5, callback);
      expect(() => clock.advanceBy(value)).toThrow(/advanceBy/);
      expect(clock.now()).toBe(10);
      expect(clock.pending).toBe(1);
      expect(callback).not.toHaveBeenCalled();
    },
  );

  it("rejects backward movement and invalid scheduled delays", () => {
    const clock = manualClock(10);
    expect(() => clock.advanceTo(9)).toThrow(/backwards/);
    expect(() => clock.schedule(-1, vi.fn())).toThrow(/scheduled delay/);
    expect(() => clock.schedule(Number.NaN, vi.fn())).toThrow(
      /scheduled delay/,
    );
    expect(clock.now()).toBe(10);
    expect(clock.pending).toBe(0);
  });

  it("supports cancellation and equal-deadline insertion order", () => {
    const clock = manualClock();
    const calls: string[] = [];
    const cancel = clock.schedule(10, () => calls.push("cancelled"));
    cancel();
    cancel();
    clock.schedule(10, () => calls.push("first"));
    clock.schedule(10, () => calls.push("second"));
    clock.flush();
    expect(calls).toEqual(["first", "second"]);
    expect(clock.pending).toBe(0);
  });

  it("flushes only through its initial horizon", () => {
    const clock = manualClock();
    const calls: string[] = [];
    clock.schedule(10, () => {
      calls.push("first");
      clock.schedule(5, () => calls.push("later"));
    });
    clock.flush();
    expect(calls).toEqual(["first"]);
    expect(clock.now()).toBe(10);
    expect(clock.pending).toBe(1);
    clock.flush();
    expect(calls).toEqual(["first", "later"]);
    clock.flush();
    expect(clock.now()).toBe(15);
  });
});
