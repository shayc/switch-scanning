import type { Clock, Scheduler } from "./clock.ts";
import type { ScanStyle } from "./styles.ts";
import type { SwitchDefinition } from "./switches.ts";

// Scan tree

export type ScanNode = ScanGroupNode | ScanTargetNode;

export interface ScanGroupNode {
  readonly kind: "group";
  readonly id: string;
  readonly label: string;
  readonly exitLabel?: string;
  readonly disabled?: boolean;
  readonly children: readonly ScanNode[];
}

export interface ScanTargetNode {
  readonly kind: "target";
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

// Snapshot

export type Highlight =
  | null
  | { readonly kind: "group" | "target"; readonly id: string }
  | { readonly kind: "exit"; readonly groupId: string };

export type ScannerStatus =
  "idle" | "scanning" | "transitioning" | "paused" | "complete";

export interface ScanPosition {
  /** Zero-based index within the active scope. */
  readonly index: number;
  readonly count: number;
}

export interface PendingTiming {
  readonly kind: "advance" | "dwell" | "transition";
  /** Time at which the currently effective deadline was established. */
  readonly startedAt: number;
  readonly dueAt: number;
}

export interface ScannerSnapshot {
  readonly status: ScannerStatus;
  readonly highlight: Highlight;
  /** Group IDs from root to the active scope (root itself is omitted). */
  readonly path: readonly string[];
  /** The active scope's pass number, 1-based. */
  readonly loop: number;
  readonly position: ScanPosition | null;
  readonly pending: PendingTiming | null;
}

// Events

export type ScannerDiagnosticCode =
  | "command-inapplicable"
  | "duplicate-id"
  | "unknown-switch-binding"
  | "activation-missing-target"
  | "second-host-attach"
  | "use-after-dispose";

export type ScannerEvent =
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
  | HighlightChangedEvent
  | { type: "group.entered"; id: string; label: string }
  | {
      type: "group.exited";
      id: string;
      label: string;
      reason: "selected-exit" | "back" | "loops-complete" | "empty";
    }
  | { type: "target.activationRequested"; id: string; label: string }
  | { type: "target.activated"; id: string; label: string }
  | {
      type: "target.activationFailed";
      id: string;
      label: string;
      reason: string;
    }
  | { type: "diagnostic"; code: ScannerDiagnosticCode; message: string };

/** Subscribe once and discriminate clearing with `current === null`. */
export type HighlightChangedEvent =
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

// Host

export type ActivationResult =
  { activated: true } | { activated: false; reason: string };

export interface ScannerHost {
  activate(targetId: string): ActivationResult;
  reveal?(highlight: Highlight): void;
}

export type Detach = () => void;
export type Unsubscribe = () => void;

export interface HostAttachment {
  (): void;
  /** Whether this host acquired the scanner's exclusive host slot. */
  readonly attached: boolean;
}

// Options

export type StartOn = "switch" | "mount" | "command";
export type AfterActivation = "restart" | "continue" | "repeat" | "stop";
export type GroupExit = "after" | "before" | "back-only";

export interface SelectionDelayOptions {
  readonly durationMs: number;
  /** Restart the quiet period when declared switch input begins. Defaults true. */
  readonly resetOnInput?: boolean;
}

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

// Input port

export interface ScannerInputPort {
  press(switchId: string, sourceId?: string): void;
  release(switchId: string, sourceId?: string): void;
  /** Disconnect one physical source, or every active source when omitted. */
  disconnect(sourceId?: string): void;
}

// Scanner

export interface Scanner {
  /** Semantic host/caregiver/testing command; bypasses physical gesture filters. */
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
