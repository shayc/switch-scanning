import { describe, expect, it } from "vitest";
import { manualClock } from "./clock.ts";
import { createScanner } from "./scanner.ts";
import { inverseScan, stepScan } from "./styles.ts";
import { createScannerFixture } from "./testing/index.ts";
import type { ScannerOptions, ScanNode } from "./types.ts";

const YES_NO: ScanNode[] = [
  { kind: "target", id: "yes", label: "Yes" },
  { kind: "target", id: "no", label: "No" },
];

function build(options: Omit<ScannerOptions, "clock">, nodes: ScanNode[] = YES_NO) {
  const clock = manualClock();
  const scanner = createScanner({ ...options, clock });
  const fixture = createScannerFixture(scanner, nodes);
  return { clock, scanner, fixture };
}

describe("tap versus hold", () => {
  const options: Omit<ScannerOptions, "clock"> = {
    style: stepScan(),
    switches: {
      primary: {
        tap: "next",
        hold: { afterMs: 700, action: "select" },
        holdDurationMs: 80,
        ignoreRepeatMs: 0,
      },
    },
  };

  it("performs tap once on release before the hold threshold", () => {
    const { clock, scanner } = build(options);
    scanner.start(); // yes
    scanner.input.press("primary");
    clock.advanceBy(100); // < 700, >= 80
    scanner.input.release("primary");
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "no" });
  });

  it("performs hold once and suppresses the tap", () => {
    const { clock, scanner, fixture } = build(options);
    scanner.start(); // yes
    scanner.input.press("primary");
    clock.advanceBy(700); // hold threshold -> select
    expect(fixture.activations).toEqual(["yes"]);
    scanner.input.release("primary"); // only closes the gesture
    expect(fixture.activations).toEqual(["yes"]);
  });

  it("rejects a press shorter than holdDurationMs", () => {
    const { clock, scanner } = build(options);
    scanner.start();
    scanner.input.press("primary");
    clock.advanceBy(50); // < 80
    scanner.input.release("primary");
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
  });
});

describe("performOn release with hold duration", () => {
  it("performs on release only when the hold duration is met", () => {
    const { clock, scanner } = build({
      style: stepScan(),
      switches: { next: { action: "next", performOn: "release", holdDurationMs: 100 } },
    });
    scanner.start();
    scanner.input.press("next");
    clock.advanceBy(50);
    scanner.input.release("next"); // too short -> nothing
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
    scanner.input.press("next");
    clock.advanceBy(150);
    scanner.input.release("next"); // long enough -> next
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "no" });
  });
});

describe("ignore repeat", () => {
  it("rejects a second activation of the same switch inside the window", () => {
    const { clock, scanner } = build({
      style: stepScan(),
      switches: { next: { action: "next", ignoreRepeatMs: 200 } },
    });
    scanner.start(); // yes
    scanner.input.press("next"); // -> no
    scanner.input.release("next");
    scanner.input.press("next"); // within window -> rejected
    scanner.input.release("next");
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "no" });
    clock.advanceBy(200);
    scanner.input.press("next"); // window elapsed -> wrap to yes
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
  });
});

describe("move repeat", () => {
  it("repeats next while the owning source stays held", () => {
    const abc: ScanNode[] = [
      { kind: "target", id: "a", label: "A" },
      { kind: "target", id: "b", label: "B" },
      { kind: "target", id: "c", label: "C" },
    ];
    const { clock, scanner } = build(
      {
        style: stepScan({ repeat: { delayMs: 500, intervalMs: 200 } }),
        switches: { next: { action: "next" } },
      },
      abc,
    );
    scanner.start(); // a
    scanner.input.press("next"); // -> b immediately
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "b" });
    clock.advanceBy(500); // delay -> c
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "c" });
    clock.advanceBy(200); // interval -> wrap to a
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "a" });
    scanner.input.release("next"); // stop repeating
    clock.advanceBy(10000);
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "a" });
  });
});

describe("multi-source phaseful scan", () => {
  const options: Omit<ScannerOptions, "clock"> = {
    style: inverseScan({ intervalMs: 900, loops: "infinite" }),
    switches: { scan: { action: "scan" } },
    startOn: "switch",
  };

  it("opens on the first press and closes on the final release", () => {
    const { scanner, fixture } = build(options);
    scanner.input.press("scan", "sourceA"); // start + hold
    scanner.input.press("scan", "sourceB"); // no extra edge
    scanner.input.release("scan", "sourceA"); // still held by B
    expect(fixture.activations).toEqual([]);
    scanner.input.release("scan", "sourceB"); // final release -> select
    expect(fixture.activations).toEqual(["yes"]);
  });

  it("cancels advancement without selecting when the final source disconnects", () => {
    const { clock, scanner, fixture } = build(options);
    scanner.input.press("scan", "sourceA");
    clock.advanceBy(900); // -> no
    scanner.input.disconnect("sourceA");
    expect(fixture.activations).toEqual([]);
    expect(scanner.getSnapshot().status).toBe("scanning");
    clock.advanceBy(5000); // no further movement
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "no" });
  });

  it("preserves a held scan gesture across unrelated option changes", () => {
    const { clock, scanner, fixture } = build(options);
    scanner.start();
    scanner.input.press("scan", "sourceA");

    scanner.setOptions({
      ...options,
      style: inverseScan({ intervalMs: 1200, loops: "infinite" }),
      clock,
    });
    scanner.input.release("scan", "sourceA");

    expect(fixture.activations).toEqual(["yes"]);
  });
});
