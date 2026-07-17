import { describe, expect, it } from "vitest";
import { autoScan, stepScan } from "../methods/methods.ts";
import { createTestScanner } from "../testing/index.ts";
import type { ScanNode } from "../types.ts";

const YES_NO: ScanNode[] = [
  { kind: "target", id: "yes", label: "Yes" },
  { kind: "target", id: "no", label: "No" },
];

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

  it("rebuilds entered scopes when one update changes method kind and groupExit", () => {
    const { scanner } = createTestScanner(
      {
        method: autoScan({ intervalMs: 100, passes: "infinite" }),
        groupExit: "after",
        switches: { back: { action: "back" } },
      },
      tree,
    );
    scanner.start();
    scanner.select();
    expect(scanner.getSnapshot().position).toEqual({ index: 0, count: 3 });

    // The method-kind change resets the scope; the exit policy change must
    // still rebuild the candidates that reset lands in.
    scanner.setOptions({
      method: stepScan(),
      groupExit: "back-only",
      switches: { back: { action: "back" } },
    });
    expect(scanner.getSnapshot().position).toEqual({ index: 0, count: 2 });

    // "back-only" forbids the exit candidate, so traversal wraps a -> b -> a.
    scanner.next();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "b",
    });
    scanner.next();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "a",
    });
  });

  it("enters a group, exposes an exit after its children, and leaves via exit", () => {
    const { scanner, events } = createTestScanner(
      { method: stepScan(), groupExit: "after" },
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
    const { scanner } = createTestScanner(
      { method: stepScan(), groupExit: "before" },
      tree,
    );
    scanner.start();
    scanner.select();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "exit",
      groupId: "row1",
    });
  });

  it("back() leaves the group, and is a no-op at the root", () => {
    const { scanner, events } = createTestScanner({ method: stepScan() }, tree);
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
    const { scanner } = createTestScanner({ method: stepScan() }, namedRoot);

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
    const { scanner, fixture, events } = createTestScanner(
      { method: stepScan() },
      YES_NO,
    );
    scanner.start();

    fixture.setNodes([
      { kind: "target", id: "duplicate", label: "First" },
      { kind: "target", id: "duplicate", label: "Second" },
    ]);

    expect(events.ofType("diagnostic")).toContainEqual(
      expect.objectContaining({
        type: "diagnostic",
        code: "duplicate-id",
        message:
          'duplicate scan node id "duplicate"; keeping the previous tree',
      }),
    );
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "yes",
    });
  });
});
