/**
 * Logical switches sit between a physical device signal and a semantic scan
 * action. This module defines the public switch shapes, their validation, and
 * a normalized internal form the gesture recognizer consumes.
 */

/** Actions produced by a stabilized, recognized gesture. */
export type DiscreteAction = "select" | "next" | "previous" | "back";

/** The phaseful action: press begins advancement, release selects. */
export type ScanAction = "scan";

export type SwitchAction = DiscreteAction | ScanAction;

export interface DiscreteSwitchDefinition {
  action: DiscreteAction;
  performOn?: "press" | "release";
  holdDurationMs?: number;
  ignoreRepeatMs?: number;
}

export interface ScanSwitchDefinition {
  action: ScanAction;
  holdDurationMs?: number;
  ignoreRepeatMs?: number;
}

export interface TapHoldSwitchDefinition {
  tap: DiscreteAction;
  hold: {
    afterMs: number;
    action: DiscreteAction;
  };
  holdDurationMs?: number;
  ignoreRepeatMs?: number;
}

export type SwitchDefinition =
  | DiscreteSwitchDefinition
  | ScanSwitchDefinition
  | TapHoldSwitchDefinition;

export type NormalizedSwitch =
  | {
      readonly type: "discrete";
      readonly action: DiscreteAction;
      readonly performOn: "press" | "release";
      readonly holdDurationMs: number;
      readonly ignoreRepeatMs: number;
    }
  | {
      readonly type: "scan";
      readonly holdDurationMs: number;
      readonly ignoreRepeatMs: number;
    }
  | {
      readonly type: "tapHold";
      readonly tap: DiscreteAction;
      readonly holdAfterMs: number;
      readonly holdAction: DiscreteAction;
      readonly holdDurationMs: number;
      readonly ignoreRepeatMs: number;
    };

function fail(message: string): never {
  throw new RangeError(`[switch-scanning] ${message}`);
}

function assertNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    fail(`${name} must be a finite number >= 0 (received ${value})`);
  }
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    fail(`${name} must be a finite number greater than 0 (received ${value})`);
  }
}

function isDiscreteAction(action: string): action is DiscreteAction {
  return action === "select" || action === "next" || action === "previous" || action === "back";
}

export function normalizeSwitch(id: string, def: SwitchDefinition): NormalizedSwitch {
  if (id.trim() === "") {
    fail("switch IDs must be non-empty strings");
  }

  if ("tap" in def) {
    if ((def.tap as string) === "scan" || (def.hold.action as string) === "scan") {
      fail(`switch "${id}": tap/hold cannot use the phaseful "scan" action`);
    }
    if (!isDiscreteAction(def.tap)) {
      fail(`switch "${id}": tap must be a discrete action`);
    }
    if (!isDiscreteAction(def.hold.action)) {
      fail(`switch "${id}": hold.action must be a discrete action`);
    }
    assertPositive(def.hold.afterMs, `switch "${id}": hold.afterMs`);
    const holdDurationMs = def.holdDurationMs ?? 0;
    const ignoreRepeatMs = def.ignoreRepeatMs ?? 0;
    assertNonNegative(holdDurationMs, `switch "${id}": holdDurationMs`);
    assertNonNegative(ignoreRepeatMs, `switch "${id}": ignoreRepeatMs`);
    if (holdDurationMs >= def.hold.afterMs) {
      fail(`switch "${id}": holdDurationMs must be less than hold.afterMs`);
    }
    return {
      type: "tapHold",
      tap: def.tap,
      holdAfterMs: def.hold.afterMs,
      holdAction: def.hold.action,
      holdDurationMs,
      ignoreRepeatMs,
    };
  }

  if (def.action === "scan") {
    if ((def as { performOn?: unknown }).performOn !== undefined) {
      fail(`switch "${id}": a "scan" definition cannot specify performOn`);
    }
    const holdDurationMs = def.holdDurationMs ?? 0;
    const ignoreRepeatMs = def.ignoreRepeatMs ?? 0;
    assertNonNegative(holdDurationMs, `switch "${id}": holdDurationMs`);
    assertNonNegative(ignoreRepeatMs, `switch "${id}": ignoreRepeatMs`);
    return { type: "scan", holdDurationMs, ignoreRepeatMs };
  }

  if (!isDiscreteAction(def.action)) {
    fail(`switch "${id}": unknown action "${String(def.action)}"`);
  }
  const performOn = def.performOn ?? "press";
  const holdDurationMs = def.holdDurationMs ?? 0;
  const ignoreRepeatMs = def.ignoreRepeatMs ?? 0;
  assertNonNegative(holdDurationMs, `switch "${id}": holdDurationMs`);
  assertNonNegative(ignoreRepeatMs, `switch "${id}": ignoreRepeatMs`);
  return {
    type: "discrete",
    action: def.action,
    performOn,
    holdDurationMs,
    ignoreRepeatMs,
  };
}

export function normalizeSwitches(
  switches: Readonly<Record<string, SwitchDefinition>> | undefined,
): Map<string, NormalizedSwitch> {
  const result = new Map<string, NormalizedSwitch>();
  if (!switches) return result;
  for (const [id, def] of Object.entries(switches)) {
    result.set(id, normalizeSwitch(id, def));
  }
  return result;
}
