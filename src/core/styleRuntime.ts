import type { CancelScheduled, Clock, Scheduler } from "./clock.ts";
import type { ScanStyle, StepScanRepeat } from "./styles.ts";
import type { PendingTiming } from "./types.ts";

export interface LandingPolicy {
  readonly firstOfPass: boolean;
  /** One single-step dwell selection may be scheduled from this landing. */
  readonly armDwell: boolean;
}

export interface StyleRuntime {
  readonly scanHeld: boolean;
  setStyle(style: ScanStyle): void;
  landed(policy: LandingPolicy | boolean): void;
  cancelDeadline(): void;
  halt(): void;
  scanPress(sourceKey: string, firstOfPass: boolean): void;
  scanRelease(sourceKey: string): ScanPhaseResult;
  scanCancel(sourceKey: string): ScanPhaseResult;
  maybeStartRepeat(heldPress: boolean, sourceKey: string): void;
  releaseRepeatOwner(sourceKey: string): void;
}

export type ScanPhaseResult = "missing" | "open" | "closed";

/** Executes the timing semantics of declarative scan styles. */
export function createStyleRuntime(deps: {
  style: ScanStyle;
  clock?: Clock;
  scheduler: Scheduler;
  isScanning: () => boolean;
  advance: () => void;
  select: () => void;
  pendingChanged?: (pending: PendingTiming | null) => void;
}): StyleRuntime {
  let style = deps.style;
  let deadline: CancelScheduled | null = null;
  let repeatCancel: CancelScheduled | null = null;
  let repeatOwner: string | null = null;
  const activeScanSources = new Set<string>();
  const runtimeClock: Clock =
    deps.clock ??
    ("now" in deps.scheduler && typeof deps.scheduler.now === "function"
      ? (deps.scheduler as Scheduler & Clock)
      : { now: () => Date.now() });
  const pendingChanged = deps.pendingChanged ?? (() => undefined);

  function cancelDeadline(): void {
    if (deadline) {
      deadline();
      pendingChanged(null);
    }
    deadline = null;
  }

  function setDeadline(
    kind: PendingTiming["kind"],
    delay: number,
    callback: () => void,
  ): void {
    const startedAt = runtimeClock.now();
    pendingChanged({ kind, startedAt, dueAt: startedAt + delay });
    deadline = deps.scheduler.schedule(delay, () => {
      deadline = null;
      pendingChanged(null);
      callback();
    });
  }

  function schedule({ firstOfPass, armDwell }: LandingPolicy): void {
    cancelDeadline();
    if (!deps.isScanning()) return;

    if (style.kind === "auto") {
      const delay =
        style.intervalMs + (firstOfPass ? style.firstItemPauseMs : 0);
      setDeadline("advance", delay, deps.advance);
    } else if (style.kind === "inverse") {
      if (activeScanSources.size === 0) return;
      const delay =
        style.intervalMs + (firstOfPass ? style.firstItemPauseMs : 0);
      setDeadline("advance", delay, deps.advance);
    } else if (style.kind === "singleStep" && armDwell) {
      setDeadline("dwell", style.dwellTimeMs, deps.select);
    }
  }

  function stopRepeat(): void {
    if (repeatCancel) {
      repeatCancel();
      pendingChanged(null);
    }
    repeatCancel = null;
    repeatOwner = null;
  }

  function scheduleRepeat(repeat: StepScanRepeat, delay: number): void {
    const startedAt = runtimeClock.now();
    pendingChanged({
      kind: "advance",
      startedAt,
      dueAt: startedAt + delay,
    });
    repeatCancel = deps.scheduler.schedule(delay, () => {
      repeatCancel = null;
      pendingChanged(null);
      if (repeatOwner === null || !deps.isScanning()) return;
      deps.advance();
      scheduleRepeat(repeat, repeat.intervalMs);
    });
  }

  return {
    get scanHeld() {
      return activeScanSources.size > 0;
    },
    setStyle(next) {
      if (
        style.kind === "step" &&
        (next.kind !== "step" || !stepRepeatEquals(style.repeat, next.repeat))
      ) {
        stopRepeat();
      }
      style = next;
    },
    landed(policy) {
      schedule(
        typeof policy === "boolean"
          ? { firstOfPass: policy, armDwell: true }
          : policy,
      );
    },
    cancelDeadline,
    halt() {
      cancelDeadline();
      stopRepeat();
      activeScanSources.clear();
    },
    scanPress(sourceKey, firstOfPass) {
      const wasHeld = activeScanSources.size > 0;
      activeScanSources.add(sourceKey);
      if (!wasHeld) schedule({ firstOfPass, armDwell: false });
    },
    scanRelease(sourceKey) {
      if (!activeScanSources.has(sourceKey)) return "missing";
      activeScanSources.delete(sourceKey);
      if (activeScanSources.size > 0) return "open";
      cancelDeadline();
      return "closed";
    },
    scanCancel(sourceKey) {
      if (!activeScanSources.has(sourceKey)) return "missing";
      activeScanSources.delete(sourceKey);
      if (activeScanSources.size > 0) return "open";
      cancelDeadline();
      return "closed";
    },
    maybeStartRepeat(heldPress, sourceKey) {
      if (style.kind !== "step" || style.repeat === false) return;
      if (!heldPress || repeatOwner !== null) return;
      repeatOwner = sourceKey;
      scheduleRepeat(style.repeat, style.repeat.delayMs);
    },
    releaseRepeatOwner(sourceKey) {
      if (repeatOwner === sourceKey) stopRepeat();
    },
  };
}

function stepRepeatEquals(
  a: false | StepScanRepeat,
  b: false | StepScanRepeat,
): boolean {
  if (a === false || b === false) return a === b;
  return a.delayMs === b.delayMs && a.intervalMs === b.intervalMs;
}
