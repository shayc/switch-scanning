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
import type { ScanNode, ScannerOptions } from "./types.ts";

const YES_NO: ScanNode[] = [
  { kind: "target", id: "yes", label: "Yes" },
  { kind: "target", id: "no", label: "No" },
];

function build(
  options: Omit<ScannerOptions, "clock" | "scheduler">,
  nodes: ScanNode[],
) {
  const clock = manualClock();
  const scanner = createScanner({ ...options, clock });
  const fixture = createScannerFixture(scanner, nodes);
  const events = recordScannerEvents(scanner);
  return { clock, scanner, fixture, events };
}

describe("automatic scanning", () => {
  it("advances on the interval and activates the highlighted target (guide example)", () => {
    const { clock, scanner, fixture } = build(
      { style: autoScan({ intervalMs: 1000, loops: 3 }) },
      YES_NO,
    );
    scanner.start();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
    clock.advanceBy(1000);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
    scanner.select();
    expect(fixture.activations).toEqual(["no"]);
  });

  it("adds firstItemPauseMs only to the first candidate of each pass", () => {
    const { clock, scanner } = build(
      {
        style: autoScan({ intervalMs: 1000, loops: 3, firstItemPauseMs: 500 }),
      },
      YES_NO,
    );
    scanner.start();
    // First candidate waits interval + pause = 1500.
    clock.advanceBy(1400);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
    clock.advanceBy(100);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
    // Second candidate waits only the interval.
    clock.advanceBy(1000);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
    expect(scanner.getSnapshot().pass).toBe(2);
  });

  it("completes after the configured number of root passes", () => {
    const { clock, scanner, events } = build(
      { style: autoScan({ intervalMs: 100, loops: 2 }) },
      YES_NO,
    );
    scanner.start();
    // Two full yes/no passes complete on the next wrap.
    clock.advanceBy(100);
    clock.advanceBy(100);
    expect(scanner.getSnapshot().pass).toBe(2);
    clock.advanceBy(100);
    clock.advanceBy(100);
    expect(scanner.getSnapshot().status).toBe("complete");
    expect(scanner.getSnapshot().highlight).toBeNull();
    expect(events.ofType("scan.completed")).toEqual([
      { type: "scan.completed", reason: "loops" },
    ]);
  });

  it("emits scan.completed empty for an empty root", () => {
    const { scanner, events } = build(
      { style: autoScan({ intervalMs: 100, loops: 1 }) },
      [],
    );
    scanner.start();
    expect(scanner.getSnapshot().status).toBe("complete");
    expect(events.ofType("scan.completed")).toEqual([
      { type: "scan.completed", reason: "empty" },
    ]);
  });
});

describe("post-activation policy", () => {
  const options = (
    afterActivation: NonNullable<ScannerOptions["afterActivation"]>,
  ): ScannerOptions => ({
    style: autoScan({ intervalMs: 100, loops: 5 }),
    afterActivation,
  });

  it("restart returns to the first root candidate", () => {
    const { clock, scanner, fixture } = build(options("restart"), YES_NO);
    scanner.start();
    clock.advanceBy(100);
    scanner.select();
    expect(fixture.activations).toEqual(["no"]);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
  });

  it("continue advances within the current scope", () => {
    const { scanner } = build(options("continue"), YES_NO);
    scanner.start();
    scanner.select();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
  });

  it("stop enters idle and emits after-activation", () => {
    const { scanner, events } = build(options("stop"), YES_NO);
    scanner.start();
    scanner.select();
    expect(scanner.getSnapshot().status).toBe("idle");
    expect(events.ofType("scan.stopped")).toEqual([
      { type: "scan.stopped", reason: "after-activation" },
    ]);
  });

  it("keeps highlight and restarts timing when activation fails", () => {
    const { clock, scanner, fixture, events } = build(
      options("restart"),
      YES_NO,
    );
    fixture.failActivation("yes", "boom");
    scanner.start();
    scanner.select();
    expect(fixture.activations).toEqual([]);
    expect(events.ofType("target.activationFailed")[0]).toMatchObject({
      id: "yes",
      reason: "boom",
    });
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
    // Activation failure restarts the full deadline.
    clock.advanceBy(100);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
  });
});

describe("step scanning", () => {
  it("moves with next/previous and selects the current candidate", () => {
    const { scanner, fixture } = build({ style: stepScan() }, YES_NO);
    scanner.start();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
    scanner.next();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
    scanner.next();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
    scanner.previous();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
    scanner.select();
    expect(fixture.activations).toEqual(["no"]);
  });

  it("schedules no advancement deadline", () => {
    const { clock, scanner } = build({ style: stepScan() }, YES_NO);
    scanner.start();
    expect(clock.pending).toBe(0);
    clock.advanceBy(100000);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
  });

  it("clears observable repeat timing when the held switch releases", () => {
    const { clock, scanner } = build(
      {
        style: stepScan({ repeat: { delayMs: 100, intervalMs: 50 } }),
        switches: { next: { action: "next" } },
      },
      YES_NO,
    );
    scanner.start();
    scanner.input.press("next");
    expect(scanner.getSnapshot().pending).toMatchObject({ kind: "advance" });
    scanner.input.release("next");
    expect(scanner.getSnapshot().pending).toBeNull();
    expect(clock.pending).toBe(0);
  });
});

describe("single-switch step scanning", () => {
  it("selects the current candidate when the dwell expires", () => {
    const { clock, scanner, fixture } = build(
      {
        style: singleSwitchStepScan({ dwellTimeMs: 1500 }),
        switches: { next: { action: "next" } },
      },
      YES_NO,
    );
    scanner.start();
    scanner.next();
    clock.advanceBy(1499);
    expect(fixture.activations).toEqual([]);
    clock.advanceBy(1);
    expect(fixture.activations).toEqual(["no"]);
  });
});

describe("inverse scanning", () => {
  it("advances while held and selects on release", () => {
    const { clock, scanner, fixture } = build(
      {
        style: inverseScan({ intervalMs: 900, loops: "infinite" }),
        switches: { scan: { action: "scan" } },
        startOn: "switch",
      },
      YES_NO,
    );
    scanner.input.press("scan");
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
    clock.advanceBy(900);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
    scanner.input.release("scan");
    expect(fixture.activations).toEqual(["no"]);
  });

  it("selects the first candidate when released before any movement", () => {
    const { scanner, fixture } = build(
      {
        style: inverseScan({ intervalMs: 900, loops: "infinite" }),
        switches: { scan: { action: "scan" } },
        startOn: "switch",
      },
      YES_NO,
    );
    scanner.input.press("scan");
    scanner.input.release("scan");
    expect(fixture.activations).toEqual(["yes"]);
  });
});
