import { isDevelopment } from "./env.ts";

/** Format a diagnostic as a library-tagged, code-prefixed message string. */
export function formatDiagnostic(code: string, message: string): string {
  return `[switch-scanning] (${code}) ${message}`;
}

/** Create a development-only warning sink deduplicated by code and message. */
export function createDiagnosticWarner(): (
  code: string,
  message: string,
) => void {
  const warned = new Set<string>();
  return (code, message) => {
    if (!isDevelopment() || typeof console === "undefined") return;
    const key = `${code}\0${message}`;
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(formatDiagnostic(code, message));
  };
}
