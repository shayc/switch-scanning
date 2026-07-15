import { normalizeSwitches, type NormalizedSwitch } from "../input/switches.ts";
import {
  assertBoolean,
  assertNonNegative,
  assertOneOf,
  fail,
} from "../shared/validate.ts";
import { assertScanStyle, type ScanStyle } from "../styles/styles.ts";
import type {
  AfterActivation,
  GroupExit,
  ScannerBehaviorOptions,
  StartOn,
} from "../types.ts";

export interface NormalizedSelectionDelay {
  durationMs: number;
  resetOnInput: boolean;
}

export interface NormalizedOptions {
  style: ScanStyle;
  switches: Map<string, NormalizedSwitch>;
  startOn: StartOn;
  afterActivation: AfterActivation;
  groupExit: GroupExit;
  enabled: boolean;
  selectionDelay: NormalizedSelectionDelay;
}

export function normalizeOptions(
  raw: ScannerBehaviorOptions,
): NormalizedOptions {
  assertScanStyle(raw.style);
  const switches = normalizeSwitches(raw.switches);

  const startOn = raw.startOn ?? "switch";
  assertOneOf(startOn, ["switch", "mount", "command"] as const, "startOn");

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
    style: raw.style,
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
