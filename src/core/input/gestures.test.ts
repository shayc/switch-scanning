import { describe, expect, it } from "vitest";
import { manualClock } from "../shared/clock.ts";
import { createScanner } from "../scanner/scanner.ts";
import { autoScan, inverseScan, stepScan } from "../methods/methods.ts";
import {
  createScannerFixture,
  createTestScanner,
  recordScannerEvents,
} from "../testing/index.ts";
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

describe("tap versus hold", () => {
  const options: Omit<ScannerOptions, "clock"> = {
    method: stepScan(),
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
    const { clock, scanner } = createTestScanner(options, YES_NO);
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
    const { clock, scanner, fixture } = createTestScanner(options, YES_NO);
    scanner.start();
    scanner.input.press("primary");
    clock.advanceBy(700);
    expect(fixture.activations).toEqual(["yes"]);
    scanner.input.release("primary");
    expect(fixture.activations).toEqual(["yes"]);
  });

  it("rejects a press shorter than holdDurationMs", () => {
    const { clock, scanner } = createTestScanner(options, YES_NO);
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
    const { clock, scanner } = createTestScanner(
      {
        method: stepScan(),
        switches: {
          next: { action: "next", performOn: "release", holdDurationMs: 100 },
        },
      },
      YES_NO,
    );
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
    const paused = createTestScanner(
      {
        method: stepScan(),
        startOn: "manual",
        switches,
      },
      YES_NO,
    ).scanner;
    paused.start();
    paused.pause();
    paused.input.press("next");
    paused.resume();
    paused.input.release("next");
    expect(paused.getSnapshot().highlight).toMatchObject({ id: "yes" });

    const disabled = createTestScanner(
      {
        method: stepScan(),
        startOn: "input",
        switches,
      },
      YES_NO,
    ).scanner;
    disabled.input.press("next");
    disabled.setOptions({
      method: stepScan(),
      startOn: "input",
      switches,
      enabled: false,
    });
    disabled.setOptions({
      method: stepScan(),
      startOn: "input",
      switches,
      enabled: true,
    });
    disabled.input.release("next");
    expect(disabled.getSnapshot().status).toBe("idle");

    const inactive = createTestScanner(
      {
        method: stepScan(),
        startOn: "manual",
        switches,
      },
      YES_NO,
    ).scanner;
    inactive.input.press("next");
    inactive.start();
    inactive.input.release("next");
    expect(inactive.getSnapshot().highlight).toMatchObject({ id: "yes" });
  });
});

describe("press stabilization", () => {
  it("accepts a press-edge discrete action only after its hold duration", () => {
    const { clock, scanner } = createTestScanner(
      {
        method: stepScan(),
        switches: { next: { action: "next", holdDurationMs: 100 } },
      },
      YES_NO,
    );
    scanner.start();
    scanner.input.press("next");
    clock.advanceBy(99);
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "yes" });
    clock.advanceBy(1);
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "no" });
    scanner.input.release("next");
  });

  it("accepts a phaseful scan only after its hold duration", () => {
    const { clock, scanner, fixture } = createTestScanner(
      {
        method: inverseScan({ intervalMs: 100, passes: "infinite" }),
        switches: { scan: { action: "scan", holdDurationMs: 50 } },
        startOn: "manual",
      },
      YES_NO,
    );
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
    const { scanner } = createTestScanner(
      {
        method: stepScan(),
        switches: { next: { action: "next", performOn: "release" } },
      },
      YES_NO,
    );
    scanner.start();
    scanner.input.press("next", "same");
    scanner.input.press("next", "same");
    scanner.input.release("next", "same");
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "no" });
  });
});

