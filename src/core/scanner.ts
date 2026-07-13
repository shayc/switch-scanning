import type { Clock, Scheduler } from "./clock.ts";
import { systemClock } from "./clock.ts";
import {
  createGestureEngine,
  type GestureEngine,
  type GestureSink,
} from "./gestures.ts";
import { ScanSession, type SessionEffect } from "./session.ts";
import { createScannerStore } from "./scannerStore.ts";
import { createStyleRuntime, type StyleRuntime } from "./styleRuntime.ts";
import type { ScanStyle } from "./styles.ts";
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
  ScanGroupNode,
  Scanner,
  ScannerDiagnosticCode,
  ScannerHost,
  ScannerInputPort,
  ScannerOptions,
  ScannerStatus,
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
  let disposed = false;
  let hasPublishedTree = false;
  let mountStartPending = options.startOn === "mount";
  let status: ScannerStatus = "idle";

  const store = createScannerStore(() => session.snapshot(status));
  const {
    runTransition,
    serialized,
    commit,
    emit,
    reportBoundaryError,
  } = store;

  function diagnostic(code: ScannerDiagnosticCode, message: string): void {
    emit({ type: "diagnostic", code, message });
  }

  const scheduler: Scheduler = {
    schedule(delayMs, callback) {
      return baseScheduler.schedule(delayMs, () => runTransition(callback));
    },
  };

  const styleRuntime: StyleRuntime = createStyleRuntime({
    style: options.style,
    scheduler,
    isScanning: () => status === "scanning",
    advance: onAdvanceTick,
    select: onDwellExpire,
  });

  const sink: GestureSink = {
    discreteAction: (action, context) =>
      handleSwitchAction(action, context.heldPress, context.sourceKey),
    pressReleased: (sourceKey) => styleRuntime.releaseRepeatOwner(sourceKey),
    scanPress: (context) => onScanPress(context.sourceKey),
    scanRelease: (context) => onScanRelease(context.sourceKey),
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

  function applySessionEffects(effects: readonly SessionEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "landed":
          emit({
            type: "highlight.changed",
            previous: effect.previous,
            current: effect.current,
            label: effect.label,
          });
          if (host?.reveal) {
            try {
              host.reveal(effect.current);
            } catch (error) {
              reportBoundaryError(error, "host reveal");
            }
          }
          styleRuntime.landed(session.firstOfPass);
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
    applySessionEffects(session.stepForward(resolveLoopLimit()));
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
    if (selection.kind === "target") {
      activateTarget(selection.id);
    } else if (selection.kind === "handled") {
      applySessionEffects(selection.effects);
    }
  }

  function activateTarget(id: string): void {
    styleRuntime.cancelDeadline();
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
      styleRuntime.landed(session.firstOfPass);
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
      styleRuntime.landed(session.firstOfPass);
    }
  }

  function applyAfterActivation(): void {
    switch (options.afterActivation) {
      case "restart":
        applySessionEffects(session.resetToRoot());
        break;
      case "continue":
        applySessionEffects(session.stepForward(resolveLoopLimit()));
        break;
      case "repeat":
        styleRuntime.landed(session.firstOfPass);
        break;
      case "stop":
        styleRuntime.halt();
        session.clear();
        status = "idle";
        emit({ type: "scan.stopped", reason: "after-activation" });
        break;
    }
  }

  function startScan(): void {
    if (disposed || !options.enabled) return;
    styleRuntime.halt();
    const effects = session.start();
    if (effects.some((effect) => effect.type === "root-empty")) {
      status = "complete";
      emit({ type: "scan.completed", reason: "empty" });
      return;
    }
    status = "scanning";
    emit({ type: "scan.started" });
    applySessionEffects(effects);
  }

  function maybeStartOnMount(): boolean {
    if (!mountStartPending || options.startOn !== "mount" || status !== "idle")
      return false;
    mountStartPending = false;
    startScan();
    commit();
    return true;
  }

  function completeScan(reason: "loops" | "empty"): void {
    styleRuntime.halt();
    session.clear();
    status = "complete";
    emit({ type: "scan.completed", reason });
  }

  function internalStop(reason: "command" | "disabled"): void {
    styleRuntime.halt();
    gestures.reset();
    session.clear();
    status = "idle";
    emit({ type: "scan.stopped", reason });
  }

  function handleSwitchAction(
    action: DiscreteAction,
    heldPress: boolean,
    sourceKey: string,
  ): void {
    if (disposed || !options.enabled) return;
    if (status === "paused") return;

    if (status === "idle" || status === "complete") {
      if (options.startOn !== "switch") return;
      startScan();
      commit();
      return;
    }

    switch (action) {
      case "next":
        applySessionEffects(session.stepForward(resolveLoopLimit()));
        styleRuntime.maybeStartRepeat(heldPress, sourceKey);
        break;
      case "previous":
        applySessionEffects(session.stepBackward());
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
    if (disposed || !options.enabled || status === "paused") return;

    if (status === "idle" || status === "complete") {
      if (options.startOn !== "switch") return;
      startScan();
      if ((status as ScannerStatus) === "scanning") {
        styleRuntime.scanPress(sourceKey, session.firstOfPass);
      }
      commit();
      return;
    }

    styleRuntime.scanPress(sourceKey, session.firstOfPass);
    commit();
  }

  function onScanRelease(sourceKey: string): void {
    const phase = styleRuntime.scanRelease(sourceKey);
    if (phase === "missing") return;
    if (status === "scanning" && phase === "closed") selectCurrent();
    commit();
  }

  function onScanCancel(sourceKey: string): void {
    const phase = styleRuntime.scanCancel(sourceKey);
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
    applySessionEffects(effects);
  }

  function reconcile(): void {
    if (status !== "scanning" && status !== "paused") return;
    applySessionEffects(session.reconcile());
    commit();
  }

  const input: ScannerInputPort = {
    press: serialized((switchId: string, sourceId?: string) => {
      if (!disposed) gestures.press(switchId, sourceId);
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
      startScan();
      commit();
    }),
    pause: serialized(() => {
      if (disposed || status !== "scanning") {
        if (!disposed)
          diagnostic(
            "command-inapplicable",
            `pause() ignored while "${status}"`,
          );
        return;
      }
      styleRuntime.cancelDeadline();
      status = "paused";
      emit({ type: "scan.paused" });
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
      status = "scanning";
      emit({ type: "scan.resumed" });
      styleRuntime.landed(session.firstOfPass);
      commit();
    }),
    stop: serialized(() => {
      if (disposed) return;
      internalStop("command");
      commit();
    }),
    restart: serialized(() => {
      if (disposed) return;
      styleRuntime.halt();
      session.clear();
      status = "idle";
      startScan();
      commit();
    }),
    next: serialized(() => {
      if (disposed || !requireScanning("next")) return;
      applySessionEffects(session.stepForward(resolveLoopLimit()));
      commit();
    }),
    previous: serialized(() => {
      if (disposed || !requireScanning("previous")) return;
      applySessionEffects(session.stepBackward());
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
      try {
        tree = compileTree(root);
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
      session.setTree(tree);
      hasPublishedTree = true;
      if (maybeStartOnMount()) return;
      reconcile();
    }),
    attachHost(next) {
      let detached = false;
      runTransition(() => {
        if (detached || disposed) return;
        if (host)
          diagnostic("second-host-attach", "a host is already attached");
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
      styleRuntime.halt();
      gestures.reset();
      session.clear();
      status = "idle";
      store.clearListeners();
      host = null;
    }),
  };

  function applyOptions(next: ScannerOptions): void {
    const previous = options;
    options = normalizeOptions(next);
    styleRuntime.setStyle(options.style);
    session.setGroupExit(options.groupExit);
    gestures.setSwitches(options.switches);

    if (!options.enabled) {
      if (status === "scanning" || status === "paused")
        internalStop("disabled");
      return;
    }

    if (status !== "scanning") return;

    if (previous.style.kind !== options.style.kind) {
      applySessionEffects(session.resetCurrentScope());
      return;
    }

    if (previous.groupExit !== options.groupExit) {
      reconcile();
      return;
    }

    styleRuntime.landed(session.firstOfPass);
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
  return {
    style: raw.style,
    switches: normalizeSwitches(raw.switches),
    startOn: raw.startOn ?? "switch",
    afterActivation: raw.afterActivation ?? "restart",
    groupExit: raw.groupExit ?? "after",
    enabled: raw.enabled ?? true,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
