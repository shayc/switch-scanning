import { describe, expect, it } from "vitest";
import { manualClock } from "./clock.ts";
import { createScanner } from "./scanner.ts";
import {
  autoScan,
  inverseScan,
  singleSwitchStepScan,
  stepScan,
} from "./styles.ts";
import { createScannerFixture, recordScannerEvents } from "./testing/index.ts";
import type { ScannerBehaviorOptions, ScannerOptions } from "./types.ts";

const TARGET = { kind: "target" as const, id: "x", label: "X" };

describe("scanner boundaries", () => {
  it("diagnoses unknown switches and missing hosts", () => {
    const scanner = createScanner({ style: stepScan() });
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
    const scanner = createScanner({ style: stepScan() });
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
      style: stepScan(),
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
        style: stepScan(),
        groupExit: "none",
      } as unknown as ScannerOptions),
    ).toThrow(/groupExit must be/);
    expect(() =>
      createScanner({
        style: stepScan(),
        selectionDelay: { durationMs: -1 },
      }),
    ).toThrow(/selectionDelay.durationMs/);
  });

  it("validates structural styles and enum-like options at runtime", () => {
    expect(() =>
      createScanner({ style: { kind: "auto" } } as unknown as ScannerOptions),
    ).toThrow(/intervalMs/);
    expect(() =>
      createScanner({
        style: {
          kind: "auto",
          intervalMs: -1,
          loops: 1,
          firstItemPauseMs: 0,
          transitionTimeMs: 0,
        },
      } as unknown as ScannerOptions),
    ).toThrow(/intervalMs/);
    expect(() =>
      createScanner({
        style: { kind: "step" },
      } as unknown as ScannerOptions),
    ).toThrow(/repeat/);
    expect(() =>
      createScanner({
        style: stepScan(),
        startOn: "later",
      } as unknown as ScannerOptions),
    ).toThrow(/startOn/);
    expect(() =>
      createScanner({
        style: stepScan(),
        afterActivation: "advance",
      } as unknown as ScannerOptions),
    ).toThrow(/afterActivation/);
    expect(() =>
      createScanner({
        style: stepScan(),
        enabled: "yes",
      } as unknown as ScannerOptions),
    ).toThrow(/enabled/);
    expect(() =>
      createScanner({
        style: stepScan(),
        selectionDelay: { durationMs: 1, resetOnInput: "yes" },
      } as unknown as ScannerOptions),
    ).toThrow(/resetOnInput/);
  });

  it("accepts separately paired clock and scheduler ports", () => {
    const time = manualClock();
    const scanner = createScanner({
      style: stepScan(),
      clock: { now: () => time.now() },
      scheduler: {
        schedule: (delay, callback) => time.schedule(delay, callback),
      },
    });
    expect(scanner.getSnapshot().status).toBe("idle");
  });

  it("rejects creation-only timing infrastructure in behavior updates", () => {
    const clock = manualClock();
    const scanner = createScanner({ style: stepScan(), clock });
    expect(() =>
      scanner.setOptions({
        style: autoScan({ intervalMs: 10, loops: 1 }),
        clock,
      } as unknown as ScannerBehaviorOptions),
    ).toThrow(/creation-only/);
    expect(scanner.getSnapshot().status).toBe("idle");
  });

  it("disables active scanning but leaves idle disable silent", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: autoScan({ intervalMs: 10, loops: 2 }),
      clock,
    });
    createScannerFixture(scanner, [TARGET]);
    const events = recordScannerEvents(scanner);
    scanner.start();
    scanner.setOptions({
      style: autoScan({ intervalMs: 10, loops: 2 }),
      enabled: false,
    });
    expect(scanner.getSnapshot().status).toBe("idle");
    expect(clock.pending).toBe(0);
    expect(events.ofType("scan.stopped").at(-1)?.reason).toBe("disabled");

    events.clear();
    scanner.setOptions({ style: stepScan(), enabled: false });
    expect(events.events).toEqual([]);
  });

  it("reconciles style changes while scanning, paused, and transitioning", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: autoScan({ intervalMs: 100, loops: 2 }),
      selectionDelay: { durationMs: 50 },
      clock,
    });
    createScannerFixture(scanner, [TARGET]);
    scanner.start();
    scanner.setOptions({ style: stepScan() });
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      position: { index: 0, count: 1 },
      pending: null,
    });

    scanner.pause();
    scanner.setOptions({
      style: singleSwitchStepScan({ dwellTimeMs: 20 }),
    });
    expect(scanner.getSnapshot().status).toBe("paused");
    scanner.resume();
    expect(scanner.getSnapshot().pending).toBeNull();

    scanner.setOptions({
      style: stepScan(),
      selectionDelay: { durationMs: 50 },
    });
    scanner.select();
    expect(scanner.getSnapshot().status).toBe("transitioning");
    scanner.setOptions({
      style: inverseScan({ intervalMs: 20, loops: 2 }),
    });
    expect(scanner.getSnapshot().status).toBe("scanning");
  });

  it("handles transition pause/resume both before and after expiry", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: stepScan(),
      selectionDelay: { durationMs: 50 },
      clock,
    });
    createScannerFixture(scanner, [TARGET]);
    scanner.start();
    scanner.select();
    scanner.pause();
    clock.advanceBy(20);
    scanner.resume();
    expect(scanner.getSnapshot().status).toBe("transitioning");
    scanner.pause();
    clock.advanceBy(100);
    scanner.resume();
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { kind: "target", id: "x" },
    });
  });

  it("ignores all mutation ports after disposal", () => {
    const scanner = createScanner({ style: stepScan() });
    scanner.dispose();
    scanner.pause();
    scanner.resume();
    scanner.restart();
    scanner.next();
    scanner.previous();
    scanner.select();
    scanner.back();
    scanner.setOptions({ style: autoScan({ intervalMs: 10, loops: 1 }) });
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
      style: stepScan(),
      startOn: "command",
      switches: { pause: { action: "togglePause" } },
    });
    const events = recordScannerEvents(scanner);
    scanner.input.press("pause");
    expect(events.ofType("diagnostic").at(-1)?.code).toBe(
      "command-inapplicable",
    );
  });
});
