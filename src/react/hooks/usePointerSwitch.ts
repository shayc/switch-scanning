import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type Ref,
  type RefCallback,
} from "react";
import type { Scanner } from "../../core/index.ts";
import { useCommittedRef, useRegistrationRef } from "./refs.ts";

/** Options for {@link usePointerSwitch}. */
export interface UsePointerSwitchOptions {
  /** Declared logical switch operated by this dedicated surface. */
  switchId: string;
  enabled?: boolean;
  ref?: Ref<HTMLElement>;
}

/** Props to spread onto the pointer-switch element. */
export interface PointerSwitchBinding {
  props: {
    ref: RefCallback<HTMLElement>;
    "data-scan-pointer-switch": "";
  };
}

/**
 * Turn one dedicated element into a coalesced touch/pen/primary-mouse switch.
 * The surface owns its pointer input and should be styled with
 * `touch-action: none`; it is intentionally unsuitable for direct touch use.
 */
export function usePointerSwitch(
  scanner: Scanner,
  options: UsePointerSwitchOptions,
): PointerSwitchBinding {
  const optionsRef = useCommittedRef(options);
  const reactId = useId();
  const sourceId = `pointer:${reactId}`;
  const keyboardSourceId = `keyboard:${reactId}`;
  const activePointers = useRef(new Set<number>());
  const pressedSwitch = useRef<string | null>(null);
  const pressedKey = useRef<{ code: string; switchId: string } | null>(null);

  const disconnectAll = useCallback((): void => {
    if (activePointers.current.size > 0 || pressedSwitch.current !== null) {
      scanner.input.disconnect(sourceId);
    }
    if (pressedKey.current !== null) {
      scanner.input.disconnect(keyboardSourceId);
    }
    activePointers.current.clear();
    pressedSwitch.current = null;
    pressedKey.current = null;
  }, [keyboardSourceId, scanner, sourceId]);

  // Blur / tab-hidden are environment suspensions: drop held contacts and
  // invalidate an armed dwell so it cannot fire when the user returns.
  const suspendEnvironment = useCallback((): void => {
    disconnectAll();
    scanner.input.suspend();
  }, [disconnectAll, scanner]);

  const register = useCallback(
    (element: HTMLElement) => {
      const ownerDocument = element.ownerDocument;
      const ownerWindow = ownerDocument.defaultView;
      const accepts = (event: PointerEvent): boolean => {
        const pointerType = event.pointerType || "mouse";
        return pointerType !== "mouse" || event.button === 0;
      };

      const onPointerDown = (event: PointerEvent): void => {
        if (optionsRef.current.enabled === false) return;
        if (!accepts(event) || activePointers.current.has(event.pointerId))
          return;
        event.preventDefault();
        activePointers.current.add(event.pointerId);
        try {
          element.setPointerCapture(event.pointerId);
        } catch {
          // Capture is best-effort on older/partial browser implementations.
        }
        if (activePointers.current.size === 1) {
          pressedSwitch.current = optionsRef.current.switchId;
          scanner.input.press(optionsRef.current.switchId, sourceId);
        }
      };

      const finishPointer = (event: PointerEvent, cancelled: boolean): void => {
        if (!activePointers.current.delete(event.pointerId)) return;
        event.preventDefault();
        if (!cancelled) {
          try {
            element.releasePointerCapture(event.pointerId);
          } catch {
            // The browser may already have released capture.
          }
        }
        if (activePointers.current.size !== 0) return;
        const switchId = pressedSwitch.current;
        pressedSwitch.current = null;
        if (cancelled) scanner.input.disconnect(sourceId);
        else if (switchId) scanner.input.release(switchId, sourceId);
      };

      const onPointerUp = (event: PointerEvent): void =>
        finishPointer(event, false);
      const onPointerCancel = (event: PointerEvent): void =>
        finishPointer(event, true);
      const onLostCapture = (event: PointerEvent): void => {
        if (activePointers.current.has(event.pointerId))
          finishPointer(event, true);
      };
      const onClick = (event: MouseEvent): void => {
        if (optionsRef.current.enabled === false) return;
        // Real/generated pointer clicks have detail > 0. Keyboard and
        // programmatic `element.click()` activations have detail === 0.
        if (event.detail <= 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      const isSwitchKey = (event: KeyboardEvent): boolean =>
        event.code === "Space" || event.code === "Enter";
      const onKeyDown = (event: KeyboardEvent): void => {
        if (optionsRef.current.enabled === false || !isSwitchKey(event)) return;
        // Do not claim modifier chords (Cmd/Ctrl/Alt + key) so this surface's
        // bare Space/Enter fallback cannot swallow OS/browser shortcuts.
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        if (event.repeat || pressedKey.current !== null) return;
        const switchId = optionsRef.current.switchId;
        pressedKey.current = { code: event.code, switchId };
        scanner.input.press(switchId, keyboardSourceId);
      };
      const onKeyUp = (event: KeyboardEvent): void => {
        const pressed = pressedKey.current;
        if (!pressed || event.code !== pressed.code) return;
        event.preventDefault();
        pressedKey.current = null;
        scanner.input.release(pressed.switchId, keyboardSourceId);
      };
      const onVisibility = (): void => {
        if (ownerDocument.visibilityState === "hidden") suspendEnvironment();
      };

      element.addEventListener("pointerdown", onPointerDown);
      element.addEventListener("pointerup", onPointerUp);
      element.addEventListener("pointercancel", onPointerCancel);
      element.addEventListener("lostpointercapture", onLostCapture);
      element.addEventListener("click", onClick, true);
      element.addEventListener("keydown", onKeyDown);
      element.addEventListener("keyup", onKeyUp);
      ownerWindow?.addEventListener("blur", suspendEnvironment);
      ownerDocument.addEventListener("visibilitychange", onVisibility);

      return () => {
        element.removeEventListener("pointerdown", onPointerDown);
        element.removeEventListener("pointerup", onPointerUp);
        element.removeEventListener("pointercancel", onPointerCancel);
        element.removeEventListener("lostpointercapture", onLostCapture);
        element.removeEventListener("click", onClick, true);
        element.removeEventListener("keydown", onKeyDown);
        element.removeEventListener("keyup", onKeyUp);
        ownerWindow?.removeEventListener("blur", suspendEnvironment);
        ownerDocument.removeEventListener("visibilitychange", onVisibility);
        disconnectAll();
      };
    },
    [
      disconnectAll,
      suspendEnvironment,
      keyboardSourceId,
      scanner,
      sourceId,
      optionsRef,
    ],
  );

  useEffect(() => {
    if (options.enabled === false) disconnectAll();
  }, [options.enabled, options.switchId, disconnectAll]);

  const ref = useRegistrationRef(register, options.ref);
  return { props: { ref, "data-scan-pointer-switch": "" } };
}
