/**
 * Scanner logic depends on these time ports, allowing tests to drive time by
 * hand while production uses the real-time `systemClock` adapter.
 */

/** A monotonic time source. */
export interface Clock {
  /** Monotonic milliseconds. Only differences are meaningful. */
  now(): number;
}

/** Cancels a previously scheduled callback. Safe to call more than once. */
export type CancelScheduled = () => void;

/** Schedules callbacks against a {@link Clock}'s time base. */
export interface Scheduler {
  /**
   * Invoke `callback` after `delayMs` measured on the same time base as the
   * paired {@link Clock}. Implementations must fire callbacks in deadline
   * order, breaking ties by insertion order.
   */
  schedule(delayMs: number, callback: () => void): CancelScheduled;
}

/** A clock and scheduler backed by real timers. */
export function systemClock(): Clock & Scheduler {
  return {
    now: () => performanceNow(),
    schedule(delayMs, callback) {
      const handle = setTimeout(callback, delayMs);
      return () => clearTimeout(handle);
    },
  };
}

function performanceNow(): number {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  // Fall back to Date for environments without `performance`.
  return Date.now();
}

interface ScheduledEntry {
  readonly deadline: number;
  readonly seq: number;
  callback: (() => void) | null;
}

/** A {@link Clock} and {@link Scheduler} whose virtual time is advanced by hand. */
export interface ManualClock extends Clock, Scheduler {
  /** Advance virtual time by `ms`, firing every callback that comes due. */
  advanceBy(ms: number): void;
  /** Advance virtual time to an absolute value, firing due callbacks. */
  advanceTo(time: number): void;
  /**
   * Advance through the latest deadline pending when called. Callbacks that
   * schedule work beyond that horizon remain pending.
   */
  flush(): void;
  /** Number of callbacks still scheduled. */
  readonly pending: number;
}

/**
 * A fully deterministic clock + scheduler for tests and offline simulation.
 * Callbacks fire in `(deadline, insertion-order)` order, matching the ordering
 * the runtime relies on for exact-timestamp behavior.
 */
export function manualClock(startAt = 0): ManualClock {
  assertFiniteNonNegative(startAt, "initial time");
  let current = startAt;
  let seq = 0;
  let entries: ScheduledEntry[] = [];

  function drainUntil(time: number): void {
    // Repeatedly pull the earliest due entry so that callbacks scheduled by
    // other callbacks are also honored within the same advance.
    for (;;) {
      let nextIndex = -1;
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (entry === undefined || entry.callback === null) continue;
        if (entry.deadline > time) continue;
        const best = nextIndex === -1 ? undefined : entries[nextIndex];
        if (
          best === undefined ||
          entry.deadline < best.deadline ||
          (entry.deadline === best.deadline && entry.seq < best.seq)
        ) {
          nextIndex = i;
        }
      }
      if (nextIndex === -1) break;
      const entry = entries[nextIndex]!;
      entries.splice(nextIndex, 1);
      current = entry.deadline;
      entry.callback?.();
    }
    current = time;
    entries = entries.filter((entry) => entry.callback !== null);
  }

  return {
    now: () => current,
    schedule(delayMs, callback) {
      assertFiniteNonNegative(delayMs, "scheduled delay");
      const entry: ScheduledEntry = {
        deadline: current + delayMs,
        seq: seq++,
        callback,
      };
      entries.push(entry);
      return () => {
        entry.callback = null;
      };
    },
    advanceBy(ms) {
      assertFiniteNonNegative(ms, "advanceBy(ms)");
      drainUntil(current + ms);
    },
    advanceTo(time) {
      assertFiniteNonNegative(time, "advanceTo(time)");
      if (time < current) {
        throw new Error("manualClock cannot advance backwards");
      }
      drainUntil(time);
    },
    flush() {
      // Fire everything by pushing the deadline to the furthest pending entry.
      const maxDeadline = entries.reduce(
        (max, entry) =>
          entry.callback !== null ? Math.max(max, entry.deadline) : max,
        current,
      );
      drainUntil(maxDeadline);
    },
    get pending() {
      return entries.filter((entry) => entry.callback !== null).length;
    },
  };
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `[switch-scanning] manualClock ${name} must be a finite number >= 0 (received ${String(value)})`,
    );
  }
}
