import { describe, expect, it } from "vitest";
import { createScanner, stepScan } from "../core/index.ts";
import {
  ScanRegistry,
  scanGroupStructuralSignature,
  scanTargetStructuralSignature,
} from "./registry.ts";

describe("registry ownership", () => {
  it("signs every tree-affecting registration field and excludes callbacks", () => {
    const activate = () => undefined;
    const target = {
      id: "target",
      label: "Target",
      groupId: "group",
      disabled: false,
      activate,
    };
    const targetSignature = scanTargetStructuralSignature(target);
    expect(targetSignature).toBe(
      '{"id":"target","label":"Target","groupId":"group","disabled":false}',
    );
    expect(
      scanTargetStructuralSignature({ ...target, activate: () => 1 }),
    ).toBe(targetSignature);
    expect(
      scanTargetStructuralSignature({
        ...target,
        ref: { current: null },
      } as never),
    ).toBe(targetSignature);
    expect(
      scanTargetStructuralSignature({ ...target, disabled: true }),
    ).not.toBe(targetSignature);

    const group = {
      id: "group",
      label: "Group",
      parentId: "parent",
      exitLabel: "Leave",
      disabled: false,
      sequence: ["b", "a"],
    };
    const groupSignature = scanGroupStructuralSignature(group);
    expect(groupSignature).toContain('"sequence":["b","a"]');
    expect(
      scanGroupStructuralSignature({ ...group, exitLabel: "Back" }),
    ).not.toBe(groupSignature);
  });

  it("does not let stale cleanup remove a newer registration", () => {
    const registry = new ScanRegistry();
    const element = document.createElement("button");
    const firstCleanup = registry.mountTarget(
      "x",
      () => ({ id: "x", label: "First" }),
      element,
    );
    registry.mountTarget("x", () => ({ id: "x", label: "Second" }), element);
    firstCleanup();
    expect(registry.getTarget("x")?.getOptions().label).toBe("Second");
  });

  it("allows an ordinary group named root when it does not collide", () => {
    const registry = new ScanRegistry();
    const scanner = createScanner({ style: stepScan(), startOn: "command" });
    const group = document.createElement("div");
    const target = document.createElement("button");

    registry.attach(scanner);
    registry.mountGroup(
      "root",
      () => ({ id: "root", label: "User root" }),
      group,
    );
    registry.mountTarget(
      "inside",
      () => ({ id: "inside", label: "Inside", groupId: "root" }),
      target,
    );
    registry.flush();

    scanner.start();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "group",
      id: "root",
    });
    scanner.select();
    expect(scanner.getSnapshot()).toMatchObject({
      path: ["root"],
      highlight: { kind: "target", id: "inside" },
    });
  });

  it("rejects IDs shared by a target and group", () => {
    const registry = new ScanRegistry();
    const element = document.createElement("div");
    registry.mountTarget(
      "shared",
      () => ({ id: "shared", label: "Target" }),
      element,
    );
    expect(() =>
      registry.mountGroup(
        "shared",
        () => ({ id: "shared", label: "Group" }),
        element,
      ),
    ).toThrow('duplicate scan node id "shared"');
  });

  it("rejects cycles in explicit group parentage", () => {
    const registry = new ScanRegistry();
    registry.mountGroup(
      "a",
      () => ({ id: "a", label: "A", parentId: "b" }),
      null,
    );
    registry.mountGroup(
      "b",
      () => ({ id: "b", label: "B", parentId: "a" }),
      null,
    );
    registry.attach(createScanner({ style: stepScan() }));

    expect(() => registry.flush()).toThrow(
      "cyclic scan group parentage: a -> b -> a",
    );
  });

  it("owns group replacement, labels, and explicit unmount operations", () => {
    const registry = new ScanRegistry();
    const first = document.createElement("div");
    const second = document.createElement("div");
    registry.mountGroup(
      "group",
      () => ({ id: "group", label: "Group", exitLabel: "Leave" }),
      first,
    );
    expect(registry.exitLabelFor("group")).toBe("Leave");
    expect(registry.exitLabelFor("missing")).toBe("Back");
    registry.mountGroup(
      "group",
      () => ({ id: "group", label: "Replacement" }),
      null,
    );
    expect(registry.getGroupElement("group")).toBeNull();
    registry.unmountGroup("group");
    registry.unmountTarget("missing");
    registry.touchGroup();
    registry.touchTarget();

    registry.mountGroup(
      "duplicate",
      () => ({ id: "duplicate", label: "First" }),
      first,
    );
    expect(() =>
      registry.mountGroup(
        "duplicate",
        () => ({ id: "duplicate", label: "Second" }),
        second,
      ),
    ).toThrow('duplicate scan group id "duplicate"');
    expect(() =>
      registry.mountTarget(
        "duplicate",
        () => ({ id: "duplicate", label: "Target" }),
        document.createElement("button"),
      ),
    ).toThrow('duplicate scan node id "duplicate"');
  });
});
