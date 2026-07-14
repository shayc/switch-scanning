import { useCallback, useEffect, type Ref, type RefCallback } from "react";
import { useScannerContext } from "../context.ts";
import { useCommittedRef, useRegistrationRef } from "./refs.ts";
import type { ScanTargetOptions } from "../registry.ts";

/** Options for {@link useScanTarget}. */
export interface UseScanTargetOptions extends ScanTargetOptions {
  ref?: Ref<HTMLElement>;
}

/** Props to spread onto the target element. */
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

  const optionsRef = useCommittedRef(options);

  const register = useCallback(
    (element: HTMLElement) =>
      registry.mountTarget(id, () => optionsRef.current, element),
    [registry, id, optionsRef],
  );
  const ref: RefCallback<HTMLElement> = useRegistrationRef(
    register,
    options.ref,
  );

  useEffect(() => {
    registry.touchTarget();
  });

  return { props: { ref, "data-scan-target": "" } };
}
