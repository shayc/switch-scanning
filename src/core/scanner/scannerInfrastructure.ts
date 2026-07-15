import type { Clock, Scheduler } from "../shared/clock.ts";
import { systemClock } from "../shared/clock.ts";
import type { ScannerOptions } from "../types.ts";

let sharedInfrastructure: (Clock & Scheduler) | null = null;

function defaultInfrastructure(): Clock & Scheduler {
  sharedInfrastructure ??= systemClock();
  return sharedInfrastructure;
}

/**
 * Resolves the clock/scheduler pair: both default together, a custom scheduler
 * requires a paired clock, and a lone clock must itself implement Scheduler.
 */
export function resolveInfrastructure(options: ScannerOptions): {
  clock: Clock;
  scheduler: Scheduler;
} {
  const { clock, scheduler } = options;
  if (clock === undefined && scheduler === undefined) {
    const infrastructure = defaultInfrastructure();
    return { clock: infrastructure, scheduler: infrastructure };
  }
  if (clock === undefined) {
    throw new TypeError(
      "[switch-scanning] a custom scheduler requires a paired clock",
    );
  }
  if (scheduler !== undefined) return { clock, scheduler };
  if (isScheduler(clock)) return { clock, scheduler: clock };
  throw new TypeError(
    "[switch-scanning] a custom clock must implement Scheduler or provide scheduler",
  );
}

function isScheduler(clock: Clock): clock is Clock & Scheduler {
  return "schedule" in clock && typeof clock.schedule === "function";
}
