import {
  createGestureEngine,
  type GestureContext,
  type GestureEngine,
  type GestureSink,
  type GestureStartState,
} from "../input/gestures.ts";
import {
  decideDiscreteInput,
  decideScanPress,
} from "../input/inputDecisions.ts";
import type { DiscreteAction } from "../input/switches.ts";
import {
  highlightEquals,
  ScanSession,
  type SessionEffect,
} from "../model/session.ts";
import {
  compileTree,
  DuplicateScanNodeIdError,
  type CompiledTree,
} from "../model/tree.ts";
import type { CancelScheduled, Scheduler } from "../shared/clock.ts";
import { createDiagnosticWarner } from "../shared/diagnostics.ts";
import { isDevelopment } from "../shared/env.ts";
import {
  createMethodRuntime,
  type MethodRuntime,
} from "../methods/methodRuntime.ts";
import { isTimedMethod } from "../methods/methods.ts";
import type {
  ActivationResult,
  Highlight,
  PendingTiming,
  ScanGroupNode,
  Scanner,
  ScannerBehaviorOptions,
  ScannerDiagnosticCode,
  ScannerHost,
  ScannerInputPort,
  ScannerOptions,
  ScannerStatus,
} from "../types.ts";
import {
  normalizeOptions,
  normalizeOptionsUpdate,
  type NormalizedOptions,
} from "./normalizeOptions.ts";
import { resolveInfrastructure } from "./scannerInfrastructure.ts";
import { assertScannerRuntimeInvariants } from "./scannerInvariants.ts";
import { createScannerStore } from "./scannerStore.ts";
import {
  createSelectionTransitionTiming,
  isSelectionTransitionDue,
  resetSelectionTransitionQuietDueAt,
  selectionTransitionDueAt,
  type SelectionTransitionTiming,
} from "./selectionTransition.ts";

type Presentation = {
  highlight: NonNullable<Highlight>;
  label: string;
} | null;

