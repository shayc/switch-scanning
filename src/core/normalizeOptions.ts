import { assertScanStyle, type ScanStyle } from "./styles.ts";
import {
  normalizeSwitches,
  type NormalizedSwitch,
} from "./input/switches.ts";
import type {
  AfterActivation,
  GroupExit,
  ScannerBehaviorOptions,
  StartOn,
} from "./types.ts";

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
  const groupExit = raw.groupExit ?? "after";
  if (
    groupExit !== "after" &&
    groupExit !== "before" &&
    groupExit !== "back-only"
  ) {
    throw new RangeError(
      `[switch-scanning] groupExit must be "after", "before", or "back-only" (received ${String(groupExit)})`,
    );
  }
  if (groupExit === "back-only" && !hasBackAction(switches)) {
    throw new RangeError(
      '[switch-scanning] groupExit "back-only" requires a declared switch mapped to "back"; add one or use groupExit "before"/"after"',
    );
  }

  const durationMs = raw.selectionDelay?.durationMs ?? 0;
  assertNonNegative(durationMs, "selectionDelay.durationMs");
  const resetOnInput = raw.selectionDelay?.resetOnInput ?? true;
  if (typeof resetOnInput !== "boolean") {
    throw new TypeError(
      `[switch-scanning] selectionDelay.resetOnInput must be a boolean (received ${String(resetOnInput)})`,
    );
  }

  const startOn = raw.startOn ?? "switch";
  if (startOn !== "switch" && startOn !== "mount" && startOn !== "command") {
    throw new RangeError(
      `[switch-scanning] startOn must be "switch", "mount", or "command" (received ${String(startOn)})`,
    );
  }

  const afterActivation = raw.afterActivation ?? "restart";
  if (
    afterActivation !== "restart" &&
    afterActivation !== "continue" &&
    afterActivation !== "repeat" &&
    afterActivation !== "stop"
  ) {
    throw new RangeError(
      `[switch-scanning] afterActivation must be "restart", "continue", "repeat", or "stop" (received ${String(afterActivation)})`,
    );
  }

  const enabled = raw.enabled ?? true;
  if (typeof enabled !== "boolean") {
    throw new TypeError(
      `[switch-scanning] enabled must be a boolean (received ${String(enabled)})`,
    );
  }

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

function assertNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `[switch-scanning] ${name} must be a finite number >= 0 (received ${value})`,
    );
  }
}
