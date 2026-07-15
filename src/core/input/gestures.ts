import type { CancelScheduled, Clock, Scheduler } from "../shared/clock.ts";
import type {
  DiscreteAction,
  NormalizedSwitch,
  PressRecognition,
  ResolvedTiming,
  SwitchAction,
} from "./switches.ts";

/**
 * The gesture engine turns raw press/release signals for `(switchId, sourceId)`
 * pairs into stabilized, recognized semantic actions. It owns per-source
 * timing (hold thresholds, tap-versus-hold deadlines) and the per-logical-switch
 * ignore-repeat window. It knows nothing about the scan tree; it reports
 * results through the {@link GestureSink}.
 */
export interface GestureSink {
  /** A new declared source contact began, before stabilization. */
  pressStarted(ctx: GestureContext & { recognition: PressRecognition }): void;
  /** A still-held press crossed a nonzero recognition threshold. */
  holdRecognized(action: SwitchAction, ctx: GestureContext): void;
  /** Any tracked contact ended with a normal release. */
  contactReleased(ctx: GestureContext & { heldMs: number }): void;
  /** Any tracked contact was dropped without a release (disconnect, cancel). */
  contactCancelled(ctx: GestureContext): void;
  /** A discrete action was recognized. `heldPress` means a press is still down. */
  discreteAction(
    action: DiscreteAction,
    ctx: GestureContext & { heldPress: boolean },
  ): void;
  /** An accepted, still-held discrete press was released (repeat cleanup). */
  pressReleased(ctx: GestureContext): void;
  /** The press phase of a phaseful `scan` switch opened for this source. */
  scanPress(ctx: GestureContext): void;
  /** The press phase closed by a normal release. */
  scanRelease(ctx: GestureContext): void;
  /** The scan source was disconnected without a release. */
  scanCancel(ctx: GestureContext): void;
  /** An input bound to an undeclared logical switch was seen. */
  unknownSwitch(switchId: string): void;
}

export interface GestureContext {
  readonly switchId: string;
  /** The resolved physical source (defaults to the switch ID). */
  readonly sourceId: string;
  readonly sourceKey: string;
  /** Scanner lifecycle eligibility captured once at raw press. */
  readonly startedIn: GestureStartState;
}

export type GestureStartState =
  "active" | "startable" | "transitioning" | "paused" | "disabled" | "inactive";

interface SourceState {
  switchId: string;
  sourceId: string;
  sourceKey: string;
  def: NormalizedSwitch;
  pressedAt: number;
  deadline: CancelScheduled | null;
  holdFired: boolean;
  scanAccepted: boolean;
  heldDiscrete: boolean;
  startedIn: GestureStartState;
}

export interface GestureEngine {
  press(switchId: string, sourceId: string | undefined): void;
  release(switchId: string, sourceId: string | undefined): void;
  disconnect(sourceId: string | undefined): void;
  /** Replace the switch map; cancels gestures whose definition changed. */
  setSwitches(switches: Map<string, NormalizedSwitch>): void;
  /** Cancel held sources while preserving fixed repeat-suppression windows. */
  cancelActive(): void;
  /** Forget every fixed repeat-suppression window. */
  clearRepeatWindows(): void;
}

