import type { CancelScheduled, Clock, Scheduler } from "../shared/clock.ts";
import { isTimedMethod } from "./methods.ts";
import type { ScanMethod, StepScanRepeat } from "./methods.ts";
import type { PendingTiming } from "../types.ts";

interface LandingPolicy {
  readonly firstOfPass: boolean;
  /** One dwell selection may be scheduled from this landing. */
  readonly armDwell: boolean;
}

/** Timing surface a scanner drives to realize its method's advance/dwell/repeat semantics. */
export interface MethodRuntime {
  readonly pending: PendingTiming | null;
  setMethod(method: ScanMethod): void;
  landed(policy: LandingPolicy): void;
  cancelDeadline(): void;
  /** Cancel the active deadline, returning a frozen dwell remainder if armed. */
  suspendDeadline(): number | null;
  /** Resume a dwell token previously returned by {@link suspendDeadline}. */
  resumeDwell(remainingMs: number): void;
  halt(): void;
  scanPress(sourceKey: string, firstOfPass: boolean): void;
  scanRelease(sourceKey: string): ScanPhaseResult;
  scanCancel(sourceKey: string): ScanPhaseResult;
  maybeStartRepeat(
    direction: "next" | "previous",
    heldPress: boolean,
    sourceKey: string,
  ): void;
  releaseRepeatOwner(sourceKey: string): void;
}

type ScanPhaseResult = "missing" | "open" | "closed";

/** Executes the timing semantics of declarative scan methods. */
export function createMethodRuntime(deps: {
  method: ScanMethod;
  clock: Clock;
  scheduler: Scheduler;
  isScanning: () => boolean;
  advance: () => void;
  repeat: (direction: "next" | "previous") => void;
  select: () => void;
}): MethodRuntime {
  let method = deps.method;
  let deadline: CancelScheduled | null = null;
  let repeatCancel: CancelScheduled | null = null;
  let repeatOwner: string | null = null;
  let repeatDirection: "next" | "previous" | null = null;
  let pending: PendingTiming | null = null;
  const activeScanSources = new Set<string>();

  function endScanSource(sourceKey: string): ScanPhaseResult {
    if (!activeScanSources.has(sourceKey)) return "missing";
    activeScanSources.delete(sourceKey);
    if (activeScanSources.size > 0) return "open";
    cancelDeadline();
    return "closed";
  }

  function cancelDeadline(): void {
    if (deadline) {
      deadline();
      pending = null;
    }
    deadline = null;
  }

  function suspendDeadline(): number | null {
    const remainingMs =
      pending?.kind === "dwell"
        ? Math.max(0, pending.dueAt - deps.clock.now())
        : null;
    cancelDeadline();
    return remainingMs;
  }

  function setDeadline(
    kind: PendingTiming["kind"],
    delay: number,
    callback: () => void,
  ): void {
    const startedAt = deps.clock.now();
    pending = { kind, startedAt, dueAt: startedAt + delay };
    deadline = deps.scheduler.schedule(delay, () => {
      deadline = null;
      pending = null;
      callback();
    });
  }

  function schedule({ firstOfPass, armDwell }: LandingPolicy): void {
    cancelDeadline();
    if (!deps.isScanning()) return;

    if (isTimedMethod(method)) {
      // Inverse advances only while a scan switch is held; auto advances freely.
      if (method.kind === "inverse" && activeScanSources.size === 0) return;
      const delay =
        method.intervalMs + (firstOfPass ? method.firstItemPauseMs : 0);
      setDeadline("advance", delay, deps.advance);
    } else if (method.kind === "dwell" && armDwell) {
      setDeadline("dwell", method.dwellDurationMs, deps.select);
    }
  }

  function stopRepeat(): void {
    if (repeatCancel) {
      repeatCancel();
      pending = null;
    }
    repeatCancel = null;
    repeatOwner = null;
    repeatDirection = null;
  }

  function scheduleRepeat(repeat: StepScanRepeat, delay: number): void {
    const startedAt = deps.clock.now();
    pending = {
      kind: "advance",
      startedAt,
      dueAt: startedAt + delay,
    };
    repeatCancel = deps.scheduler.schedule(delay, () => {
      repeatCancel = null;
      pending = null;
      if (
        repeatOwner === null ||
        repeatDirection === null ||
        !deps.isScanning()
      )
        return;
      deps.repeat(repeatDirection);
      scheduleRepeat(repeat, repeat.intervalMs);
    });
  }

  return {
    get pending() {
      return pending;
    },
    setMethod(next) {
      if (
        method.kind === "step" &&
        (next.kind !== "step" || !stepRepeatEquals(method.repeat, next.repeat))
      ) {
        stopRepeat();
      }
      method = next;
    },
    landed(policy) {
      schedule(policy);
    },
    cancelDeadline,
    suspendDeadline,
    resumeDwell(remainingMs) {
      cancelDeadline();
      if (!deps.isScanning()) return;
      setDeadline("dwell", remainingMs, deps.select);
    },
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
      return endScanSource(sourceKey);
    },
    scanCancel(sourceKey) {
      return endScanSource(sourceKey);
    },
    maybeStartRepeat(direction, heldPress, sourceKey) {
      if (method.kind !== "step" || method.repeat === false) return;
      if (!heldPress || repeatOwner !== null) return;
      repeatOwner = sourceKey;
      repeatDirection = direction;
      scheduleRepeat(method.repeat, method.repeat.delayMs);
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
