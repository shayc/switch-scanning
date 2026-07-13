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

  it("diagnoses explicit parents that do not exist before keeping nodes at root", () => {
    const warn = vi.fn();
    const targets = new Map<string, RegistryTargetEntry>([
      [
        "target",
        {
          id: "target",
          element: null,
          getOptions: () => ({
            id: "target",
            label: "Target",
            groupId: "missing-target-parent",
          }),
        },
      ],
    ]);
    const groups = new Map<string, RegistryGroupEntry>([
      [
        "group",
        {
          id: "group",
          element: null,
          getOptions: () => ({
            id: "group",
            label: "Group",
            parentId: "missing-group-parent",
          }),
        },
      ],
    ]);

    const tree = compileRegistryTree(targets, groups, new Map(), {
      reportParentCycle: vi.fn(),
      warn,
    });

    expect(tree.children).toEqual([
      { kind: "target", id: "target", label: "Target" },
      { kind: "group", id: "group", label: "Group", children: [] },
    ]);
    expect(warn).toHaveBeenCalledWith(
      "missing-parent",
      'target "target" references unknown group "missing-target-parent"; keeping it at the root',
    );
    expect(warn).toHaveBeenCalledWith(
      "missing-parent",
      'group "group" references unknown parent "missing-group-parent"; keeping it at the root',
    );
  });

  it("applies explicit sequences deterministically and diagnoses mismatches", () => {
    const warn = vi.fn();
    const groups = new Map<string, RegistryGroupEntry>([
      [
        "group",
        {
          id: "group",
          element: null,
          getOptions: () => ({
            id: "group",
            label: "Group",
            exitLabel: "Leave",
            disabled: true,
            sequence: ["b", "b", "missing"],
          }),
        },
      ],
    ]);
    const targets = new Map<string, RegistryTargetEntry>(
      ["a", "b", "c"].map((id) => [
        id,
        {
          id,
          element: null,
          getOptions: () => ({
            id,
            label: id.toUpperCase(),
            groupId: "group",
          }),
        },
      ]),
    );

    const tree = compileRegistryTree(targets, groups, new Map(), {
      reportParentCycle: vi.fn(),
      warn,
    });
    expect(tree.children[0]).toMatchObject({
      kind: "group",
      id: "group",
      exitLabel: "Leave",
      disabled: true,
      children: [{ id: "b" }, { id: "a" }, { id: "c" }],
    });
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("marks controls disabled by an ancestor fieldset as ineligible", () => {
    const fieldset = document.createElement("fieldset");
    fieldset.disabled = true;
    const button = document.createElement("button");
    fieldset.append(button);
    document.body.append(fieldset);
    const targets = new Map<string, RegistryTargetEntry>([
      [
        "disabled",
        {
          id: "disabled",
          element: button,
          getOptions: () => ({ id: "disabled", label: "Disabled" }),
        },
      ],
    ]);

    const tree = compileRegistryTree(targets, new Map(), new Map(), {
      reportParentCycle: vi.fn(),
      warn: vi.fn(),
    });

    expect(tree.children).toEqual([
      {
        kind: "target",
        id: "disabled",
        label: "Disabled",
        disabled: true,
      },
    ]);
  });
});