function presentationEquals(a: Presentation, b: Presentation): boolean {
  if (a === null || b === null) return a === b;
  return highlightEquals(a.highlight, b.highlight) && a.label === b.label;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ActiveTransition extends SelectionTransitionTiming {
  quietDueAt: number;
  pending: PendingTiming | null;
  cancel: CancelScheduled | null;
}

const EMPTY_ROOT: ScanGroupNode = {
  kind: "group",
  id: "__root__",
  label: "root",
  children: [],
};

const diagnosticChannels = new WeakMap<
  Scanner,
  (code: ScannerDiagnosticCode, message: string) => void
>();

/** @internal Route an integration diagnostic through a scanner's event bus. */
export function reportScannerDiagnostic(
  scanner: Scanner,
  code: ScannerDiagnosticCode,
  message: string,
): void {
  diagnosticChannels.get(scanner)?.(code, message);
}

/** Landing policies passed to `applySessionEffects`. */
const PRESENT = { present: true, armDwell: false };
const SILENT = { present: false, armDwell: false };
const PRESENT_ARMED = { present: true, armDwell: true };

/** Create the runtime coordinator for traversal, timing, input, and host effects. */
export function createScanner(rawOptions: ScannerOptions): Scanner {
  const { clock, scheduler: baseScheduler } = resolveInfrastructure(rawOptions);

  let options = normalizeOptions(rawOptions);
  let tree: CompiledTree = compileTree(EMPTY_ROOT);
  const session = new ScanSession(tree, options.groupExit);
  let host: ScannerHost | null = null;
  let presentation: Presentation = null;
  let transition: ActiveTransition | null = null;
  let disposed = false;
  let hasPublishedTree = false;
  let mountStartPending = options.startOn === "mount";
  let suspendedDwellRemaining: number | null = null;
  // A method-kind change while paused defers its scope reset to resume, so the
  // paused snapshot keeps its retained highlight instead of publishing a cursor
  // that no longer matches it.
  let pendingScopeReset = false;
  let status: ScannerStatus = "idle";

  const store = createScannerStore(
    () =>
      session.snapshot(
        status,
        presentation?.highlight ?? null,
        effectivePending(),
      ),
    clock,
    assertRuntimeInvariants,
  );
  const { runTransition, serialized, emit, reportBoundaryError } = store;
  const warnDiagnostic = createDiagnosticWarner();

  function diagnostic(code: ScannerDiagnosticCode, message: string): void {
    emit({ type: "diagnostic", code, message });
    warnDiagnostic(code, message);
  }

  const scheduler: Scheduler = {
    schedule(delayMs, callback) {
      return baseScheduler.schedule(delayMs, () => runTransition(callback));
    },
  };

  const methodRuntime: MethodRuntime = createMethodRuntime({
    method: options.method,
    clock,
    scheduler,
    isScanning: () => status === "scanning",
    advance: onAdvanceTick,
    repeat: onRepeatTick,
    select: onDwellExpire,
  });

  // The mutual-exclusion invariant between transition and method timing is
  // enforced by assertScannerRuntimeInvariants after every serialized mutation.
  function effectivePending(): PendingTiming | null {
    return transition?.pending ?? methodRuntime.pending;
  }

  function assertRuntimeInvariants(): void {
    if (!isDevelopment()) return;
    assertScannerRuntimeInvariants({
      status,
      sessionDepth: session.depth,
      hasPresentation: presentation !== null,
      transition,
      methodPending: methodRuntime.pending,
      suspendedDwellRemaining,
      methodKind: options.method.kind,
    });
  }

  const sink: GestureSink = {
    pressStarted: (context) => {
      emit({
        type: "input.pressed",
        switchId: context.switchId,
        sourceId: context.sourceId,
        recognition: context.recognition,
      });
      onRawPressStarted(context);
    },
    holdRecognized: (action, context) => {
      emit({
        type: "input.holdRecognized",
        switchId: context.switchId,
        sourceId: context.sourceId,
        action,
      });
    },
    contactReleased: (context) => {
      emit({
        type: "input.released",
        switchId: context.switchId,
        sourceId: context.sourceId,
        heldMs: context.heldMs,
      });
    },
    contactCancelled: (context) => {
      emit({
        type: "input.cancelled",
        switchId: context.switchId,
        sourceId: context.sourceId,
      });
    },
    discreteAction: (action, context) =>
      handleSwitchAction(action, context.heldPress, context),
    pressReleased: (context) => {
      methodRuntime.releaseRepeatOwner(context.sourceKey);
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

  function isLive(): boolean {
    return (
      status === "scanning" || status === "transitioning" || status === "paused"
    );
  }

  function gestureStartState(): GestureStartState {
    if (!options.enabled) return "disabled";
    if (status === "scanning") return "active";
    if (status === "transitioning") return "transitioning";
    if (status === "paused") return "paused";
    return options.startOn === "input" ? "startable" : "inactive";
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
    if (presentationEquals(presentation, next)) return;

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
      methodRuntime.landed({ firstOfPass: session.firstOfPass, armDwell });
    }
  }

  function applySessionEffects(
    effects: readonly SessionEffect[],
    policy: { present: boolean; armDwell: boolean } = PRESENT,
  ): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "landed":
          if (policy.present) {
            setPresentation({
              highlight: effect.current,
              label: effect.label,
            });
            methodRuntime.landed({
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
          completeScan("passes");
          break;
        case "root-empty":
          completeScan("empty");
          break;
      }
    }
  }

  function resolvePassLimit(): number | null {
    const method = options.method;
    if (isTimedMethod(method)) {
      return method.passes === "infinite"
        ? Number.POSITIVE_INFINITY
        : method.passes;
    }
    return null;
  }

  /** Advance the cursor, applying the method's pass limit. */
  function stepForward(): readonly SessionEffect[] {
    return session.stepForward(resolvePassLimit());
  }

  function onAdvanceTick(): void {
    if (status !== "scanning") return;
    applySessionEffects(stepForward(), PRESENT);
  }

  function onRepeatTick(direction: "next" | "previous"): void {
    if (status !== "scanning") return;
    applySessionEffects(
      direction === "next" ? stepForward() : session.stepBackward(),
      PRESENT,
    );
  }

  function onDwellExpire(): void {
    if (status !== "scanning") return;
    selectCurrent();
  }

  function selectCurrent(): void {
    methodRuntime.cancelDeadline();
    const selection = session.selectCurrent();
    if (selection.kind === "none") return;

    if (selection.kind === "target") {
      activateTarget(selection.id);
    } else {
      applySessionEffects(selection.effects, SILENT);
    }

    if (status === "scanning") beginSelectionTransition();
  }

  function activateTarget(id: string): void {
    const node = tree.byId.get(id);
    const target = node && node.kind === "target" ? node : null;
    const label = target?.label ?? id;

    if (!target || target.disabled) {
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
        applySessionEffects(session.resetToRoot(), SILENT);
        break;
      case "continue":
        applySessionEffects(stepForward(), SILENT);
        break;
      case "repeat":
        break;
      case "stop":
        stopAfterActivation();
        break;
    }
  }

  function stopAfterActivation(): void {
    teardown();
    status = "idle";
    emit({ type: "scan.stopped", reason: "after-activation" });
  }

  function beginSelectionTransition(): void {
    if (status !== "scanning") return;
    // Selection always ends held movement, even when no visible transition is
    // configured and presentation resumes synchronously.
    methodRuntime.halt();
    const now = clock.now();
    const quietDurationMs = options.selectionDelay.durationMs;
    const fixedDurationMs =
      options.method.kind === "auto" ? options.method.transitionDurationMs : 0;
    const timing = createSelectionTransitionTiming({
      now,
      fixedDurationMs,
      quietDurationMs,
      resetOnInput: options.selectionDelay.resetOnInput,
    });

    if (!timing) {
      presentLogical(false);
      return;
    }

    transition = {
      ...timing,
      pending: null,
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
    const dueAt = selectionTransitionDueAt(active);
    const delay = Math.max(0, dueAt - clock.now());
    active.pending = { kind: "transition", startedAt, dueAt };
    active.cancel = scheduler.schedule(delay, () => {
      if (transition !== active || status !== "transitioning") return;
      active.cancel = null;
      finishTransition();
    });
  }

  function finishTransition(): void {
    if (!transition) return;
    transition.cancel?.();
    transition = null;
    status = "scanning";
    emit({ type: "scan.transitionEnded" });
    presentLogical(false);
  }

  function clearTransitionSchedule(): void {
    if (!transition) return;
    transition.cancel?.();
    transition.cancel = null;
    transition.pending = null;
  }

  function dropTransition(): void {
    transition?.cancel?.();
    transition = null;
  }

  /** Tear down all live scanning machinery; callers set the resulting status. */
  function teardown(): void {
    dropTransition();
    suspendedDwellRemaining = null;
    pendingScopeReset = false;
    methodRuntime.halt();
    gestures.cancelActive();
    session.clear();
    setPresentation(null);
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

    const now = clock.now();
    const previousDueAt = selectionTransitionDueAt(active);
    active.quietDueAt = resetSelectionTransitionQuietDueAt(active, now);
    if (selectionTransitionDueAt(active) !== previousDueAt) {
      scheduleTransition(now);
    }
  }

  function startScan(
    armDwell: boolean,
    emptyBehavior: "complete" | "defer" = "complete",
  ): boolean {
    if (disposed || !options.enabled) return false;
    dropTransition();
    methodRuntime.halt();
    const effects = session.start();
    if (effects.some((effect) => effect.type === "root-empty")) {
      if (emptyBehavior === "defer") {
        status = "idle";
        setPresentation(null);
        return false;
      }
      status = "complete";
      setPresentation(null);
      emit({ type: "scan.completed", reason: "empty" });
      return true;
    }
    status = "scanning";
    emit({ type: "scan.started" });
    applySessionEffects(effects, { present: true, armDwell });
    return true;
  }

  function maybeStartOnMount(): boolean {
    if (
      !mountStartPending ||
      !hasPublishedTree ||
      !options.enabled ||
      options.startOn !== "mount" ||
      status !== "idle"
    )
      return false;
    const started = startScan(false, "defer");
    if (started) mountStartPending = false;
    return started;
  }

  function completeScan(reason: "passes" | "empty"): void {
    teardown();
    status = "complete";
    emit({ type: "scan.completed", reason });
  }

  function stopInternal(reason: "command" | "disabled"): void {
    teardown();
    status = "idle";
    emit({ type: "scan.stopped", reason });
  }

  function pauseInternal(): void {
    if (status !== "scanning" && status !== "transitioning") return;
    if (status === "transitioning") clearTransitionSchedule();
    else suspendedDwellRemaining = methodRuntime.suspendDeadline();
    status = "paused";
    // Forget held contacts so resume requires a fresh gesture, but retain each
    // accepted switch's fixed ignore-repeat window across the lifecycle edge.
    gestures.cancelActive();
    emit({ type: "scan.paused" });
  }

  function resumeInternal(): void {
    if (status !== "paused") return;
    emit({ type: "scan.resumed" });
    if (transition) {
      status = "transitioning";
      if (isSelectionTransitionDue(transition, clock.now())) finishTransition();
      else scheduleTransition(clock.now());
      return;
    }
    status = "scanning";
    if (pendingScopeReset) {
      pendingScopeReset = false;
      suspendedDwellRemaining = null;
      applySessionEffects(session.resetCurrentScope(), {
        present: true,
        armDwell: false,
      });
      return;
    }
    if (suspendedDwellRemaining !== null) {
      const remainingMs = suspendedDwellRemaining;
      suspendedDwellRemaining = null;
      methodRuntime.resumeDwell(remainingMs);
    } else {
      presentLogical(false);
    }
  }

  function handleSwitchAction(
    action: DiscreteAction,
    heldPress: boolean,
    context: GestureContext,
  ): void {
    if (disposed || !options.enabled) return;
    const decision = decideDiscreteInput(
      action,
      context.startedIn,
      status,
      options.startOn,
    );
    if (decision === "ignore") return;
    if (decision === "diagnose-toggle-pause") {
      diagnostic(
        "command-inapplicable",
        `togglePause ignored while status is "${status}"`,
      );
      return;
    }
    if (decision === "toggle-pause") {
      if (status === "paused") resumeInternal();
      else pauseInternal();
      return;
    }
    if (decision === "start") {
      startScan(true);
      return;
    }

    switch (action) {
      case "next":
        applySessionEffects(stepForward(), PRESENT_ARMED);
        methodRuntime.maybeStartRepeat("next", heldPress, context.sourceKey);
        break;
      case "previous":
        applySessionEffects(session.stepBackward(), PRESENT_ARMED);
        methodRuntime.maybeStartRepeat(
          "previous",
          heldPress,
          context.sourceKey,
        );
        break;
      case "select":
        selectCurrent();
        break;
      case "back":
        backCommand();
        break;
    }
  }

  function onScanPress(context: GestureContext): void {
    if (disposed || !options.enabled) return;
    const decision = decideScanPress(
      context.startedIn,
      status,
      options.startOn,
    );
    if (decision === "ignore") return;
    if (decision === "start") startScan(true);
    if (status === "scanning") {
      methodRuntime.scanPress(context.sourceKey, session.firstOfPass);
    }
  }

  function onScanRelease(context: GestureContext): void {
    const phase = methodRuntime.scanRelease(context.sourceKey);
    if (phase === "missing") return;
    if (status === "scanning" && phase === "closed") selectCurrent();
  }

  function onScanCancel(context: GestureContext): void {
    // Cancelling only unwinds the method runtime's press bookkeeping; the
    // logical cursor stays put, so there is no scanner-side follow-up.
    methodRuntime.scanCancel(context.sourceKey);
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
    methodRuntime.cancelDeadline();
    applySessionEffects(effects, PRESENT);
  }

  function reconcile(): void {
    if (!isLive()) return;
    // Reconciliation establishes a fresh non-dwell landing policy. A dwell
    // frozen by pause is therefore invalidated just like a live dwell.
    suspendedDwellRemaining = null;
    const hidden =
      status === "transitioning" || (status === "paused" && !!transition);
    const effects = session.reconcile();
    if (effects.length === 0) {
      // Nothing moved: the same candidate sits at the same index in the same
      // scope. Restarting the advance deadline here would let a host that
      // republishes the tree faster than `intervalMs` (any live label or badge
      // change) reset the timer forever, so auto/inverse scanning would never
      // advance. Keep the in-flight advance timing and only refresh the label,
      // but still drop a pending dwell — reconciliation is never a dwell
      // landing (SS-13).
      if (!hidden && status === "scanning") {
        setPresentation(session.currentPresentation);
        if (methodRuntime.pending?.kind === "dwell") {
          methodRuntime.cancelDeadline();
        }
      }
      return;
    }
    applySessionEffects(effects, {
      present: !hidden,
      armDwell: false,
    });
    if (
      !hidden &&
      status === "scanning" &&
      !effects.some((effect) => effect.type === "landed")
    ) {
      // Effects moved the scope (e.g. an exit) without re-landing the current
      // item: re-present and re-time it as a fresh non-dwell landing.
      presentLogical(false);
    }
  }

  function suspendEnvironment(): void {
    // Environment suspension (window blur, tab hidden, device locked) drops
    // every held contact, exactly like a full disconnect.
    gestures.disconnect(undefined);
    // It also invalidates an armed single-switch dwell unless the method opts
    // out: retain the highlight, consume the arming token, and require a fresh
    // navigation before dwell can select again. This closes the gap where a
    // user navigates to an item, backgrounds the page, and returns much later
    // to a stale auto-selection. Covers both a live dwell and one frozen by an
    // earlier pause.
    if (
      options.method.kind === "dwell" &&
      options.method.suspensionPolicy !== "continue"
    ) {
      if (status === "scanning" && methodRuntime.pending?.kind === "dwell") {
        methodRuntime.cancelDeadline();
      }
      suspendedDwellRemaining = null;
    }
  }

  /**
   * Every scope's candidate list has the exit policy baked into it, so a
   * `groupExit` change staled them all. Reconciliation is the rebuild: it is
   * the only path that reapplies the policy to each live frame and repairs the
   * parent indices a scope exit restores. Kept silent, because the caller lands
   * the cursor itself — the intermediate repair must not present or re-time.
   */
  function rebuildScopesIfExitPolicyChanged(changed: boolean): void {
    if (!changed) return;
    applySessionEffects(session.reconcile(), SILENT);
  }

  function applyOptions(normalized: NormalizedOptions): void {
    const previous = options;
    options = normalized;
    if (previous.startOn !== "mount" && options.startOn === "mount") {
      mountStartPending = true;
    }
    methodRuntime.setMethod(options.method);
    session.setGroupExit(options.groupExit);
    gestures.setSwitches(options.switches);

    if (!options.enabled) {
      if (isLive()) {
        stopInternal("disabled");
      } else {
        gestures.cancelActive();
        gestures.clearRepeatWindows();
      }
      return;
    }

    if (!isLive()) {
      maybeStartOnMount();
      return;
    }

    const groupExitChanged = previous.groupExit !== options.groupExit;

    if (previous.method.kind !== options.method.kind) {
      const wasPaused = status === "paused";
      const hadTransition = transition !== null;
      dropTransition();
      suspendedDwellRemaining = null;
      if (hadTransition) emit({ type: "scan.transitionEnded" });
      if (wasPaused) {
        // Resetting the cursor now — while pause holds the old highlight — would
        // publish a position that disagrees with that highlight. Defer the reset
        // to resume, which re-presents the new method at the start of the scope.
        pendingScopeReset = true;
        rebuildScopesIfExitPolicyChanged(groupExitChanged);
        return;
      }
      status = "scanning";
      rebuildScopesIfExitPolicyChanged(groupExitChanged);
      applySessionEffects(session.resetCurrentScope(), {
        present: true,
        armDwell: false,
      });
      return;
    }

    if (groupExitChanged) {
      reconcile();
      return;
    }

    if (status === "scanning") presentLogical(false);
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
    suspend: serialized(() => {
      if (!disposed) suspendEnvironment();
    }),
  };

  const scanner: Scanner = {
    start: serialized(() => {
      if (disposed)
        return diagnostic("use-after-dispose", "start() after dispose()");
      if (status !== "idle" && status !== "complete") {
        diagnostic(
          "command-inapplicable",
          `start() ignored while status is "${status}"; use restart() to begin a fresh session`,
        );
        return;
      }
      startScan(false);
    }),
    pause: serialized(() => {
      if (disposed) return;
      if (status !== "scanning" && status !== "transitioning") {
        diagnostic("command-inapplicable", `pause() ignored while "${status}"`);
        return;
      }
      pauseInternal();
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
    }),
    stop: serialized(() => {
      if (disposed || status === "idle") return;
      stopInternal("command");
    }),
    restart: serialized(() => {
      if (disposed) return;
      if (isLive()) {
        stopInternal("command");
      } else {
        teardown();
        status = "idle";
      }
      startScan(false);
    }),
    next: serialized(() => {
      if (disposed || !requireScanning("next")) return;
      applySessionEffects(stepForward(), PRESENT_ARMED);
    }),
    previous: serialized(() => {
      if (disposed || !requireScanning("previous")) return;
      applySessionEffects(session.stepBackward(), PRESENT_ARMED);
    }),
    select: serialized(() => {
      if (disposed || !requireScanning("select")) return;
      selectCurrent();
    }),
    back: serialized(() => {
      if (disposed || !requireScanning("back")) return;
      backCommand();
    }),
    // Synchronous, non-serialized accessors and lifecycle wiring below.
    getSnapshot() {
      return store.getSnapshot();
    },
    subscribe(onChange) {
      return store.subscribe(onChange);
    },
    observe(listener) {
      return store.observe(listener);
    },
    setOptions(next: ScannerBehaviorOptions) {
      if (disposed) return;
      const normalized = normalizeOptionsUpdate(next);
      runTransition(() => {
        if (!disposed) applyOptions(normalized);
      });
    },
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
      let detached = false;

      // Host acquisition is a synchronous public contract. Reserve the slot
      // before queuing setup so a call made by an observer cannot return
      // `attached: false` and then attach moments later when the queue drains.
      const attached = !disposed && host === null;
      if (attached) host = next;

      const detach = () => {
        if (detached) return;
        detached = true;
        runTransition(() => {
          if (!attached || host !== next) return;
          setPresentation(null);
          host = null;
        });
      };

      runTransition(() => {
        if (!attached) {
          if (disposed) return;
          diagnostic(
            "second-host-attach",
            "a host is already attached; the second host was rejected",
          );
          return;
        }
        if (detached || disposed || host !== next) return;
        if (presentation) {
          revealWith(next, presentation.highlight);
        } else if (
          status === "scanning" ||
          (status === "paused" && transition === null)
        ) {
          // Detaching a host clears its decorations but deliberately preserves
          // the logical session. Restore that cursor before the replacement
          // host can accept a selection, so no target is activated invisibly.
          setPresentation(session.currentPresentation);
        }
        maybeStartOnMount();
      });
      return { attached, detach };
    },
    input,
    dispose: serialized(() => {
      if (disposed) return;
      teardown();
      status = "idle";
      disposed = true;
      store.clearListeners();
      host = null;
    }),
  };

  diagnosticChannels.set(scanner, (code, message) => {
    runTransition(() => diagnostic(code, message));
  });
  return scanner;
}
