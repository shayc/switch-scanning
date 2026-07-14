import { describe, expect, it } from "vitest";
import { manualClock } from "../clock.ts";
import { createScanner } from "../scanner.ts";
import { autoScan, inverseScan, stepScan } from "../styles.ts";
import { createScannerFixture } from "../testing/index.ts";
import type { ScannerOptions, ScanNode } from "../types.ts";

const YES_NO: ScanNode[] = [
  { kind: "target", id: "yes", label: "Yes" },
  { kind: "target", id: "no", label: "No" },
];

const ABC: ScanNode[] = [
  { kind: "target", id: "a", label: "A" },
  { kind: "target", id: "b", label: "B" },
  { kind: "target", id: "c", label: "C" },
];

function build(
  options: Omit<ScannerOptions, "clock">,
  nodes: ScanNode[] = YES_NO,
) {
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
    scanner.start();
    scanner.input.press("primary");
    clock.advanceBy(100); // < 700, >= 80
    scanner.input.release("primary");
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
  });

  it("performs hold once and suppresses the tap", () => {
    const { clock, scanner, fixture } = build(options);
    scanner.start();
    scanner.input.press("primary");
    clock.advanceBy(700);
    expect(fixture.activations).toEqual(["yes"]);
    scanner.input.release("primary");
    expect(fixture.activations).toEqual(["yes"]);
  });

  it("rejects a press shorter than holdDurationMs", () => {
    const { clock, scanner } = build(options);
    scanner.start();
    scanner.input.press("primary");
    clock.advanceBy(50); // < 80
    scanner.input.release("primary");
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
  });
});

describe("performOn release with hold duration", () => {
  it("performs on release only when the hold duration is met", () => {
    const { clock, scanner } = build({
      style: stepScan(),
      switches: {
        next: { action: "next", performOn: "release", holdDurationMs: 100 },
      },
    });
    scanner.start();
    scanner.input.press("next");
    clock.advanceBy(50);
    scanner.input.release("next");
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
    scanner.input.press("next");
    clock.advanceBy(150);
    scanner.input.release("next");
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
  });
});

describe("gesture lifecycle origin", () => {
  const switches = {
    next: { action: "next" as const, performOn: "release" as const },
  };

  it("requires a fresh gesture after pause, disable, or command-only idle", () => {
    const paused = build({
      style: stepScan(),
      startOn: "command",
      switches,
    }).scanner;
    paused.start();
    paused.pause();
    paused.input.press("next");
    paused.resume();
    paused.input.release("next");
    expect(paused.getSnapshot().highlight).toMatchObject({ id: "yes" });

    const disabled = build({
      style: stepScan(),
      startOn: "switch",
      switches,
    }).scanner;
    disabled.input.press("next");
    disabled.setOptions({
      style: stepScan(),
      startOn: "switch",
      switches,
      enabled: false,
    });
    disabled.setOptions({
      style: stepScan(),
      startOn: "switch",
      switches,
      enabled: true,
    });
    disabled.input.release("next");
    expect(disabled.getSnapshot().status).toBe("idle");

    const inactive = build({
      style: stepScan(),
      startOn: "command",
      switches,
    }).scanner;
    inactive.input.press("next");
    inactive.start();
    inactive.input.release("next");
    expect(inactive.getSnapshot().highlight).toMatchObject({ id: "yes" });
  });
});

describe("press stabilization", () => {
  it("accepts a press-edge discrete action only after its hold duration", () => {
    const { clock, scanner } = build({
      style: stepScan(),
      switches: { next: { action: "next", holdDurationMs: 100 } },
    });
    scanner.start();
    scanner.input.press("next");
    clock.advanceBy(99);
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "yes" });
    clock.advanceBy(1);
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "no" });
    scanner.input.release("next");
  });

  it("accepts a phaseful scan only after its hold duration", () => {
    const { clock, scanner, fixture } = build({
      style: inverseScan({ intervalMs: 100, loops: "infinite" }),
      switches: { scan: { action: "scan", holdDurationMs: 50 } },
      startOn: "command",
    });
    scanner.start();
    scanner.input.press("scan");
    clock.advanceBy(49);
    scanner.input.release("scan");
    expect(fixture.activations).toEqual([]);

    scanner.input.press("scan");
    clock.advanceBy(50);
    scanner.input.release("scan");
    expect(fixture.activations).toEqual(["yes"]);
  });

  it("ignores duplicate press signals for one held source", () => {
    const { scanner } = build({
      style: stepScan(),
      switches: { next: { action: "next", performOn: "release" } },
    });
    scanner.start();
    scanner.input.press("next", "same");
    scanner.input.press("next", "same");
    scanner.input.release("next", "same");
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "no" });
  });
});

