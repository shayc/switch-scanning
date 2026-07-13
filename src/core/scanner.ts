import type { CancelScheduled, Clock, Scheduler } from "./clock.ts";
import { systemClock } from "./clock.ts";
import {
  createGestureEngine,
  type GestureContext,
  type GestureEngine,
  type GestureSink,
  type GestureStartState,
} from "./gestures.ts";
import { highlightEquals, ScanSession, type SessionEffect } from "./session.ts";
import { createScannerStore } from "./scannerStore.ts";
import { createStyleRuntime, type StyleRuntime } from "./styleRuntime.ts";
import { assertScanStyle, type ScanStyle } from "./styles.ts";
import {
  normalizeSwitches,
  type DiscreteAction,
  type NormalizedSwitch,
} from "./switches.ts";
import {
  compileTree,
  DuplicateScanNodeIdError,
  type CompiledTree,
} from "./tree.ts";
import type {
  ActivationResult,
  AfterActivation,
  GroupExit,
  Highlight,
  PendingTiming,
  ScanGroupNode,
  Scanner,
  ScannerDiagnosticCode,
  ScannerHost,
  ScannerInputPort,
  ScannerOptions,
  ScannerStatus,
  StartOn,
} from "./types.ts";

interface NormalizedSelectionDelay {
  durationMs: number;
  resetOnInput: boolean;
}

interface NormalizedOptions {
  style: ScanStyle;
  switches: Map<string, NormalizedSwitch>;
  startOn: StartOn;
  afterActivation: AfterActivation;
  groupExit: GroupExit;
  enabled: boolean;
  selectionDelay: NormalizedSelectionDelay;
}

type Presentation = {
  highlight: NonNullable<Highlight>;
  label: string;
} | null;

interface ActiveTransition {
  fixedDueAt: number;
  quietDueAt: number;
  quietDurationMs: number;
  resetOnInput: boolean;
  effectiveDueAt: number;
  cancel: CancelScheduled | null;
}

const EMPTY_ROOT: ScanGroupNode = {
  kind: "group",
  id: "__root__",
  label: "root",
  children: [],
};

