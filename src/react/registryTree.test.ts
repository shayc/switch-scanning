import { describe, expect, it, vi } from "vitest";
import {
  compileRegistryTree,
  type RegistryGroupEntry,
  type RegistryTargetEntry,
} from "./registryTree.ts";

describe("registry tree compiler", () => {
  it("derives containment and DOM order from registration snapshots", () => {
    const groupElement = document.createElement("div");
    const first = document.createElement("button");
    const second = document.createElement("button");
    groupElement.append(first, second);

    const groups = new Map<string, RegistryGroupEntry>([
      [
        "group",
        {
          id: "group",
          element: groupElement,
          getOptions: () => ({ id: "group", label: "Group" }),
        },
      ],
    ]);
    const targets = new Map<string, RegistryTargetEntry>([
      [
        "second",
        {
          id: "second",
          element: second,
          getOptions: () => ({ id: "second", label: "Second" }),
        },
      ],
      [
        "first",
        {
          id: "first",
          element: first,
          getOptions: () => ({ id: "first", label: "First" }),
        },
      ],
    ]);

    const tree = compileRegistryTree(
      targets,
      groups,
      new Map([[groupElement, "group"]]),
      { reportParentCycle: vi.fn(), warn: vi.fn() },
    );

    expect(tree.children).toEqual([
      {
        kind: "group",
        id: "group",
        label: "Group",
        children: [
          { kind: "target", id: "first", label: "First" },
          { kind: "target", id: "second", label: "Second" },
        ],
      },
    ]);
  });

  it("delegates parent-cycle policy to the registry boundary", () => {
    const reportParentCycle = vi.fn();
    const groups = new Map<string, RegistryGroupEntry>([
      [
        "a",
        {
          id: "a",
          element: null,
          getOptions: () => ({ id: "a", label: "A", parentId: "b" }),
        },
      ],
      [
        "b",
        {
          id: "b",
          element: null,
          getOptions: () => ({ id: "b", label: "B", parentId: "a" }),
        },
      ],
    ]);

    compileRegistryTree(new Map(), groups, new Map(), {
      reportParentCycle,
      warn: vi.fn(),
    });

    expect(reportParentCycle).toHaveBeenCalledWith(["a", "b"]);
  });
});
