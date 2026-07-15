export { createScanner } from "./scanner.ts";
export {
  autoScan,
  stepScan,
  singleSwitchStepScan,
  inverseScan,
  isTimedStyle,
} from "./styles.ts";

export type {
  AutoScanStyle,
  AutoScanOptions,
  StepScanStyle,
  StepScanOptions,
  StepScanRepeat,
  SingleSwitchStepScanStyle,
  SingleSwitchStepScanOptions,
  DwellSuspensionPolicy,
  InverseScanStyle,
  InverseScanOptions,
  ScanStyle,
  LoopLimit,
} from "./styles.ts";

export type {
  SwitchDefinition,
  DiscreteSwitchDefinition,
  ScanSwitchDefinition,
  TapHoldSwitchDefinition,
  DiscreteAction,
  ScanAction,
  SwitchAction,
  PressRecognition,
} from "./input/switches.ts";

export type {
  Clock,
  Scheduler,
  CancelScheduled,
  ManualClock,
} from "./clock.ts";
export { systemClock, manualClock } from "./clock.ts";

export type {
  ScanNode,
  ScanGroupNode,
  ScanTargetNode,
  Highlight,
  ScannerStatus,
  ScannerSnapshot,
  ScanPosition,
  PendingTiming,
  ScannerEvent,
  HighlightChangedEvent,
  ScannerDiagnosticCode,
  ScannerHost,
  ActivationResult,
  Scanner,
  ScannerOptions,
  ScannerBehaviorOptions,
  SelectionDelayOptions,
  ScannerInputPort,
  StartOn,
  AfterActivation,
  GroupExit,
  Detach,
  HostAttachment,
  Unsubscribe,
} from "./types.ts";
