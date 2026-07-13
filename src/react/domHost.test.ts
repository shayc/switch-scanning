import { afterEach, describe, expect, it, vi } from "vitest";
import { createDomHost } from "./domHost.ts";
import { ScanRegistry } from "./registry.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("DOM host", () => {
  it("presents targets, ancestors, exits, and clearing", () => {
    const registry = new ScanRegistry();
    const group = document.createElement("div");
    const target = document.createElement("button");
    group.append(target);
    document.body.append(group);
    registry.mountGroup(
      "group",
      () => ({ id: "group", label: "Group" }),
      group,
    );
    registry.mountTarget(
      "target",
      () => ({ id: "target", label: "Target" }),
      target,
    );
    const host = createDomHost(registry, () => "Back from group");

    host.reveal?.({ kind: "target", id: "target" });
    expect(target.getAttribute("data-scan-highlighted")).toBe("");
    expect(group.getAttribute("data-scan-within")).toBe("");

    host.reveal?.({ kind: "exit", groupId: "group" });
    expect(target.hasAttribute("data-scan-highlighted")).toBe(false);
    expect(group.getAttribute("data-scan-exit-highlighted")).toBe("");
    expect(group.getAttribute("data-scan-exit-label")).toBe("Back from group");

    host.reveal?.(null);
    expect(group.hasAttribute("data-scan-exit-highlighted")).toBe(false);
  });

  it("uses custom and native activation paths and reports ineligible targets", () => {
    const registry = new ScanRegistry();
    const custom = vi.fn();
    const customElement = document.createElement("div");
    registry.mountTarget(
      "custom",
      () => ({ id: "custom", label: "Custom", activate: custom }),
      customElement,
    );
    const button = document.createElement("button");
    const click = vi.fn();
    button.addEventListener("click", click);
    registry.mountTarget(
      "native",
      () => ({ id: "native", label: "Native" }),
      button,
    );
    const disabled = document.createElement("button");
    disabled.disabled = true;
    registry.mountTarget(
      "disabled",
      () => ({ id: "disabled", label: "Disabled" }),
      disabled,
    );
    registry.mountTarget(
      "headless",
      () => ({ id: "headless", label: "Headless" }),
      null,
    );
    const host = createDomHost(registry, () => "Back");

    expect(host.activate("custom")).toEqual({ activated: true });
    expect(custom).toHaveBeenCalledOnce();
    expect(host.activate("native")).toEqual({ activated: true });
    expect(click).toHaveBeenCalledOnce();
    expect(host.activate("disabled")).toEqual({
      activated: false,
      reason: "target disabled",
    });
    expect(host.activate("headless")).toEqual({
      activated: false,
      reason: "target has no element",
    });
    expect(host.activate("missing")).toEqual({
      activated: false,
      reason: "target not registered",
    });
  });
});
