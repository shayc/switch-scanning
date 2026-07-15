/**
 * Logical switches sit between a physical device signal and a semantic scan
 * action. This module defines the public switch shapes, their validation, and
 * a normalized internal form the gesture recognizer consumes.
 */

/** Actions produced by a stabilized, recognized gesture. */
export type DiscreteAction =
  "select" | "next" | "previous" | "back" | "togglePause";

/** The phaseful action: press begins advancement, release selects. */
export type ScanAction = "scan";

/** Any action a switch can trigger. */
export type SwitchAction = DiscreteAction | ScanAction;

/** A switch that fires one discrete action per accepted press. */
export interface DiscreteSwitchDefinition {
  action: DiscreteAction;
  performOn?: "press" | "release";
  holdDurationMs?: number;
  ignoreRepeatMs?: number;
}

/** A switch bound to the phaseful `scan` action. */
export interface ScanSwitchDefinition {
  action: ScanAction;
  holdDurationMs?: number;
  ignoreRepeatMs?: number;
}

/** A switch that fires one action on a tap and another when held. */
export interface TapHoldSwitchDefinition {
  tap: DiscreteAction;
  hold: {
    afterMs: number;
    action: DiscreteAction;
  };
  holdDurationMs?: number;
  ignoreRepeatMs?: number;
}

/** Any switch definition: discrete, phaseful `scan`, or tap/hold. */
export type SwitchDefinition =
  DiscreteSwitchDefinition | ScanSwitchDefinition | TapHoldSwitchDefinition;

/**
 * How a just-started press will be decided, carried on `input.pressed` so
 * hosts can animate hold or stabilization progress without re-implementing
 * gesture timing.
 */
export type PressRecognition =
  /** The press was accepted the moment contact began. */
  | { readonly kind: "immediate" }
  /** The press is accepted after remaining held for `holdDurationMs`. */
  | { readonly kind: "stabilize"; readonly holdDurationMs: number }
  /** The action fires on release, if held at least `holdDurationMs`. */
  | {
      readonly kind: "hold";
      readonly holdDurationMs: number;
      readonly action: DiscreteAction;
    }
  /** Release before `holdAfterMs` taps; holding past it fires `holdAction`. */
  | {
      readonly kind: "tapHold";
      readonly holdAfterMs: number;
      readonly tapAction: DiscreteAction;
      readonly holdAction: DiscreteAction;
    };

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

function isDiscreteAction(action: unknown): action is DiscreteAction {
  return (
    action === "select" ||
    action === "next" ||
    action === "previous" ||
    action === "back" ||
    action === "togglePause"
  );
}

export function normalizeSwitch(
  id: string,
  def: SwitchDefinition,
): NormalizedSwitch {
  if (typeof id !== "string" || id.trim() === "") {
    fail("switch IDs must be non-empty strings");
  }

  if (typeof def !== "object" || def === null || Array.isArray(def)) {
    fail(`switch "${id}": definition must be an object`);
  }

  const candidate = def as unknown as Record<string, unknown>;

  if ("tap" in candidate) {
    const hold = candidate.hold;
    if (typeof hold !== "object" || hold === null || Array.isArray(hold)) {
      fail(`switch "${id}": hold must be an object`);
    }
    const holdCandidate = hold as Record<string, unknown>;
    if (candidate.tap === "scan" || holdCandidate.action === "scan") {
      fail(`switch "${id}": tap/hold cannot use the phaseful "scan" action`);
    }
    if (!isDiscreteAction(candidate.tap)) {
      fail(`switch "${id}": tap must be a discrete action`);
    }
    if (!isDiscreteAction(holdCandidate.action)) {
      fail(`switch "${id}": hold.action must be a discrete action`);
    }
    assertPositive(
      holdCandidate.afterMs as number,
      `switch "${id}": hold.afterMs`,
    );
    const holdDurationMs =
      (candidate.holdDurationMs as number | undefined) ?? 0;
    const ignoreRepeatMs =
      (candidate.ignoreRepeatMs as number | undefined) ?? 0;
    assertNonNegative(holdDurationMs, `switch "${id}": holdDurationMs`);
    assertNonNegative(ignoreRepeatMs, `switch "${id}": ignoreRepeatMs`);
    if (holdDurationMs >= (holdCandidate.afterMs as number)) {
      fail(`switch "${id}": holdDurationMs must be less than hold.afterMs`);
    }
    return {
      type: "tapHold",
      tap: candidate.tap,
      holdAfterMs: holdCandidate.afterMs as number,
      holdAction: holdCandidate.action,
      holdDurationMs,
      ignoreRepeatMs,
    };
  }

  if (candidate.action === "scan") {
    if ((def as { performOn?: unknown }).performOn !== undefined) {
      fail(`switch "${id}": a "scan" definition cannot specify performOn`);
    }
    const holdDurationMs =
      (candidate.holdDurationMs as number | undefined) ?? 0;
    const ignoreRepeatMs =
      (candidate.ignoreRepeatMs as number | undefined) ?? 0;
    assertNonNegative(holdDurationMs, `switch "${id}": holdDurationMs`);
    assertNonNegative(ignoreRepeatMs, `switch "${id}": ignoreRepeatMs`);
    return { type: "scan", holdDurationMs, ignoreRepeatMs };
  }

  if (!isDiscreteAction(candidate.action)) {
    fail(`switch "${id}": unknown action "${String(candidate.action)}"`);
  }
  const performOn =
    candidate.performOn === undefined ? "press" : candidate.performOn;
  if (performOn !== "press" && performOn !== "release") {
    fail(`switch "${id}": performOn must be "press" or "release"`);
  }
  const holdDurationMs = (candidate.holdDurationMs as number | undefined) ?? 0;
  const ignoreRepeatMs = (candidate.ignoreRepeatMs as number | undefined) ?? 0;
  assertNonNegative(holdDurationMs, `switch "${id}": holdDurationMs`);
  assertNonNegative(ignoreRepeatMs, `switch "${id}": ignoreRepeatMs`);
  return {
    type: "discrete",
    action: candidate.action,
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
