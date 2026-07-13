import { describe, expect, it, vi } from "vitest";
import { manualClock } from "./clock.ts";
import { createScanner } from "./scanner.ts";
import { autoScan, inverseScan, singleSwitchStepScan, stepScan } from "./styles.ts";
import {
  createScannerFixture,
  recordScannerEvents,
} from "./testing/index.ts";
import type { ScanNode, ScannerOptions } from "./types.ts";

const YES_NO: ScanNode[] = [
  { kind: "target", id: "yes", label: "Yes" },
  { kind: "target", id: "no", label: "No" },
];

function build(options: Omit<ScannerOptions, "clock" | "scheduler">, nodes: ScanNode[]) {
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
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
    clock.advanceBy(1000);
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "no" });
    scanner.select();
    expect(fixture.activations).toEqual(["no"]);
  });

  it("adds firstItemPauseMs only to the first candidate of each pass", () => {
    const { clock, scanner } = build(
      { style: autoScan({ intervalMs: 1000, loops: 3, firstItemPauseMs: 500 }) },
      YES_NO,
    );
    scanner.start();
    // First candidate waits interval + pause = 1500.
    clock.advanceBy(1400);
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
    clock.advanceBy(100);
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "no" });
    // Second candidate waits only the interval.
    clock.advanceBy(1000);
    // Wrapped back to yes (pass 2), first of pass again.
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
    expect(scanner.getSnapshot().loop).toBe(2);
  });

  it("completes after the configured number of root passes", () => {
    const { clock, scanner, events } = build(
      { style: autoScan({ intervalMs: 100, loops: 2 }) },
      YES_NO,
    );
    scanner.start();
    // pass 1: yes -> no ; pass 2: yes -> no ; then wrap beyond limit -> complete
    clock.advanceBy(100); // -> no (pass1)
    clock.advanceBy(100); // wrap -> yes (pass2)
    expect(scanner.getSnapshot().loop).toBe(2);
    clock.advanceBy(100); // -> no (pass2)
    clock.advanceBy(100); // wrap beyond limit -> complete
    expect(scanner.getSnapshot().status).toBe("complete");
    expect(scanner.getSnapshot().highlight).toBeNull();
    expect(events.ofType("scan.completed")).toEqual([{ type: "scan.completed", reason: "loops" }]);
  });

  it("emits scan.completed empty for an empty root", () => {
    const { scanner, events } = build({ style: autoScan({ intervalMs: 100, loops: 1 }) }, []);
    scanner.start();
    expect(scanner.getSnapshot().status).toBe("complete");
    expect(events.ofType("scan.completed")).toEqual([{ type: "scan.completed", reason: "empty" }]);
  });
});

describe("post-activation policy", () => {
  const options = (afterActivation: NonNullable<ScannerOptions["afterActivation"]>): ScannerOptions => ({
    style: autoScan({ intervalMs: 100, loops: 5 }),
    afterActivation,
  });

  it("restart returns to the first root candidate", () => {
    const { clock, scanner, fixture } = build(options("restart"), YES_NO);
    scanner.start();
    clock.advanceBy(100); // -> no
    scanner.select();
    expect(fixture.activations).toEqual(["no"]);
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
  });

  it("continue advances within the current scope", () => {
    const { scanner } = build(options("continue"), YES_NO);
    scanner.start(); // yes
    scanner.select(); // activates yes, then advances -> no
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "no" });
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
    const { clock, scanner, fixture, events } = build(options("restart"), YES_NO);
    fixture.failActivation("yes", "boom");
    scanner.start(); // yes
    scanner.select();
    expect(fixture.activations).toEqual([]);
    expect(events.ofType("target.activationFailed")[0]).toMatchObject({ id: "yes", reason: "boom" });
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
    // fresh full deadline
    clock.advanceBy(100);
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "no" });
  });
});

describe("step scanning", () => {
  it("moves with next/previous and selects the current candidate", () => {
    const { scanner, fixture } = build({ style: stepScan() }, YES_NO);
    scanner.start();
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
    scanner.next();
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "no" });
    scanner.next(); // wrap
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
    scanner.previous(); // wrap back to no
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "no" });
    scanner.select();
    expect(fixture.activations).toEqual(["no"]);
  });

  it("schedules no advancement deadline", () => {
    const { clock, scanner } = build({ style: stepScan() }, YES_NO);
    scanner.start();
    expect(clock.pending).toBe(0);
    clock.advanceBy(100000);
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
  });
});

