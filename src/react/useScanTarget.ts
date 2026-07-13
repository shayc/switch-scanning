import {
  useCallback,
  useEffect,
  useRef,
  type Ref,
  type RefCallback,
} from "react";
import { useScannerContext } from "./context.ts";
import { applyRef } from "./refs.ts";
import type { ScanTargetOptions } from "./registry.ts";

export interface UseScanTargetOptions extends ScanTargetOptions {
  ref?: Ref<HTMLElement>;
}

export interface ScanTargetBinding {
  props: {
    ref: RefCallback<HTMLElement>;
    "data-scan-target": "";
  };
}

/**
 * Mark an element the application already owns as a scan target. Inserts no
 * wrapper and changes no layout. The returned `props` carry a composed callback
 * ref and a static registration attribute; ordinary DOM controls need no
 * `activate` because selection invokes their native action path.
 */
export function useScanTarget(
  options: UseScanTargetOptions,
): ScanTargetBinding {
  const { registry } = useScannerContext("useScanTarget");
  const { id } = options;

  const optionsRef = useRef<UseScanTargetOptions>(options);
  optionsRef.current = options;

  const ref = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      const forwardedRef = options.ref;
      const unregister = registry.mountTarget(
        id,
        () => optionsRef.current,
        element,
      );
      applyRef(forwardedRef, element);
      return () => {
        unregister();
        applyRef(forwardedRef, null);
      };
    },
    [registry, id, options.ref],
  );

  // Republish when a structural field changes; freshness of `activate` and
  // `metadata` does not require a new registration.
  useEffect(() => {
    registry.touchTarget();
  }, [registry, id, options.label, options.disabled, options.groupId]);

  return { props: { ref, "data-scan-target": "" } };
}
