import type { ScanGroupNode, ScanNode, ScanTargetNode } from "../core/index.ts";
import { isDevelopment } from "./env.ts";
import type { ScanGroupOptions, ScanTargetOptions } from "./registry.ts";

export interface RegistryTargetEntry {
  readonly id: string;
  getOptions: () => ScanTargetOptions;
  element: HTMLElement | null;
}

export interface RegistryGroupEntry {
  readonly id: string;
  getOptions: () => ScanGroupOptions;
  element: HTMLElement | null;
}

interface RegistryTreeDiagnostics {
  reportParentCycle(cycle: readonly string[]): void;
  warn(code: string, message: string): void;
}

const ROOT_PARENT = Symbol("scan-registry-root");
export const SYNTHETIC_ROOT_ID = "__root__";
type ParentId = string | typeof ROOT_PARENT;

/** Compile live DOM registrations into the framework-agnostic scan tree. */
export function compileRegistryTree(
  targets: ReadonlyMap<string, RegistryTargetEntry>,
  groups: ReadonlyMap<string, RegistryGroupEntry>,
  groupElements: ReadonlyMap<HTMLElement, string>,
  diagnostics: RegistryTreeDiagnostics,
): ScanGroupNode {
  const childrenOf = new Map<ParentId, string[]>();
  const groupParents = new Map<string, ParentId>();

  const pushChild = (parent: ParentId, id: string): void => {
    const list = childrenOf.get(parent);
    if (list) list.push(id);
    else childrenOf.set(parent, [id]);
  };

  const domParent = (element: HTMLElement | null, selfId: string): ParentId => {
    let cursor = element?.parentElement ?? null;
    while (cursor) {
      const groupId = groupElements.get(cursor);
      if (groupId !== undefined && groupId !== selfId) return groupId;
      cursor = cursor.parentElement;
    }
    return ROOT_PARENT;
  };

  const resolveTargetParent = (entry: RegistryTargetEntry): ParentId => {
    const explicit = entry.getOptions().groupId;
    if (explicit !== undefined) {
      if (groups.has(explicit)) return explicit;
      if (isDevelopment()) {
        diagnostics.warn(
          "missing-parent",
          `target "${entry.id}" references unknown group "${explicit}"; keeping it at the root`,
        );
      }
      return ROOT_PARENT;
    }
    return domParent(entry.element, entry.id);
  };

  const resolveGroupParent = (entry: RegistryGroupEntry): ParentId => {
    const explicit = entry.getOptions().parentId;
    if (explicit !== undefined) {
      if (groups.has(explicit)) return explicit;
      if (isDevelopment()) {
        diagnostics.warn(
          "missing-parent",
          `group "${entry.id}" references unknown parent "${explicit}"; keeping it at the root`,
        );
      }
      return ROOT_PARENT;
    }
    return domParent(entry.element, entry.id);
  };

  for (const entry of targets.values())
    pushChild(resolveTargetParent(entry), entry.id);
  for (const entry of groups.values())
    groupParents.set(entry.id, resolveGroupParent(entry));
  repairParentCycles(groupParents, diagnostics);
  for (const [id, parentId] of groupParents) pushChild(parentId, id);

  const elementOf = (id: string): HTMLElement | null =>
    targets.get(id)?.element ?? groups.get(id)?.element ?? null;

  const domOrder = (parentId: ParentId, ids: readonly string[]): string[] => {
    const elements = ids.map(elementOf);
    const firstElement = elements[0];
    const useFallback = elements.some(
      (element) =>
        !element?.isConnected ||
        (!!firstElement &&
          !!(
            firstElement.compareDocumentPosition(element) &
            Node.DOCUMENT_POSITION_DISCONNECTED
          )),
    );
    if (useFallback) {
      if (isDevelopment() && ids.length > 1) {
        const scope = parentId === ROOT_PARENT ? "root" : `group "${parentId}"`;
        diagnostics.warn(
          "disconnected-order",
          `${scope} has disconnected siblings; using deterministic ID order. Supply an explicit sequence for intentional scan order`,
        );
      }
      return [...ids].sort((a, b) => a.localeCompare(b));
    }

    return [...ids].sort((a, b) => {
      const elementA = elementOf(a)!;
      const elementB = elementOf(b)!;
      const position = elementA.compareDocumentPosition(elementB);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return a.localeCompare(b);
    });
  };

  const applySequence = (
    parentId: string,
    ids: readonly string[],
    sequence: readonly string[],
  ): string[] => {
    const present = new Set(ids);
    const ordered: string[] = [];
    const used = new Set<string>();
    const seenInSequence = new Set<string>();

    for (const id of sequence) {
      if (isDevelopment()) {
        if (seenInSequence.has(id)) {
          diagnostics.warn(
            "sequence-mismatch",
            `group "${parentId}" lists "${id}" more than once`,
          );
        }
        if (!present.has(id)) {
          diagnostics.warn(
            "sequence-mismatch",
            `group "${parentId}" sequence references unknown child "${id}"`,
          );
        }
      }
      seenInSequence.add(id);
      if (present.has(id) && !used.has(id)) {
        ordered.push(id);
        used.add(id);
      }
    }

    const remainder = domOrder(
      parentId,
      ids.filter((id) => !used.has(id)),
    );
    if (isDevelopment() && remainder.length > 0) {
      diagnostics.warn(
        "sequence-mismatch",
        `group "${parentId}" sequence omits ${remainder.length} child(ren); appended in DOM order`,
      );
    }
    return [...ordered, ...remainder];
  };

  const orderChildren = (
    parentId: ParentId,
    ids: readonly string[],
  ): string[] => {
    const group = parentId === ROOT_PARENT ? null : groups.get(parentId);
    const sequence = group?.getOptions().sequence;
    return parentId !== ROOT_PARENT && sequence && sequence.length > 0
      ? applySequence(parentId, ids, sequence)
      : domOrder(parentId, ids);
  };

  const buildTargetNode = (entry: RegistryTargetEntry): ScanTargetNode => {
    const options = entry.getOptions();
    const disabled =
      options.disabled === true || isElementDisabled(entry.element);
    const node: {
      kind: "target";
      id: string;
      label: string;
      disabled?: boolean;
    } = { kind: "target", id: entry.id, label: options.label };
    if (disabled) node.disabled = true;
    return node;
  };

  const buildNode = (id: string): ScanNode | null => {
    const group = groups.get(id);
    if (group) {
      const children = orderChildren(id, childrenOf.get(id) ?? [])
        .map(buildNode)
        .filter((node): node is ScanNode => node !== null);
      const options = group.getOptions();
      const node: {
        kind: "group";
        id: string;
        label: string;
        children: ScanNode[];
        exitLabel?: string;
        disabled?: boolean;
      } = { kind: "group", id, label: options.label, children };
      if (options.exitLabel !== undefined) node.exitLabel = options.exitLabel;
      if (options.disabled) node.disabled = true;
      return node;
    }
    const target = targets.get(id);
    return target ? buildTargetNode(target) : null;
  };

  const rootChildren = orderChildren(
    ROOT_PARENT,
    childrenOf.get(ROOT_PARENT) ?? [],
  )
    .map(buildNode)
    .filter((node): node is ScanNode => node !== null);

  return {
    kind: "group",
    id: SYNTHETIC_ROOT_ID,
    label: "root",
    children: rootChildren,
  };
}

function repairParentCycles(
  parents: Map<string, ParentId>,
  diagnostics: RegistryTreeDiagnostics,
): void {
  for (const startId of parents.keys()) {
    const path: string[] = [];
    const position = new Map<string, number>();
    let currentId: string | undefined = startId;

    while (currentId !== undefined) {
      const cycleStart = position.get(currentId);
      if (cycleStart !== undefined) {
        const cycle = path.slice(cycleStart);
        diagnostics.reportParentCycle(cycle);
        parents.set(cycle[0]!, ROOT_PARENT);
        break;
      }
      position.set(currentId, path.length);
      path.push(currentId);
      const parentId = parents.get(currentId);
      currentId = typeof parentId === "string" ? parentId : undefined;
    }
  }
}

export function isElementDisabled(element: HTMLElement | null): boolean {
  if (!element) return false;
  if (
    (element as HTMLButtonElement).disabled === true ||
    element.matches(":disabled")
  ) {
    return true;
  }
  return element.getAttribute("aria-disabled") === "true";
}
