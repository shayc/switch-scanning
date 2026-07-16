import { useCallback, useEffect, type Ref, type RefCallback } from "react";
import type { Detach } from "../../core/index.ts";
import { useScannerContext } from "../context.ts";
import type { ScanRegistry } from "../registry.ts";
import { useCommittedRef, useRegistrationRef } from "./refs.ts";

/**
 * Shared registration lifecycle behind {@link useScanTarget} and
 * {@link useScanGroup}: mount the element under a stable id, keep the latest
 * options available to the imperative registration, and mark the registry
 * dirty on every render so option changes are reconciled. Returns the composed
 * callback ref; each caller supplies its own typed props wrapper.
 */
export function useScanNode<O extends { id: string; ref?: Ref<HTMLElement> }>(
  hookName: string,
  options: O,
  mount: (
    registry: ScanRegistry,
    id: string,
    getOptions: () => O,
    element: HTMLElement,
  ) => Detach,
  touch: (registry: ScanRegistry) => void,
): RefCallback<HTMLElement> {
  const { registry } = useScannerContext(hookName);
  const { id } = options;

  const optionsRef = useCommittedRef(options);

  const register = useCallback(
    (element: HTMLElement) =>
      mount(registry, id, () => optionsRef.current, element),
    [registry, id, optionsRef, mount],
  );
  const ref = useRegistrationRef(register, options.ref);

  useEffect(() => {
    touch(registry);
  });

  return ref;
}
