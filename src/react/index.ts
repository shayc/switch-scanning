export {
  autoScan,
  dwellScan,
  inverseScan,
  stepScan,
  type AutoScanMethod,
  type AutoScanOptions,
  type DwellScanMethod,
  type DwellScanOptions,
  type DwellSuspensionPolicy,
  type InverseScanMethod,
  type InverseScanOptions,
  type PassLimit,
  type ScanMethod,
  type StepScanMethod,
  type StepScanOptions,
  type StepScanRepeat,
} from "../core/methods/methods.ts";
export {
  SwitchScanner,
  type KeyboardActionBindings,
  type KeyboardBinding,
  type KeyboardGesture,
  type SwitchGesture,
  type SwitchScannerBehavior,
  type SwitchScannerKeyboardOptions,
  type SwitchScannerProps,
} from "./simple/SwitchScanner.tsx";
export {
  useScanTarget,
  type UseScanTargetOptions,
  type ScanTargetProps,
} from "./hooks/useScanTarget.ts";
export {
  useScanGroup,
  type UseScanGroupOptions,
  type ScanGroupProps,
} from "./hooks/useScanGroup.ts";
export {
  useSwitch,
  type UseSwitchOptions,
  type SwitchProps,
} from "./simple/useSwitch.ts";
export {
  useScannerCommands,
  type ScannerCommands,
} from "./simple/useScannerCommands.ts";
export {
  useScannerSnapshot,
  type SnapshotSelector,
  type SnapshotEquality,
} from "./hooks/useScannerSnapshot.ts";
export {
  useScannerEvents,
  type ScannerEventListener,
} from "./hooks/useScannerEvents.ts";

export type {
  Highlight,
  PendingTiming,
  ScannerEvent,
  ScannerSnapshot,
  ScannerStatus,
  StartOn,
} from "../core/types.ts";
export type {
  DiscreteAction,
  SwitchAction,
  SwitchDefinition,
} from "../core/input/switches.ts";
