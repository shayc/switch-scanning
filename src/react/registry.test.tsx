import { afterEach, describe, expect, it, vi } from "vitest";
import { createScanner, stepScan } from "../core/index.ts";
import type { ScannerEvent } from "../core/index.ts";
import {
  ScanRegistry,
  scanGroupStructuralSignature,
  scanTargetStructuralSignature,
} from "./registry.ts";

afterEach(() => vi.unstubAllEnvs());

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

  it("rejects the synthetic registry root ID for user nodes", () => {
    const registry = new ScanRegistry();
    expect(() =>
      registry.mountTarget(
        "__root__",
        () => ({ id: "__root__", label: "Target" }),
        document.createElement("button"),
      ),
    ).toThrow('scan node id "__root__" is reserved for the registry root');
    expect(() =>
      registry.mountGroup(
        "__root__",
        () => ({ id: "__root__", label: "Group" }),
        document.createElement("div"),
      ),
    ).toThrow('scan node id "__root__" is reserved for the registry root');
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
    expect(() =>
      registry.mountGroup(
        "b",
        () => ({ id: "b", label: "B", parentId: "a" }),
        null,
      ),
    ).toThrow("cyclic scan group parentage: a -> b -> a");
  });

  it("emits typed production diagnostics for duplicate, reserved, and cyclic IDs", () => {
    vi.stubEnv("NODE_ENV", "production");
    const scanner = createScanner({ style: stepScan() });
    const diagnostics: Extract<ScannerEvent, { type: "diagnostic" }>[] = [];
    scanner.observe((event) => {
      if (event.type === "diagnostic") diagnostics.push(event);
    });
    const registry = new ScanRegistry();

    registry.mountTarget(
      "__root__",
      () => ({ id: "__root__", label: "Reserved" }),
      document.createElement("button"),
    );
    registry.attach(scanner);
    registry.mountTarget(
      "duplicate",
      () => ({ id: "duplicate", label: "First" }),
      document.createElement("button"),
    );
    registry.mountTarget(
      "duplicate",
      () => ({ id: "duplicate", label: "Second" }),
      document.createElement("button"),
    );
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

    expect(diagnostics.map((event) => event.code)).toEqual([
      "reserved-id",
      "duplicate-id",
      "parent-cycle",
    ]);
  });

  it("exposes exit labels and falls back to Back for unknown groups", () => {
    const registry = new ScanRegistry();
    registry.mountGroup(
      "group",
      () => ({ id: "group", label: "Group", exitLabel: "Leave" }),
      document.createElement("div"),
    );
    expect(registry.exitLabelFor("group")).toBe("Leave");
    expect(registry.exitLabelFor("missing")).toBe("Back");
  });

  it("replaces a group in place and drops its element when remounted without one", () => {
    const registry = new ScanRegistry();
    registry.mountGroup(
      "group",
      () => ({ id: "group", label: "Group" }),
      document.createElement("div"),
    );
    registry.mountGroup(
      "group",
      () => ({ id: "group", label: "Replacement" }),
      null,
    );
    expect(registry.getGroupElement("group")).toBeNull();
  });

  it("removes a group on unmount and frees its id for reuse", () => {
    const registry = new ScanRegistry();
    registry.mountGroup(
      "group",
      () => ({ id: "group", label: "Group" }),
      document.createElement("div"),
    );
    registry.unmountGroup("group");
    expect(registry.getGroupElement("group")).toBeNull();
    // The id is free, so remounting must not throw a duplicate diagnostic.
    expect(() =>
      registry.mountGroup(
        "group",
        () => ({ id: "group", label: "Reused" }),
        document.createElement("div"),
      ),
    ).not.toThrow();
  });

  it("rejects a duplicate id across groups and targets", () => {
    const registry = new ScanRegistry();
    registry.mountGroup(
      "duplicate",
      () => ({ id: "duplicate", label: "First" }),
      document.createElement("div"),
    );
    expect(() =>
      registry.mountGroup(
        "duplicate",
        () => ({ id: "duplicate", label: "Second" }),
        document.createElement("div"),
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
