import { describe, expect, it } from "vitest";
import {
  autoScan,
  inverseScan,
  dwellScan,
  stepScan,
} from "../methods/methods.ts";
import { createTestScanner, recordScannerEvents } from "../testing/index.ts";
import type { ScanNode, ScannerOptions } from "../types.ts";
import { createScanner } from "./scanner.ts";

const YES_NO: ScanNode[] = [
  { kind: "target", id: "yes", label: "Yes" },
  { kind: "target", id: "no", label: "No" },
];

describe("automatic scanning", () => {
  // Mirrors the automatic-scanning example from the guide.
  it("advances on the interval and activates the highlighted target", () => {
    const { clock, scanner, fixture } = createTestScanner(
      { method: autoScan({ intervalMs: 1000, passes: 3 }) },
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
    const { clock, scanner } = createTestScanner(
      {
        method: autoScan({
          intervalMs: 1000,
          passes: 3,
          firstItemPauseMs: 500,
        }),
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
    const { clock, scanner, events } = createTestScanner(
      { method: autoScan({ intervalMs: 100, passes: 2 }) },
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
    expect(events.ofType("scan.completed")).toMatchObject([
      { type: "scan.completed", reason: "passes" },
    ]);
  });

  it("emits scan.completed empty for an empty root", () => {
    const { scanner, events } = createTestScanner(
      { method: autoScan({ intervalMs: 100, passes: 1 }) },
      [],
    );
    scanner.start();
    expect(scanner.getSnapshot().status).toBe("complete");
    expect(events.ofType("scan.completed")).toMatchObject([
      { type: "scan.completed", reason: "empty" },
    ]);
  });
});

describe("post-activation policy", () => {
  const options = (
    afterActivation: NonNullable<ScannerOptions["afterActivation"]>,
  ): ScannerOptions => ({
    method: autoScan({ intervalMs: 100, passes: 5 }),
    afterActivation,
  });

  it("restart returns to the first root candidate", () => {
    const { clock, scanner, fixture } = createTestScanner(
      options("restart"),
      YES_NO,
    );
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
    const { scanner } = createTestScanner(options("continue"), YES_NO);
    scanner.start();
    scanner.select();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
  });

  it("stop enters idle and emits after-activation", () => {
    const { scanner, events } = createTestScanner(options("stop"), YES_NO);
    scanner.start();
    scanner.select();
    expect(scanner.getSnapshot().status).toBe("idle");
    expect(events.ofType("scan.stopped")).toMatchObject([
      { type: "scan.stopped", reason: "after-activation" },
    ]);
  });

  it("completes when restart finds that activation disabled the root", () => {
    const target = {
      kind: "target" as const,
      id: "only",
      label: "Only",
      disabled: false,
    };
    const scanner = createScanner({
      method: stepScan(),
      afterActivation: "restart",
      startOn: "manual",
    });
    const events = recordScannerEvents(scanner);
    scanner.attachHost({
      activate: () => {
        target.disabled = true;
        return { activated: true };
      },
    });
    scanner.setTree({
      kind: "group",
      id: "root",
      label: "Root",
      children: [target],
    });

    scanner.start();
    scanner.select();

    expect(scanner.getSnapshot()).toMatchObject({
      status: "complete",
      highlight: null,
      position: null,
    });
    expect(events.ofType("scan.completed")).toMatchObject([
      { type: "scan.completed", reason: "empty" },
    ]);
  });

  it("keeps highlight and restarts timing when activation fails", () => {
    const { clock, scanner, fixture, events } = createTestScanner(
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
    const { scanner, fixture } = createTestScanner(
      { method: stepScan() },
      YES_NO,
    );
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
    const { clock, scanner } = createTestScanner(
      { method: stepScan() },
      YES_NO,
    );
    scanner.start();
    expect(clock.pending).toBe(0);
    clock.advanceBy(100000);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
  });

  it("clears observable repeat timing when the held switch releases", () => {
    const { clock, scanner } = createTestScanner(
      {
        method: stepScan({ repeat: { delayMs: 100, intervalMs: 50 } }),
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

  it("halts held movement when a zero-delay selection lands", () => {
    const { clock, scanner } = createTestScanner(
      {
        method: stepScan({ repeat: { delayMs: 100, intervalMs: 50 } }),
        switches: {
          next: { action: "next" },
          select: { action: "select" },
        },
        selectionDelay: { durationMs: 0 },
      },
      YES_NO,
    );
    scanner.start();
    scanner.input.press("next", "move");
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "no" });

    scanner.input.press("select", "choose");
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "yes" });
    clock.advanceBy(1_000);
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "yes" });
  });
});

describe("dwell scanning", () => {
  it("selects the current candidate when the dwell expires", () => {
    const { clock, scanner, fixture } = createTestScanner(
      {
        method: dwellScan({ dwellDurationMs: 1500 }),
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

  it("freezes an armed dwell while paused and resumes its remaining time", () => {
    const { clock, scanner, fixture } = createTestScanner(
      { method: dwellScan({ dwellDurationMs: 1000 }) },
      YES_NO,
    );
    scanner.start();
    scanner.next();
    clock.advanceBy(300);

    scanner.pause();
    expect(scanner.getSnapshot()).toMatchObject({
      status: "paused",
      pending: null,
    });
    expect(clock.pending).toBe(0);

    scanner.resume();
    clock.advanceBy(699);
    expect(fixture.activations).toEqual([]);
    clock.advanceBy(1);
    expect(fixture.activations).toEqual(["no"]);
  });

  it("supports the auditory pause-on-highlight recipe without losing dwell", () => {
    const { clock, scanner, fixture } = createTestScanner(
      { method: dwellScan({ dwellDurationMs: 1000 }) },
      YES_NO,
    );
    scanner.observe((event) => {
      if (event.type !== "highlight.changed" || event.current === null) return;
      scanner.pause();
    });
    const finishSpeech = () => scanner.resume();

    scanner.start();
    expect(scanner.getSnapshot().status).toBe("paused");
    finishSpeech();

    scanner.next();
    expect(scanner.getSnapshot().status).toBe("paused");
    expect(clock.pending).toBe(0);

    finishSpeech();
    clock.advanceBy(1000);
    expect(fixture.activations).toEqual(["no"]);
  });
});

describe("inverse scanning", () => {
  it("advances while held and selects on release", () => {
    const { clock, scanner, fixture } = createTestScanner(
      {
        method: inverseScan({ intervalMs: 900, passes: "infinite" }),
        switches: { scan: { action: "scan" } },
        startOn: "input",
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
    const { scanner, fixture } = createTestScanner(
      {
        method: inverseScan({ intervalMs: 900, passes: "infinite" }),
        switches: { scan: { action: "scan" } },
        startOn: "input",
      },
      YES_NO,
    );
    scanner.input.press("scan");
    scanner.input.release("scan");
    expect(fixture.activations).toEqual(["yes"]);
  });
});
