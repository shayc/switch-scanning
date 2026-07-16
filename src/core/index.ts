export { createScanner } from "./scanner/scanner.ts";
export {
  autoScan,
  inverseScan,
  isTimedMethod,
  dwellScan,
  stepScan,
} from "./methods/methods.ts";

export type {
  AutoScanOptions,
  AutoScanMethod,
  DwellSuspensionPolicy,
  InverseScanOptions,
  InverseScanMethod,
  PassLimit,
  ScanMethod,
  DwellScanOptions,
  DwellScanMethod,
  StepScanOptions,
  StepScanRepeat,
  StepScanMethod,
} from "./methods/methods.ts";

export type {
  DiscreteAction,
  DiscreteSwitchDefinition,
  PressRecognition,
  ScanAction,
  ScanSwitchDefinition,
  SwitchAction,
  SwitchDefinition,
  TapHoldSwitchDefinition,
} from "./input/switches.ts";

export { manualClock, systemClock } from "./shared/clock.ts";
export type {
  CancelScheduled,
  Clock,
  ManualClock,
  Scheduler,
} from "./shared/clock.ts";

export type {
  ActivationResult,
  AfterActivation,
  Detach,
  GroupExit,
  Highlight,
  HighlightChangedEvent,
  HostAttachment,
  PendingTiming,
  ScanGroupNode,
  Scanner,
  ScannerBehaviorOptions,
  ScannerDiagnosticCode,
  ScannerEvent,
  ScannerHost,
  ScannerInputPort,
  ScannerOptions,
  ScannerSnapshot,
  ScannerStatus,
  ScanNode,
  ScanPosition,
  ScanTargetNode,
  SelectionDelayOptions,
  StartOn,
  Unsubscribe,
} from "./types.ts";