describe("ignore repeat", () => {
  it("rejects a second activation of the same switch inside the window", () => {
    const { clock, scanner } = build({
      style: stepScan(),
      switches: { next: { action: "next", ignoreRepeatMs: 200 } },
    });
    scanner.start();
    scanner.input.press("next");
    scanner.input.release("next");
    scanner.input.press("next");
    scanner.input.release("next");
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
    clock.advanceBy(200);
    scanner.input.press("next");
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
  });

  it("consumes a tap/hold gesture when its hold edge is repeat-blocked", () => {
    const { clock, scanner } = build({
      style: stepScan(),
      switches: {
        primary: {
          tap: "next",
          hold: { afterMs: 100, action: "previous" },
          ignoreRepeatMs: 1_000,
        },
      },
    });
    scanner.start();
    scanner.input.press("primary");
    scanner.input.release("primary");
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "no" });
    scanner.input.press("primary");
    clock.advanceBy(100);
    scanner.input.release("primary");
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "no" });
  });

  it("preserves suppression when a pause cancels the accepted contact", () => {
    const { clock, scanner } = build({
      style: stepScan(),
      startOn: "command",
      switches: {
        pause: { action: "togglePause", ignoreRepeatMs: 200 },
      },
    });
    scanner.start();

    scanner.input.press("pause", "key");
    expect(scanner.getSnapshot().status).toBe("paused");
    scanner.input.release("pause", "key");

    scanner.input.press("pause", "key");
    scanner.input.release("pause", "key");
    expect(scanner.getSnapshot().status).toBe("paused");

    clock.advanceBy(200);
    scanner.input.press("pause", "key");
    expect(scanner.getSnapshot().status).toBe("scanning");
  });

  it("preserves suppression when activation stops the scanner", () => {
    const { clock, scanner } = build({
      style: stepScan(),
      startOn: "switch",
      afterActivation: "stop",
      switches: {
        select: { action: "select", ignoreRepeatMs: 200 },
      },
    });
    scanner.start();

    scanner.input.press("select", "key");
    expect(scanner.getSnapshot().status).toBe("idle");
    scanner.input.release("select", "key");
    scanner.input.press("select", "key");
    expect(scanner.getSnapshot().status).toBe("idle");

    clock.advanceBy(200);
    scanner.input.press("select", "key-2");
    expect(scanner.getSnapshot().status).toBe("scanning");
  });

  it("preserves suppression when a loop completion tears down scanning", () => {
    const { clock, scanner } = build(
      {
        style: autoScan({ intervalMs: 100, loops: 1 }),
        startOn: "switch",
        switches: { next: { action: "next", ignoreRepeatMs: 200 } },
      },
      [{ kind: "target", id: "only", label: "Only" }],
    );
    scanner.start();

    scanner.input.press("next", "key");
    expect(scanner.getSnapshot().status).toBe("complete");
    scanner.input.release("next", "key");
    scanner.input.press("next", "key");
    expect(scanner.getSnapshot().status).toBe("complete");

    clock.advanceBy(200);
    scanner.input.press("next", "key-2");
    expect(scanner.getSnapshot().status).toBe("scanning");
  });
});

