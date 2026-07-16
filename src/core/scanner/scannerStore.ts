import { snapshotEquals } from "../model/session.ts";
import type { Clock } from "../shared/clock.ts";
import type {
  ScannerEvent,
  ScannerEventBody,
  ScannerSnapshot,
  Unsubscribe,
} from "../types.ts";

interface ScannerStore {
  runTransition: (work: () => void) => void;
  serialized: <Args extends unknown[]>(
    work: (...args: Args) => void,
  ) => (...args: Args) => void;
  emit: (event: ScannerEventBody) => void;
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
  clock: Clock,
  assertInvariants?: () => void,
): ScannerStore {
  const subscribers = new Set<() => void>();
  const observers = new Set<(event: ScannerEvent) => void>();
  let cachedSnapshot: ScannerSnapshot = {
    status: "idle",
    highlight: null,
    path: [],
    pass: 0,
    position: null,
    pending: null,
  };
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

  function notify<T>(
    targets: Set<(arg: T) => void>,
    arg: T,
    boundary: string,
  ): void {
    for (const target of [...targets]) {
      try {
        target(arg);
      } catch (error) {
        reportBoundaryError(error, boundary);
      }
    }
  }

  function publishChanges(): void {
    const next = buildSnapshot();
    if (!snapshotEquals(next, cachedSnapshot)) {
      cachedSnapshot = next;
      notify(subscribers, undefined, "listener");
    }

    for (const event of pendingEvents.splice(0)) {
      notify(observers, event, "observer");
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
        assertInvariants?.();
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
    emit(event) {
      // Stamped at enqueue time: events describe when the thing happened,
      // even though delivery is deferred until the transition publishes.
      pendingEvents.push({ ...event, at: clock.now() });
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
