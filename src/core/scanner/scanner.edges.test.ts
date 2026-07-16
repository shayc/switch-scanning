import { describe, expect, it } from "vitest";
import { manualClock } from "../shared/clock.ts";
import {
  autoScan,
  inverseScan,
  dwellScan,
  stepScan,
} from "../methods/methods.ts";
import { createScannerFixture, recordScannerEvents } from "../testing/index.ts";
import type { ScannerBehaviorOptions, ScannerOptions } from "../types.ts";
import { createScanner } from "./scanner.ts";

const TARGET = { kind: "target" as const, id: "x", label: "X" };

describe("scanner boundaries", () => {
  it("diagnoses unknown switches and missing hosts", () => {
    const scanner = createScanner({ method: stepScan() });
    const events = recordScannerEvents(scanner);
    scanner.input.press("missing");
    scanner.setTree({
      kind: "group",
      id: "root",
      label: "Root",
      children: [TARGET],
    });
    scanner.start();
    scanner.select();
    expect(events.ofType("diagnostic").map((event) => event.code)).toContain(
      "unknown-switch-binding",
    );
    expect(events.ofType("target.activationFailed")[0]?.reason).toBe(
      "no host attached",
    );
  });

  it("converts a throwing host activation into a failure event", () => {
    const scanner = createScanner({ method: stepScan() });
    const events = recordScannerEvents(scanner);
    scanner.attachHost({
      activate: () => {
        throw new Error("host exploded");
      },
    });
    scanner.setTree({
      kind: "group",
      id: "root",
      label: "Root",
      children: [TARGET],
    });
    scanner.start();
    scanner.select();
    expect(events.ofType("target.activationFailed")[0]?.reason).toBe(
      "host exploded",
    );
  });

  it("supports the repeat post-activation policy", () => {
    const scanner = createScanner({
      method: stepScan(),
      afterActivation: "repeat",
    });
    const fixture = createScannerFixture(scanner, [TARGET]);
    scanner.start();
    scanner.select();
    scanner.select();
    expect(fixture.activations).toEqual(["x", "x"]);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "x",
    });
  });
});

