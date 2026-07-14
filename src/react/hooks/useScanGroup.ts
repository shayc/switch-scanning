import { useCallback, useEffect, type Ref, type RefCallback } from "react";
import { useScannerContext } from "../context.ts";
import { useCommittedRef, useRegistrationRef } from "./refs.ts";
import type { ScanGroupOptions } from "../registry.ts";

/** Options for {@link useScanGroup}. */
export interface UseScanGroupOptions extends ScanGroupOptions {
  ref?: Ref<HTMLElement>;
}

/** Props to spread onto the group element. */
export interface ScanGroupBinding {
  props: {
    ref: RefCallback<HTMLElement>;
    "data-scan-group": "";
  };
}

/**
 * Mark an element the application already owns as a scan group. Inserts no
 * wrapper and changes no layout. The nearest containing registered group is the
 * default parent; use `parentId` for portals or non-contained composition. An
 * explicit `sequence` sets deliberate scan order.
 */
export function useScanGroup(options: UseScanGroupOptions): ScanGroupBinding {
  const { registry } = useScannerContext("useScanGroup");
  const { id } = options;

  const optionsRef = useCommittedRef(options);

  const register = useCallback(
    (element: HTMLElement) =>
      registry.mountGroup(id, () => optionsRef.current, element),
    [registry, id, optionsRef],
  );
  const ref: RefCallback<HTMLElement> = useRegistrationRef(
    register,
    options.ref,
  );

  useEffect(() => {
    registry.touchGroup();
  });

  return { props: { ref, "data-scan-group": "" } };
}
