/**
 * Logical switches sit between a physical device signal and a semantic scan
 * action. This module defines the public switch shapes, their validation, and
 * a normalized internal form the gesture recognizer consumes.
 */

import {
  assertNonNegative,
  assertOneOf,
  assertPositive,
  fail,
  readNumber,
  readOptionalNumber,
} from "../shared/validate.ts";

const DISCRETE_ACTIONS = [
  "select",
  "next",
  "previous",
  "back",
  "togglePause",
] as const;

/** Actions produced by a stabilized, recognized gesture. */
export type DiscreteAction = (typeof DISCRETE_ACTIONS)[number];

/** The phaseful action: press begins advancement, release selects. */
export type ScanAction = "scan";

/** Any action a switch can trigger. */
export type SwitchAction = DiscreteAction | ScanAction;

/** Timing fields every switch shape may specify. */
interface SwitchTiming {
  holdDurationMs?: number;
  ignoreRepeatMs?: number;
}

/** A switch that fires one discrete action per accepted press. */
export interface DiscreteSwitchDefinition extends SwitchTiming {
  action: DiscreteAction;
  performOn?: "press" | "release";
}

/** A switch bound to the phaseful `scan` action. */
export interface ScanSwitchDefinition extends SwitchTiming {
  action: ScanAction;
}

/** A switch that fires one action on a tap and another when held. */
export interface TapHoldSwitchDefinition extends SwitchTiming {
  tap: DiscreteAction;
  hold: {
    afterMs: number;
    action: DiscreteAction;
  };
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

/** Timing fields resolved to concrete values during normalization. */
export interface ResolvedTiming {
  readonly holdDurationMs: number;
  readonly ignoreRepeatMs: number;
}

/** A validated switch definition with timing resolved, ready for the gesture engine. */
export type NormalizedSwitch =
  | ({
      readonly type: "discrete";
      readonly action: DiscreteAction;
      readonly performOn: "press" | "release";
    } & ResolvedTiming)
  | ({ readonly type: "scan" } & ResolvedTiming)
  | ({
      readonly type: "tapHold";
      readonly tap: DiscreteAction;
      readonly holdAfterMs: number;
      readonly holdAction: DiscreteAction;
    } & ResolvedTiming);

function isDiscreteAction(action: unknown): action is DiscreteAction {
  return (DISCRETE_ACTIONS as readonly unknown[]).includes(action);
}

/** Reads and validates the timing fields common to every switch shape. */
function resolveTiming(
  candidate: Record<string, unknown>,
  at: (field: string) => string,
): ResolvedTiming {
  const holdDurationMs = readOptionalNumber(
    candidate,
    "holdDurationMs",
    at("holdDurationMs"),
  );
  const ignoreRepeatMs = readOptionalNumber(
    candidate,
    "ignoreRepeatMs",
    at("ignoreRepeatMs"),
  );
  assertNonNegative(holdDurationMs, at("holdDurationMs"));
  assertNonNegative(ignoreRepeatMs, at("ignoreRepeatMs"));
  return { holdDurationMs, ignoreRepeatMs };
}

/** Validate and normalize one switch definition, failing on malformed input. */
export function normalizeSwitch(
  id: string,
  def: SwitchDefinition,
): NormalizedSwitch {
  if (typeof id !== "string" || id.trim() === "") {
    fail("switch IDs must be non-empty strings");
  }

  const at = (field: string) => `switch "${id}": ${field}`;

  if (typeof def !== "object" || def === null || Array.isArray(def)) {
    fail(at("definition must be an object"));
  }

  const candidate = def as unknown as Record<string, unknown>;

  if ("tap" in candidate) {
    const hold = candidate.hold;
    if (typeof hold !== "object" || hold === null || Array.isArray(hold)) {
      fail(at("hold must be an object"));
    }
    const holdCandidate = hold as Record<string, unknown>;
    if (candidate.tap === "scan" || holdCandidate.action === "scan") {
      fail(at('tap/hold cannot use the phaseful "scan" action'));
    }
    if (!isDiscreteAction(candidate.tap)) {
      fail(at("tap must be a discrete action"));
    }
    if (!isDiscreteAction(holdCandidate.action)) {
      fail(at("hold.action must be a discrete action"));
    }
    const holdAfterMs = readNumber(
      holdCandidate,
      "afterMs",
      at("hold.afterMs"),
    );
    assertPositive(holdAfterMs, at("hold.afterMs"));
    const { holdDurationMs, ignoreRepeatMs } = resolveTiming(candidate, at);
    if (holdDurationMs >= holdAfterMs) {
      fail(at("holdDurationMs must be less than hold.afterMs"));
    }
    return {
      type: "tapHold",
      tap: candidate.tap,
      holdAfterMs,
      holdAction: holdCandidate.action,
      holdDurationMs,
      ignoreRepeatMs,
    };
  }

  if (candidate.action === "scan") {
    if (candidate.performOn !== undefined) {
      fail(at('a "scan" definition cannot specify performOn'));
    }
    const { holdDurationMs, ignoreRepeatMs } = resolveTiming(candidate, at);
    return { type: "scan", holdDurationMs, ignoreRepeatMs };
  }

  if (!isDiscreteAction(candidate.action)) {
    fail(at(`unknown action "${String(candidate.action)}"`));
  }
  const performOn =
    candidate.performOn === undefined ? "press" : candidate.performOn;
  assertOneOf(performOn, ["press", "release"], at("performOn"));
  const { holdDurationMs, ignoreRepeatMs } = resolveTiming(candidate, at);
  return {
    type: "discrete",
    action: candidate.action,
    performOn,
    holdDurationMs,
    ignoreRepeatMs,
  };
}

/** Normalize a whole switch map, keyed by logical switch ID. */
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
