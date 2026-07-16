import { describe, expect, it, vi } from "vitest";
import { createScanner } from "../scanner/scanner.ts";
import { autoScan, stepScan } from "../methods/methods.ts";
import { createScannerFixture, createTestScanner } from "./index.ts";

const TARGETS = [
  { kind: "target" as const, id: "yes", label: "Yes" },
  { kind: "target" as const, id: "no", label: "No" },
];

describe("scanner testing helpers", () => {
  it("createTestScanner supplies one manual clock to the scanner and caller", () => {
    const test = createTestScanner(
      { method: autoScan({ intervalMs: 100, passes: 2 }) },
      TARGETS,
    );
    test.scanner.start();

    test.clock.advanceBy(100);

    expect(test.scanner.getSnapshot().highlight).toMatchObject({ id: "no" });
  });

  it("does not let an untyped scheduler split the helper's time base", () => {
    const externalSchedule = vi.fn(() => () => undefined);
    const options = {
      method: autoScan({ intervalMs: 100, passes: 2 }),
      scheduler: { schedule: externalSchedule },
    } as unknown as Parameters<typeof createTestScanner>[0];

    const test = createTestScanner(options, TARGETS);
    test.scanner.start();
    expect(externalSchedule).not.toHaveBeenCalled();

    test.clock.advanceBy(100);
    expect(test.scanner.getSnapshot().highlight).toMatchObject({ id: "no" });
  });

  it("allowActivation clears a fixture failure for a later selection", () => {
    const scanner = createScanner({ method: stepScan() });
    const fixture = createScannerFixture(scanner, TARGETS);
    fixture.failActivation("yes", "not yet");
    scanner.start();
    scanner.select();
    expect(fixture.activations).toEqual([]);

    fixture.allowActivation("yes");
    scanner.select();

    expect(fixture.activations).toEqual(["yes"]);
  });

  it("throws when its exclusive host attachment is rejected", () => {
    const scanner = createScanner({ method: stepScan() });
    scanner.attachHost({ activate: () => ({ activated: true }) });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => createScannerFixture(scanner, TARGETS)).toThrow(
      /could not attach its host/,
    );
  });
});
