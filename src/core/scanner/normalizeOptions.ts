import { normalizeSwitches, type NormalizedSwitch } from "../input/switches.ts";
import {
  assertBoolean,
  assertNonNegative,
  assertOneOf,
  fail,
} from "../shared/validate.ts";
import { assertScanMethod, type ScanMethod } from "../methods/methods.ts";
import type {
  AfterActivation,
  GroupExit,
  ScannerBehaviorOptions,
  StartOn,
} from "../types.ts";

interface NormalizedSelectionDelay {
  durationMs: number;
  resetOnInput: boolean;
}

/** Scanner options with every field validated and defaulted to a concrete value. */
export interface NormalizedOptions {
  method: ScanMethod;
  switches: Map<string, NormalizedSwitch>;
  startOn: StartOn;
  afterActivation: AfterActivation;
  groupExit: GroupExit;
  enabled: boolean;
  selectionDelay: NormalizedSelectionDelay;
}

/**
 * Validate and normalize a behavior-options update from `setOptions`. Rejects
 * the creation-only clock/scheduler fields before normalizing, so the call
 * fails synchronously at the call site rather than silently dropping them.
 */
export function normalizeOptionsUpdate(
  next: ScannerBehaviorOptions,
): NormalizedOptions {
  if ("clock" in next || "scheduler" in next) {
    throw new TypeError(
      "[switch-scanning] clock and scheduler are creation-only and cannot be changed with setOptions()",
    );
  }
  return normalizeOptions(next);
}

/** Validate raw behavior options and fill defaults, throwing on invalid input. */
export function normalizeOptions(
  raw: ScannerBehaviorOptions,
): NormalizedOptions {
  assertScanMethod(raw.method);
  const switches = normalizeSwitches(raw.switches);

  const startOn = raw.startOn ?? "input";
  assertOneOf(startOn, ["input", "mount", "manual"] as const, "startOn");

  const afterActivation = raw.afterActivation ?? "restart";
  assertOneOf(
    afterActivation,
    ["restart", "continue", "repeat", "stop"] as const,
    "afterActivation",
  );

  const groupExit = raw.groupExit ?? "after";
  assertOneOf(
    groupExit,
    ["after", "before", "back-only"] as const,
    "groupExit",
  );
  if (groupExit === "back-only" && !hasBackAction(switches)) {
    fail(
      'groupExit "back-only" requires a declared switch mapped to "back"; add one or use groupExit "before"/"after"',
    );
  }

  const enabled = raw.enabled ?? true;
  assertBoolean(enabled, "enabled");

  const durationMs = raw.selectionDelay?.durationMs ?? 0;
  assertNonNegative(durationMs, "selectionDelay.durationMs");
  const resetOnInput = raw.selectionDelay?.resetOnInput ?? true;
  assertBoolean(resetOnInput, "selectionDelay.resetOnInput");

  return {
    method: raw.method,
    switches,
    startOn,
    afterActivation,
    groupExit,
    enabled,
    selectionDelay: {
      durationMs,
      resetOnInput,
    },
  };
}

function hasBackAction(
  switches: ReadonlyMap<string, NormalizedSwitch>,
): boolean {
  for (const definition of switches.values()) {
    if (definition.type === "discrete" && definition.action === "back") {
      return true;
    }
    if (
      definition.type === "tapHold" &&
      (definition.tap === "back" || definition.holdAction === "back")
    ) {
      return true;
    }
  }
  return false;
}
