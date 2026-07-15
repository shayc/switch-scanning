import type { ScanGroupNode, ScanNode } from "../types.ts";

/** A scan tree with every node indexed by id for O(1) lookup. */
export interface CompiledTree {
  readonly root: ScanGroupNode;
  /** Every node in {@link root}, keyed by {@link ScanNode.id}. */
  readonly byId: ReadonlyMap<string, ScanNode>;
}

/** Thrown by {@link compileTree} when two nodes share an id. */
export class DuplicateScanNodeIdError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`duplicate scan node id "${id}"`);
    this.name = "DuplicateScanNodeIdError";
    this.id = id;
  }
}

/** Index a scan tree by id, rejecting duplicate ids. */
export function compileTree(root: ScanGroupNode): CompiledTree {
  const byId = new Map<string, ScanNode>();

  const walk = (node: ScanNode): void => {
    if (byId.has(node.id)) throw new DuplicateScanNodeIdError(node.id);
    byId.set(node.id, node);
    if (node.kind === "group") {
      for (const child of node.children) walk(child);
    }
  };
  walk(root);

  return { root, byId };
}

/** The label for a group's exit affordance, defaulting to `Back from <label>`. */
export function exitLabelFor(group: ScanGroupNode): string {
  return group.exitLabel ?? `Back from ${group.label}`;
}
