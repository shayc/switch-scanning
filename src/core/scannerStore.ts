import { snapshotEquals } from "./session.ts";
import type { ScannerEvent, ScannerSnapshot, Unsubscribe } from "./types.ts";

export interface ScannerStore {
  runTransition: (work: () => void) => void;
  serialized: <Args extends unknown[]>(
    work: (...args: Args) => void,
  ) => (...args: Args) => void;
  commit: () => void;
  emit: (event: ScannerEvent) => void;
  getSnapshot: () => ScannerSnapshot;
  subscribe: (onChange: () => void) => Unsubscribe;
  observe: (listener: (event: ScannerEvent) => void) => Unsubscribe;
  reportBoundaryError: (error: unknown, boundary: string) => void;
  clearListeners: () => void;
}

/**
 * Owns scanner transaction ordering and publication. Domain mutations are
 * supplied by the coordinator and published only after each one completes.
 */
export function createScannerStore(
  buildSnapshot: () => ScannerSnapshot,
): ScannerStore {
  const subscribers = new Set<() => void>();
  const observers = new Set<(event: ScannerEvent) => void>();
  let cachedSnapshot: ScannerSnapshot = {
    status: "idle",
    highlight: null,
    path: [],
    loop: 0,
  };
  let commitPending = false;
  let isDrainingTransitions = false;
  const pendingEvents: ScannerEvent[] = [];
  const pendingTransitions: Array<() => void> = [];

  function reportBoundaryError(error: unknown, boundary: string): void {
    if (typeof globalThis.reportError === "function") {
      globalThis.reportError(error);
      return;
    }
    if (typeof console !== "undefined") {
      console.error(`[switch-scanning] scanner ${boundary} failed`, error);
    }
  }

  function publishChanges(): void {
    if (commitPending) {
      commitPending = false;
      const next = buildSnapshot();
      if (!snapshotEquals(next, cachedSnapshot)) cachedSnapshot = next;

      for (const subscriber of [...subscribers]) {
        try {
          subscriber();
        } catch (error) {
          reportBoundaryError(error, "listener");
        }
      }
    }

    const events = pendingEvents.splice(0);
    for (const event of events) {
      for (const observer of [...observers]) {
        try {
          observer(event);
        } catch (error) {
          reportBoundaryError(error, "listener");
        }
      }
    }
  }

  function runTransition(work: () => void): void {
    pendingTransitions.push(work);
    if (isDrainingTransitions) return;

    isDrainingTransitions = true;
    try {
      while (pendingTransitions.length > 0) {
        const transition = pendingTransitions.shift()!;
        transition();
        publishChanges();
      }
    } finally {
      isDrainingTransitions = false;
    }
  }

  function serialized<Args extends unknown[]>(
    work: (...args: Args) => void,
  ): (...args: Args) => void {
    return (...args) => runTransition(() => work(...args));
  }

  return {
    runTransition,
    serialized,
    commit() {
      commitPending = true;
    },
    emit(event) {
      pendingEvents.push(event);
    },
    getSnapshot() {
      return cachedSnapshot;
    },
    subscribe(onChange) {
      subscribers.add(onChange);
      return () => {
        subscribers.delete(onChange);
      };
    },
    observe(listener) {
      observers.add(listener);
      return () => {
        observers.delete(listener);
      };
    },
    reportBoundaryError,
    clearListeners() {
      subscribers.clear();
      observers.clear();
    },
  };
}
