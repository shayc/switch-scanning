import { useId, type Ref, type RefCallback } from "react";
import type { Detach } from "../../core/index.ts";
import type { ScanRegistry, ScanTargetOptions } from "../registry.ts";
import { useScanNode } from "./useScanNode.ts";

/** Options for {@link useScanTarget}; omit `id` to use a stable React-generated identity. */
export interface UseScanTargetOptions extends Omit<ScanTargetOptions, "id"> {
  id?: string;
  ref?: Ref<HTMLElement>;
}

/** Props spread directly onto an existing scan target element. */
export interface ScanTargetProps {
  ref: RefCallback<HTMLElement>;
  "data-scan-target": "";
}

/**
 * Mark an element the application already owns as a scan target. Inserts no
 * wrapper and changes no layout. The returned props carry a composed callback
 * ref and a static registration attribute; ordinary DOM controls need no
 * `activate` because selection invokes their native action path.
 */
export function useScanTarget(options: UseScanTargetOptions): ScanTargetProps {
  const generatedId = useId();
  const resolved: ScanTargetOptions & { ref?: Ref<HTMLElement> } = {
    ...options,
    id: options.id ?? `target:${generatedId}`,
  };
  const ref = useScanNode("useScanTarget", resolved, mountTarget, touchTarget);
  return { ref, "data-scan-target": "" };
}

function mountTarget(
  registry: ScanRegistry,
  id: string,
  getOptions: () => ScanTargetOptions,
  element: HTMLElement,
): Detach {
  return registry.mountTarget(id, getOptions, element);
}

function touchTarget(registry: ScanRegistry): void {
  registry.touchTarget();
}
