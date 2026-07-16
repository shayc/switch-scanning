import type { Detach } from "../../core/index.ts";

/**
 * Watch one document's environment-suspension edges — window blur and tab
 * hidden — and invoke `onSuspend` on each. Callers drop their held contacts
 * and call `scanner.input.suspend()` so a stale dwell cannot fire on return.
 */
export function observeEnvironmentSuspension(
  ownerDocument: Document,
  onSuspend: () => void,
): Detach {
  const ownerWindow = ownerDocument.defaultView;
  const onVisibility = (): void => {
    if (ownerDocument.visibilityState === "hidden") onSuspend();
  };
  ownerWindow?.addEventListener("blur", onSuspend);
  ownerDocument.addEventListener("visibilitychange", onVisibility);
  return () => {
    ownerWindow?.removeEventListener("blur", onSuspend);
    ownerDocument.removeEventListener("visibilitychange", onVisibility);
  };
}
