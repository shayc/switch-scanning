import {
  useCallback,
  useEffect,
  useRef,
  type Ref,
  type RefCallback,
} from "react";
import { useScannerContext } from "../context.ts";
import { useRegistrationRef } from "./refs.ts";
import type { ScanGroupOptions } from "../registry.ts";

export interface UseScanGroupOptions extends ScanGroupOptions {
  ref?: Ref<HTMLElement>;
}

export interface ScanGroupBinding {
  props: {
    ref: RefCallback<HTMLElement>;
    "data-scan-group": "";
  };
}

/**
 * Decorate an element the application already owns as a scan group. Inserts no
 * element and changes no layout. The nearest containing registered group is the
 * default parent; use `parentId` for portals or non-contained composition. An
 * explicit `sequence` sets deliberate scan order.
 */
export function useScanGroup(options: UseScanGroupOptions): ScanGroupBinding {
  const { registry } = useScannerContext("useScanGroup");
  const { id } = options;

  const optionsRef = useRef<UseScanGroupOptions>(options);
  optionsRef.current = options;

  const register = useCallback(
    (element: HTMLElement) =>
      registry.mountGroup(id, () => optionsRef.current, element),
    [registry, id],
  );
  const ref: RefCallback<HTMLElement> = useRegistrationRef(
    register,
    options.ref,
  );

  const sequenceKey = options.sequence ? options.sequence.join("\0") : "";
  useEffect(() => {
    registry.touchGroup();
  }, [
    registry,
    id,
    options.label,
    options.exitLabel,
    options.disabled,
    options.parentId,
    sequenceKey,
  ]);

  return { props: { ref, "data-scan-group": "" } };
}
