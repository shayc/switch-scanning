import { useEffect, useRef } from "react";
import type { Scanner } from "../core/index.ts";

/** Map from `KeyboardEvent.code` to a declared logical switch ID. */
export type KeyboardSwitchBindings = Readonly<Record<string, string>>;

export interface KeyboardSwitchesOptions {
  /** When false, listeners are attached but ignore events. Defaults to true. */
  enabled?: boolean;
  /** Element/document to listen on. Defaults to the global document. */
  target?: Document | HTMLElement | null;
  /** Explicit ownership policy for mapped keydown events. */
  shouldHandle?: (event: KeyboardEvent) => boolean;
}

/**
 * Operate declared logical switches from the keyboard. Uses `KeyboardEvent.code`,
 * ignores browser auto-repeat, and lets the deterministic scheduler implement
 * move repeat. Blur, visibility loss, and unmount disconnect their stable source
 * IDs so a lost key-up cannot leave a switch stuck down.
 */
export function useKeyboardSwitches(
  scanner: Scanner,
  bindings: KeyboardSwitchBindings,
  options: KeyboardSwitchesOptions = {},
): void {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const enabledRef = useRef(options.enabled ?? true);
  enabledRef.current = options.enabled ?? true;
  const shouldHandleRef = useRef(options.shouldHandle);
  shouldHandleRef.current = options.shouldHandle;

  const explicitTarget = options.target;

  useEffect(() => {
    const target: Document | HTMLElement =
      explicitTarget ?? (typeof document !== "undefined" ? document : null!);
    if (!target) return;

    // Remember the binding accepted on keydown. Bindings may change before
    // keyup, but the logical switch that opened the gesture must be released.
    const held = new Map<
      string,
      { accepted: true; switchId: string } | { accepted: false }
    >();
    const sourceId = (code: string): string => `key:${code}`;

    const onKeyDown = (event: KeyboardEvent): void => {
      const switchId = bindingsRef.current[event.code];
      if (switchId === undefined) return;
      const existing = held.get(event.code);
      if (existing) {
        if (existing.accepted) event.preventDefault();
        return;
      }
      if (!enabledRef.current || event.repeat) return;

      const accepted = shouldHandleRef.current?.(event) ?? true;
      if (!accepted) {
        held.set(event.code, { accepted: false });
        return;
      }

      event.preventDefault();
      held.set(event.code, { accepted: true, switchId });
      scanner.input.press(switchId, sourceId(event.code));
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      const decision = held.get(event.code);
      if (!decision) return;
      held.delete(event.code);
      if (!decision.accepted) return;
      event.preventDefault();
      scanner.input.release(decision.switchId, sourceId(event.code));
    };

    const disconnectAll = (): void => {
      for (const [code, decision] of held) {
        if (decision.accepted) scanner.input.disconnect(sourceId(code));
      }
      held.clear();
    };

    const onVisibility = (): void => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        disconnectAll();
      }
    };

    target.addEventListener("keydown", onKeyDown as EventListener);
    target.addEventListener("keyup", onKeyUp as EventListener);
    if (typeof window !== "undefined")
      window.addEventListener("blur", disconnectAll);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      target.removeEventListener("keydown", onKeyDown as EventListener);
      target.removeEventListener("keyup", onKeyUp as EventListener);
      if (typeof window !== "undefined")
        window.removeEventListener("blur", disconnectAll);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      disconnectAll();
    };
  }, [scanner, explicitTarget]);
}
