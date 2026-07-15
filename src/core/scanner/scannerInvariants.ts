import type { PendingTiming, ScannerStatus } from "../types.ts";
import type { ScanStyle } from "../styles/styles.ts";

export interface ScannerRuntimeInvariantState {
  readonly status: ScannerStatus;
  readonly sessionDepth: number;
  readonly hasPresentation: boolean;
  readonly transition: { readonly pending: PendingTiming | null } | null;
  readonly stylePending: PendingTiming | null;
  readonly suspendedDwellRemaining: number | null;
  readonly styleKind: ScanStyle["kind"];
}

/** Assert internal lifecycle relationships after one serialized mutation. */
export function assertScannerRuntimeInvariants(
  state: ScannerRuntimeInvariantState,
): void {
  const {
    status,
    sessionDepth,
    hasPresentation,
    transition,
    stylePending,
    suspendedDwellRemaining,
    styleKind,
  } = state;
  const fail = (message: string): never => {
    throw new Error(`[switch-scanning] invariant violated: ${message}`);
  };
  const transitionPending = transition?.pending ?? null;

  if (stylePending && transitionPending) {
    fail("transition and style timing cannot both be pending");
  }
  const pending = transitionPending ?? stylePending;
  if (pending && pending.dueAt < pending.startedAt) {
    fail("a pending deadline cannot precede its start time");
  }
  if (suspendedDwellRemaining !== null) {
    if (
      status !== "paused" ||
      transition !== null ||
      styleKind !== "singleStep"
    ) {
      fail("a suspended dwell requires a paused single-step scan");
    }
    if (suspendedDwellRemaining < 0) {
      fail("a suspended dwell remainder cannot be negative");
    }
  }

  switch (status) {
    case "idle":
    case "complete":
      if (sessionDepth !== 0) fail(`${status} status cannot retain a session`);
      if (hasPresentation) fail(`${status} status cannot retain presentation`);
      if (transition !== null)
        fail(`${status} status cannot retain transition data`);
      if (stylePending !== null)
        fail(`${status} status cannot retain style timing`);
      if (suspendedDwellRemaining !== null)
        fail(`${status} status cannot retain a suspended dwell`);
      break;
    case "scanning":
      if (sessionDepth === 0) fail("scanning requires a live session");
      if (transition !== null) fail("scanning cannot retain transition data");
      if (suspendedDwellRemaining !== null)
        fail("scanning cannot retain a suspended dwell");
      break;
    case "transitioning":
      if (sessionDepth === 0) fail("transitioning requires a live session");
      if (transition === null) fail("transitioning requires transition data");
      if (transitionPending === null)
        fail("transitioning requires a scheduled deadline");
      if (hasPresentation) fail("transitioning cannot expose presentation");
      if (stylePending !== null)
        fail("transitioning cannot retain style timing");
      break;
    case "paused":
      if (sessionDepth === 0) fail("paused requires a live session");
      if (stylePending !== null) fail("paused cannot retain style timing");
      if (transition) {
        if (transitionPending !== null)
          fail("a paused transition cannot retain a scheduled deadline");
        if (hasPresentation)
          fail("a paused transition cannot expose presentation");
      }
      break;
  }
}