/** Create the runtime coordinator for traversal, timing, input, and host effects. */
export function createScanner(rawOptions: ScannerOptions): Scanner {
  const { clock, scheduler: baseScheduler } = resolveInfrastructure(rawOptions);

  let options = normalizeOptions(rawOptions);
  let tree: CompiledTree = compileTree(EMPTY_ROOT);
  const session = new ScanSession(tree, options.groupExit);
  let host: ScannerHost | null = null;
  let presentation: Presentation = null;
  let pending: PendingTiming | null = null;
  let transition: ActiveTransition | null = null;
  let disposed = false;
  let hasPublishedTree = false;
  let mountStartPending = options.startOn === "mount";
  let status: ScannerStatus = "idle";

  const store = createScannerStore(() =>
    session.snapshot(status, presentation?.highlight ?? null, pending),
  );
  const { runTransition, serialized, commit, emit, reportBoundaryError } =
    store;

  function diagnostic(code: ScannerDiagnosticCode, message: string): void {
    emit({ type: "diagnostic", code, message });
  }

  const scheduler: Scheduler = {
    schedule(delayMs, callback) {
      return baseScheduler.schedule(delayMs, () => runTransition(callback));
    },
  };

  function setPending(next: PendingTiming | null): void {
    pending = next;
  }

  const styleRuntime: StyleRuntime = createStyleRuntime({
    style: options.style,
    clock,
    scheduler,
    isScanning: () => status === "scanning",
    advance: onAdvanceTick,
    select: onDwellExpire,
    pendingChanged: setPending,
  });

  const sink: GestureSink = {
    pressStarted: onRawPressStarted,
    discreteAction: (action, context) =>
      handleSwitchAction(action, context.heldPress, context),
    pressReleased: (context) => {
      styleRuntime.releaseRepeatOwner(context.sourceKey);
      commit();
    },
    scanPress: onScanPress,
    scanRelease: onScanRelease,
    scanCancel: onScanCancel,
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
    getStartState: gestureStartState,
  });

  function gestureStartState(): GestureStartState {
    if (!options.enabled) return "disabled";
    if (status === "scanning") return "active";
    if (status === "transitioning") return "transitioning";
    if (status === "paused") return "paused";
    return options.startOn === "switch" ? "startable" : "inactive";
  }

  function revealWith(targetHost: ScannerHost, highlight: Highlight): void {
    if (!targetHost.reveal) return;
    try {
      targetHost.reveal(highlight);
    } catch (error) {
      reportBoundaryError(error, "host reveal");
    }
  }

  function setPresentation(next: Presentation): void {
    const same =
      (presentation === null && next === null) ||
      (presentation !== null &&
        next !== null &&
        highlightEquals(presentation.highlight, next.highlight) &&
        presentation.label === next.label);
    if (same) return;

    const previous = presentation?.highlight ?? null;
    presentation = next;
    if (host) revealWith(host, next?.highlight ?? null);

    if (next) {
      emit({
        type: "highlight.changed",
        previous,
        current: next.highlight,
        label: next.label,
      });
    } else if (previous) {
      emit({ type: "highlight.changed", previous, current: null });
    }
  }

  function presentLogical(armDwell: boolean): void {
    const current = session.currentPresentation;
    setPresentation(current);
    if (current && status === "scanning") {
      styleRuntime.landed({ firstOfPass: session.firstOfPass, armDwell });
    }
  }

  function applySessionEffects(
    effects: readonly SessionEffect[],
    policy: { present: boolean; armDwell: boolean } = {
      present: true,
      armDwell: false,
    },
  ): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "landed":
          if (policy.present) {
            setPresentation({
              highlight: effect.current,
              label: effect.label,
            });
            styleRuntime.landed({
              firstOfPass: session.firstOfPass,
              armDwell: policy.armDwell,
            });
          }
          break;
        case "group-entered":
          emit({ type: "group.entered", id: effect.id, label: effect.label });
          break;
        case "group-exited":
          emit({
            type: "group.exited",
            id: effect.id,
            label: effect.label,
            reason: effect.reason,
          });
          break;
        case "root-exhausted":
          completeScan("loops");
          break;
        case "root-empty":
          completeScan("empty");
          break;
      }
    }
  }

  function resolveLoopLimit(): number | null {
    const style = options.style;
    if (style.kind === "auto" || style.kind === "inverse") {
      return style.loops === "infinite"
        ? Number.POSITIVE_INFINITY
        : style.loops;
    }
    return null;
  }

  function onAdvanceTick(): void {
    if (status !== "scanning") return;
    applySessionEffects(session.stepForward(resolveLoopLimit()), {
      present: true,
      armDwell: false,
    });
    commit();
  }

  function onDwellExpire(): void {
    if (status !== "scanning") return;
    selectCurrent();
    commit();
  }

  function selectCurrent(): void {
    styleRuntime.cancelDeadline();
    const selection = session.selectCurrent();
    if (selection.kind === "none") return;

    if (selection.kind === "target") {
      activateTarget(selection.id);
    } else {
      applySessionEffects(selection.effects, {
        present: false,
        armDwell: false,
      });
    }

    if (status === "scanning") beginSelectionTransition();
  }

  function activateTarget(id: string): void {
    const node = tree.byId.get(id);
    const target = node && node.kind === "target" ? node : null;
    const label = target?.label ?? id;

    if (!target || target.disabled === true) {
      diagnostic("activation-missing-target", `cannot activate target "${id}"`);
      emit({
        type: "target.activationFailed",
        id,
        label,
        reason: "ineligible",
      });
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
      emit({
        type: "target.activationFailed",
        id,
        label,
        reason: result.reason,
      });
    }
  }

  function applyAfterActivation(): void {
    switch (options.afterActivation) {
      case "restart":
        applySessionEffects(session.resetToRoot(), {
          present: false,
          armDwell: false,
        });
        break;
      case "continue":
        applySessionEffects(session.stepForward(resolveLoopLimit()), {
          present: false,
          armDwell: false,
        });
        break;
      case "repeat":
        break;
      case "stop":
        stopAfterActivation();
        break;
    }
  }

  function stopAfterActivation(): void {
    dropTransition();
    styleRuntime.halt();
    gestures.reset();
    session.clear();
    setPresentation(null);
    status = "idle";
    emit({ type: "scan.stopped", reason: "after-activation" });
  }

  function beginSelectionTransition(): void {
    if (status !== "scanning") return;
    const now = clock.now();
    const quietDurationMs = options.selectionDelay.durationMs;
    const fixedDurationMs =
      options.style.kind === "auto" ? options.style.transitionTimeMs : 0;
    const dueAt = now + Math.max(quietDurationMs, fixedDurationMs);

    if (dueAt <= now) {
      presentLogical(false);
      return;
    }

    styleRuntime.halt();
    transition = {
      fixedDueAt: now + fixedDurationMs,
      quietDueAt: now + quietDurationMs,
      quietDurationMs,
      resetOnInput: options.selectionDelay.resetOnInput,
      effectiveDueAt: dueAt,
      cancel: null,
    };
    status = "transitioning";
    setPresentation(null);
    emit({ type: "scan.transitionStarted" });
    scheduleTransition(now);
  }

  function scheduleTransition(startedAt: number): void {
    const active = transition;
    if (!active) return;
    active.cancel?.();
    const dueAt = Math.max(active.fixedDueAt, active.quietDueAt);
    active.effectiveDueAt = dueAt;
    const delay = Math.max(0, dueAt - clock.now());
    pending = { kind: "transition", startedAt, dueAt };
    active.cancel = scheduler.schedule(delay, () => {
      if (transition !== active || status !== "transitioning") return;
      active.cancel = null;
      finishTransition(true);
      commit();
    });
  }

  function finishTransition(natural: boolean): void {
    if (!transition) return;
    transition.cancel?.();
    transition = null;
    pending = null;
    status = "scanning";
    if (natural) emit({ type: "scan.transitionEnded" });
    presentLogical(false);
  }

  function clearTransitionSchedule(): void {
    if (!transition) return;
    transition.cancel?.();
    transition.cancel = null;
    if (pending?.kind === "transition") pending = null;
  }

  function dropTransition(): void {
    clearTransitionSchedule();
    transition = null;
  }

  function onRawPressStarted(context: GestureContext): void {
    const active = transition;
    if (
      context.startedIn !== "transitioning" ||
      !active ||
      status !== "transitioning" ||
      !active.resetOnInput ||
      active.quietDurationMs <= 0
    ) {
      return;
    }

    const nextQuietDueAt = clock.now() + active.quietDurationMs;
    const nextEffectiveDueAt = Math.max(active.fixedDueAt, nextQuietDueAt);
    active.quietDueAt = nextQuietDueAt;
    if (nextEffectiveDueAt !== active.effectiveDueAt) {
      scheduleTransition(clock.now());
      commit();
    }
  }

  function startScan(armDwell: boolean): void {
    if (disposed || !options.enabled) return;
    dropTransition();
    styleRuntime.halt();
    const effects = session.start();
    if (effects.some((effect) => effect.type === "root-empty")) {
      status = "complete";
      setPresentation(null);
      emit({ type: "scan.completed", reason: "empty" });
      return;
    }
    status = "scanning";
    emit({ type: "scan.started" });
    applySessionEffects(effects, { present: true, armDwell });
  }

  function maybeStartOnMount(): boolean {
    if (!mountStartPending || options.startOn !== "mount" || status !== "idle")
      return false;
    mountStartPending = false;
    startScan(false);
    commit();
    return true;
  }

  function completeScan(reason: "loops" | "empty"): void {
    dropTransition();
    styleRuntime.halt();
    gestures.reset();
    session.clear();
    setPresentation(null);
    status = "complete";
    emit({ type: "scan.completed", reason });
  }

  function internalStop(reason: "command" | "disabled"): void {
    dropTransition();
    styleRuntime.halt();
    gestures.reset();
    session.clear();
    setPresentation(null);
    status = "idle";
    emit({ type: "scan.stopped", reason });
  }

  function pauseInternal(): void {
    if (status !== "scanning" && status !== "transitioning") return;
    if (status === "transitioning") clearTransitionSchedule();
    else styleRuntime.cancelDeadline();
    status = "paused";
    gestures.reset();
    emit({ type: "scan.paused" });
  }

  function resumeInternal(): void {
    if (status !== "paused") return;
    emit({ type: "scan.resumed" });
    if (transition) {
      status = "transitioning";
      const dueAt = Math.max(transition.fixedDueAt, transition.quietDueAt);
      if (dueAt <= clock.now()) finishTransition(false);
      else scheduleTransition(clock.now());
      return;
    }
    status = "scanning";
    presentLogical(false);
  }

  function handleSwitchAction(
    action: DiscreteAction,
    heldPress: boolean,
    context: GestureContext,
  ): void {
    if (disposed || !options.enabled) return;
    if (context.startedIn === "disabled") return;
    if (
      context.startedIn === "inactive" &&
      status !== "idle" &&
      status !== "complete"
    ) {
      return;
    }
    if (
      context.startedIn === "startable" &&
      status !== "idle" &&
      status !== "complete"
    ) {
      return;
    }

    if (action === "togglePause") {
      if (context.startedIn === "active" && status !== "scanning") return;
      if (context.startedIn === "transitioning" && status !== "transitioning") {
        return;
      }
      if (context.startedIn === "paused" && status !== "paused") return;
      if (status === "paused") resumeInternal();
      else if (status === "scanning" || status === "transitioning")
        pauseInternal();
      else
        diagnostic(
          "command-inapplicable",
          `togglePause ignored while status is "${status}"`,
        );
      commit();
      return;
    }

    if (context.startedIn === "inactive") return;

    if (
      context.startedIn === "transitioning" ||
      context.startedIn === "paused" ||
      status === "transitioning" ||
      status === "paused"
    ) {
      return;
    }

    if (status === "idle" || status === "complete") {
      if (context.startedIn !== "startable" || options.startOn !== "switch")
        return;
      startScan(true);
      commit();
      return;
    }

    switch (action) {
      case "next":
        applySessionEffects(session.stepForward(resolveLoopLimit()), {
          present: true,
          armDwell: true,
        });
        styleRuntime.maybeStartRepeat(heldPress, context.sourceKey);
        break;
      case "previous":
        applySessionEffects(session.stepBackward(), {
          present: true,
          armDwell: true,
        });
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

  function onScanPress(context: GestureContext): void {
    if (
      disposed ||
      !options.enabled ||
      context.startedIn === "disabled" ||
      context.startedIn === "inactive" ||
      context.startedIn === "paused" ||
      context.startedIn === "transitioning"
    ) {
      return;
    }

    if (context.startedIn === "startable") {
      if (status !== "idle" && status !== "complete") return;
      if (options.startOn !== "switch") return;
      startScan(true);
      if ((status as ScannerStatus) === "scanning") {
        styleRuntime.scanPress(context.sourceKey, session.firstOfPass);
      }
      commit();
      return;
    }

    if (status !== "scanning") return;
    styleRuntime.scanPress(context.sourceKey, session.firstOfPass);
    commit();
  }

  function onScanRelease(context: GestureContext): void {
    const phase = styleRuntime.scanRelease(context.sourceKey);
    if (phase === "missing") return;
    if (status === "scanning" && phase === "closed") selectCurrent();
    commit();
  }

  function onScanCancel(context: GestureContext): void {
    const phase = styleRuntime.scanCancel(context.sourceKey);
    if (phase === "missing") return;
    commit();
  }

  function requireScanning(command: string): boolean {
    if (status === "scanning") return true;
    diagnostic(
      "command-inapplicable",
      `${command}() ignored while status is "${status}"`,
    );
    return false;
  }

  function backCommand(): void {
    const effects = session.back();
    if (effects === null) {
      diagnostic("command-inapplicable", "back() at the root is a no-op");
      return;
    }
    styleRuntime.cancelDeadline();
    applySessionEffects(effects, { present: true, armDwell: false });
  }

  function reconcile(): void {
    if (
      status !== "scanning" &&
      status !== "paused" &&
      status !== "transitioning"
    ) {
      return;
    }
    const hidden =
      status === "transitioning" || (status === "paused" && !!transition);
    const effects = session.reconcile();
    applySessionEffects(effects, {
      present: !hidden,
      armDwell: false,
    });
    if (
      !hidden &&
      status === "scanning" &&
      !effects.some((effect) => effect.type === "landed")
    ) {
      // A no-op reconciliation still establishes a fresh non-dwell landing
      // policy: automatic styles restart; single-step dwell is not rearmed.
      presentLogical(false);
    }
    commit();
  }

  const input: ScannerInputPort = {
    press: serialized((switchId: string, sourceId?: string) => {
      if (!disposed && options.enabled) gestures.press(switchId, sourceId);
    }),
    release: serialized((switchId: string, sourceId?: string) => {
      if (!disposed) gestures.release(switchId, sourceId);
    }),
    disconnect: serialized((sourceId?: string) => {
      if (!disposed) gestures.disconnect(sourceId);
    }),
  };

  const scanner: Scanner = {
    start: serialized(() => {
      if (disposed)
        return diagnostic("use-after-dispose", "start() after dispose()");
      startScan(false);
      commit();
    }),
    pause: serialized(() => {
      if (disposed) return;
      if (status !== "scanning" && status !== "transitioning") {
        diagnostic("command-inapplicable", `pause() ignored while "${status}"`);
        return;
      }
      pauseInternal();
      commit();
    }),
    resume: serialized(() => {
      if (disposed) return;
      if (status !== "paused") {
        diagnostic(
          "command-inapplicable",
          `resume() ignored while "${status}"`,
        );
        return;
      }
      resumeInternal();
      commit();
    }),
    stop: serialized(() => {
      if (disposed || status === "idle") return;
      internalStop("command");
      commit();
    }),
    restart: serialized(() => {
      if (disposed) return;
      dropTransition();
      styleRuntime.halt();
      gestures.reset();
      session.clear();
      setPresentation(null);
      status = "idle";
      startScan(false);
      commit();
    }),
    next: serialized(() => {
      if (disposed || !requireScanning("next")) return;
      applySessionEffects(session.stepForward(resolveLoopLimit()), {
        present: true,
        armDwell: true,
      });
      commit();
    }),
    previous: serialized(() => {
      if (disposed || !requireScanning("previous")) return;
      applySessionEffects(session.stepBackward(), {
        present: true,
        armDwell: true,
      });
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
      return store.getSnapshot();
    },
    subscribe(onChange) {
      return store.subscribe(onChange);
    },
    observe(listener) {
      return store.observe(listener);
    },
    setOptions: serialized((next: ScannerOptions) => {
      if (disposed) return;
      applyOptions(next);
      commit();
    }),
    setTree: serialized((root: ScanGroupNode) => {
      if (disposed) return;
      let nextTree: CompiledTree;
      try {
        nextTree = compileTree(root);
      } catch (error) {
        if (error instanceof DuplicateScanNodeIdError) {
          diagnostic(
            "duplicate-id",
            `${error.message}; keeping the previous tree`,
          );
          return;
        }
        throw error;
      }
      tree = nextTree;
      session.setTree(tree);
      hasPublishedTree = true;
      if (maybeStartOnMount()) return;
      reconcile();
    }),
    attachHost(next) {
      let attached = false;
      let detached = false;
      runTransition(() => {
        if (detached || disposed) return;
        if (host) {
          diagnostic(
            "second-host-attach",
            "a host is already attached; the second host was rejected",
          );
          return;
        }
        host = next;
        attached = true;
        if (presentation) revealWith(next, presentation.highlight);
        if (options.startOn === "mount") {
          mountStartPending = true;
          if (hasPublishedTree) maybeStartOnMount();
        }
      });
      const detach = () => {
        detached = true;
        runTransition(() => {
          if (!attached || host !== next) return;
          setPresentation(null);
          host = null;
          attached = false;
          commit();
        });
      };
      return Object.assign(detach, { attached });
    },
    input,
    dispose: serialized(() => {
      if (disposed) return;
      dropTransition();
      styleRuntime.halt();
      gestures.reset();
      session.clear();
      setPresentation(null);
      status = "idle";
      commit();
      disposed = true;
      store.clearListeners();
      host = null;
    }),
  };

  function applyOptions(next: ScannerOptions): void {
    // Normalize and validate everything before mutating active runtime state.
    const normalized = normalizeOptions(next);
    const previous = options;
    options = normalized;
    styleRuntime.setStyle(options.style);
    session.setGroupExit(options.groupExit);
    gestures.setSwitches(options.switches);

    if (!options.enabled) {
      if (
        status === "scanning" ||
        status === "transitioning" ||
        status === "paused"
      ) {
        internalStop("disabled");
      } else {
        gestures.reset();
      }
      return;
    }

    if (
      status !== "scanning" &&
      status !== "transitioning" &&
      status !== "paused"
    ) {
      return;
    }

    if (previous.style.kind !== options.style.kind) {
      const wasPaused = status === "paused";
      dropTransition();
      if (!wasPaused) status = "scanning";
      applySessionEffects(session.resetCurrentScope(), {
        present: !wasPaused,
        armDwell: false,
      });
      return;
    }

    if (previous.groupExit !== options.groupExit) {
      reconcile();
      return;
    }

    if (status === "scanning") presentLogical(false);
  }

  return scanner;
}

let sharedInfrastructure: (Clock & Scheduler) | null = null;

function defaultInfrastructure(): Clock & Scheduler {
  sharedInfrastructure ??= systemClock();
  return sharedInfrastructure;
}

function resolveInfrastructure(options: ScannerOptions): {
  clock: Clock;
  scheduler: Scheduler;
} {
  const { clock, scheduler } = options;
  if (clock === undefined && scheduler === undefined) {
    const infrastructure = defaultInfrastructure();
    return { clock: infrastructure, scheduler: infrastructure };
  }
  if (clock === undefined) {
    throw new TypeError(
      "[switch-scanning] a custom scheduler requires a paired clock",
    );
  }
  if (scheduler !== undefined) return { clock, scheduler };
  if (isScheduler(clock)) return { clock, scheduler: clock };
  throw new TypeError(
    "[switch-scanning] a custom clock must implement Scheduler or provide scheduler",
  );
}

function isScheduler(clock: Clock): clock is Clock & Scheduler {
  return "schedule" in clock && typeof clock.schedule === "function";
}

function normalizeOptions(raw: ScannerOptions): NormalizedOptions {
  assertScanStyle(raw.style);
  const switches = normalizeSwitches(raw.switches);
  const groupExit = raw.groupExit ?? "after";
  if (
    groupExit !== "after" &&
    groupExit !== "before" &&
    groupExit !== "back-only"
  ) {
    throw new RangeError(
      `[switch-scanning] groupExit must be "after", "before", or "back-only" (received ${String(groupExit)})`,
    );
  }
  if (groupExit === "back-only" && !hasBackAction(switches)) {
    throw new RangeError(
      '[switch-scanning] groupExit "back-only" requires a declared switch mapped to "back"; add one or use groupExit "before"/"after"',
    );
  }

  const durationMs = raw.selectionDelay?.durationMs ?? 0;
  assertNonNegative(durationMs, "selectionDelay.durationMs");
  const resetOnInput = raw.selectionDelay?.resetOnInput ?? true;
  if (typeof resetOnInput !== "boolean") {
    throw new TypeError(
      `[switch-scanning] selectionDelay.resetOnInput must be a boolean (received ${String(resetOnInput)})`,
    );
  }

  const startOn = raw.startOn ?? "switch";
  if (startOn !== "switch" && startOn !== "mount" && startOn !== "command") {
    throw new RangeError(
      `[switch-scanning] startOn must be "switch", "mount", or "command" (received ${String(startOn)})`,
    );
  }

  const afterActivation = raw.afterActivation ?? "restart";
  if (
    afterActivation !== "restart" &&
    afterActivation !== "continue" &&
    afterActivation !== "repeat" &&
    afterActivation !== "stop"
  ) {
    throw new RangeError(
      `[switch-scanning] afterActivation must be "restart", "continue", "repeat", or "stop" (received ${String(afterActivation)})`,
    );
  }

  const enabled = raw.enabled ?? true;
  if (typeof enabled !== "boolean") {
    throw new TypeError(
      `[switch-scanning] enabled must be a boolean (received ${String(enabled)})`,
    );
  }

  return {
    style: raw.style,
    switches,
    startOn,
    afterActivation,
    groupExit,
    enabled,
    selectionDelay: {
      durationMs,
      resetOnInput,
    },
  };
}

function hasBackAction(
  switches: ReadonlyMap<string, NormalizedSwitch>,
): boolean {
  for (const definition of switches.values()) {
    if (definition.type === "discrete" && definition.action === "back") {
      return true;
    }
    if (
      definition.type === "tapHold" &&
      (definition.tap === "back" || definition.holdAction === "back")
    ) {
      return true;
    }
  }
  return false;
}

function assertNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `[switch-scanning] ${name} must be a finite number >= 0 (received ${value})`,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