describe("move repeat", () => {
  it("repeats next while the owning source stays held", () => {
    const { clock, scanner } = build(
      {
        style: stepScan({ repeat: { delayMs: 500, intervalMs: 200 } }),
        switches: { next: { action: "next" } },
      },
      ABC,
    );
    scanner.start();
    scanner.input.press("next");
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "b",
    });
    clock.advanceBy(500);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "c",
    });
    clock.advanceBy(200);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "a",
    });
    scanner.input.release("next");
    clock.advanceBy(10000);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "a",
    });
  });

  for (const ending of ["release", "disconnect"] as const) {
    it(`stops tap/hold-owned repeat on ${ending}`, () => {
      const { clock, scanner } = build(
        {
          style: stepScan({ repeat: { delayMs: 200, intervalMs: 100 } }),
          switches: {
            primary: {
              tap: "select",
              hold: { afterMs: 100, action: "next" },
            },
          },
        },
        ABC,
      );
      scanner.start();
      scanner.input.press("primary", "source");
      clock.advanceBy(100);
      expect(scanner.getSnapshot()).toMatchObject({
        highlight: { id: "b" },
        pending: { kind: "advance" },
      });

      if (ending === "release") scanner.input.release("primary", "source");
      else scanner.input.disconnect("source");

      expect(scanner.getSnapshot().pending).toBeNull();
      clock.advanceBy(1_000);
      expect(scanner.getSnapshot().highlight).toMatchObject({ id: "b" });
    });
  }

  it("cancels the old repeat schedule when the scan style changes", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: stepScan({ repeat: { delayMs: 500, intervalMs: 200 } }),
      switches: { next: { action: "next" } },
      startOn: "command",
      clock,
    });
    createScannerFixture(scanner, ABC);
    scanner.start();
    scanner.input.press("next");

    scanner.setOptions({
      style: autoScan({ intervalMs: 1000, loops: "infinite" }),
      switches: { next: { action: "next" } },
      startOn: "command",
    });
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "a",
    });

    clock.advanceBy(500);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "a",
    });
    expect(clock.pending).toBe(1);
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
    scanner.input.press("scan", "sourceA");
    scanner.input.press("scan", "sourceB");
    scanner.input.release("scan", "sourceA");
    expect(fixture.activations).toEqual([]);
    scanner.input.release("scan", "sourceB");
    expect(fixture.activations).toEqual(["yes"]);
  });

  it("cancels advancement without selecting when the final source disconnects", () => {
    const { clock, scanner, fixture } = build(options);
    scanner.input.press("scan", "sourceA");
    clock.advanceBy(900);
    scanner.input.disconnect("sourceA");
    expect(fixture.activations).toEqual([]);
    expect(scanner.getSnapshot().status).toBe("scanning");
    clock.advanceBy(5000);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
  });

  it("preserves a held scan gesture across unrelated option changes", () => {
    const { scanner, fixture } = build(options);
    scanner.start();
    scanner.input.press("scan", "sourceA");

    scanner.setOptions({
      ...options,
      style: inverseScan({ intervalMs: 1200, loops: "infinite" }),
    });
    scanner.input.release("scan", "sourceA");

    expect(fixture.activations).toEqual(["yes"]);
  });

  it("cancels an accepted scan gesture when its definition changes", () => {
    const { clock, scanner, fixture } = build(options);
    scanner.start();
    scanner.input.press("scan", "sourceA");
    scanner.setOptions({
      style: inverseScan({ intervalMs: 900, loops: "infinite" }),
      switches: { scan: { action: "next" } },
      startOn: "switch",
    });
    scanner.input.release("scan", "sourceA");
    expect(fixture.activations).toEqual([]);
    expect(clock.pending).toBe(0);
  });

  it("resets an accepted scan gesture when pausing", () => {
    const { scanner, fixture } = build(options);
    scanner.start();
    scanner.input.press("scan", "sourceA");
    scanner.pause();
    scanner.input.release("scan", "sourceA");
    expect(fixture.activations).toEqual([]);
    expect(scanner.getSnapshot().status).toBe("paused");
  });
});

describe("definition replacement", () => {
  it("cancels held discrete repeat ownership when the definition changes", () => {
    const { clock, scanner } = build({
      style: stepScan({ repeat: { delayMs: 100, intervalMs: 50 } }),
      switches: { next: { action: "next" } },
    });
    scanner.start();
    scanner.input.press("next");
    scanner.setOptions({
      style: stepScan({ repeat: { delayMs: 100, intervalMs: 50 } }),
      switches: { next: { action: "previous" } },
    });
    clock.advanceBy(500);
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "no" });
  });

  it("preserves an equivalent held tap/hold definition", () => {
    const definition = {
      tap: "next" as const,
      hold: { afterMs: 100, action: "select" as const },
    };
    const { clock, scanner, fixture } = build({
      style: stepScan(),
      switches: { primary: definition },
    });
    scanner.start();
    scanner.input.press("primary");
    scanner.setOptions({
      style: stepScan(),
      switches: { primary: { ...definition, hold: { ...definition.hold } } },
    });
    clock.advanceBy(100);
    expect(fixture.activations).toEqual(["yes"]);
  });
});
