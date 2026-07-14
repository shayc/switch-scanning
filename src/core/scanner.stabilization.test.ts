import { afterEach, describe, expect, it, vi } from "vitest";
import { manualClock } from "./clock.ts";
import { createScanner } from "./scanner.ts";
import { stepScan } from "./styles.ts";
import type { ScannerEvent } from "./types.ts";

const root = {
  kind: "group" as const,
  id: "actual-root",
  label: "Root",
  children: [
    { kind: "target" as const, id: "a", label: "A" },
    { kind: "target" as const, id: "b", label: "B" },
    { kind: "target" as const, id: "c", label: "C" },
  ],
};

afterEach(() => vi.unstubAllEnvs());

describe("tree, repeat, and diagnostic stabilization", () => {
  it("rejects a child colliding with the supplied root and keeps the previous tree", () => {
    const scanner = createScanner({ style: stepScan(), startOn: "command" });
    const events: ScannerEvent[] = [];
    scanner.observe((event) => events.push(event));
    scanner.setTree(root);
    scanner.setTree({
      ...root,
      children: [{ kind: "target", id: "actual-root", label: "Collision" }],
    });
    scanner.start();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "a",
    });
    expect(events).toContainEqual({
      type: "diagnostic",
      code: "duplicate-id",
      message:
        'duplicate scan node id "actual-root"; keeping the previous tree',
    });
  });

  it("repeats previous with the same step timing as next", () => {
    const clock = manualClock();
    const scanner = createScanner({
      style: stepScan({ repeat: { delayMs: 100, intervalMs: 50 } }),
      switches: { reverse: { action: "previous" } },
      startOn: "command",
      clock,
    });
    scanner.setTree(root);
    scanner.start();
    scanner.input.press("reverse", "key");
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "c",
    });
    clock.advanceBy(100);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "b",
    });
    clock.advanceBy(50);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "a",
    });
    scanner.input.release("reverse", "key");
    clock.advanceBy(500);
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "a",
    });
  });

  it("emits every repeated diagnostic but warns only once in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const scanner = createScanner({ style: stepScan() });
    const diagnostics: ScannerEvent[] = [];
    scanner.observe((event) => {
      if (event.type === "diagnostic") diagnostics.push(event);
    });
    scanner.input.press("missing");
    scanner.input.release("missing");
    scanner.input.press("missing");
    expect(diagnostics).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("keeps production diagnostics event-only", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const scanner = createScanner({ style: stepScan() });
    const diagnostics: ScannerEvent[] = [];
    scanner.observe((event) => {
      if (event.type === "diagnostic") diagnostics.push(event);
    });
    scanner.input.press("missing");
    expect(diagnostics).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
