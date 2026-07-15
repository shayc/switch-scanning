import { describe, expect, it, vi } from "vitest";
import { manualClock } from "../shared/clock.ts";
import { autoScan, stepScan } from "../styles/styles.ts";
import { createScannerFixture, recordScannerEvents } from "../testing/index.ts";
import type {
  Highlight,
  HostAttachment,
  ScanGroupNode,
  ScanNode,
  ScannerBehaviorOptions,
  ScannerOptions,
} from "../types.ts";
import { createScanner } from "./scanner.ts";

const YES_NO: ScanNode[] = [
  { kind: "target", id: "yes", label: "Yes" },
  { kind: "target", id: "no", label: "No" },
];

const rootOf = (children: ScanNode[]): ScanGroupNode => ({
  kind: "group",
  id: "root",
  label: "root",
  children,
});

function build(
  options: Omit<ScannerOptions, "clock" | "scheduler">,
  nodes: ScanNode[],
) {
  const clock = manualClock();
  const scanner = createScanner({ ...options, clock });
  const events = recordScannerEvents(scanner);
  const fixture = createScannerFixture(scanner, nodes);
  return { clock, scanner, fixture, events };
}

describe("start rules", () => {
  it("starts once when the initial tree is mounted", () => {
    const { scanner, fixture } = build(
      { style: stepScan(), startOn: "mount" },
      YES_NO,
    );
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { kind: "target", id: "yes" },
    });

    scanner.stop();
    fixture.setNodes([
      ...YES_NO,
      { kind: "target", id: "maybe", label: "Maybe" },
    ]);
    expect(scanner.getSnapshot().status).toBe("idle");
  });

  it("does not re-arm a consumed mount start during tree churn", () => {
    const { scanner, fixture, events } = build(
      { style: stepScan(), startOn: "mount" },
      YES_NO,
    );
    expect(events.ofType("scan.started")).toHaveLength(1);

    scanner.stop();
    fixture.setNodes([YES_NO[1]!, YES_NO[0]!]);
    fixture.setNodes(YES_NO);

    expect(scanner.getSnapshot().status).toBe("idle");
    expect(events.ofType("scan.started")).toHaveLength(1);
  });

  it("stays idle after activation-stop when the tree is republished", () => {
    const { scanner, fixture, events } = build(
      {
        style: stepScan(),
        startOn: "mount",
        afterActivation: "stop",
      },
      YES_NO,
    );

    scanner.select();
    expect(fixture.activations).toEqual(["yes"]);
    expect(scanner.getSnapshot().status).toBe("idle");

    fixture.setNodes([...YES_NO]);
    expect(scanner.getSnapshot().status).toBe("idle");
    expect(events.ofType("scan.started")).toHaveLength(1);
  });

  it("keeps a disabled mount start pending until enabled content arrives", () => {
    const scanner = createScanner({
      style: stepScan(),
      startOn: "mount",
      enabled: false,
    });
    const events = recordScannerEvents(scanner);
    scanner.attachHost({ activate: () => ({ activated: true }) });

    scanner.setOptions({ style: stepScan(), startOn: "mount", enabled: true });
    expect(scanner.getSnapshot().status).toBe("idle");
    scanner.setTree(rootOf(YES_NO));

    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { kind: "target", id: "yes" },
    });
    expect(events.ofType("scan.started")).toHaveLength(1);
  });

  it("defers an empty mount tree and starts exactly once when content appears", () => {
    const scanner = createScanner({ style: stepScan(), startOn: "mount" });
    const events = recordScannerEvents(scanner);
    scanner.attachHost({ activate: () => ({ activated: true }) });

    scanner.setTree(rootOf([]));
    expect(scanner.getSnapshot()).toMatchObject({
      status: "idle",
      highlight: null,
    });
    expect(events.ofType("scan.completed")).toEqual([]);

    scanner.setTree(rootOf(YES_NO));
    scanner.setTree(rootOf([...YES_NO]));
    expect(scanner.getSnapshot().status).toBe("scanning");
    expect(events.ofType("scan.started")).toHaveLength(1);
  });

  it("starts when the first tree is published before the host attaches", () => {
    const scanner = createScanner({ style: stepScan(), startOn: "mount" });
    const events = recordScannerEvents(scanner);

    scanner.setTree(rootOf(YES_NO));
    expect(scanner.getSnapshot().status).toBe("scanning");
    expect(events.ofType("scan.started")).toHaveLength(1);

    const activations: string[] = [];
    scanner.attachHost({
      activate: (id) => {
        activations.push(id);
        return { activated: true };
      },
    });
    scanner.select();
    expect(activations).toEqual(["yes"]);
  });

  it("first accepted switch while idle starts and consumes the action", () => {
    const { scanner, fixture } = build(
      {
        style: stepScan(),
        switches: { select: { action: "select" } },
        startOn: "switch",
      },
      YES_NO,
    );
    scanner.input.press("select");
    expect(scanner.getSnapshot().status).toBe("scanning");
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
    // The select was consumed by starting, not performed.
    expect(fixture.activations).toEqual([]);
  });

  it("does not start from input when startOn is 'command'", () => {
    const { scanner } = build(
      {
        style: stepScan(),
        switches: { select: { action: "select" } },
        startOn: "command",
      },
      YES_NO,
    );
    scanner.input.press("select");
    expect(scanner.getSnapshot().status).toBe("idle");
  });

  it("ignores physical input while paused", () => {
    const { scanner } = build(
      {
        style: stepScan(),
        switches: { next: { action: "next" } },
        startOn: "switch",
      },
      YES_NO,
    );
    scanner.start();
    scanner.pause();
    scanner.input.press("next");
    expect(scanner.getSnapshot().status).toBe("paused");
  });

  it("keeps start from resetting an existing session and reserves that for restart", () => {
    const { scanner, events } = build({ style: stepScan() }, YES_NO);
    scanner.start();
    scanner.next();
    const before = scanner.getSnapshot();
    events.clear();

    scanner.start();

    expect(scanner.getSnapshot()).toBe(before);
    const diagnostic = events.ofType("diagnostic").at(-1);
    expect(diagnostic?.code).toBe("command-inapplicable");
    expect(diagnostic?.message).toContain("use restart()");

    scanner.restart();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
    expect(
      events.events
        .filter((event) =>
          ["scan.stopped", "scan.started"].includes(event.type),
        )
        .map((event) => event.type),
    ).toEqual(["scan.stopped", "scan.started"]);
  });
});