describe("ignore repeat", () => {
  it("rejects a second activation of the same switch inside the window", () => {
    const { clock, scanner } = createTestScanner(
      {
        method: stepScan(),
        switches: { next: { action: "next", ignoreRepeatMs: 200 } },
      },
      YES_NO,
    );
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
    const { clock, scanner } = createTestScanner(
      {
        method: stepScan(),
        switches: {
          primary: {
            tap: "next",
            hold: { afterMs: 100, action: "previous" },
            ignoreRepeatMs: 1_000,
          },
        },
      },
      YES_NO,
    );
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
    const { clock, scanner } = createTestScanner(
      {
        method: stepScan(),
        startOn: "manual",
        switches: {
          pause: { action: "togglePause", ignoreRepeatMs: 200 },
        },
      },
      YES_NO,
    );
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
    const { clock, scanner } = createTestScanner(
      {
        method: stepScan(),
        startOn: "input",
        afterActivation: "stop",
        switches: {
          select: { action: "select", ignoreRepeatMs: 200 },
        },
      },
      YES_NO,
    );
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

  it("preserves suppression when pass completion tears down scanning", () => {
    const { clock, scanner } = createTestScanner(
      {
        method: autoScan({ intervalMs: 100, passes: 1 }),
        startOn: "input",
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
    const { clock, scanner } = createTestScanner(
      {
        method: stepScan({ repeat: { delayMs: 500, intervalMs: 200 } }),
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
      const { clock, scanner } = createTestScanner(
        {
          method: stepScan({ repeat: { delayMs: 200, intervalMs: 100 } }),
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

  it("cancels the old repeat schedule when the scan method changes", () => {
    const clock = manualClock();
    const scanner = createScanner({
      method: stepScan({ repeat: { delayMs: 500, intervalMs: 200 } }),
      switches: { next: { action: "next" } },
      startOn: "manual",
      clock,
    });
    createScannerFixture(scanner, ABC);
    scanner.start();
    scanner.input.press("next");

    scanner.setOptions({
      method: autoScan({ intervalMs: 1000, passes: "infinite" }),
      switches: { next: { action: "next" } },
      startOn: "manual",
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
    method: inverseScan({ intervalMs: 900, passes: "infinite" }),
    switches: { scan: { action: "scan" } },
    startOn: "input",
  };

  it("opens on the first press and closes on the final release", () => {
    const { scanner, fixture } = createTestScanner(options, YES_NO);
    scanner.input.press("scan", "sourceA");
    scanner.input.press("scan", "sourceB");
    scanner.input.release("scan", "sourceA");
    expect(fixture.activations).toEqual([]);
    scanner.input.release("scan", "sourceB");
    expect(fixture.activations).toEqual(["yes"]);
  });

  it("cancels advancement without selecting when the final source disconnects", () => {
    const { clock, scanner, fixture } = createTestScanner(options, YES_NO);
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
    const { scanner, fixture } = createTestScanner(options, YES_NO);
    scanner.start();
    scanner.input.press("scan", "sourceA");

    scanner.setOptions({
      ...options,
      method: inverseScan({ intervalMs: 1200, passes: "infinite" }),
    });
    scanner.input.release("scan", "sourceA");

    expect(fixture.activations).toEqual(["yes"]);
  });

  it("cancels an accepted scan gesture when its definition changes", () => {
    const { clock, scanner, fixture } = createTestScanner(options, YES_NO);
    scanner.start();
    scanner.input.press("scan", "sourceA");
    scanner.setOptions({
      method: inverseScan({ intervalMs: 900, passes: "infinite" }),
      switches: { scan: { action: "next" } },
      startOn: "input",
    });
    scanner.input.release("scan", "sourceA");
    expect(fixture.activations).toEqual([]);
    expect(clock.pending).toBe(0);
  });

  it("resets an accepted scan gesture when pausing", () => {
    const { scanner, fixture } = createTestScanner(options, YES_NO);
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
    const { clock, scanner } = createTestScanner(
      {
        method: stepScan({ repeat: { delayMs: 100, intervalMs: 50 } }),
        switches: { next: { action: "next" } },
      },
      YES_NO,
    );
    scanner.start();
    scanner.input.press("next");
    scanner.setOptions({
      method: stepScan({ repeat: { delayMs: 100, intervalMs: 50 } }),
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
    const { clock, scanner, fixture } = createTestScanner(
      {
        method: stepScan(),
        switches: { primary: definition },
      },
      YES_NO,
    );
    scanner.start();
    scanner.input.press("primary");
    scanner.setOptions({
      method: stepScan(),
      switches: { primary: { ...definition, hold: { ...definition.hold } } },
    });
    clock.advanceBy(100);
    expect(fixture.activations).toEqual(["yes"]);
  });
});

describe("input-phase events", () => {
  const TAP_HOLD: Omit<ScannerOptions, "clock"> = {
    method: stepScan(),
    switches: {
      primary: { tap: "next", hold: { afterMs: 700, action: "select" } },
    },
  };

  it("describes the pending recognition on input.pressed", () => {
    const { scanner } = createTestScanner(
      {
        method: stepScan(),
        switches: {
          tapHold: { tap: "next", hold: { afterMs: 700, action: "select" } },
          onRelease: {
            action: "select",
            performOn: "release",
            holdDurationMs: 100,
          },
          stabilized: { action: "next", holdDurationMs: 80 },
          instant: { action: "next" },
        },
      },
      YES_NO,
    );
    const events = recordScannerEvents(scanner);
    scanner.start();

    for (const switchId of ["tapHold", "onRelease", "stabilized", "instant"]) {
      scanner.input.press(switchId);
      scanner.input.disconnect(switchId);
    }

    expect(
      events.ofType("input.pressed").map((event) => event.recognition),
    ).toEqual([
      {
        kind: "tapHold",
        holdAfterMs: 700,
        tapAction: "next",
        holdAction: "select",
      },
      { kind: "hold", holdDurationMs: 100, action: "select" },
      { kind: "stabilize", holdDurationMs: 80 },
      { kind: "immediate" },
    ]);
  });

  it("reports heldMs on release and ignores duplicate presses", () => {
    const { clock, scanner } = createTestScanner(TAP_HOLD, YES_NO);
    const events = recordScannerEvents(scanner);
    scanner.start();

    scanner.input.press("primary");
    scanner.input.press("primary");
    clock.advanceBy(150);
    scanner.input.release("primary");

    expect(events.ofType("input.pressed")).toHaveLength(1);
    expect(events.ofType("input.released")).toMatchObject([
      { switchId: "primary", sourceId: "primary", heldMs: 150, at: 150 },
    ]);
  });

  it("cancels held contacts on disconnect, suspend, pause, and redefinition", () => {
    const { scanner } = createTestScanner(TAP_HOLD, YES_NO);
    const events = recordScannerEvents(scanner);
    scanner.start();

    scanner.input.press("primary", "wired");
    scanner.input.disconnect("wired");

    scanner.input.press("primary");
    scanner.input.suspend();

    scanner.input.press("primary");
    scanner.pause();
    scanner.resume();

    scanner.input.press("primary");
    scanner.setOptions({
      method: stepScan(),
      switches: { primary: { action: "select" } },
    });

    expect(events.ofType("input.cancelled")).toHaveLength(4);
    expect(events.ofType("input.released")).toHaveLength(0);
  });

  it("reports hold recognition while the contact is still down", () => {
    const { clock, scanner, fixture } = createTestScanner(TAP_HOLD, YES_NO);
    const events = recordScannerEvents(scanner);
    scanner.start();

    scanner.input.press("primary");
    clock.advanceBy(700);
    expect(events.ofType("input.holdRecognized")).toMatchObject([
      { switchId: "primary", action: "select", at: 700 },
    ]);
    expect(fixture.activations).toEqual(["yes"]);

    clock.advanceBy(300);
    scanner.input.release("primary");
    expect(events.ofType("input.released")).toMatchObject([{ heldMs: 1000 }]);
    // The hold consumed the gesture: no tap fires on release.
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
  });

  it("reports stabilized discrete and scan acceptance as hold recognition", () => {
    const { clock, scanner } = createTestScanner(
      {
        method: inverseScan({ intervalMs: 100, passes: "infinite" }),
        switches: {
          go: { action: "scan", holdDurationMs: 120 },
          step: { action: "next", holdDurationMs: 80 },
        },
      },
      YES_NO,
    );
    const events = recordScannerEvents(scanner);
    scanner.start();

    scanner.input.press("step");
    clock.advanceBy(80);
    scanner.input.release("step");
    scanner.input.press("go");
    clock.advanceBy(120);
    scanner.input.disconnect("go");

    expect(
      events.ofType("input.holdRecognized").map((event) => event.action),
    ).toEqual(["next", "scan"]);
  });

  it("does not report a repeat-blocked hold as recognized", () => {
    const { clock, scanner } = createTestScanner(
      {
        method: stepScan(),
        switches: {
          primary: {
            tap: "next",
            hold: { afterMs: 700, action: "select" },
            ignoreRepeatMs: 5000,
          },
        },
      },
      YES_NO,
    );
    const events = recordScannerEvents(scanner);
    scanner.start();

    scanner.input.press("primary");
    clock.advanceBy(100);
    scanner.input.release("primary"); // accepted tap consumes the repeat window
    scanner.input.press("primary");
    clock.advanceBy(700); // hold threshold crossed, blocked by ignoreRepeatMs
    scanner.input.release("primary");

    expect(events.ofType("input.holdRecognized")).toHaveLength(0);
    expect(events.ofType("input.pressed")).toHaveLength(2);
    expect(events.ofType("input.released")).toHaveLength(2);
  });

  it("emits nothing for unknown switches or while disabled", () => {
    const { scanner } = createTestScanner(TAP_HOLD, YES_NO);
    const events = recordScannerEvents(scanner);
    scanner.start();

    scanner.input.press("mystery");
    scanner.input.release("mystery");
    expect(events.ofType("input.pressed")).toHaveLength(0);
    expect(events.ofType("diagnostic")).toMatchObject([
      { code: "unknown-switch-binding" },
    ]);

    scanner.setOptions({ ...TAP_HOLD, enabled: false });
    events.clear();
    scanner.input.press("primary");
    scanner.input.release("primary");
    expect(events.events).toEqual([]);
  });

  it("orders input events ahead of the selection they complete", () => {
    const { clock, scanner } = createTestScanner(
      {
        method: stepScan(),
        switches: {
          step: { action: "next" },
          sel: { action: "select", performOn: "release", holdDurationMs: 100 },
        },
      },
      YES_NO,
    );
    const events = recordScannerEvents(scanner);
    scanner.start();
    scanner.input.press("step");
    scanner.input.release("step");
    events.clear();

    scanner.input.press("sel");
    clock.advanceBy(150);
    scanner.input.release("sel");

    expect(events.events.map((event) => event.type)).toEqual([
      "input.pressed",
      "input.released",
      "target.activationRequested",
      "target.activated",
      "highlight.changed",
    ]);
  });
});
