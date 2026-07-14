import { useCallback, useContext, useRef, useSyncExternalStore } from "react";
import type { Scanner, ScannerSnapshot } from "../../core/index.ts";
import { ScannerContext } from "../context.ts";

export type SnapshotSelector<T> = (snapshot: ScannerSnapshot) => T;
export type SnapshotEquality<T> = (a: T, b: T) => boolean;

/**
 * Subscribe to scanner state through `useSyncExternalStore`, with selector
 * caching so a component only rerenders when its selected value changes.
 * Equality governs the selected value, never the immutable source snapshot.
 *
 * Two calling forms are supported:
 *   useScannerSnapshot(selector?, isEqual?)          // uses provider context
 *   useScannerSnapshot(scanner, selector?, isEqual?) // explicit scanner
 */
export function useScannerSnapshot(): ScannerSnapshot;
export function useScannerSnapshot<T>(
  selector: SnapshotSelector<T>,
  isEqual?: SnapshotEquality<T>,
): T;
export function useScannerSnapshot<T>(
  scanner: Scanner,
  selector?: SnapshotSelector<T>,
  isEqual?: SnapshotEquality<T>,
): T;
export function useScannerSnapshot<T>(
  a?: Scanner | SnapshotSelector<T>,
  b?: SnapshotSelector<T> | SnapshotEquality<T>,
  c?: SnapshotEquality<T>,
): T | ScannerSnapshot {
  const context = useContext(ScannerContext);

  let scanner: Scanner | undefined;
  let selector: SnapshotSelector<T> | undefined;
  let isEqual: SnapshotEquality<T> | undefined;

  if (typeof a === "function") {
    selector = a;
    isEqual = b as SnapshotEquality<T> | undefined;
  } else {
    scanner = a;
    selector = b as SnapshotSelector<T> | undefined;
    isEqual = c;
  }

  const resolved = scanner ?? context?.scanner;
  if (!resolved) {
    throw new Error(
      "[switch-scanning] useScannerSnapshot needs a scanner: pass one or render inside <ScannerProvider>.",
    );
  }

  // Cache the last selected value so equal selections keep a stable reference.
  const cache = useRef<{
    input: ScannerSnapshot;
    output: T;
    selector: SnapshotSelector<T> | undefined;
    isEqual: SnapshotEquality<T> | undefined;
  } | null>(null);

  const getSelected = useCallback((): T => {
    const snapshot = resolved.getSnapshot();
    if (
      cache.current &&
      cache.current.input === snapshot &&
      cache.current.selector === selector &&
      cache.current.isEqual === isEqual
    ) {
      return cache.current.output;
    }
    const next = selector ? selector(snapshot) : (snapshot as unknown as T);
    const equals = isEqual ?? Object.is;
    if (cache.current && equals(cache.current.output, next)) {
      // Keep the previous reference to avoid an unnecessary rerender.
      cache.current = {
        input: snapshot,
        output: cache.current.output,
        selector,
        isEqual,
      };
      return cache.current.output;
    }
    cache.current = { input: snapshot, output: next, selector, isEqual };
    return next;
  }, [resolved, selector, isEqual]);

  return useSyncExternalStore(
    useCallback((onChange) => resolved.subscribe(onChange), [resolved]),
    getSelected,
    getSelected,
  );
}
