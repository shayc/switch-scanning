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
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// Snapshot

export type Highlight =
  | null
  | { readonly kind: "group" | "target"; readonly id: string }
  | { readonly kind: "exit"; readonly groupId: string };

export type ScannerStatus = "idle" | "scanning" | "paused" | "complete";

export interface ScannerSnapshot {
  readonly status: ScannerStatus;
  readonly highlight: Highlight;
  /** Group IDs from root to the active scope (root itself is omitted). */
  readonly path: readonly string[];
  /** The active scope's pass number, 1-based. */
  readonly loop: number;
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
  | { type: "scan.completed"; reason: "loops" | "empty" }
  | {
      type: "scan.stopped";
      reason: "command" | "disabled" | "after-activation" | "error";
    }
  | {
      type: "highlight.changed";
      previous: Highlight;
      current: NonNullable<Highlight>;
      label: string;
    }
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

// Host

export type ActivationResult =
  { activated: true } | { activated: false; reason: string };

export interface ScannerHost {
  activate(targetId: string): ActivationResult;
  reveal?(highlight: Highlight): void;
}

export type Detach = () => void;
export type Unsubscribe = () => void;

// Options

export type StartOn = "switch" | "mount" | "command";
export type AfterActivation = "restart" | "continue" | "repeat" | "stop";
export type GroupExit = "after" | "before" | "none";

interface ScannerBehaviorOptions {
  style: ScanStyle;
  switches?: Readonly<Record<string, SwitchDefinition>>;
  startOn?: StartOn;
  afterActivation?: AfterActivation;
  groupExit?: GroupExit;
  enabled?: boolean;
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
  disconnect(sourceId?: string): void;
}

// Scanner

export interface Scanner {
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

  setOptions(options: ScannerOptions): void;
  setTree(root: ScanGroupNode): void;
  attachHost(host: ScannerHost): Detach;

  readonly input: ScannerInputPort;

  dispose(): void;
}
