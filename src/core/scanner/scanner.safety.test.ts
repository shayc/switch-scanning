import { describe, expect, it } from "vitest";
import { manualClock } from "../shared/clock.ts";
import { autoScan, singleSwitchStepScan, stepScan } from "../styles/styles.ts";
import { createScannerFixture, recordScannerEvents } from "../testing/index.ts";
import type { Highlight, ScanNode } from "../types.ts";
import { createScanner } from "./scanner.ts";

const TARGETS: ScanNode[] = [
  { kind: "target", id: "yes", label: "Yes" },
  { kind: "target", id: "no", label: "No" },
];

describe("causal dwell selection", () => {
  it("consumes one navigation token and never autonomously rearms", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: singleSwitchStepScan({ dwellTimeMs: 100 }),
      switches: { next: { action: "next" } },
      clock,
    });
    const fixture = createScannerFixture(scanner, TARGETS);

    scanner.start();
    scanner.next();
    clock.advanceBy(100);
    expect(fixture.activations).toEqual(["no"]);

    clock.advanceBy(1_000);
    expect(fixture.activations).toEqual(["no"]);
    expect(scanner.getSnapshot().pending).toBeNull();
  });

  it("does not rearm after a group entry or activation failure", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: singleSwitchStepScan({ dwellTimeMs: 100 }),
      switches: { next: { action: "next" } },
      clock,
    });
    const fixture = createScannerFixture(scanner, [
      {
        kind: "group",
        id: "answers",
        label: "Answers",
        children: [{ kind: "target", id: "yes", label: "Yes" }],
      },
    ]);

    scanner.start();
    scanner.next();
    clock.advanceBy(100);
    expect(scanner.getSnapshot()).toMatchObject({
      path: ["answers"],
      highlight: { kind: "target", id: "yes" },
    });
    clock.advanceBy(1_000);
    expect(fixture.activations).toEqual([]);

    fixture.failActivation("yes");
    scanner.next();
    clock.advanceBy(100);
    expect(fixture.activations).toEqual([]);
    clock.advanceBy(1_000);
    expect(fixture.activations).toEqual([]);
  });

  it("does not preserve an armed dwell through tree reconciliation", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: singleSwitchStepScan({ dwellTimeMs: 100 }),
      clock,
    });
    const fixture = createScannerFixture(scanner, TARGETS);
    scanner.start();
    scanner.next();
    fixture.setNodes([
      ...TARGETS,
      { kind: "target", id: "maybe", label: "Maybe" },
    ]);
    clock.advanceBy(100);
    expect(fixture.activations).toEqual([]);
    expect(scanner.getSnapshot().pending).toBeNull();
  });

  it("does not preserve a paused dwell through tree reconciliation", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: singleSwitchStepScan({ dwellTimeMs: 100 }),
      clock,
    });
    const fixture = createScannerFixture(scanner, TARGETS);
    scanner.start();
    scanner.next();
    clock.advanceBy(40);
    scanner.pause();

    fixture.setNodes([...TARGETS]);
    scanner.resume();
    clock.advanceBy(1_000);

    expect(fixture.activations).toEqual([]);
    expect(scanner.getSnapshot().pending).toBeNull();
  });

  it("disarms an armed dwell on environment suspension while retaining the highlight", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: singleSwitchStepScan({ dwellTimeMs: 100 }),
      switches: { next: { action: "next" } },
      clock,
    });
    const fixture = createScannerFixture(scanner, TARGETS);

    scanner.start();
    scanner.next();
    clock.advanceBy(40);
    scanner.input.suspend();

    // The dwell is disarmed and the highlight stays put.
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { kind: "target", id: "no" },
      pending: null,
    });
    clock.advanceBy(1_000);
    expect(fixture.activations).toEqual([]);

    // A fresh navigation rearms; the dwell then selects normally.
    scanner.next();
    clock.advanceBy(100);
    expect(fixture.activations).toEqual(["yes"]);
  });

  it("also disarms a paused dwell on suspension", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: singleSwitchStepScan({ dwellTimeMs: 100 }),
      switches: { next: { action: "next" } },
      clock,
    });
    const fixture = createScannerFixture(scanner, TARGETS);

    scanner.start();
    scanner.next();
    clock.advanceBy(40);
    scanner.pause();
    scanner.input.suspend();
    scanner.resume();
    clock.advanceBy(1_000);

    expect(fixture.activations).toEqual([]);
    expect(scanner.getSnapshot().pending).toBeNull();
  });

  it("does not resume a paused dwell after changing to another style", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: singleSwitchStepScan({ dwellTimeMs: 100 }),
      clock,
    });
    const fixture = createScannerFixture(scanner, TARGETS);

    scanner.start();
    scanner.next();
    clock.advanceBy(40);
    scanner.pause();
    scanner.setOptions({ style: stepScan() });
    scanner.resume();
    clock.advanceBy(1_000);

    expect(scanner.getSnapshot().pending).toBeNull();
    expect(fixture.activations).toEqual([]);
  });

  it('keeps the pre-2026 behavior under suspensionPolicy "continue"', () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: singleSwitchStepScan({
        dwellTimeMs: 100,
        suspensionPolicy: "continue",
      }),
      switches: { next: { action: "next" } },
      clock,
    });
    const fixture = createScannerFixture(scanner, TARGETS);

    scanner.start();
    scanner.next();
    clock.advanceBy(40);
    scanner.input.suspend();
    clock.advanceBy(60);

    expect(fixture.activations).toEqual(["no"]);
  });
});