export function createGestureEngine(deps: {
  switches: Map<string, NormalizedSwitch>;
  clock: Clock;
  scheduler: Scheduler;
  sink: GestureSink;
  getStartState: () => GestureStartState;
}): GestureEngine {
  let switches = deps.switches;
  const { clock, scheduler, sink } = deps;

  const sources = new Map<string, SourceState>();
  const blockedUntil = new Map<string, number>();

  function keyOf(switchId: string, sourceId: string): string {
    return `${switchId}\0${sourceId}`;
  }

  function tryAccept(switchId: string, def: NormalizedSwitch): boolean {
    const now = clock.now();
    const until = blockedUntil.get(switchId);
    if (until !== undefined && now < until) return false;
    // Recognition owns debounce, so a stabilized gesture consumes its window
    // even when the scanner later ignores the semantic action for its captured
    // lifecycle state. This prevents the same physical bounce from becoming a
    // fresh command immediately after a pause/resume or other state change.
    if (def.ignoreRepeatMs > 0) {
      blockedUntil.set(switchId, now + def.ignoreRepeatMs);
    }
    return true;
  }

  function clearDeadline(state: SourceState): void {
    state.deadline?.();
    state.deadline = null;
  }

  // Tear down a source that ended without a normal release (disconnect, cancel,
  // or a definition change). The release action is never performed.
  function cancelSource(state: SourceState): void {
    clearDeadline(state);
    const ctx = contextOf(state);
    sink.contactCancelled(ctx);
    if (state.scanAccepted) {
      sink.scanCancel(ctx);
    } else if (state.heldDiscrete) {
      sink.pressReleased(ctx);
    }
  }

  // Fire now when there is no hold threshold, else after the source stays held
  // for `delayMs`. Clears the pending deadline as the scheduled fire runs.
  function afterHold(
    state: SourceState,
    delayMs: number,
    fire: () => void,
  ): void {
    if (delayMs <= 0) {
      fire();
      return;
    }
    state.deadline = scheduler.schedule(delayMs, () => {
      state.deadline = null;
      fire();
    });
  }

  function press(switchId: string, sourceId: string | undefined): void {
    const def = switches.get(switchId);
    if (!def) {
      sink.unknownSwitch(switchId);
      return;
    }
    const resolvedSource = sourceId ?? switchId;
    const sourceKey = keyOf(switchId, resolvedSource);
    // A duplicate press for a still-held source is ignored.
    if (sources.has(sourceKey)) return;

    const state: SourceState = {
      switchId,
      sourceId: resolvedSource,
      sourceKey,
      def,
      pressedAt: clock.now(),
      deadline: null,
      holdFired: false,
      scanAccepted: false,
      heldDiscrete: false,
      startedIn: deps.getStartState(),
    };
    sources.set(sourceKey, state);
    sink.pressStarted({ ...contextOf(state), recognition: recognitionOf(def) });

    switch (def.type) {
      case "discrete": {
        if (def.performOn === "release") {
          // Wait for release to evaluate hold duration.
          return;
        }
        afterHold(state, def.holdDurationMs, () => acceptDiscretePress(state));
        return;
      }
      case "scan": {
        afterHold(state, def.holdDurationMs, () => acceptScanPress(state));
        return;
      }
      case "tapHold": {
        state.deadline = scheduler.schedule(def.holdAfterMs, () => {
          state.deadline = null;
          if (tryAccept(state.switchId, def)) {
            state.holdFired = true;
            state.heldDiscrete = true;
            sink.holdRecognized(def.holdAction, contextOf(state));
            sink.discreteAction(def.holdAction, {
              ...contextOf(state),
              heldPress: true,
            });
          } else {
            // Blocked by ignore-repeat; treat as consumed so tap does not fire.
            state.holdFired = true;
          }
        });
        return;
      }
    }
  }

  function acceptDiscretePress(state: SourceState): void {
    const def = state.def;
    if (def.type !== "discrete") return;
    if (!tryAccept(state.switchId, def)) return;
    state.heldDiscrete = true;
    if (def.holdDurationMs > 0) {
      sink.holdRecognized(def.action, contextOf(state));
    }
    sink.discreteAction(def.action, {
      ...contextOf(state),
      heldPress: true,
    });
  }

  function acceptScanPress(state: SourceState): void {
    const def = state.def;
    if (def.type !== "scan") return;
    if (!tryAccept(state.switchId, def)) return;
    state.scanAccepted = true;
    if (def.holdDurationMs > 0) {
      sink.holdRecognized("scan", contextOf(state));
    }
    sink.scanPress(contextOf(state));
  }

  function release(switchId: string, sourceId: string | undefined): void {
    const resolvedSource = sourceId ?? switchId;
    const sourceKey = keyOf(switchId, resolvedSource);
    const state = sources.get(sourceKey);
    if (!state) return;
    sources.delete(sourceKey);
    clearDeadline(state);

    const def = state.def;
    const now = clock.now();
    const heldFor = now - state.pressedAt;
    // Physical contact ends before any gesture the release completes.
    sink.contactReleased({ ...contextOf(state), heldMs: heldFor });

    switch (def.type) {
      case "discrete": {
        if (def.performOn === "release") {
          if (heldFor >= def.holdDurationMs && tryAccept(state.switchId, def)) {
            sink.discreteAction(def.action, {
              ...contextOf(state),
              heldPress: false,
            });
          }
        } else if (state.heldDiscrete) {
          sink.pressReleased(contextOf(state));
        }
        return;
      }
      case "scan": {
        if (state.scanAccepted) {
          sink.scanRelease(contextOf(state));
        }
        return;
      }
      case "tapHold": {
        if (state.holdFired) {
          if (state.heldDiscrete) sink.pressReleased(contextOf(state));
          return; // hold already consumed the gesture
        }
        if (heldFor >= def.holdDurationMs && tryAccept(state.switchId, def)) {
          sink.discreteAction(def.tap, {
            ...contextOf(state),
            heldPress: false,
          });
        }
        return;
      }
    }
  }

  function disconnect(sourceId: string | undefined): void {
    for (const [key, state] of [...sources]) {
      if (sourceId !== undefined && state.sourceId !== sourceId) continue;
      sources.delete(key);
      cancelSource(state);
    }
  }

  function setSwitches(next: Map<string, NormalizedSwitch>): void {
    // Cancel gestures whose definition changed.
    for (const [key, state] of [...sources]) {
      const nextDef = next.get(state.switchId);
      if (nextDef && switchDefinitionsEqual(nextDef, state.def)) {
        state.def = nextDef;
      } else {
        sources.delete(key);
        cancelSource(state);
      }
    }
    switches = next;
  }

  function cancelActive(): void {
    for (const state of sources.values()) {
      cancelSource(state);
    }
    sources.clear();
  }

  function clearRepeatWindows(): void {
    blockedUntil.clear();
  }

  return {
    press,
    release,
    disconnect,
    setSwitches,
    cancelActive,
    clearRepeatWindows,
  };
}