describe("serialized transitions", () => {
  it("reports an observer error after publishing the complete transition", () => {
    const { clock, scanner } = build(
      { style: autoScan({ intervalMs: 100, loops: 2 }) },
      YES_NO,
    );
    scanner.observe((event) => {
      if (event.type === "scan.started") throw new Error("listener failed");
    });
    const reported = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => scanner.start()).not.toThrow();
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { kind: "target", id: "yes" },
    });
    expect(clock.pending).toBe(1);
    expect(reported).toHaveBeenCalledWith(
      "[switch-scanning] scanner listener failed",
      expect.objectContaining({ message: "listener failed" }),
    );
    reported.mockRestore();
  });

  it("runs observer commands after the transition being observed", () => {
    const { scanner, events } = build({ style: stepScan() }, YES_NO);
    scanner.observe((event) => {
      if (event.type === "scan.started") scanner.stop();
    });

    scanner.start();

    expect(scanner.getSnapshot()).toMatchObject({
      status: "idle",
      highlight: null,
    });
    expect(events.events.map((event) => event.type)).toEqual([
      "scan.started",
      "highlight.changed",
      "highlight.changed",
      "scan.stopped",
    ]);
  });

  it("throws invalid re-entrant option updates at their own call site", () => {
    const { scanner } = build({ style: stepScan() }, YES_NO);
    let caught: unknown;
    scanner.observe((event) => {
      if (event.type !== "scan.started") return;
      try {
        scanner.setOptions({
          style: stepScan(),
          enabled: "invalid",
        } as unknown as ScannerBehaviorOptions);
      } catch (error) {
        caught = error;
      }
    });

    expect(() => scanner.start()).not.toThrow();
    expect(caught).toEqual(
      expect.objectContaining({
        message:
          "[switch-scanning] enabled must be a boolean (received invalid)",
      }),
    );
    expect(scanner.getSnapshot().status).toBe("scanning");
  });

  it("reports re-entrant host acquisition truthfully before queued setup", () => {
    const scanner = createScanner({ style: stepScan() });
    const activations: string[] = [];
    let attachment: HostAttachment | undefined;
    scanner.setTree(rootOf([{ kind: "target", id: "yes", label: "Yes" }]));
    scanner.observe((event) => {
      if (event.type !== "scan.started") return;
      attachment = scanner.attachHost({
        activate: (id) => {
          activations.push(id);
          return { activated: true };
        },
      });
      expect(attachment.attached).toBe(true);
    });

    scanner.start();
    scanner.select();

    expect(attachment?.attached).toBe(true);
    expect(activations).toEqual(["yes"]);
  });

  it("reports a host reveal failure without interrupting publication", () => {
    const scanner = createScanner({ style: stepScan(), startOn: "command" });
    scanner.setTree(rootOf(YES_NO));
    scanner.attachHost({
      activate: () => ({ activated: true }),
      reveal: () => {
        throw new Error("reveal failed");
      },
    });
    const reported = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => scanner.start()).not.toThrow();
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { kind: "target", id: "yes" },
    });
    expect(reported).toHaveBeenCalledWith(
      "[switch-scanning] scanner host reveal failed",
      expect.objectContaining({ message: "reveal failed" }),
    );
    reported.mockRestore();
  });
});

