import { manualClock, type ManualClock } from "../clock.ts";
import { createScanner } from "../scanner.ts";
import type {
  ActivationResult,
  Scanner,
  ScannerEvent,
  ScannerHost,
  ScanGroupNode,
  ScanNode,
  Unsubscribe,
} from "../types.ts";

export { manualClock } from "../clock.ts";
export type { ManualClock } from "../clock.ts";

const FIXTURE_ROOT_ID = "__fixture_root__";

/** A scanner paired with an in-memory host for driving tests. */
export interface ScannerFixture {
  readonly scanner: Scanner;
  /** IDs of every target the host successfully activated, in order. */
  readonly activations: readonly string[];
  /** Force a specific target to fail activation with the given reason. */
  failActivation(targetId: string, reason?: string): void;
  /** Clear a previously configured activation failure. */
  allowActivation(targetId: string): void;
  /** Replace the fixture's target/group list. */
  setNodes(nodes: readonly ScanNode[]): void;
  /** Detach the fixture host and stop observing. */
  dispose(): void;
}

/**
 * Wrap a scanner with an in-memory host so application tests can drive
 * scanning without a DOM. Children are wrapped in a synthetic root group.
 */
export function createScannerFixture(
  scanner: Scanner,
  nodes: readonly ScanNode[],
): ScannerFixture {
  const activations: string[] = [];
  const failures = new Map<string, string>();

  const host: ScannerHost = {
    activate(targetId): ActivationResult {
      const reason = failures.get(targetId);
      if (reason !== undefined) return { activated: false, reason };
      activations.push(targetId);
      return { activated: true };
    },
  };

  const attachment = scanner.attachHost(host);
  if (!attachment.attached) {
    throw new Error(
      "[switch-scanning] createScannerFixture could not attach its host; the scanner already has a host or is disposed",
    );
  }

  const toRoot = (children: readonly ScanNode[]): ScanGroupNode => ({
    kind: "group",
    id: FIXTURE_ROOT_ID,
    label: "root",
    children,
  });

  scanner.setTree(toRoot(nodes));

  return {
    scanner,
    get activations() {
      return activations;
    },
    failActivation(targetId, reason = "test-forced-failure") {
      failures.set(targetId, reason);
    },
    allowActivation(targetId) {
      failures.delete(targetId);
    },
    setNodes(next) {
      scanner.setTree(toRoot(next));
    },
    dispose() {
      attachment.detach();
    },
  };
}

/** A rolling record of the events a scanner has emitted. */
export interface RecordedEvents {
  readonly events: readonly ScannerEvent[];
  /** Events whose `type` matches. */
  ofType<T extends ScannerEvent["type"]>(
    type: T,
  ): Extract<ScannerEvent, { type: T }>[];
  clear(): void;
  stop: Unsubscribe;
}

/** Record every event a scanner emits for later assertions. */
export function recordScannerEvents(scanner: Scanner): RecordedEvents {
  const events: ScannerEvent[] = [];
  const stop = scanner.observe((event) => {
    events.push(event);
  });
  return {
    get events() {
      return events;
    },
    ofType(type) {
      return events.filter((event) => event.type === type) as never;
    },
    clear() {
      events.length = 0;
    },
    stop,
  };
}

/**
 * Convenience helper that builds a scanner with a fresh manual clock plus a
 * fixture in one call.
 */
export function createTestScanner(
  scannerFactory: (clock: ManualClock) => Scanner,
  nodes: readonly ScanNode[],
): { clock: ManualClock; scanner: Scanner; fixture: ScannerFixture } {
  const clock = manualClock();
  const scanner = scannerFactory(clock);
  const fixture = createScannerFixture(scanner, nodes);
  return { clock, scanner, fixture };
}

export { createScanner };
