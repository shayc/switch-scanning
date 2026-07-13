import type { CancelScheduled, Scheduler } from "./clock.ts";
import type { ScanStyle, StepScanRepeat } from "./styles.ts";

export interface StyleRuntime {
  readonly scanHeld: boolean;
  setStyle(style: ScanStyle): void;
  landed(firstOfPass: boolean): void;
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
  scheduler: Scheduler;
  isScanning: () => boolean;
  advance: () => void;
  select: () => void;
}): StyleRuntime {
  let style = deps.style;
  let deadline: CancelScheduled | null = null;
  let repeatCancel: CancelScheduled | null = null;
  let repeatOwner: string | null = null;
  const activeScanSources = new Set<string>();

  function cancelDeadline(): void {
    deadline?.();
    deadline = null;
  }

  function schedule(firstOfPass: boolean): void {
    cancelDeadline();
    if (!deps.isScanning()) return;

    if (style.kind === "auto") {
      const delay =
        style.intervalMs + (firstOfPass ? style.firstItemPauseMs : 0);
      deadline = deps.scheduler.schedule(delay, () => {
        deadline = null;
        deps.advance();
      });
    } else if (style.kind === "inverse") {
      if (activeScanSources.size === 0) return;
      const delay =
        style.intervalMs + (firstOfPass ? style.firstItemPauseMs : 0);
      deadline = deps.scheduler.schedule(delay, () => {
        deadline = null;
        deps.advance();
      });
    } else if (style.kind === "singleStep") {
      deadline = deps.scheduler.schedule(style.dwellTimeMs, () => {
        deadline = null;
        deps.select();
      });
    }
  }

  function stopRepeat(): void {
    repeatCancel?.();
    repeatCancel = null;
    repeatOwner = null;
  }

  function scheduleRepeat(repeat: StepScanRepeat, delay: number): void {
    repeatCancel = deps.scheduler.schedule(delay, () => {
      repeatCancel = null;
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
    landed(firstOfPass) {
      schedule(firstOfPass);
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
      if (!wasHeld) schedule(firstOfPass);
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