describe("selection transition coordinator", () => {
  it("publishes hidden transition state and resets the quiet-timing window on input", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: autoScan({
        intervalMs: 100,
        loops: 3,
        transitionTimeMs: 40,
      }),
      switches: { select: { action: "select" } },
      selectionDelay: { durationMs: 60 },
      clock,
    });
    createScannerFixture(scanner, TARGETS);

    scanner.start();
    scanner.select();
    expect(scanner.getSnapshot()).toMatchObject({
      status: "transitioning",
      highlight: null,
      pending: { kind: "transition", startedAt: 0, dueAt: 60 },
      position: { index: 0, count: 2 },
    });

    clock.advanceBy(20);
    scanner.input.press("select");
    scanner.input.release("select");
    expect(scanner.getSnapshot().pending).toEqual({
      kind: "transition",
      startedAt: 20,
      dueAt: 80,
    });

    clock.advanceBy(59);
    expect(scanner.getSnapshot().status).toBe("transitioning");
    clock.advanceBy(1);
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { kind: "target", id: "yes" },
      pending: { kind: "advance", startedAt: 80, dueAt: 180 },
    });
  });

  it("keeps pending timestamps stable while a fixed deadline dominates", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: autoScan({
        intervalMs: 100,
        loops: 3,
        transitionTimeMs: 100,
      }),
      switches: { select: { action: "select" } },
      selectionDelay: { durationMs: 50 },
      clock,
    });
    createScannerFixture(scanner, TARGETS);
    scanner.start();
    scanner.select();
    const initial = scanner.getSnapshot().pending;
    clock.advanceBy(10);
    scanner.input.press("select");
    expect(scanner.getSnapshot().pending).toEqual(initial);
  });

  it("suppresses a gesture begun during transition through release", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: stepScan(),
      switches: {
        next: { action: "next", performOn: "release" },
        select: { action: "select" },
      },
      selectionDelay: { durationMs: 50 },
      clock,
    });
    createScannerFixture(scanner, TARGETS);
    scanner.start();
    scanner.select();
    scanner.input.press("next");
    clock.advanceBy(50);
    expect(scanner.getSnapshot().status).toBe("scanning");
    scanner.input.release("next");
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
  });

  it("lets a switch pause a transition and requires a fresh gesture to resume", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: stepScan(),
      switches: { pause: { action: "togglePause" } },
      selectionDelay: { durationMs: 50 },
      clock,
    });
    createScannerFixture(scanner, TARGETS);
    scanner.start();
    scanner.select();

    scanner.input.press("pause");
    expect(scanner.getSnapshot().status).toBe("paused");
    scanner.input.release("pause");
    clock.advanceBy(100);
    expect(scanner.getSnapshot().status).toBe("paused");

    scanner.input.press("pause");
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { kind: "target", id: "yes" },
    });
  });

  it("does not let a release gesture cross a lifecycle boundary to toggle pause", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: stepScan(),
      switches: {
        pause: { action: "togglePause", performOn: "release" },
      },
      selectionDelay: { durationMs: 50 },
      clock,
    });
    createScannerFixture(scanner, TARGETS);
    scanner.start();
    scanner.select();
    scanner.input.press("pause");
    clock.advanceBy(50);
    scanner.input.release("pause");
    expect(scanner.getSnapshot().status).toBe("scanning");

    scanner.input.press("pause");
    scanner.select();
    scanner.input.release("pause");
    expect(scanner.getSnapshot().status).toBe("transitioning");
  });
});

describe("safe configuration and lifecycle", () => {
  it("requires a declared back action for back-only group exits", () => {
    expect(() =>
      createScanner({ style: stepScan(), groupExit: "back-only" }),
    ).toThrow(/declared switch mapped to "back"/);

    expect(() =>
      createScanner({
        style: stepScan(),
        groupExit: "back-only",
        switches: {
          primary: {
            tap: "next",
            hold: { afterMs: 500, action: "back" },
          },
        },
      }),
    ).not.toThrow();
  });

  it("leaves active state untouched when an option update is rejected", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: autoScan({ intervalMs: 100, loops: 2 }),
      clock,
    });
    createScannerFixture(scanner, TARGETS);
    scanner.start();
    const before = scanner.getSnapshot();
    const pendingCount = clock.pending;

    expect(() =>
      scanner.setOptions({
        style: stepScan(),
        groupExit: "back-only",
      }),
    ).toThrow();
    expect(scanner.getSnapshot()).toBe(before);
    expect(clock.pending).toBe(pendingCount);
  });

  it("makes idle stop silent and dispose snapshots accurate", () => {
    const scanner = createScanner({ style: stepScan() });
    const events = recordScannerEvents(scanner);
    scanner.stop();
    expect(events.events).toEqual([]);

    createScannerFixture(scanner, TARGETS);
    scanner.start();
    scanner.dispose();
    expect(scanner.getSnapshot()).toEqual({
      status: "idle",
      highlight: null,
      path: [],
      pass: 0,
      position: null,
      pending: null,
    });
  });

  it("rejects a second host and clears the owning host on detach", () => {
    const scanner = createScanner({ style: stepScan() });
    const first: Highlight[] = [];
    const second: Highlight[] = [];
    const attachment = scanner.attachHost({
      activate: () => ({ activated: true }),
      reveal: (highlight) => first.push(highlight),
    });
    const rejected = scanner.attachHost({
      activate: () => ({ activated: true }),
      reveal: (highlight) => second.push(highlight),
    });
    expect(attachment.attached).toBe(true);
    expect(rejected.attached).toBe(false);
    scanner.setTree({
      kind: "group",
      id: "root",
      label: "Root",
      children: TARGETS,
    });
    scanner.start();
    expect(first.at(-1)).toEqual({ kind: "target", id: "yes" });
    expect(second).toEqual([]);
    attachment.detach();
    attachment.detach();
    expect(first.at(-1)).toBeNull();
    expect(scanner.getSnapshot().highlight).toBeNull();
  });
});
