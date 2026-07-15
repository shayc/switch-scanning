import type {
  PressRecognition,
  SwitchAction,
  SwitchDefinition,
} from "./input/switches.ts";
import type { Clock, Scheduler } from "./shared/clock.ts";
import type { ScanStyle } from "./styles/styles.ts";

/** A node in the scan tree: a group or a target. */
export type ScanNode = ScanGroupNode | ScanTargetNode;

/** A group of scannable children, entered on selection. */
export interface ScanGroupNode {
  readonly kind: "group";
  readonly id: string;
  readonly label: string;
  readonly exitLabel?: string;
  readonly disabled?: boolean;
  readonly children: readonly ScanNode[];
}

/** A leaf the user can activate. */
export interface ScanTargetNode {
  readonly kind: "target";
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/** What the highlight currently occupies, or `null` when nothing is highlighted. */
export type Highlight =
  | null
  | { readonly kind: "group" | "target"; readonly id: string }
  | { readonly kind: "exit"; readonly groupId: string };

/** Lifecycle state of the scanner. */
export type ScannerStatus =
  "idle" | "scanning" | "transitioning" | "paused" | "complete";

/** Where the highlight sits within its scope. */
export interface ScanPosition {
  /** Zero-based index within the active scope. */
  readonly index: number;
  readonly count: number;
}

/** The timer the scanner is currently waiting on. */
export interface PendingTiming {
  readonly kind: "advance" | "dwell" | "transition";
  /** Time at which the currently effective deadline was established. */
  readonly startedAt: number;
  readonly dueAt: number;
}

/** Immutable view of scanner state for rendering. */
export interface ScannerSnapshot {
  readonly status: ScannerStatus;
  readonly highlight: Highlight;
  /** Group IDs from root to the active scope (root itself is omitted). */
  readonly path: readonly string[];
  /** One-based pass number within the active scope. */
  readonly pass: number;
  readonly position: ScanPosition | null;
  readonly pending: PendingTiming | null;
}

/** Stable code identifying a diagnostic condition. */
export type ScannerDiagnosticCode =
  | "command-inapplicable"
  | "duplicate-id"
  | "reserved-id"
  | "parent-cycle"
  | "unknown-switch-binding"
  | "activation-missing-target"
  | "second-host-attach"
  | "use-after-dispose";

/**
 * The payload of a scanner notification, before the store stamps `at`.
 * Emitting code constructs these; observers always receive {@link ScannerEvent}.
 */
export type ScannerEventBody =
  | { type: "scan.started" }
  | { type: "scan.paused" }
  | { type: "scan.resumed" }
  | { type: "scan.transitionStarted" }
  | { type: "scan.transitionEnded" }
  | { type: "scan.completed"; reason: "loops" | "empty" }
  | {
      type: "scan.stopped";
      reason: "command" | "disabled" | "after-activation" | "error";
    }
  | HighlightChangedEventBody
  | { type: "group.entered"; id: string; label: string }
  | {
      type: "group.exited";
      id: string;
      label: string;
      reason:
        "selected-exit" | "back" | "loops-complete" | "empty" | "reconcile";
    }
  | { type: "target.activationRequested"; id: string; label: string }
  | { type: "target.activated"; id: string; label: string }
  | {
      type: "target.activationFailed";
      id: string;
      label: string;
      reason: string;
    }
  | {
      type: "input.pressed";
      switchId: string;
      sourceId: string;
      recognition: PressRecognition;
    }
  | {
      type: "input.released";
      switchId: string;
      sourceId: string;
      heldMs: number;
    }
  | { type: "input.cancelled"; switchId: string; sourceId: string }
  | {
      type: "input.holdRecognized";
      switchId: string;
      sourceId: string;
      action: SwitchAction;
    }
  | { type: "diagnostic"; code: ScannerDiagnosticCode; message: string };

/** One event for both highlight moves and clears; `current === null` marks a clear (and omits `label`). */
export type HighlightChangedEventBody =
  | {
      type: "highlight.changed";
      previous: Highlight;
      current: NonNullable<Highlight>;
      label: string;
    }
  | {
      type: "highlight.changed";
      previous: NonNullable<Highlight>;
      current: null;
    };

/**
 * A notification emitted through {@link Scanner.observe}. `at` is the
 * injected clock's time when the event was produced; like snapshot `pending`
 * times, it is meaningful only relative to other values from the same clock.
 */
export type ScannerEvent = ScannerEventBody & { readonly at: number };

/** An observed highlight move or clear, stamped with the clock time. */
export type HighlightChangedEvent = HighlightChangedEventBody & {
  readonly at: number;
};

/** Outcome of a host activation attempt. */
export type ActivationResult =
  { activated: true } | { activated: false; reason: string };

/** Bridge that activates targets and optionally reveals the highlight. */
export interface ScannerHost {
  activate(targetId: string): ActivationResult;
  reveal?(highlight: Highlight): void;
}

/** Reverses a registration or host attachment. */
export type Detach = () => void;
/** Removes a subscriber or observer. */
export type Unsubscribe = () => void;

/** Handle returned by {@link Scanner.attachHost}. */
export interface HostAttachment {
  /** Whether this host acquired the scanner's exclusive host slot. */
  readonly attached: boolean;
  /** Release the host slot. Safe to call more than once. */
  detach(): void;
}

/** When scanning first begins. */
export type StartOn = "switch" | "mount" | "command";
/** What the scanner does after a target activates. */
export type AfterActivation = "restart" | "continue" | "repeat" | "stop";
/** Where a group's exit affordance sits, or whether exit is back-only. */
export type GroupExit = "after" | "before" | "back-only";

/** Quiet period enforced after a selection before scanning resumes. */
export interface SelectionDelayOptions {
  readonly durationMs: number;
  /** Restart the quiet period when declared switch input begins. Defaults to true. */
  readonly resetOnInput?: boolean;
}

/** Runtime behavior for a scanner; updatable via {@link Scanner.setOptions}. */
export interface ScannerBehaviorOptions {
  style: ScanStyle;
  switches?: Readonly<Record<string, SwitchDefinition>>;
  startOn?: StartOn;
  afterActivation?: AfterActivation;
  groupExit?: GroupExit;
  enabled?: boolean;
  selectionDelay?: SelectionDelayOptions;
}

type ScannerInfrastructureOptions =
  | { clock?: undefined; scheduler?: undefined }
  | { clock: Clock & Scheduler; scheduler?: undefined }
  | { clock: Clock; scheduler: Scheduler };

/**
 * A custom time source must either implement both ports itself or be paired
 * with a scheduler that uses the same time base.
 */
export type ScannerOptions = ScannerBehaviorOptions &
  ScannerInfrastructureOptions;

/** Routes physical press/release for declared logical switches. */
export interface ScannerInputPort {
  press(switchId: string, sourceId?: string): void;
  release(switchId: string, sourceId?: string): void;
  /** Disconnect one physical source, or every active source when omitted. */
  disconnect(sourceId?: string): void;
  /**
   * Signal that the input environment was suspended (window blur, tab hidden,
   * device locked). Drops every held contact like a full {@link disconnect} and
   * additionally invalidates an armed single-switch dwell per the style's
   * {@link DwellSuspensionPolicy}, so a stale dwell cannot fire on return.
   */
  suspend(): void;
}

/** The scanning runtime: commands, state, subscriptions, and host wiring. */
export interface Scanner {
  /** Semantic host/programmatic/testing command; bypasses physical gesture filters. */
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  restart(): void;
  next(): void;
  previous(): void;
  select(): void;
  back(): void;

  getSnapshot(): ScannerSnapshot;
  subscribe(onChange: () => void): Unsubscribe;
  observe(listener: (event: ScannerEvent) => void): Unsubscribe;

  /** Replace runtime behavior. Clock and scheduler are fixed at creation. */
  setOptions(options: ScannerBehaviorOptions): void;
  setTree(root: ScanGroupNode): void;
  attachHost(host: ScannerHost): HostAttachment;

  /** End-user physical-input path for declared logical switches. */
  readonly input: ScannerInputPort;

  /** Silent teardown. Call `stop()` first if observers need a final lifecycle event. */
  dispose(): void;
}
