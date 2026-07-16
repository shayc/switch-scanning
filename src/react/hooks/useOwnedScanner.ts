import { useEffect, useRef } from "react";
import {
  createScanner,
  type Scanner,
  type ScannerOptions,
} from "../../core/index.ts";
import {
  scannerBehaviorSignature,
  toScannerBehaviorOptions,
} from "../../core/scanner/behaviorOptions.ts";
import { useCommittedRef } from "./refs.ts";

/**
 * Lazily create a single scanner whose identity is stable for the component's
 * lifetime, forwarding complete option changes through `setOptions`. Options
 * are compared structurally, so callers do not need to memoize them.
 *
 * Lifecycle: on unmount the scanner is stopped; it is never disposed. This
 * keeps the object recoverable across StrictMode's simulated unmount/remount
 * without allowing host attachment to re-arm a consumed `startOn: "mount"`
 * token. Consumers that skip the provider still get their `setTimeout` chain
 * torn down when the component leaves the tree.
 */
export function useOwnedScanner(options: ScannerOptions): Scanner {
  const ref = useRef<Scanner | null>(null);
  if (ref.current === null) {
    ref.current = createScanner(options);
  }
  const scanner = ref.current;

  const optionsRef = useCommittedRef(options);

  const signature = scannerBehaviorSignature(options);
  const lastSignature = useRef<string | null>(null);

  useEffect(() => {
    if (lastSignature.current === null) {
      // First run: options were already applied at creation time.
      lastSignature.current = signature;
      return;
    }
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    scanner.setOptions(toScannerBehaviorOptions(optionsRef.current));
    // signature captures every serializable field that setOptions consumes.
  }, [scanner, signature, optionsRef]);

  useEffect(() => {
    return () => {
      // Stop (never dispose) so the scanner stays recoverable across a
      // StrictMode remount. The guard avoids a spurious scan.stopped when the
      // scanner is already stopped — e.g. ScannerProvider's cleanup ran first.
      if (scanner.getSnapshot().status !== "idle") scanner.stop();
    };
  }, [scanner]);

  return scanner;
}
