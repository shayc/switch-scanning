import type { GroupExit } from "./types.ts";
import type { ScanGroupNode, ScanNode } from "./types.ts";

/** A single position a highlight can occupy inside a scope. */
export type Candidate =
  | { readonly kind: "group"; readonly id: string }
  | { readonly kind: "target"; readonly id: string }
  | { readonly kind: "exit"; readonly groupId: string };

/** One level of the traversal stack. */
export interface ScopeFrame {
  readonly groupId: string | "root";
  candidates: readonly Candidate[];
  index: number;
  pass: number;
}

export interface CompiledTree {
  readonly root: ScanGroupNode;
  readonly byId: ReadonlyMap<string, ScanNode>;
  readonly parentOf: ReadonlyMap<string, string | "root">;
}

const ROOT: "root" = "root";

export function compileTree(root: ScanGroupNode): CompiledTree {
  const byId = new Map<string, ScanNode>();
  const parentOf = new Map<string, string | "root">();

  const walk = (node: ScanNode, parentId: string | "root"): void => {
    byId.set(node.id, node);
    parentOf.set(node.id, parentId);
    if (node.kind === "group") {
      for (const child of node.children) walk(child, node.id);
    }
  };
  for (const child of root.children) walk(child, ROOT);

  return { root, byId, parentOf };
}

function isEligible(node: ScanNode): boolean {
  if (node.disabled === true) return false;
  if (node.kind === "target") return true;
  // A group is eligible only when it contains reachable content.
  return node.children.some(isEligible);
}

/**
 * Build the ordered candidate sequence for a scope, filtering disabled and
 * empty content and inserting the virtual exit at the configured position.
 */
export function buildCandidates(
  group: ScanGroupNode,
  isRoot: boolean,
  groupExit: GroupExit,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const child of group.children) {
    if (!isEligible(child)) continue;
    candidates.push(
      child.kind === "target"
        ? { kind: "target", id: child.id }
        : { kind: "group", id: child.id },
    );
  }

  if (!isRoot && groupExit !== "none") {
    const exit: Candidate = { kind: "exit", groupId: group.id };
    if (groupExit === "before") candidates.unshift(exit);
    else candidates.push(exit);
  }

  return candidates;
}

export function candidateEquals(a: Candidate, b: Candidate): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "exit" && b.kind === "exit") return a.groupId === b.groupId;
  return "id" in a && "id" in b && a.id === b.id;
}

export function exitLabelFor(group: ScanGroupNode): string {
  return group.exitLabel ?? `Back from ${group.label}`;
}
