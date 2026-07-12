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
} from "./switches.ts";

export type { Clock, Scheduler, CancelScheduled, ManualClock } from "./clock.ts";
export { systemClock, manualClock } from "./clock.ts";

export type {
  ScanNode,
  ScanGroupNode,
  ScanTargetNode,
  Highlight,
  ScannerStatus,
  ScannerSnapshot,
  ScannerEvent,
  ScannerDiagnosticCode,
  ScannerHost,
  ActivationResult,
  Scanner,
  ScannerOptions,
  ScannerInputPort,
  StartOn,
  AfterActivation,
  GroupExit,
  Detach,
  Unsubscribe,
} from "./types.ts";
