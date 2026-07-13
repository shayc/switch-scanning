import { describe, expect, it } from "vitest";
import { ScanSession, highlightEquals, snapshotEquals } from "./session.ts";
import { compileTree } from "./tree.ts";
import type { ScanGroupNode } from "./types.ts";

const ROOT: ScanGroupNode = {
  kind: "group",
  id: "__test_root__",
  label: "root",
  children: [
    {
      kind: "group",
      id: "row",
      label: "Row",
      children: [
        { kind: "target", id: "a", label: "A" },
        { kind: "target", id: "b", label: "B" },
      ],
    },
    { kind: "target", id: "c", label: "C" },
  ],
};

describe("scan session", () => {
  it("owns group traversal independently of timing and hosts", () => {
    const session = new ScanSession(compileTree(ROOT), "after");

    expect(session.start()).toEqual([
      {
        type: "landed",
        previous: null,
        current: { kind: "group", id: "row" },
        label: "Row",
      },
    ]);

    const selection = session.selectCurrent();
    expect(selection.kind).toBe("handled");
    expect(session.snapshot("scanning")).toMatchObject({
      path: ["row"],
      highlight: { kind: "target", id: "a" },
    });

    session.stepForward(null);
    expect(session.snapshot("scanning").highlight).toEqual({
      kind: "target",
      id: "b",
    });
    session.stepForward(null);
    expect(session.snapshot("scanning").highlight).toEqual({
      kind: "exit",
      groupId: "row",
    });
  });

  it("reconciles a changed tree while preserving highlighted identity", () => {
    const session = new ScanSession(compileTree(ROOT), "after");
    session.start();
    session.stepForward(null);
    expect(session.currentHighlight).toEqual({ kind: "target", id: "c" });

    const reordered: ScanGroupNode = {
      ...ROOT,
      children: [{ kind: "target", id: "d", label: "D" }, ...ROOT.children],
    };
    session.setTree(compileTree(reordered));

    expect(session.reconcile()).toEqual([
      {
        type: "landed",
        previous: { kind: "target", id: "c" },
        current: { kind: "target", id: "c" },
        label: "C",
      },
    ]);
    expect(session.currentHighlight).toEqual({ kind: "target", id: "c" });
  });

  it("reports root exhaustion without owning scanner lifecycle", () => {
    const session = new ScanSession(
      compileTree({
        kind: "group",
        id: "root",
        label: "root",
        children: [{ kind: "target", id: "only", label: "Only" }],
      }),
      "after",
    );
    session.start();
    expect(session.stepForward(1)).toEqual([{ type: "root-exhausted" }]);
  });

  it("handles commands safely without an active frame", () => {
    const session = new ScanSession(compileTree(ROOT), "after");
    expect(session.depth).toBe(0);
    expect(session.currentPresentation).toBeNull();
    expect(session.resetCurrentScope()).toEqual([]);
    expect(session.stepForward(null)).toEqual([]);
    expect(session.stepBackward()).toEqual([]);
    expect(session.selectCurrent()).toEqual({ kind: "none" });
    expect(session.reconcile()).toEqual([]);
    session.clear();
  });

  it("preserves an entered scope and target identity during nested reconciliation", () => {
    const session = new ScanSession(compileTree(ROOT), "after");
    session.start();
    session.selectCurrent();
    session.stepForward(null);
    expect(session.currentHighlight).toEqual({ kind: "target", id: "b" });

    const changed: ScanGroupNode = {
      ...ROOT,
      children: [
        {
          kind: "group",
          id: "row",
          label: "Row renamed",
          children: [
            { kind: "target", id: "new", label: "New" },
            { kind: "target", id: "a", label: "A" },
            { kind: "target", id: "b", label: "B" },
          ],
        },
        { kind: "target", id: "c", label: "C" },
      ],
    };
    session.setTree(compileTree(changed));
    expect(session.reconcile()).toEqual([
      {
        type: "landed",
        previous: { kind: "target", id: "b" },
        current: { kind: "target", id: "b" },
        label: "B",
      },
    ]);
    expect(session.snapshot("scanning")).toMatchObject({
      path: ["row"],
      position: { index: 2, count: 4 },
    });
  });

  it("widens safely when an active group disappears and reports an empty root", () => {
    const session = new ScanSession(compileTree(ROOT), "after");
    session.start();
    session.selectCurrent();
    session.setTree(
      compileTree({
        kind: "group",
        id: "root",
        label: "Root",
        children: [{ kind: "target", id: "c", label: "C" }],
      }),
    );
    expect(session.reconcile()).toEqual([
      {
        type: "landed",
        previous: { kind: "target", id: "a" },
        current: { kind: "target", id: "c" },
        label: "C",
      },
    ]);
    expect(session.snapshot("scanning").path).toEqual([]);

    session.setTree(
      compileTree({ kind: "group", id: "root", label: "Root", children: [] }),
    );
    expect(session.reconcile()).toEqual([{ type: "root-empty" }]);
  });

  it("exits an exhausted nested scope and can change virtual-exit placement", () => {
    const session = new ScanSession(compileTree(ROOT), "after");
    session.start();
    session.selectCurrent();
    session.stepForward(1);
    session.stepForward(1);
    expect(session.stepForward(1)).toEqual([
      {
        type: "group-exited",
        id: "row",
        label: "Row",
        reason: "loops-complete",
      },
      {
        type: "landed",
        previous: { kind: "exit", groupId: "row" },
        current: { kind: "group", id: "row" },
        label: "Row",
      },
    ]);
    session.setGroupExit("before");
    session.selectCurrent();
    expect(session.currentHighlight).toEqual({ kind: "exit", groupId: "row" });
  });

  it("compares complete snapshot domain state", () => {
    const base = {
      status: "scanning" as const,
      highlight: { kind: "target" as const, id: "a" },
      path: ["row"],
      loop: 1,
      position: { index: 0, count: 2 },
      pending: { kind: "advance" as const, startedAt: 0, dueAt: 10 },
    };
    expect(snapshotEquals(base, { ...base })).toBe(true);
    expect(snapshotEquals(base, { ...base, loop: 2 })).toBe(false);
    expect(snapshotEquals(base, { ...base, path: [] })).toBe(false);
    expect(
      snapshotEquals(base, { ...base, position: { index: 1, count: 2 } }),
    ).toBe(false);
    expect(
      snapshotEquals(base, {
        ...base,
        pending: { kind: "dwell", startedAt: 0, dueAt: 10 },
      }),
    ).toBe(false);
    expect(highlightEquals(null, null)).toBe(true);
    expect(
      highlightEquals(
        { kind: "exit", groupId: "a" },
        { kind: "exit", groupId: "b" },
      ),
    ).toBe(false);
  });
});
