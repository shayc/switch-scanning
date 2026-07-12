import { createContext, useContext } from "react";
import type { Scanner } from "../core/index.ts";
import type { ScanRegistry } from "./registry.ts";

export interface ScannerContextValue {
  readonly scanner: Scanner;
  readonly registry: ScanRegistry;
}

export const ScannerContext = createContext<ScannerContextValue | null>(null);

export function useScannerContext(hookName: string): ScannerContextValue {
  const value = useContext(ScannerContext);
  if (!value) {
    throw new Error(
      `[switch-scanning] ${hookName} must be used inside a <ScannerProvider>.`,
    );
  }
  return value;
}

/** Resolve a scanner from an explicit argument or the surrounding provider. */
export function useResolvedScanner(explicit: Scanner | undefined, hookName: string): Scanner {
  const context = useContext(ScannerContext);
  const scanner = explicit ?? context?.scanner;
  if (!scanner) {
    throw new Error(
      `[switch-scanning] ${hookName} needs a scanner: pass one explicitly or render inside <ScannerProvider>.`,
    );
  }
  return scanner;
}
