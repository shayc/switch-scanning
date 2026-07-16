import { useId, type Ref, type RefCallback } from "react";
import type { Detach } from "../../core/index.ts";
import type { ScanGroupOptions, ScanRegistry } from "../registry.ts";
import { useScanNode } from "./useScanNode.ts";

/** Options for {@link useScanGroup}; omit `id` to use a stable React-generated identity. */
export interface UseScanGroupOptions extends Omit<ScanGroupOptions, "id"> {
  id?: string;
  ref?: Ref<HTMLElement>;
}

/** Props spread directly onto an existing scan group element. */
export interface ScanGroupProps {
  ref: RefCallback<HTMLElement>;
  "data-scan-group": "";
}

/**
 * Mark an element the application already owns as a scan group. Inserts no
 * wrapper and changes no layout. The nearest containing registered group is the
 * default parent; use `parentId` for portals or non-contained composition. An
 * explicit `sequence` sets deliberate scan order.
 */
export function useScanGroup(options: UseScanGroupOptions): ScanGroupProps {
  const generatedId = useId();
  const resolved: ScanGroupOptions & { ref?: Ref<HTMLElement> } = {
    ...options,
    id: options.id ?? `group:${generatedId}`,
  };
  const ref = useScanNode("useScanGroup", resolved, mountGroup, touchGroup);
  return { ref, "data-scan-group": "" };
}

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
