import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type Ref,
  type RefCallback,
} from "react";
import type { Detach } from "../../core/index.ts";

const useCommitEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Keep the latest committed value available to imperative callbacks. */
export function useCommittedRef<T>(value: T): { current: T } {
  const ref = useRef(value);
  useCommitEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function attachRef<T>(ref: Ref<T> | undefined, value: T): Detach {
  if (!ref) return () => undefined;
  if (typeof ref === "function") {
    const cleanup = ref(value);
    return typeof cleanup === "function" ? cleanup : () => ref(null);
  }
  (ref as { current: T | null }).current = value;
  return () => {
    (ref as { current: T | null }).current = null;
  };
}

/** Cross-version React 18/19 callback ref registration with explicit cleanup. */
export function useRegistrationRef<T extends HTMLElement>(
  register: (element: T) => Detach,
  forwardedRef?: Ref<T>,
): RefCallback<T> {
  const active = useRef<Detach | null>(null);

  return useCallback(
    (element: T | null): void => {
      active.current?.();
      active.current = null;
      if (element === null) return;

      const detachRegistration = register(element);
      const detachForwardedRef = attachRef(forwardedRef, element);
      let cleaned = false;
      active.current = () => {
        if (cleaned) return;
        cleaned = true;
        detachRegistration();
        detachForwardedRef();
      };
    },
    [register, forwardedRef],
  );
}
