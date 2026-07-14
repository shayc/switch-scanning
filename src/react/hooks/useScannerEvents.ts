import { useContext, useEffect, useRef } from "react";
import type { Scanner, ScannerEvent } from "../../core/index.ts";
import { ScannerContext } from "../context.ts";

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
  const context = useContext(ScannerContext);

  const scanner = typeof a === "function" ? context?.scanner : a;
  const listener = typeof a === "function" ? a : b;

  if (!scanner) {
    throw new Error(
      "[switch-scanning] useScannerEvents needs a scanner: pass one or render inside <ScannerProvider>.",
    );
  }

  const listenerRef = useRef<ScannerEventListener | undefined>(listener);
  listenerRef.current = listener;

  useEffect(() => {
    return scanner.observe((event) => {
      listenerRef.current?.(event);
    });
  }, [scanner]);
}
