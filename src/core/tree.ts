import type { ScanGroupNode, ScanNode } from "./types.ts";

export interface CompiledTree {
  readonly root: ScanGroupNode;
  readonly byId: ReadonlyMap<string, ScanNode>;
}

export class DuplicateScanNodeIdError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`duplicate scan node id "${id}"`);
    this.name = "DuplicateScanNodeIdError";
    this.id = id;
  }
}

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

export function exitLabelFor(group: ScanGroupNode): string {
  return group.exitLabel ?? `Back from ${group.label}`;
}
