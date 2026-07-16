import type { ScannerBehaviorOptions, ScannerOptions } from "../types.ts";

/** @internal Remove creation-only timing infrastructure before an update. */
export function toScannerBehaviorOptions(
  options: ScannerOptions,
): ScannerBehaviorOptions {
  const { clock, scheduler, ...behavior } = options;
  void clock;
  void scheduler;
  return behavior;
}

/** @internal Stable equality key for every serializable scanner behavior field. */
export function scannerBehaviorSignature(
  options: ScannerBehaviorOptions,
): string {
  const switches = options.switches
    ? Object.fromEntries(
        Object.entries(options.switches).sort(([a], [b]) => a.localeCompare(b)),
      )
    : null;

  return JSON.stringify({
    method: options.method,
    switches,
    startOn: options.startOn ?? null,
    afterActivation: options.afterActivation ?? null,
    groupExit: options.groupExit ?? null,
    enabled: options.enabled ?? null,
    selectionDelay: options.selectionDelay ?? null,
  });
}