describe("groups and exits", () => {
  const tree: ScanNode[] = [
    {
      kind: "group",
      id: "row1",
      label: "Row 1",
      children: [
        { kind: "target", id: "a", label: "A" },
        { kind: "target", id: "b", label: "B" },
      ],
    },
    { kind: "target", id: "c", label: "C" },
  ];

  it("enters a group, exposes an exit after its children, and leaves via exit", () => {
    const { scanner, events } = build({ style: stepScan(), groupExit: "after" }, tree);
    scanner.start();
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "group", id: "row1" });
    scanner.select(); // enter group
    expect(scanner.getSnapshot().path).toEqual(["row1"]);
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "a" });
    scanner.next(); // b
    scanner.next(); // exit (after)
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "exit", groupId: "row1" });
    scanner.select(); // leave group, highlight the group just exited
    expect(scanner.getSnapshot().path).toEqual([]);
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "group", id: "row1" });
    expect(events.ofType("group.exited")[0]).toMatchObject({ id: "row1", reason: "selected-exit" });
  });

  it("places the exit before children when groupExit is 'before'", () => {
    const { scanner } = build({ style: stepScan(), groupExit: "before" }, tree);
    scanner.start();
    scanner.select(); // enter row1
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "exit", groupId: "row1" });
  });

  it("back() leaves the group, and is a no-op at the root", () => {
    const { scanner, events } = build({ style: stepScan() }, tree);
    scanner.start();
    scanner.select(); // enter
    scanner.back();
    expect(scanner.getSnapshot().path).toEqual([]);
    scanner.back(); // no-op at root
    expect(events.ofType("diagnostic").some((d) => d.code === "command-inapplicable")).toBe(true);
  });

  it("treats a group named root as an ordinary user group", () => {
    const namedRoot: ScanNode[] = [
      {
        kind: "group",
        id: "root",
        label: "Root named group",
        children: [{ kind: "target", id: "inside", label: "Inside" }],
      },
    ];
    const { scanner } = build({ style: stepScan() }, namedRoot);

    scanner.start();
    scanner.select();
    expect(scanner.getSnapshot().path).toEqual(["root"]);

    scanner.back();
    expect(scanner.getSnapshot()).toMatchObject({
      path: [],
      highlight: { kind: "group", id: "root" },
    });
  });
});

describe("tree identity", () => {
  it("rejects duplicate IDs and keeps the previous tree", () => {
    const { scanner, fixture, events } = build({ style: stepScan() }, YES_NO);
    scanner.start();

    fixture.setNodes([
      { kind: "target", id: "duplicate", label: "First" },
      { kind: "target", id: "duplicate", label: "Second" },
    ]);

    expect(events.ofType("diagnostic")).toContainEqual({
      type: "diagnostic",
      code: "duplicate-id",
      message: 'duplicate scan node id "duplicate"; keeping the previous tree',
    });
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
  });
});

describe("single-switch step scanning", () => {
  it("selects the current candidate when the dwell expires", () => {
    const { clock, scanner, fixture } = build(
      { style: singleSwitchStepScan({ dwellTimeMs: 1500 }), switches: { next: { action: "next" } } },
      YES_NO,
    );
    scanner.start(); // yes, dwell scheduled
    scanner.next(); // -> no, dwell restarts
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
    scanner.input.press("scan"); // start + hold, highlight yes
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
    clock.advanceBy(900); // first movement -> no
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "no" });
    scanner.input.release("scan"); // select current
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
    fixture.setNodes([...YES_NO, { kind: "target", id: "maybe", label: "Maybe" }]);
    expect(scanner.getSnapshot().status).toBe("idle");
  });

  it("first accepted switch while idle starts and consumes the action", () => {
    const { scanner, fixture } = build(
      { style: stepScan(), switches: { select: { action: "select" } }, startOn: "switch" },
      YES_NO,
    );
    scanner.input.press("select");
    expect(scanner.getSnapshot().status).toBe("scanning");
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "target", id: "yes" });
    // The select was consumed by starting, not performed.
    expect(fixture.activations).toEqual([]);
  });

  it("does not start from input when startOn is 'command'", () => {
    const { scanner } = build(
      { style: stepScan(), switches: { select: { action: "select" } }, startOn: "command" },
      YES_NO,
    );
    scanner.input.press("select");
    expect(scanner.getSnapshot().status).toBe("idle");
  });

  it("ignores physical input while paused", () => {
    const { scanner } = build(
      { style: stepScan(), switches: { next: { action: "next" } }, startOn: "switch" },
      YES_NO,
    );
    scanner.start();
    scanner.pause();
    scanner.input.press("next");
    expect(scanner.getSnapshot().status).toBe("paused");
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
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});

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

    expect(scanner.getSnapshot()).toMatchObject({ status: "idle", highlight: null });
    expect(events.events.map((event) => event.type)).toEqual([
      "scan.started",
      "highlight.changed",
      "scan.stopped",
    ]);
  });
});
