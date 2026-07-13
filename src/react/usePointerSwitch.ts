import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type Ref,
  type RefCallback,
} from "react";
import type { Scanner } from "../core/index.ts";
import { useRegistrationRef } from "./refs.ts";

export interface UsePointerSwitchOptions {
  /** Declared logical switch operated by this dedicated surface. */
  switchId: string;
  enabled?: boolean;
  ref?: Ref<HTMLElement>;
}

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
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const reactId = useId();
  const sourceId = `pointer:${reactId}`;
  const activePointers = useRef(new Set<number>());
  const pressedSwitch = useRef<string | null>(null);

  const disconnectAll = useCallback((): void => {
    if (activePointers.current.size > 0 || pressedSwitch.current !== null) {
      scanner.input.disconnect(sourceId);
    }
    activePointers.current.clear();
    pressedSwitch.current = null;
  }, [scanner, sourceId]);

  const register = useCallback(
    (element: HTMLElement) => {
      const ownerDocument = element.ownerDocument;
      const ownerWindow = ownerDocument.defaultView;
      const accepts = (event: PointerEvent): boolean => {
        const pointerType = event.pointerType || "mouse";
        return pointerType !== "mouse" || event.button === 0;
      };

      const onPointerDown = (event: PointerEvent): void => {
        if (
          !optionsRef.current.enabled &&
          optionsRef.current.enabled !== undefined
        )
          return;
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
        // Real/generated pointer clicks have detail > 0. Keyboard and
        // programmatic `element.click()` activations have detail === 0.
        if (event.detail <= 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      const onVisibility = (): void => {
        if (ownerDocument.visibilityState === "hidden") disconnectAll();
      };

      element.addEventListener("pointerdown", onPointerDown);
      element.addEventListener("pointerup", onPointerUp);
      element.addEventListener("pointercancel", onPointerCancel);
      element.addEventListener("lostpointercapture", onLostCapture);
      element.addEventListener("click", onClick, true);
      ownerWindow?.addEventListener("blur", disconnectAll);
      ownerDocument.addEventListener("visibilitychange", onVisibility);

      return () => {
        element.removeEventListener("pointerdown", onPointerDown);
        element.removeEventListener("pointerup", onPointerUp);
        element.removeEventListener("pointercancel", onPointerCancel);
        element.removeEventListener("lostpointercapture", onLostCapture);
        element.removeEventListener("click", onClick, true);
        ownerWindow?.removeEventListener("blur", disconnectAll);
        ownerDocument.removeEventListener("visibilitychange", onVisibility);
        disconnectAll();
      };
    },
    [disconnectAll, scanner, sourceId],
  );

  useEffect(() => {
    if (options.enabled === false) disconnectAll();
  }, [options.enabled, options.switchId, disconnectAll]);

  const ref = useRegistrationRef(register, options.ref);
  return { props: { ref, "data-scan-pointer-switch": "" } };
}
