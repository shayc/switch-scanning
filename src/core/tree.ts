import type { ScanGroupNode, ScanNode } from "./types.ts";

export interface CompiledTree {
  readonly root: ScanGroupNode;
  readonly byId: ReadonlyMap<string, ScanNode>;
  readonly parentOf: ReadonlyMap<string, string | null>;
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
  const parentOf = new Map<string, string | null>();

  const walk = (node: ScanNode, parentId: string | null): void => {
    if (byId.has(node.id)) throw new DuplicateScanNodeIdError(node.id);
    byId.set(node.id, node);
    parentOf.set(node.id, parentId);
    if (node.kind === "group") {
      for (const child of node.children) walk(child, node.id);
    }
  };
  for (const child of root.children) walk(child, null);

  return { root, byId, parentOf };
}

export function exitLabelFor(group: ScanGroupNode): string {
  return group.exitLabel ?? `Back from ${group.label}`;
}
