import type { CancelScheduled, Clock, Scheduler } from "./clock.ts";
import { systemClock } from "./clock.ts";
import { createGestureEngine, type GestureEngine, type GestureSink } from "./gestures.ts";
import type { ScanStyle, StepScanRepeat } from "./styles.ts";
import { normalizeSwitches, type DiscreteAction, type NormalizedSwitch } from "./switches.ts";
import {
  buildCandidates,
  compileTree,
  DuplicateScanNodeIdError,
  exitLabelFor,
  type Candidate,
  type CompiledTree,
  type ScopeFrame,
} from "./tree.ts";
import type {
  ActivationResult,
  AfterActivation,
  GroupExit,
  Highlight,
  Scanner,
  ScannerDiagnosticCode,
  ScannerEvent,
  ScannerHost,
  ScannerInputPort,
  ScannerOptions,
  ScannerSnapshot,
  ScannerStatus,
  ScanGroupNode,
  ScanTargetNode,
  StartOn,
} from "./types.ts";

interface NormalizedOptions {
  style: ScanStyle;
  switches: Map<string, NormalizedSwitch>;
  startOn: StartOn;
  afterActivation: AfterActivation;
  groupExit: GroupExit;
  enabled: boolean;
}

const EMPTY_ROOT: ScanGroupNode = { kind: "group", id: "__root__", label: "root", children: [] };