function contextOf(state: SourceState): GestureContext {
  return {
    switchId: state.switchId,
    sourceId: state.sourceId,
    sourceKey: state.sourceKey,
    startedIn: state.startedIn,
  };
}

/** A press is accepted immediately unless a hold window must first elapse. */
function stabilizeOrImmediate(holdDurationMs: number): PressRecognition {
  return holdDurationMs > 0
    ? { kind: "stabilize", holdDurationMs }
    : { kind: "immediate" };
}

/** Describe how a fresh press will be decided, for progress feedback. */
function recognitionOf(def: NormalizedSwitch): PressRecognition {
  switch (def.type) {
    case "tapHold":
      return {
        kind: "tapHold",
        holdAfterMs: def.holdAfterMs,
        tapAction: def.tap,
        holdAction: def.holdAction,
      };
    case "discrete":
      if (def.performOn === "release") {
        return {
          kind: "hold",
          holdDurationMs: def.holdDurationMs,
          action: def.action,
        };
      }
      return stabilizeOrImmediate(def.holdDurationMs);
    case "scan":
      return stabilizeOrImmediate(def.holdDurationMs);
  }
}

function timingEqual(a: ResolvedTiming, b: ResolvedTiming): boolean {
  return (
    a.holdDurationMs === b.holdDurationMs &&
    a.ignoreRepeatMs === b.ignoreRepeatMs
  );
}

function switchDefinitionsEqual(
  a: NormalizedSwitch,
  b: NormalizedSwitch,
): boolean {
  if (a.type !== b.type) return false;

  if (a.type === "discrete" && b.type === "discrete") {
    return (
      a.action === b.action && a.performOn === b.performOn && timingEqual(a, b)
    );
  }

  if (a.type === "scan" && b.type === "scan") {
    return timingEqual(a, b);
  }

  if (a.type === "tapHold" && b.type === "tapHold") {
    return (
      a.tap === b.tap &&
      a.holdAfterMs === b.holdAfterMs &&
      a.holdAction === b.holdAction &&
      timingEqual(a, b)
    );
  }

  return false;
}
