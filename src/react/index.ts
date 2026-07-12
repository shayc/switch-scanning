// Re-export the framework-agnostic core so `@shayc/switch-scanning` is a
// complete entry point for React applications.
export * from "../core/index.ts";

export { ScannerProvider, type ScannerProviderProps } from "./ScannerProvider.tsx";
export { useScanner } from "./useScanner.ts";
export {
  useScanTarget,
  type UseScanTargetOptions,
  type ScanTargetBinding,
} from "./useScanTarget.ts";
export {
  useScanGroup,
  type UseScanGroupOptions,
  type ScanGroupBinding,
} from "./useScanGroup.ts";
export {
  useKeyboardSwitches,
  type KeyboardSwitchBindings,
  type KeyboardSwitchesOptions,
} from "./useKeyboardSwitches.ts";
export {
  useScannerSnapshot,
  type SnapshotSelector,
  type SnapshotEquality,
} from "./useScannerSnapshot.ts";
export {
  useScannerEvents,
  type ScannerEventListener,
} from "./useScannerEvents.ts";
export type { ScanTargetOptions, ScanGroupOptions } from "./registry.ts";
export { ScanRegistry } from "./registry.ts";
