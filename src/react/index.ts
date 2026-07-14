// Re-export the framework-agnostic core so `@shayc/switch-scanning` is a
// complete entry point for React applications.
export * from "../core/index.ts";

export {
  ScannerProvider,
  type ScannerProviderProps,
} from "./ScannerProvider.tsx";
export { useScanner } from "./hooks/useScanner.ts";
export {
  useScanTarget,
  type UseScanTargetOptions,
  type ScanTargetBinding,
} from "./hooks/useScanTarget.ts";
export {
  useScanGroup,
  type UseScanGroupOptions,
  type ScanGroupBinding,
} from "./hooks/useScanGroup.ts";
export {
  useKeyboardSwitches,
  type KeyboardSwitchBindings,
  type KeyboardSwitchesOptions,
} from "./hooks/useKeyboardSwitches.ts";
export {
  usePointerSwitch,
  type UsePointerSwitchOptions,
  type PointerSwitchBinding,
} from "./hooks/usePointerSwitch.ts";
export {
  useScannerSnapshot,
  type SnapshotSelector,
  type SnapshotEquality,
} from "./hooks/useScannerSnapshot.ts";
export {
  useScannerEvents,
  type ScannerEventListener,
} from "./hooks/useScannerEvents.ts";
export type { ScanTargetOptions, ScanGroupOptions } from "./registry.ts";
export { ScanRegistry } from "./registry.ts";
