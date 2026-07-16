import { describe, expect, it } from "vitest";
import type { GestureStartState } from "./gestures.ts";
import { decideDiscreteInput, decideScanPress } from "./inputDecisions.ts";
import type { ScannerStatus, StartOn } from "../types.ts";

const START_STATES: GestureStartState[] = [
  "active",
  "startable",
  "transitioning",
  "paused",
  "disabled",
  "inactive",
];
const STATUSES: ScannerStatus[] = [
  "idle",
  "scanning",
  "transitioning",
  "paused",
  "complete",
];
const START_RULES: StartOn[] = ["input", "mount", "manual"];

describe("input lifecycle decisions", () => {
  it("performs ordinary actions only for a stable active scan", () => {
    let performed = 0;
    let started = 0;
    for (const startedIn of START_STATES) {
      for (const status of STATUSES) {
        for (const startOn of START_RULES) {
          const decision = decideDiscreteInput(
            "next",
            startedIn,
            status,
            startOn,
          );
          if (decision === "perform") {
            performed++;
            expect({ startedIn, status }).toEqual({
              startedIn: "active",
              status: "scanning",
            });
          }
          if (decision === "start") {
            started++;
            expect(startedIn).toBe("startable");
            expect(["idle", "complete"]).toContain(status);
            expect(startOn).toBe("input");
          }
        }
      }
    }
    // Guard against a regression that never reaches the positive branches.
    expect(performed).toBeGreaterThan(0);
    expect(started).toBeGreaterThan(0);
  });

  it("starts a phaseful scan only from the declared start boundary", () => {
    let performed = 0;
    let started = 0;
    for (const startedIn of START_STATES) {
      for (const status of STATUSES) {
        for (const startOn of START_RULES) {
          const decision = decideScanPress(startedIn, status, startOn);
          if (decision === "perform") {
            performed++;
            expect({ startedIn, status }).toEqual({
              startedIn: "active",
              status: "scanning",
            });
          }
          if (decision === "start") {
            started++;
            expect(startedIn).toBe("startable");
            expect(["idle", "complete"]).toContain(status);
            expect(startOn).toBe("input");
          }
        }
      }
    }
    expect(performed).toBeGreaterThan(0);
    expect(started).toBeGreaterThan(0);
  });

  it("keeps pause gestures on the lifecycle boundary where they began", () => {
    expect(
      decideDiscreteInput("togglePause", "active", "scanning", "input"),
    ).toBe("toggle-pause");
    expect(
      decideDiscreteInput(
        "togglePause",
        "transitioning",
        "transitioning",
        "input",
      ),
    ).toBe("toggle-pause");
    expect(
      decideDiscreteInput("togglePause", "paused", "paused", "input"),
    ).toBe("toggle-pause");
    expect(
      decideDiscreteInput("togglePause", "active", "paused", "input"),
    ).toBe("ignore");
    expect(
      decideDiscreteInput("togglePause", "inactive", "idle", "manual"),
    ).toBe("diagnose-toggle-pause");
  });
});
