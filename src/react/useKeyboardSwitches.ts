import { useEffect, useRef } from "react";
import type { Scanner } from "../core/index.ts";

/** Map from `KeyboardEvent.code` to a declared logical switch ID. */
export type KeyboardSwitchBindings = Readonly<Record<string, string>>;

export interface KeyboardSwitchesOptions {
  /** When false, listeners are attached but ignore events. Defaults to true. */
  enabled?: boolean;
  /** Element/document to listen on. Defaults to the global document. */
  target?: Document | HTMLElement | null;
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

  const explicitTarget = options.target;

  useEffect(() => {
    const target: Document | HTMLElement =
      explicitTarget ?? (typeof document !== "undefined" ? document : null!);
    if (!target) return;

    const held = new Set<string>();
    const sourceId = (code: string): string => `key:${code}`;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!enabledRef.current || event.repeat) return;
      const switchId = bindingsRef.current[event.code];
      if (switchId === undefined) return;
      event.preventDefault();
      if (held.has(event.code)) return;
      held.add(event.code);
      scanner.input.press(switchId, sourceId(event.code));
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      const switchId = bindingsRef.current[event.code];
      if (switchId === undefined) return;
      if (enabledRef.current) event.preventDefault();
      if (!held.delete(event.code)) return;
      scanner.input.release(switchId, sourceId(event.code));
    };

    const disconnectAll = (): void => {
      for (const code of held) scanner.input.disconnect(sourceId(code));
      held.clear();
    };

    const onVisibility = (): void => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        disconnectAll();
      }
    };

    target.addEventListener("keydown", onKeyDown as EventListener);
    target.addEventListener("keyup", onKeyUp as EventListener);
    if (typeof window !== "undefined") window.addEventListener("blur", disconnectAll);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      target.removeEventListener("keydown", onKeyDown as EventListener);
      target.removeEventListener("keyup", onKeyUp as EventListener);
      if (typeof window !== "undefined") window.removeEventListener("blur", disconnectAll);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      disconnectAll();
    };
  }, [scanner, explicitTarget]);
}
