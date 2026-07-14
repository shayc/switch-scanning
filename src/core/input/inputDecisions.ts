import type { GestureStartState } from "./gestures.ts";
import type { DiscreteAction } from "./switches.ts";
import type { ScannerStatus, StartOn } from "../types.ts";

export type DiscreteInputDecision =
  "ignore" | "start" | "perform" | "toggle-pause" | "diagnose-toggle-pause";

/** Pure lifecycle gate for a recognized discrete switch action. */
export function decideDiscreteInput(
  action: DiscreteAction,
  startedIn: GestureStartState,
  status: ScannerStatus,
  startOn: StartOn,
): DiscreteInputDecision {
  if (startedIn === "disabled") return "ignore";
  if (
    (startedIn === "inactive" || startedIn === "startable") &&
    status !== "idle" &&
    status !== "complete"
  ) {
    return "ignore";
  }

  if (action === "togglePause") {
    if (startedIn === "active" && status !== "scanning") return "ignore";
    if (startedIn === "transitioning" && status !== "transitioning") {
      return "ignore";
    }
    if (startedIn === "paused" && status !== "paused") return "ignore";
    return status === "paused" ||
      status === "scanning" ||
      status === "transitioning"
      ? "toggle-pause"
      : "diagnose-toggle-pause";
  }

  if (startedIn === "inactive") return "ignore";
  if (
    startedIn === "transitioning" ||
    startedIn === "paused" ||
    status === "transitioning" ||
    status === "paused"
  ) {
    return "ignore";
  }
  if (status === "idle" || status === "complete") {
    return startedIn === "startable" && startOn === "switch"
      ? "start"
      : "ignore";
  }
  return "perform";
}

export type ScanPressDecision = "ignore" | "start" | "perform";

/** Pure lifecycle gate for the press phase of an inverse-scan switch. */
export function decideScanPress(
  startedIn: GestureStartState,
  status: ScannerStatus,
  startOn: StartOn,
): ScanPressDecision {
  if (
    startedIn === "disabled" ||
    startedIn === "inactive" ||
    startedIn === "paused" ||
    startedIn === "transitioning"
  ) {
    return "ignore";
  }
  if (startedIn === "startable") {
    return (status === "idle" || status === "complete") && startOn === "switch"
      ? "start"
      : "ignore";
  }
  return status === "scanning" ? "perform" : "ignore";
}