describe("option and lifecycle edges", () => {
  it("rejects invalid group-exit and selection-delay values", () => {
    expect(() =>
      createScanner({
        method: stepScan(),
        groupExit: "none",
      } as unknown as ScannerOptions),
    ).toThrow(/groupExit must be/);
    expect(() =>
      createScanner({
        method: stepScan(),
        selectionDelay: { durationMs: -1 },
      }),
    ).toThrow(/selectionDelay.durationMs/);
  });

  it("validates structural methods and enum-like options at runtime", () => {
    expect(() =>
      createScanner({ method: { kind: "auto" } } as unknown as ScannerOptions),
    ).toThrow(/intervalMs/);
    expect(() =>
      createScanner({
        method: {
          kind: "auto",
          intervalMs: -1,
          passes: 1,
          firstItemPauseMs: 0,
          transitionDurationMs: 0,
        },
      } as unknown as ScannerOptions),
    ).toThrow(/intervalMs/);
    expect(() =>
      createScanner({
        method: { kind: "step" },
      } as unknown as ScannerOptions),
    ).toThrow(/repeat/);
    expect(() =>
      createScanner({
        method: stepScan(),
        startOn: "later",
      } as unknown as ScannerOptions),
    ).toThrow(/startOn/);
    expect(() =>
      createScanner({
        method: stepScan(),
        afterActivation: "advance",
      } as unknown as ScannerOptions),
    ).toThrow(/afterActivation/);
    expect(() =>
      createScanner({
        method: stepScan(),
        enabled: "yes",
      } as unknown as ScannerOptions),
    ).toThrow(/enabled/);
    expect(() =>
      createScanner({
        method: stepScan(),
        selectionDelay: { durationMs: 1, resetOnInput: "yes" },
      } as unknown as ScannerOptions),
    ).toThrow(/resetOnInput/);
  });

  it("accepts separately paired clock and scheduler ports", () => {
    const time = manualClock();
    const scanner = createScanner({
      method: stepScan(),
      clock: { now: () => time.now() },
      scheduler: {
        schedule: (delay, callback) => time.schedule(delay, callback),
      },
    });
    expect(scanner.getSnapshot().status).toBe("idle");
  });

  it("rejects creation-only timing infrastructure in behavior updates", () => {
    const clock = manualClock();
    const scanner = createScanner({ method: stepScan(), clock });
    expect(() =>
      scanner.setOptions({
        method: autoScan({ intervalMs: 10, passes: 1 }),
        clock,
      } as unknown as ScannerBehaviorOptions),
    ).toThrow(/creation-only/);
    expect(scanner.getSnapshot().status).toBe("idle");
  });

  it("disables active scanning but leaves idle disable silent", () => {
    const clock = manualClock();
    const scanner = createScanner({
      method: autoScan({ intervalMs: 10, passes: 2 }),
      clock,
    });
    createScannerFixture(scanner, [TARGET]);
    const events = recordScannerEvents(scanner);
    scanner.start();
    scanner.setOptions({
      method: autoScan({ intervalMs: 10, passes: 2 }),
      enabled: false,
    });
    expect(scanner.getSnapshot().status).toBe("idle");
    expect(clock.pending).toBe(0);
    expect(events.ofType("scan.stopped").at(-1)?.reason).toBe("disabled");

    events.clear();
    scanner.setOptions({ method: stepScan(), enabled: false });
    expect(events.events).toEqual([]);
  });

  it("reconciles method changes while scanning, paused, and transitioning", () => {
    const clock = manualClock();
    const scanner = createScanner({
      method: autoScan({ intervalMs: 100, passes: 2 }),
      selectionDelay: { durationMs: 50 },
      clock,
    });
    createScannerFixture(scanner, [TARGET]);
    const events = recordScannerEvents(scanner);
    scanner.start();
    scanner.setOptions({ method: stepScan() });
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      position: { index: 0, count: 1 },
      pending: null,
    });

    scanner.pause();
    scanner.setOptions({
      method: dwellScan({ dwellDurationMs: 20 }),
    });
    expect(scanner.getSnapshot().status).toBe("paused");
    scanner.resume();
    expect(scanner.getSnapshot().pending).toBeNull();

    scanner.setOptions({
      method: stepScan(),
      selectionDelay: { durationMs: 50 },
    });
    scanner.select();
    expect(scanner.getSnapshot().status).toBe("transitioning");
    events.clear();
    scanner.setOptions({
      method: inverseScan({ intervalMs: 20, passes: 2 }),
    });
    expect(scanner.getSnapshot().status).toBe("scanning");
    expect(events.ofType("scan.transitionEnded")).toHaveLength(1);
  });

  it("keeps the paused snapshot coherent across a method-kind change", () => {
    const clock = manualClock();
    const scanner = createScanner({
      method: autoScan({ intervalMs: 100, passes: 5 }),
      startOn: "manual",
      switches: { next: { action: "next" } },
      clock,
    });
    createScannerFixture(scanner, [
      { kind: "target", id: "a", label: "A" },
      { kind: "target", id: "b", label: "B" },
      { kind: "target", id: "c", label: "C" },
    ]);
    scanner.start();
    scanner.input.press("next");
    scanner.input.release("next");
    scanner.input.press("next");
    scanner.input.release("next");
    expect(scanner.getSnapshot()).toMatchObject({
      highlight: { id: "c" },
      position: { index: 2, count: 3 },
    });

    scanner.pause();
    scanner.setOptions({ method: stepScan() });

    // The retained highlight must still match its reported position while
    // paused; deferring the scope reset keeps the two in agreement.
    expect(scanner.getSnapshot()).toMatchObject({
      status: "paused",
      highlight: { id: "c" },
      position: { index: 2, count: 3 },
    });

    // Resume performs the deferred reset, re-presenting the new method at the
    // start of the scope.
    scanner.resume();
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { id: "a" },
      position: { index: 0, count: 3 },
    });
  });

  it("clears a switch's ignore-repeat window when its definition changes", () => {
    const scanner = createScanner({
      method: stepScan(),
      startOn: "manual",
      switches: { next: { action: "next", ignoreRepeatMs: 10_000 } },
    });
    createScannerFixture(scanner, [
      { kind: "target", id: "a", label: "A" },
      { kind: "target", id: "b", label: "B" },
      { kind: "target", id: "c", label: "C" },
    ]);
    scanner.start();
    scanner.input.press("next");
    scanner.input.release("next");
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "b" });

    // The long window suppresses the second activation.
    scanner.input.press("next");
    scanner.input.release("next");
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "b" });

    // Correcting the window must take effect at once, not after the stale 10s.
    scanner.setOptions({
      method: stepScan(),
      switches: { next: { action: "next", ignoreRepeatMs: 100 } },
    });
    scanner.input.press("next");
    scanner.input.release("next");
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "c" });
  });

  it("handles transition pause/resume both before and after expiry", () => {
    const clock = manualClock();
    const scanner = createScanner({
      method: stepScan(),
      selectionDelay: { durationMs: 50 },
      clock,
    });
    createScannerFixture(scanner, [TARGET]);
    scanner.start();
    const events = recordScannerEvents(scanner);
    scanner.select();
    scanner.pause();
    clock.advanceBy(20);
    scanner.resume();
    expect(scanner.getSnapshot().status).toBe("transitioning");
    scanner.pause();
    clock.advanceBy(100);
    events.clear();
    scanner.resume();
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { kind: "target", id: "x" },
    });
    expect(events.events.map((event) => event.type)).toEqual([
      "scan.resumed",
      "scan.transitionEnded",
      "highlight.changed",
    ]);
  });

  it("emits group.exited when reconciliation drops an entered scope", () => {
    const scanner = createScanner({ method: stepScan() });
    const fixture = createScannerFixture(scanner, [
      {
        kind: "group",
        id: "row",
        label: "Row",
        children: [TARGET],
      },
      { kind: "target", id: "other", label: "Other" },
    ]);
    const events = recordScannerEvents(scanner);
    scanner.start();
    scanner.select();
    events.clear();

    fixture.setNodes([{ kind: "target", id: "other", label: "Other" }]);

    expect(events.ofType("group.exited")).toMatchObject([
      { type: "group.exited", id: "row", label: "Row", reason: "reconcile" },
    ]);
  });

  it("dispose cancels every pending scanner deadline", () => {
    const clock = manualClock();
    const scanner = createScanner({
      method: autoScan({ intervalMs: 100, passes: "infinite" }),
      clock,
    });
    createScannerFixture(scanner, [TARGET]);
    scanner.start();
    expect(clock.pending).toBeGreaterThan(0);

    scanner.dispose();

    expect(clock.pending).toBe(0);
  });

  it("ignores all mutation ports after disposal", () => {
    const scanner = createScanner({ method: stepScan() });
    scanner.dispose();
    scanner.pause();
    scanner.resume();
    scanner.restart();
    scanner.next();
    scanner.previous();
    scanner.select();
    scanner.back();
    scanner.setOptions({ method: autoScan({ intervalMs: 10, passes: 1 }) });
    scanner.setTree({
      kind: "group",
      id: "root",
      label: "Root",
      children: [TARGET],
    });
    scanner.input.press("x");
    scanner.input.release("x");
    scanner.input.disconnect();
    scanner.dispose();
    scanner.start();
    expect(scanner.getSnapshot()).toMatchObject({
      status: "idle",
      highlight: null,
      position: null,
      pending: null,
    });
  });

  it("diagnoses toggle pause outside its applicable states", () => {
    const scanner = createScanner({
      method: stepScan(),
      startOn: "manual",
      switches: { pause: { action: "togglePause" } },
    });
    const events = recordScannerEvents(scanner);
    scanner.input.press("pause");
    expect(events.ofType("diagnostic").at(-1)?.code).toBe(
      "command-inapplicable",
    );
  });
});
