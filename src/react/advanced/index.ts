export {
  ScannerProvider,
  type ScannerProviderProps,
} from "../ScannerProvider.tsx";
export { useScannerContext, type ScannerContextValue } from "../context.ts";
export { useOwnedScanner } from "../hooks/useOwnedScanner.ts";
export {
  useKeyboardSwitches,
  type KeyboardSwitchBindings,
  type UseKeyboardSwitchesOptions,
} from "../hooks/useKeyboardSwitches.ts";
export {
  usePointerSwitch,
  type UsePointerSwitchOptions,
  type PointerSwitchProps,
} from "../hooks/usePointerSwitch.ts";
export {
  useScanTarget,
  type UseScanTargetOptions,
  type ScanTargetProps,
} from "../hooks/useScanTarget.ts";
export {
  useScanGroup,
  type UseScanGroupOptions,
  type ScanGroupProps,
} from "../hooks/useScanGroup.ts";
export {
  useScannerSnapshot,
  type SnapshotSelector,
  type SnapshotEquality,
} from "../hooks/useScannerSnapshot.ts";
export {
  useScannerEvents,
  type ScannerEventListener,
} from "../hooks/useScannerEvents.ts";
export type { ScanTargetOptions, ScanGroupOptions } from "../registry.ts";
export { ScanRegistry } from "../registry.ts";

// Core engine and host types this tier hands the caller (scanner ownership via
// useOwnedScanner, custom hosts), re-exported so the advanced surface is
// self-contained.
export type {
  ActivationResult,
  HostAttachment,
  Scanner,
  ScannerHost,
  ScannerOptions,
} from "../../core/index.ts";
