import { useEffect } from "react";
import type { Scanner, ScannerEvent } from "../../core/index.ts";
import { useResolvedScanner } from "../context.ts";
import { useCommittedRef } from "./refs.ts";

/** Receives each {@link ScannerEvent}. */
export type ScannerEventListener = (event: ScannerEvent) => void;

/**
 * Observe scanner events for feedback (speech, tones, haptics, analytics).
 * The listener is stored in a ref, so changing the callback never re-subscribes.
 *
 * Two calling forms are supported:
 *   useScannerEvents(listener)           // uses provider context
 *   useScannerEvents(scanner, listener)  // explicit scanner
 */
export function useScannerEvents(listener: ScannerEventListener): void;
export function useScannerEvents(
  scanner: Scanner,
  listener: ScannerEventListener,
): void;
export function useScannerEvents(
  a: Scanner | ScannerEventListener,
  b?: ScannerEventListener,
): void {
  const explicit = typeof a === "function" ? undefined : a;
  const listener = typeof a === "function" ? a : b;
  const scanner = useResolvedScanner(explicit, "useScannerEvents");

  const listenerRef = useCommittedRef(listener);

  useEffect(() => {
    return scanner.observe((event) => {
      listenerRef.current?.(event);
    });
  }, [scanner, listenerRef]);
}
