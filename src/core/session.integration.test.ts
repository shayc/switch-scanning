import { describe, expect, it } from "vitest";
import { manualClock } from "./clock.ts";
import { createScanner } from "./scanner.ts";
import { stepScan } from "./styles.ts";
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
    const { scanner, events } = build(
      { style: stepScan(), groupExit: "after" },
      tree,
    );
    scanner.start();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "group",
      id: "row1",
    });
    scanner.select();
    expect(scanner.getSnapshot().path).toEqual(["row1"]);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "a",
    });
    scanner.next();
    scanner.next();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "exit",
      groupId: "row1",
    });
    scanner.select();
    expect(scanner.getSnapshot().path).toEqual([]);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "group",
      id: "row1",
    });
    expect(events.ofType("group.exited")[0]).toMatchObject({
      id: "row1",
      reason: "selected-exit",
    });
  });

  it("places the exit before children when groupExit is 'before'", () => {
    const { scanner } = build({ style: stepScan(), groupExit: "before" }, tree);
    scanner.start();
    scanner.select();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "exit",
      groupId: "row1",
    });
  });

  it("back() leaves the group, and is a no-op at the root", () => {
    const { scanner, events } = build({ style: stepScan() }, tree);
    scanner.start();
    scanner.select();
    scanner.back();
    expect(scanner.getSnapshot().path).toEqual([]);
    scanner.back();
    expect(
      events
        .ofType("diagnostic")
        .some((d) => d.code === "command-inapplicable"),
    ).toBe(true);
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
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
  });
});
