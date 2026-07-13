import type { ScannerOptions } from "./types.ts";

/** @internal Stable equality key for every serializable scanner behavior field. */
export function scannerBehaviorSignature(options: ScannerOptions): string {
  const switches = options.switches
    ? Object.fromEntries(
        Object.entries(options.switches).sort(([a], [b]) => a.localeCompare(b)),
      )
    : null;

  return JSON.stringify({
    style: options.style,
    switches,
    startOn: options.startOn ?? null,
    afterActivation: options.afterActivation ?? null,
    groupExit: options.groupExit ?? null,
    enabled: options.enabled ?? null,
    selectionDelay: options.selectionDelay ?? null,
  });
}
