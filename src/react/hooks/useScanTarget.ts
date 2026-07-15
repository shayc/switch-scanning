import type { Ref, RefCallback } from "react";
import type { Detach } from "../../core/index.ts";
import type { ScanRegistry, ScanTargetOptions } from "../registry.ts";
import { useScanNode } from "./useScanNode.ts";

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
  const ref = useScanNode("useScanTarget", options, mountTarget, touchTarget);
  return { props: { ref, "data-scan-target": "" } };
}
