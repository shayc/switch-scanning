import { describe, expect, it } from "vitest";
import { ScanSession } from "./session.ts";
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
});
