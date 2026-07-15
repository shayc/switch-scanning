import type { CancelScheduled, Clock, Scheduler } from "../shared/clock.ts";
import type { ScanStyle, StepScanRepeat } from "./styles.ts";
import type { PendingTiming } from "../types.ts";

export interface LandingPolicy {
  readonly firstOfPass: boolean;
  /** One single-step dwell selection may be scheduled from this landing. */
  readonly armDwell: boolean;
}

export interface StyleRuntime {
  readonly pending: PendingTiming | null;
  setStyle(style: ScanStyle): void;
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

export type ScanPhaseResult = "missing" | "open" | "closed";

/** Executes the timing semantics of declarative scan styles. */
export function createStyleRuntime(deps: {
  style: ScanStyle;
  clock: Clock;
  scheduler: Scheduler;
  isScanning: () => boolean;
  advance: () => void;
  repeat: (direction: "next" | "previous") => void;
  select: () => void;
}): StyleRuntime {
  let style = deps.style;
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

    if (style.kind === "auto" || style.kind === "inverse") {
      // Inverse advances only while a scan switch is held; auto advances freely.
      if (style.kind === "inverse" && activeScanSources.size === 0) return;
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
      if (style.kind !== "step" || style.repeat === false) return;
      if (!heldPress || repeatOwner !== null) return;
      repeatOwner = sourceKey;
      repeatDirection = direction;
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
