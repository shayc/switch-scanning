import { formatDiagnostic } from "../core/shared/diagnostics.ts";
import { isDevelopment } from "../core/shared/env.ts";

/**
 * Development-only console warning tagged with a diagnostic code. Unlike
 * `createDiagnosticWarner`, repeats are not deduplicated — use it where a
 * condition can legitimately recur (e.g. effect-gated configuration warnings).
 */
export function warnDev(code: string, message: string): void {
  if (!isDevelopment() || typeof console === "undefined") return;
  console.warn(formatDiagnostic(code, message));
}
