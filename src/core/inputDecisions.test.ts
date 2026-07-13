import { describe, expect, it } from "vitest";
import type { GestureStartState } from "./gestures.ts";
import { decideDiscreteInput, decideScanPress } from "./inputDecisions.ts";
import type { ScannerStatus, StartOn } from "./types.ts";

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
const START_RULES: StartOn[] = ["switch", "mount", "command"];

describe("input lifecycle decisions", () => {
  it("performs ordinary actions only for a stable active scan", () => {
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
            expect({ startedIn, status }).toEqual({
              startedIn: "active",
              status: "scanning",
            });
          }
          if (decision === "start") {
            expect(startedIn).toBe("startable");
            expect(["idle", "complete"]).toContain(status);
            expect(startOn).toBe("switch");
          }
        }
      }
    }
  });

  it("starts a phaseful scan only from the declared start boundary", () => {
    for (const startedIn of START_STATES) {
      for (const status of STATUSES) {
        for (const startOn of START_RULES) {
          const decision = decideScanPress(startedIn, status, startOn);
          if (decision === "perform") {
            expect({ startedIn, status }).toEqual({
              startedIn: "active",
              status: "scanning",
            });
          }
          if (decision === "start") {
            expect(startedIn).toBe("startable");
            expect(["idle", "complete"]).toContain(status);
            expect(startOn).toBe("switch");
          }
        }
      }
    }
  });

  it("keeps pause gestures on the lifecycle boundary where they began", () => {
    expect(
      decideDiscreteInput("togglePause", "active", "scanning", "switch"),
    ).toBe("toggle-pause");
    expect(
      decideDiscreteInput(
        "togglePause",
        "transitioning",
        "transitioning",
        "switch",
      ),
    ).toBe("toggle-pause");
    expect(
      decideDiscreteInput("togglePause", "paused", "paused", "switch"),
    ).toBe("toggle-pause");
    expect(
      decideDiscreteInput("togglePause", "active", "paused", "switch"),
    ).toBe("ignore");
    expect(
      decideDiscreteInput("togglePause", "inactive", "idle", "command"),
    ).toBe("diagnose-toggle-pause");
  });
});
