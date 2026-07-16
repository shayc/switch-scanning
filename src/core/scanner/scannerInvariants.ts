import type { PendingTiming, ScannerStatus } from "../types.ts";
import type { ScanMethod } from "../methods/methods.ts";

/** The runtime facts {@link assertScannerRuntimeInvariants} checks for internal consistency. */
export interface ScannerRuntimeInvariantState {
  readonly status: ScannerStatus;
  readonly sessionDepth: number;
  readonly hasPresentation: boolean;
  readonly transition: { readonly pending: PendingTiming | null } | null;
  readonly methodPending: PendingTiming | null;
  readonly suspendedDwellRemaining: number | null;
  readonly methodKind: ScanMethod["kind"];
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
    methodPending,
    suspendedDwellRemaining,
    methodKind,
  } = state;
  const failInvariant = (message: string): never => {
    throw new Error(`[switch-scanning] invariant violated: ${message}`);
  };
  const transitionPending = transition?.pending ?? null;

  if (methodPending && transitionPending) {
    failInvariant("transition and method timing cannot both be pending");
  }
  const pending = transitionPending ?? methodPending;
  if (pending && pending.dueAt < pending.startedAt) {
    failInvariant("a pending deadline cannot precede its start time");
  }
  if (suspendedDwellRemaining !== null) {
    if (status !== "paused" || transition !== null || methodKind !== "dwell") {
      failInvariant("a suspended dwell requires a paused dwell scan");
    }
    if (suspendedDwellRemaining < 0) {
      failInvariant("a suspended dwell remainder cannot be negative");
    }
  }

  switch (status) {
    case "idle":
    case "complete":
      if (sessionDepth !== 0)
        failInvariant(`${status} status cannot retain a session`);
      if (hasPresentation)
        failInvariant(`${status} status cannot retain presentation`);
      if (transition !== null)
        failInvariant(`${status} status cannot retain transition data`);
      if (methodPending !== null)
        failInvariant(`${status} status cannot retain method timing`);
      if (suspendedDwellRemaining !== null)
        failInvariant(`${status} status cannot retain a suspended dwell`);
      break;
    case "scanning":
      if (sessionDepth === 0) failInvariant("scanning requires a live session");
      if (transition !== null)
        failInvariant("scanning cannot retain transition data");
      if (suspendedDwellRemaining !== null)
        failInvariant("scanning cannot retain a suspended dwell");
      break;
    case "transitioning":
      if (sessionDepth === 0)
        failInvariant("transitioning requires a live session");
      if (transition === null)
        failInvariant("transitioning requires transition data");
      if (transitionPending === null)
        failInvariant("transitioning requires a scheduled deadline");
      if (hasPresentation)
        failInvariant("transitioning cannot expose presentation");
      if (methodPending !== null)
        failInvariant("transitioning cannot retain method timing");
      break;
    case "paused":
      if (sessionDepth === 0) failInvariant("paused requires a live session");
      if (methodPending !== null)
        failInvariant("paused cannot retain method timing");
      if (transition) {
        if (transitionPending !== null)
          failInvariant(
            "a paused transition cannot retain a scheduled deadline",
          );
        if (hasPresentation)
          failInvariant("a paused transition cannot expose presentation");
      }
      break;
  }
}
