import type { CancelScheduled, Clock, Scheduler } from "./clock.ts";
import type { DiscreteAction, NormalizedSwitch } from "./switches.ts";

/**
 * The gesture engine turns raw press/release signals for `(switchId, sourceId)`
 * pairs into stabilized, recognized semantic actions. It owns per-source
 * timing (hold thresholds, tap-versus-hold deadlines) and the per-logical-switch
 * ignore-repeat window. It knows nothing about the scan tree; it reports
 * results through the {@link GestureSink}.
 */
export interface GestureSink {
  /** A discrete action was recognized. `heldPress` means a press is still down. */
  discreteAction(
    action: DiscreteAction,
    ctx: { switchId: string; sourceKey: string; heldPress: boolean },
  ): void;
  /** An accepted, still-held discrete press was released (repeat cleanup). */
  pressReleased(sourceKey: string): void;
  /** The press phase of a phaseful `scan` switch opened for this source. */
  scanPress(ctx: { switchId: string; sourceKey: string }): void;
  /** The press phase closed by a normal release. */
  scanRelease(ctx: { switchId: string; sourceKey: string }): void;
  /** The scan source was disconnected without a release. */
  scanCancel(sourceKey: string): void;
  /** An input bound to an undeclared logical switch was seen. */
  unknownSwitch(switchId: string): void;
}

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
}

export interface GestureEngine {
  press(switchId: string, sourceId: string | undefined): void;
  release(switchId: string, sourceId: string | undefined): void;
  disconnect(sourceId: string | undefined): void;
  /** Replace the switch map; cancels gestures whose definition changed. */
  setSwitches(switches: Map<string, NormalizedSwitch>): void;
  /** Cancel all pending gestures and forget all sources. */
  reset(): void;
}

export function createGestureEngine(deps: {
  switches: Map<string, NormalizedSwitch>;
  clock: Clock;
  scheduler: Scheduler;
  sink: GestureSink;
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
    if (def.ignoreRepeatMs > 0) {
      blockedUntil.set(switchId, now + def.ignoreRepeatMs);
    }
    return true;
  }

  function clearDeadline(state: SourceState): void {
    state.deadline?.();
    state.deadline = null;
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
    };
    sources.set(sourceKey, state);

    switch (def.type) {
      case "discrete": {
        if (def.performOn === "release") {
          // Wait for release to evaluate hold duration.
          return;
        }
        if (def.holdDurationMs <= 0) {
          acceptDiscretePress(state);
        } else {
          state.deadline = scheduler.schedule(def.holdDurationMs, () => {
            state.deadline = null;
            acceptDiscretePress(state);
          });
        }
        return;
      }
      case "scan": {
        if (def.holdDurationMs <= 0) {
          acceptScanPress(state);
        } else {
          state.deadline = scheduler.schedule(def.holdDurationMs, () => {
            state.deadline = null;
            acceptScanPress(state);
          });
        }
        return;
      }
      case "tapHold": {
        state.deadline = scheduler.schedule(def.holdAfterMs, () => {
          state.deadline = null;
          if (def.type !== "tapHold") return;
          if (tryAccept(state.switchId, def)) {
            state.holdFired = true;
            sink.discreteAction(def.holdAction, {
              switchId: state.switchId,
              sourceKey: state.sourceKey,
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
    sink.discreteAction(def.action, {
      switchId: state.switchId,
      sourceKey: state.sourceKey,
      heldPress: true,
    });
  }

  function acceptScanPress(state: SourceState): void {
    const def = state.def;
    if (def.type !== "scan") return;
    if (!tryAccept(state.switchId, def)) return;
    state.scanAccepted = true;
    sink.scanPress({ switchId: state.switchId, sourceKey: state.sourceKey });
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

    switch (def.type) {
      case "discrete": {
        if (def.performOn === "release") {
          if (heldFor >= def.holdDurationMs && tryAccept(state.switchId, def)) {
            sink.discreteAction(def.action, {
              switchId: state.switchId,
              sourceKey: state.sourceKey,
              heldPress: false,
            });
          }
        } else if (state.heldDiscrete) {
          sink.pressReleased(state.sourceKey);
        }
        return;
      }
      case "scan": {
        if (state.scanAccepted) {
          sink.scanRelease({
            switchId: state.switchId,
            sourceKey: state.sourceKey,
          });
        }
        return;
      }
      case "tapHold": {
        if (state.holdFired) return; // hold already consumed the gesture
        if (heldFor >= def.holdDurationMs && tryAccept(state.switchId, def)) {
          sink.discreteAction(def.tap, {
            switchId: state.switchId,
            sourceKey: state.sourceKey,
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
      clearDeadline(state);
      if (state.scanAccepted) {
        sink.scanCancel(state.sourceKey);
      } else if (state.heldDiscrete) {
        sink.pressReleased(state.sourceKey);
      }
    }
  }

  function setSwitches(next: Map<string, NormalizedSwitch>): void {
    // Cancel gestures whose definition changed; the release action is not
    // performed for an interrupted gesture.
    for (const [key, state] of [...sources]) {
      const nextDef = next.get(state.switchId);
      if (nextDef && switchDefinitionsEqual(nextDef, state.def)) {
        state.def = nextDef;
      } else {
        sources.delete(key);
        clearDeadline(state);
        if (state.scanAccepted) {
          sink.scanCancel(state.sourceKey);
        } else if (state.heldDiscrete) {
          sink.pressReleased(state.sourceKey);
        }
      }
    }
    switches = next;
  }

  function reset(): void {
    for (const state of sources.values()) {
      clearDeadline(state);
    }
    sources.clear();
    blockedUntil.clear();
  }

  return { press, release, disconnect, setSwitches, reset };
}

function switchDefinitionsEqual(
  a: NormalizedSwitch,
  b: NormalizedSwitch,
): boolean {
  if (a.type !== b.type) return false;

  if (a.type === "discrete" && b.type === "discrete") {
    return (
      a.action === b.action &&
      a.performOn === b.performOn &&
      a.holdDurationMs === b.holdDurationMs &&
      a.ignoreRepeatMs === b.ignoreRepeatMs
    );
  }

  if (a.type === "scan" && b.type === "scan") {
    return (
      a.holdDurationMs === b.holdDurationMs &&
      a.ignoreRepeatMs === b.ignoreRepeatMs
    );
  }

  if (a.type === "tapHold" && b.type === "tapHold") {
    return (
      a.tap === b.tap &&
      a.holdAfterMs === b.holdAfterMs &&
      a.holdAction === b.holdAction &&
      a.holdDurationMs === b.holdDurationMs &&
      a.ignoreRepeatMs === b.ignoreRepeatMs
    );
  }

  return false;
}