export function createScanner(rawOptions: ScannerOptions): Scanner {
  const clock: Clock = rawOptions.clock ?? defaultInfra();
  const baseScheduler: Scheduler = rawOptions.scheduler ?? (clock as Clock & Scheduler);

  let options = normalizeOptions(rawOptions);
  let tree: CompiledTree = compileTree(EMPTY_ROOT);
  let host: ScannerHost | null = null;
  let disposed = false;
  let hasPublishedTree = false;
  let mountStartPending = options.startOn === "mount";

  let status: ScannerStatus = "idle";
  let frames: ScopeFrame[] = [];

  let styleDeadline: CancelScheduled | null = null;
  let repeatCancel: CancelScheduled | null = null;
  let repeatOwner: string | null = null;
  const activeScanSources = new Set<string>();

  const subscribers = new Set<() => void>();
  const observers = new Set<(event: ScannerEvent) => void>();

  let cachedSnapshot: ScannerSnapshot = { status: "idle", highlight: null, path: [], loop: 0 };
  let commitPending = false;
  let isDrainingTransitions = false;
  const pendingEvents: ScannerEvent[] = [];
  const pendingTransitions: Array<() => void> = [];

  /**
   * Scanner mutations are serialized. Calls made by subscribers, observers,
   * hosts, or timer callbacks wait until the current transition is published.
   */
  function runTransition(work: () => void): void {
    pendingTransitions.push(work);
    if (isDrainingTransitions) return;

    isDrainingTransitions = true;
    try {
      while (pendingTransitions.length > 0) {
        const transition = pendingTransitions.shift()!;
        transition();
        publishChanges();
      }
    } finally {
      isDrainingTransitions = false;
    }
  }

  function serialized<Args extends unknown[]>(
    work: (...args: Args) => void,
  ): (...args: Args) => void {
    return (...args) => runTransition(() => work(...args));
  }

  function publishChanges(): void {
    if (commitPending) {
      commitPending = false;
      const next = buildSnapshot();
      if (!snapshotEquals(next, cachedSnapshot)) cachedSnapshot = next;

      for (const subscriber of [...subscribers]) {
        try {
          subscriber();
        } catch (error) {
          reportListenerError(error);
        }
      }
    }

    const events = pendingEvents.splice(0);
    for (const event of events) {
      for (const observer of [...observers]) {
        try {
          observer(event);
        } catch (error) {
          reportListenerError(error);
        }
      }
    }
  }

  function reportListenerError(error: unknown): void {
    if (typeof globalThis.reportError === "function") {
      globalThis.reportError(error);
      return;
    }
    if (typeof console !== "undefined") {
      console.error("[switch-scanning] scanner listener failed", error);
    }
  }

  const scheduler: Scheduler = {
    schedule(delayMs, callback) {
      return baseScheduler.schedule(delayMs, () => runTransition(callback));
    },
  };

  // -- gesture engine ------------------------------------------------------

  const sink: GestureSink = {
    discreteAction: (action, ctx) => handleSwitchAction(action, ctx.heldPress, ctx.sourceKey),
    pressReleased: (sourceKey) => releaseRepeatOwner(sourceKey),
    scanPress: (ctx) => onScanPress(ctx.sourceKey),
    scanRelease: (ctx) => onScanRelease(ctx.sourceKey),
    scanCancel: (sourceKey) => onScanCancel(sourceKey),
    unknownSwitch: (switchId) =>
      diagnostic(
        "unknown-switch-binding",
        `input referenced switch "${switchId}", which is not declared in scanner options`,
      ),
  };

  const gestures: GestureEngine = createGestureEngine({
    switches: options.switches,
    clock,
    scheduler,
    sink,
  });

  // -- snapshot / notification --------------------------------------------

  function currentFrame(): ScopeFrame | undefined {
    return frames[frames.length - 1];
  }

  function currentCandidate(): Candidate | undefined {
    const frame = currentFrame();
    if (!frame) return undefined;
    return frame.candidates[frame.index];
  }

  function currentHighlight(): Highlight {
    const cand = currentCandidate();
    if (!cand) return null;
    if (cand.kind === "exit") return { kind: "exit", groupId: cand.groupId };
    return { kind: cand.kind, id: cand.id };
  }

  function labelForCandidate(cand: Candidate): string {
    if (cand.kind === "exit") {
      const group = tree.byId.get(cand.groupId);
      return group && group.kind === "group" ? exitLabelFor(group) : "Back";
    }
    const node = tree.byId.get(cand.id);
    return node?.label ?? cand.id;
  }

  function buildSnapshot(): ScannerSnapshot {
    const frame = currentFrame();
    const path = frames.flatMap((frame) => (frame.groupId === null ? [] : [frame.groupId]));
    return {
      status,
      highlight: currentHighlight(),
      path,
      loop: frame ? frame.pass : 0,
    };
  }

  function snapshotEquals(a: ScannerSnapshot, b: ScannerSnapshot): boolean {
    if (a.status !== b.status || a.loop !== b.loop) return false;
    if (a.path.length !== b.path.length) return false;
    for (let i = 0; i < a.path.length; i += 1) if (a.path[i] !== b.path[i]) return false;
    return highlightEquals(a.highlight, b.highlight);
  }

  function commit(): void {
    commitPending = true;
  }

  function emit(event: ScannerEvent): void {
    pendingEvents.push(event);
  }

  function diagnostic(code: ScannerDiagnosticCode, message: string): void {
    emit({ type: "diagnostic", code, message });
  }

  // -- timing --------------------------------------------------------------

  function cancelStyleDeadline(): void {
    styleDeadline?.();
    styleDeadline = null;
  }

  function scanHeld(): boolean {
    return activeScanSources.size > 0;
  }

  function resolveLoopLimit(): number | null {
    const style = options.style;
    if (style.kind === "auto" || style.kind === "inverse") {
      return style.loops === "infinite" ? Number.POSITIVE_INFINITY : style.loops;
    }
    return null;
  }

  function scheduleStyleDeadline(): void {
    cancelStyleDeadline();
    if (status !== "scanning") return;
    const frame = currentFrame();
    if (!frame || frame.candidates.length === 0) return;
    const style = options.style;
    const firstOfPass = frame.index === 0;

    if (style.kind === "auto") {
      const delay = style.intervalMs + (firstOfPass ? style.firstItemPauseMs : 0);
      styleDeadline = scheduler.schedule(delay, () => {
        styleDeadline = null;
        onAdvanceTick();
      });
    } else if (style.kind === "inverse") {
      if (!scanHeld()) return;
      const delay = style.intervalMs + (firstOfPass ? style.firstItemPauseMs : 0);
      styleDeadline = scheduler.schedule(delay, () => {
        styleDeadline = null;
        onAdvanceTick();
      });
    } else if (style.kind === "singleStep") {
      styleDeadline = scheduler.schedule(style.dwellTimeMs, () => {
        styleDeadline = null;
        onDwellExpire();
      });
    }
    // step scanning schedules no advancement deadline.
  }

  function onAdvanceTick(): void {
    if (status !== "scanning") return;
    stepForward();
    commit();
  }

  function onDwellExpire(): void {
    if (status !== "scanning") return;
    selectCurrent();
    commit();
  }

  // -- landing / movement --------------------------------------------------

  function land(previous: Highlight): void {
    const cand = currentCandidate();
    if (!cand) return;
    const current = currentHighlight();
    if (current) {
      emit({
        type: "highlight.changed",
        previous,
        current,
        label: labelForCandidate(cand),
      });
    }
    host?.reveal?.(current);
    scheduleStyleDeadline();
  }

  function stepForward(): void {
    const frame = currentFrame();
    if (!frame || frame.candidates.length === 0) return;
    const previous = currentHighlight();
    if (frame.index < frame.candidates.length - 1) {
      frame.index += 1;
      land(previous);
      return;
    }
    // Wrap to the first candidate — a completed pass.
    const limit = resolveLoopLimit();
    const nextPass = frame.pass + 1;
    if (limit !== null && Number.isFinite(limit) && nextPass > limit) {
      exhaustScope();
      return;
    }
    frame.pass = nextPass;
    frame.index = 0;
    land(previous);
  }

  function stepBackward(): void {
    const frame = currentFrame();
    if (!frame || frame.candidates.length === 0) return;
    const previous = currentHighlight();
    frame.index =
      frame.index > 0 ? frame.index - 1 : frame.candidates.length - 1;
    land(previous);
  }

  function exhaustScope(): void {
    if (frames.length <= 1) {
      completeScan("loops");
    } else {
      leaveGroup("loops-complete");
    }
  }

  function enterGroup(groupId: string): void {
    const node = tree.byId.get(groupId);
    if (!node || node.kind !== "group") return;
    const previous = currentHighlight();
    const candidates = buildCandidates(node, false, options.groupExit);
    if (candidates.length === 0) {
      // Nothing to enter; behave as an immediate empty exit.
      emit({ type: "group.exited", id: node.id, label: node.label, reason: "empty" });
      land(previous);
      return;
    }
    frames.push({ groupId, candidates, index: 0, pass: 1 });
    emit({ type: "group.entered", id: node.id, label: node.label });
    land(previous);
  }

  function leaveGroup(reason: "selected-exit" | "back" | "loops-complete" | "empty"): void {
    const frame = currentFrame();
    if (!frame || frame.groupId === null) return;
    const node = tree.byId.get(frame.groupId);
    const previous = currentHighlight();
    frames.pop();
    if (node && node.kind === "group") {
      emit({ type: "group.exited", id: node.id, label: node.label, reason });
    }
    land(previous);
  }

  // -- selection & activation ---------------------------------------------

  function selectCurrent(): void {
    const cand = currentCandidate();
    if (!cand) return;
    if (cand.kind === "group") {
      cancelStyleDeadline();
      enterGroup(cand.id);
    } else if (cand.kind === "exit") {
      cancelStyleDeadline();
      leaveGroup("selected-exit");
    } else {
      activateTarget(cand.id);
    }
  }

  function activateTarget(id: string): void {
    cancelStyleDeadline();
    const node = tree.byId.get(id);
    const target = node && node.kind === "target" ? (node as ScanTargetNode) : null;
    const label = target?.label ?? id;

    if (!target || target.disabled === true) {
      diagnostic("activation-missing-target", `cannot activate target "${id}"`);
      emit({ type: "target.activationFailed", id, label, reason: "ineligible" });
      scheduleStyleDeadline();
      return;
    }

    emit({ type: "target.activationRequested", id, label });

    let result: ActivationResult;
    if (!host) {
      result = { activated: false, reason: "no host attached" };
    } else {
      try {
        result = host.activate(id);
      } catch (error) {
        result = { activated: false, reason: errorMessage(error) };
      }
    }

    if (result.activated) {
      emit({ type: "target.activated", id, label });
      applyAfterActivation();
    } else {
      emit({ type: "target.activationFailed", id, label, reason: result.reason });
      // Keep the highlight; restart the style's ordinary post-selection timing.
      scheduleStyleDeadline();
    }
  }

  function applyAfterActivation(): void {
    switch (options.afterActivation) {
      case "restart":
        resetToRoot();
        land(null);
        break;
      case "continue":
        stepForward();
        break;
      case "repeat":
        scheduleStyleDeadline();
        break;
      case "stop":
        haltTiming();
        frames = [];
        status = "idle";
        emit({ type: "scan.stopped", reason: "after-activation" });
        break;
    }
  }

  // -- lifecycle -----------------------------------------------------------

  function resetToRoot(): void {
    const candidates = buildCandidates(tree.root, true, options.groupExit);
    frames = [{ groupId: null, candidates, index: 0, pass: 1 }];
  }

  function startScan(): void {
    if (disposed || !options.enabled) return;
    haltTiming();
    const candidates = buildCandidates(tree.root, true, options.groupExit);
    if (candidates.length === 0) {
      frames = [];
      status = "complete";
      emit({ type: "scan.completed", reason: "empty" });
      return;
    }
    frames = [{ groupId: null, candidates, index: 0, pass: 1 }];
    status = "scanning";
    emit({ type: "scan.started" });
    land(null);
  }

  function maybeStartOnMount(): boolean {
    if (!mountStartPending || options.startOn !== "mount" || status !== "idle") return false;
    mountStartPending = false;
    startScan();
    commit();
    return true;
  }

  function completeScan(reason: "loops" | "empty"): void {
    haltTiming();
    frames = [];
    status = "complete";
    emit({ type: "scan.completed", reason });
  }

  function haltTiming(): void {
    cancelStyleDeadline();
    stopRepeat();
    activeScanSources.clear();
  }

  function internalStop(reason: "command" | "disabled"): void {
    haltTiming();
    gestures.reset();
    frames = [];
    status = "idle";
    emit({ type: "scan.stopped", reason });
  }

  // -- repeat --------------------------------------------------------------

  function stopRepeat(): void {
    repeatCancel?.();
    repeatCancel = null;
    repeatOwner = null;
  }

  function maybeStartRepeat(heldPress: boolean, sourceKey: string): void {
    const style = options.style;
    if (style.kind !== "step" || style.repeat === false) return;
    if (!heldPress || repeatOwner !== null) return;
    repeatOwner = sourceKey;
    scheduleRepeat(style.repeat, style.repeat.delayMs);
  }

  function scheduleRepeat(repeat: StepScanRepeat, delay: number): void {
    repeatCancel = scheduler.schedule(delay, () => {
      repeatCancel = null;
      if (repeatOwner === null || status !== "scanning") return;
      stepForward();
      commit();
      scheduleRepeat(repeat, repeat.intervalMs);
    });
  }

  function releaseRepeatOwner(sourceKey: string): void {
    if (repeatOwner === sourceKey) stopRepeat();
  }

  // -- input handling ------------------------------------------------------

  function handleSwitchAction(action: DiscreteAction, heldPress: boolean, sourceKey: string): void {
    if (disposed || !options.enabled) return;
    if (status === "paused") return; // physical input ignored while paused

    if (status === "idle" || status === "complete") {
      if (options.startOn !== "switch") return;
      startScan(); // the action is consumed to start
      commit();
      return;
    }

    switch (action) {
      case "next":
        stepForward();
        maybeStartRepeat(heldPress, sourceKey);
        break;
      case "previous":
        stepBackward();
        break;
      case "select":
        selectCurrent();
        break;
      case "back":
        backCommand();
        break;
    }
    commit();
  }

  function onScanPress(sourceKey: string): void {
    if (disposed || !options.enabled) return;
    if (status === "paused") return;

    if (status === "idle" || status === "complete") {
      if (options.startOn !== "switch") return;
      startScan();
      // startScan resets timing; register the held scan source and begin
      // advancement now that scanning is active.
      if ((status as ScannerStatus) === "scanning") {
        activeScanSources.add(sourceKey);
        scheduleStyleDeadline();
      }
      commit();
      return;
    }

    const wasHeld = scanHeld();
    activeScanSources.add(sourceKey);
    if (!wasHeld) {
      // First accepted press opens the phase: begin advancement.
      scheduleStyleDeadline();
    }
    commit();
  }

  function onScanRelease(sourceKey: string): void {
    if (!activeScanSources.has(sourceKey)) return;
    activeScanSources.delete(sourceKey);
    if (status !== "scanning") {
      commit();
      return;
    }
    if (!scanHeld()) {
      cancelStyleDeadline();
      selectCurrent();
      commit();
    }
  }

  function onScanCancel(sourceKey: string): void {
    if (!activeScanSources.has(sourceKey)) return;
    activeScanSources.delete(sourceKey);
    if (status !== "scanning") {
      commit();
      return;
    }
    if (!scanHeld()) {
      // Final scan source lost without a release: stop advancing, no selection.
      cancelStyleDeadline();
      commit();
    }
  }

  // -- commands ------------------------------------------------------------

  function requireScanning(command: string): boolean {
    if (status === "scanning") return true;
    diagnostic("command-inapplicable", `${command}() ignored while status is "${status}"`);
    return false;
  }

  function backCommand(): void {
    if (frames.length > 1) {
      cancelStyleDeadline();
      leaveGroup("back");
    } else {
      diagnostic("command-inapplicable", "back() at the root is a no-op");
    }
  }

  // -- reconciliation ------------------------------------------------------

  function reconcile(): void {
    if (status !== "scanning" && status !== "paused") return;
    if (frames.length === 0) return;

    const previousHighlight = currentHighlight();
    const rebuilt: ScopeFrame[] = [];

    // Rebuild the root frame.
    const rootCandidates = buildCandidates(tree.root, true, options.groupExit);
    rebuilt.push({ groupId: null, candidates: rootCandidates, index: 0, pass: frames[0]!.pass });

    // Walk deeper frames while each group still exists and is reachable.
    for (let i = 1; i < frames.length; i += 1) {
      const frame = frames[i]!;
      if (frame.groupId === null) break;
      const parent = rebuilt[rebuilt.length - 1]!;
      const stillPresent = parent.candidates.some(
        (c) => c.kind === "group" && c.id === frame.groupId,
      );
      const node = tree.byId.get(frame.groupId);
      if (!stillPresent || !node || node.kind !== "group") break;
      // Point the parent at this child group so exits restore correctly.
      parent.index = parent.candidates.findIndex(
        (c) => c.kind === "group" && c.id === frame.groupId,
      );
      const candidates = buildCandidates(node, false, options.groupExit);
      if (candidates.length === 0) break;
      rebuilt.push({ groupId: frame.groupId, candidates, index: 0, pass: frame.pass });
    }

    frames = rebuilt;

    if (rootCandidates.length === 0) {
      completeScan("empty");
      commit();
      return;
    }

    // Try to preserve the highlighted identity in the (possibly truncated) top scope.
    repairHighlight(previousHighlight);
    commit();
  }

  function repairHighlight(previous: Highlight): void {
    const frame = currentFrame();
    if (!frame) {
      completeScan("empty");
      return;
    }
    if (previous) {
      const idx = frame.candidates.findIndex((c) => highlightEquals(candidateToHighlight(c), previous));
      if (idx !== -1) {
        // Identity preserved: keep the existing deadline unless index moved.
        if (idx !== frame.index) {
          frame.index = idx;
          land(previous);
        }
        return;
      }
    }
    // Identity gone: choose next eligible sibling, else exit, else parent repair.
    if (frame.index >= frame.candidates.length) {
      frame.index = Math.max(0, frame.candidates.length - 1);
    }
    land(previous);
  }

  // -- public port ---------------------------------------------------------

  const input: ScannerInputPort = {
    press: serialized((switchId: string, sourceId?: string) => {
      if (disposed) return;
      gestures.press(switchId, sourceId);
    }),
    release: serialized((switchId: string, sourceId?: string) => {
      if (disposed) return;
      gestures.release(switchId, sourceId);
    }),
    disconnect: serialized((sourceId?: string) => {
      if (disposed) return;
      gestures.disconnect(sourceId);
    }),
  };

  // -- public API ----------------------------------------------------------

  const scanner: Scanner = {
    start: serialized(() => {
      if (disposed) return diagnostic("use-after-dispose", "start() after dispose()");
      startScan();
      commit();
    }),
    pause: serialized(() => {
      if (disposed || status !== "scanning") {
        if (!disposed) diagnostic("command-inapplicable", `pause() ignored while "${status}"`);
        return;
      }
      cancelStyleDeadline();
      status = "paused";
      emit({ type: "scan.paused" });
      commit();
    }),
    resume: serialized(() => {
      if (disposed) return;
      if (status !== "paused") {
        diagnostic("command-inapplicable", `resume() ignored while "${status}"`);
        return;
      }
      status = "scanning";
      emit({ type: "scan.resumed" });
      scheduleStyleDeadline();
      commit();
    }),
    stop: serialized(() => {
      if (disposed) return;
      internalStop("command");
      commit();
    }),
    restart: serialized(() => {
      if (disposed) return;
      haltTiming();
      frames = [];
      status = "idle";
      startScan();
      commit();
    }),
    next: serialized(() => {
      if (disposed || !requireScanning("next")) return;
      stepForward();
      commit();
    }),
    previous: serialized(() => {
      if (disposed || !requireScanning("previous")) return;
      stepBackward();
      commit();
    }),
    select: serialized(() => {
      if (disposed || !requireScanning("select")) return;
      selectCurrent();
      commit();
    }),
    back: serialized(() => {
      if (disposed || !requireScanning("back")) return;
      backCommand();
      commit();
    }),
    getSnapshot() {
      return cachedSnapshot;
    },
    subscribe(onChange) {
      subscribers.add(onChange);
      return () => {
        subscribers.delete(onChange);
      };
    },
    observe(listener) {
      observers.add(listener);
      return () => {
        observers.delete(listener);
      };
    },
    setOptions: serialized((next: ScannerOptions) => {
      if (disposed) return;
      applyOptions(next);
      commit();
    }),
    setTree: serialized((root: ScanGroupNode) => {
      if (disposed) return;
      try {
        tree = compileTree(root);
      } catch (error) {
        if (error instanceof DuplicateScanNodeIdError) {
          diagnostic("duplicate-id", `${error.message}; keeping the previous tree`);
          return;
        }
        throw error;
      }
      hasPublishedTree = true;
      if (maybeStartOnMount()) return;
      reconcile();
    }),
    attachHost(next) {
      let detached = false;
      runTransition(() => {
        if (detached || disposed) return;
        if (host) diagnostic("second-host-attach", "a host is already attached");
        host = next;
        if (options.startOn === "mount") {
          mountStartPending = true;
          if (hasPublishedTree) maybeStartOnMount();
        }
      });
      return () => {
        detached = true;
        runTransition(() => {
          if (host === next) host = null;
        });
      };
    },
    input,
    dispose: serialized(() => {
      if (disposed) return;
      disposed = true;
      haltTiming();
      gestures.reset();
      frames = [];
      status = "idle";
      subscribers.clear();
      observers.clear();
      host = null;
    }),
  };

  function applyOptions(next: ScannerOptions): void {
    const prev = options;
    options = normalizeOptions(next);
    gestures.setSwitches(options.switches);

    if (!options.enabled) {
      if (status === "scanning" || status === "paused") {
        internalStop("disabled");
      }
      return;
    }

    if (status !== "scanning") return;

    if (prev.style.kind !== options.style.kind) {
      // Style kind changed: keep the valid scope, reset to its first candidate.
      const frame = currentFrame();
      if (frame) {
        const previous = currentHighlight();
        frame.index = 0;
        frame.pass = 1;
        land(previous);
      }
      return;
    }

    if (prev.groupExit !== options.groupExit) {
      reconcile();
      return;
    }

    // Timing change: replace the active deadline from now.
    scheduleStyleDeadline();
  }

  return scanner;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

let sharedInfra: (Clock & Scheduler) | null = null;
function defaultInfra(): Clock & Scheduler {
  sharedInfra ??= systemClock();
  return sharedInfra;
}

function normalizeOptions(raw: ScannerOptions): NormalizedOptions {
  return {
    style: raw.style,
    switches: normalizeSwitches(raw.switches),
    startOn: raw.startOn ?? "switch",
    afterActivation: raw.afterActivation ?? "restart",
    groupExit: raw.groupExit ?? "after",
    enabled: raw.enabled ?? true,
  };
}

function candidateToHighlight(cand: Candidate): NonNullable<Highlight> {
  if (cand.kind === "exit") return { kind: "exit", groupId: cand.groupId };
  return { kind: cand.kind, id: cand.id };
}

function highlightEquals(a: Highlight, b: Highlight): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "exit" && b.kind === "exit") return a.groupId === b.groupId;
  if ("id" in a && "id" in b) return a.id === b.id;
  return false;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
