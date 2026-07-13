import { useEffect, useRef } from "react";
import {
  createScanner,
  type Scanner,
  type ScannerOptions,
} from "../core/index.ts";

/**
 * Lazily create a single scanner whose identity is stable for the component's
 * lifetime, forwarding complete option changes through `setOptions`. Options
 * are compared structurally, so callers do not need to memoize them.
 */
export function useScanner(options: ScannerOptions): Scanner {
  const ref = useRef<Scanner | null>(null);
  if (ref.current === null) {
    ref.current = createScanner(options);
  }
  const scanner = ref.current;

  const optionsRef = useRef<ScannerOptions>(options);
  optionsRef.current = options;

  const signature = serializeOptions(options);
  const lastSignature = useRef<string | null>(null);

  useEffect(() => {
    if (lastSignature.current === null) {
      // First run: options were already applied at creation time.
      lastSignature.current = signature;
      return;
    }
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    // setOptions ignores clock/scheduler (fixed at creation); forwarding the
    // current options object is safe.
    scanner.setOptions(optionsRef.current);
    // signature captures every serializable field that setOptions consumes.
  }, [scanner, signature]);

  return scanner;
}

/** A stable structural key over the serializable option fields. */
function serializeOptions(options: ScannerOptions): string {
  return JSON.stringify({
    style: options.style,
    switches: options.switches ?? null,
    startOn: options.startOn ?? null,
    afterActivation: options.afterActivation ?? null,
    groupExit: options.groupExit ?? null,
    enabled: options.enabled ?? null,
  });
}