describe("clearing host decorations", () => {
  function withRecordingHost(style: ScannerOptions["style"]) {
    const clock = manualClock();
    const scanner = createScanner({ style, startOn: "command", clock });
    const reveals: Highlight[] = [];
    scanner.attachHost({
      activate: () => ({ activated: true }),
      reveal: (highlight) => reveals.push(highlight),
    });
    scanner.setTree(rootOf(YES_NO));
    return { clock, scanner, reveals };
  }

  it("reveals null so the host clears decorations when stopped", () => {
    const { scanner, reveals } = withRecordingHost(
      autoScan({ intervalMs: 1000, loops: 5 }),
    );
    scanner.start();
    expect(reveals.at(-1)).toEqual({ kind: "target", id: "yes" });

    scanner.stop();
    expect(reveals.at(-1)).toBeNull();
  });

  it("reveals null when a timed scan completes its loops", () => {
    const { clock, scanner, reveals } = withRecordingHost(
      autoScan({ intervalMs: 1000, loops: 1 }),
    );
    scanner.start();
    while (scanner.getSnapshot().status === "scanning") clock.advanceBy(1000);

    expect(scanner.getSnapshot().status).toBe("complete");
    expect(reveals.at(-1)).toBeNull();
  });

  it("restores the visible cursor before a replacement host can activate it", () => {
    const scanner = createScanner({ style: stepScan(), startOn: "command" });
    const firstReveals: Highlight[] = [];
    const attachment = scanner.attachHost({
      activate: () => ({ activated: true }),
      reveal: (highlight) => firstReveals.push(highlight),
    });
    scanner.setTree(rootOf(YES_NO));
    scanner.start();
    attachment.detach();
    expect(firstReveals.at(-1)).toBeNull();
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: null,
      position: { index: 0, count: 2 },
    });

    const activations: string[] = [];
    const replacementReveals: Highlight[] = [];
    scanner.attachHost({
      activate: (id) => {
        activations.push(id);
        return { activated: true };
      },
      reveal: (highlight) => replacementReveals.push(highlight),
    });

    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
    expect(replacementReveals).toEqual([{ kind: "target", id: "yes" }]);
    scanner.select();
    expect(activations).toEqual(["yes"]);
  });
});

describe("time infrastructure", () => {
  it("rejects an unpaired clock with a descriptive error", () => {
    const options = {
      style: autoScan({ intervalMs: 100, loops: 1 }),
      clock: { now: () => 0 },
    } as unknown as ScannerOptions;

    expect(() => createScanner(options)).toThrow(
      "[switch-scanning] a custom clock must implement Scheduler or provide scheduler",
    );
  });
});

describe("event timestamps", () => {
  it("stamps every event with the injected clock's time at emission", () => {
    const { clock, scanner, events } = build(
      { style: autoScan({ intervalMs: 100, loops: "infinite" }) },
      YES_NO,
    );

    clock.advanceBy(5);
    scanner.start();
    expect(events.ofType("scan.started")).toMatchObject([{ at: 5 }]);
    expect(events.ofType("highlight.changed")).toMatchObject([{ at: 5 }]);

    clock.advanceBy(100);
    expect(events.ofType("highlight.changed").at(-1)).toMatchObject({
      current: { kind: "target", id: "no" },
      at: 105,
    });
  });

  it("stamps at emission even when a transition follows the selection", () => {
    const { clock, scanner, events } = build(
      {
        style: autoScan({ intervalMs: 100, loops: "infinite" }),
        selectionDelay: { durationMs: 50 },
      },
      YES_NO,
    );

    scanner.start();
    clock.advanceBy(30);
    scanner.select();
    expect(events.ofType("target.activated")).toMatchObject([{ at: 30 }]);
    expect(events.ofType("scan.transitionStarted")).toMatchObject([{ at: 30 }]);

    clock.advanceBy(50);
    expect(events.ofType("scan.transitionEnded")).toMatchObject([{ at: 80 }]);
  });
});
