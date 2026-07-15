import type { Ref, RefCallback } from "react";
import type { Detach } from "../../core/index.ts";
import type { ScanGroupOptions, ScanRegistry } from "../registry.ts";
import { useScanNode } from "./useScanNode.ts";

function mountGroup(
  registry: ScanRegistry,
  id: string,
  getOptions: () => ScanGroupOptions,
  element: HTMLElement,
): Detach {
  return registry.mountGroup(id, getOptions, element);
}

function touchGroup(registry: ScanRegistry): void {
  registry.touchGroup();
}

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
  const ref = useScanNode("useScanGroup", options, mountGroup, touchGroup);
  return { props: { ref, "data-scan-group": "" } };
}
