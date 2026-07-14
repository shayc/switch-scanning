import { describe, expect, it, vi } from "vitest";
import { createScanner } from "../scanner.ts";
import { autoScan, stepScan } from "../styles.ts";
import { createScannerFixture, createTestScanner } from "./index.ts";

const TARGETS = [
  { kind: "target" as const, id: "yes", label: "Yes" },
  { kind: "target" as const, id: "no", label: "No" },
];

describe("scanner testing helpers", () => {
  it("createTestScanner supplies one manual clock to the scanner and caller", () => {
    const test = createTestScanner(
      (clock) =>
        createScanner({
          style: autoScan({ intervalMs: 100, loops: 2 }),
          clock,
        }),
      TARGETS,
    );
    test.scanner.start();

    test.clock.advanceBy(100);

    expect(test.scanner.getSnapshot().highlight).toMatchObject({ id: "no" });
  });

  it("allowActivation clears a fixture failure for a later selection", () => {
    const scanner = createScanner({ style: stepScan() });
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
    const scanner = createScanner({ style: stepScan() });
    scanner.attachHost({ activate: () => ({ activated: true }) });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => createScannerFixture(scanner, TARGETS)).toThrow(
      /could not attach its host/,
    );
  });
});
