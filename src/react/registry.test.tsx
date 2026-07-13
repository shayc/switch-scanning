import { describe, expect, it } from "vitest";
import { createScanner, stepScan } from "../core/index.ts";
import { ScanRegistry } from "./registry.ts";

describe("registry ownership", () => {
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

  it("keeps the synthetic root outside the user ID namespace", () => {
    const registry = new ScanRegistry();
    const scanner = createScanner({ style: stepScan(), startOn: "command" });
    const group = document.createElement("div");
    const target = document.createElement("button");

    registry.attach(scanner);
    registry.mountGroup(
      "__root__",
      () => ({ id: "__root__", label: "User root" }),
      group,
    );
    registry.mountTarget(
      "inside",
      () => ({ id: "inside", label: "Inside", groupId: "__root__" }),
      target,
    );
    registry.flush();

    scanner.start();
    expect(scanner.getSnapshot().highlight).toEqual({ kind: "group", id: "__root__" });
    scanner.select();
    expect(scanner.getSnapshot()).toMatchObject({
      path: ["__root__"],
      highlight: { kind: "target", id: "inside" },
    });
  });

  it("rejects IDs shared by a target and group", () => {
    const registry = new ScanRegistry();
    const element = document.createElement("div");
    registry.mountTarget("shared", () => ({ id: "shared", label: "Target" }), element);
    expect(() =>
      registry.mountGroup("shared", () => ({ id: "shared", label: "Group" }), element),
    ).toThrow('duplicate scan node id "shared"');
  });

  it("rejects cycles in explicit group parentage", () => {
    const registry = new ScanRegistry();
    registry.mountGroup("a", () => ({ id: "a", label: "A", parentId: "b" }), null);
    registry.mountGroup("b", () => ({ id: "b", label: "B", parentId: "a" }), null);
    registry.attach(createScanner({ style: stepScan() }));

    expect(() => registry.flush()).toThrow("cyclic scan group parentage: a -> b -> a");
  });
});
