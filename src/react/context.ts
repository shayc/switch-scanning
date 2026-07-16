import { createContext, useContext } from "react";
import type { Scanner } from "../core/index.ts";
import type { ScanRegistry } from "./registry.ts";

/** The scanner and its registry, shared through {@link ScannerContext} by a provider. */
export interface ScannerContextValue {
  readonly scanner: Scanner;
  readonly registry: ScanRegistry;
}

/** React context carrying the active {@link ScannerContextValue}, or `null` outside a provider. */
export const ScannerContext = createContext<ScannerContextValue | null>(null);

/**
 * Read the scanner and registry from the nearest `<ScannerProvider>`. Throws a
 * tagged error naming the calling hook when used outside a provider.
 */
export function useScannerContext(
  hookName = "useScannerContext",
): ScannerContextValue {
  const value = useContext(ScannerContext);
  if (!value) {
    throw new Error(
      `[switch-scanning] ${hookName} must be used inside a <ScannerProvider>.`,
    );
  }
  return value;
}

/**
 * Resolve the scanner a hook should use: the explicit one when passed, else the
 * provider's. Throws a tagged error naming the calling hook when neither exists.
 */
export function useResolvedScanner(
  explicit: Scanner | undefined,
  hookName: string,
): Scanner {
  const context = useContext(ScannerContext);
  const scanner = explicit ?? context?.scanner;
  if (!scanner) {
    throw new Error(
      `[switch-scanning] ${hookName} needs a scanner: pass one explicitly or render inside <ScannerProvider>.`,
    );
  }
  return scanner;
}
