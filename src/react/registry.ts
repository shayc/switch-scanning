import type {
  Detach,
  Scanner,
  ScanGroupNode,
  ScanNode,
  ScanTargetNode,
} from "../core/index.ts";
import { isDevelopment } from "./env.ts";

export interface ScanTargetOptions {
  id: string;
  label: string;
  groupId?: string;
  /** Structural eligibility; keep this aligned with the control's disabled state. */
  disabled?: boolean;
  activate?: () => void;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface ScanGroupOptions {
  id: string;
  label: string;
  parentId?: string;
  exitLabel?: string;
  disabled?: boolean;
  sequence?: readonly string[];
}

interface TargetEntry {
  readonly id: string;
  getOptions: () => ScanTargetOptions;
  element: HTMLElement | null;
}

interface GroupEntry {
  readonly id: string;
  getOptions: () => ScanGroupOptions;
  element: HTMLElement | null;
}

const ROOT_PARENT = Symbol("scan-registry-root");
const SYNTHETIC_ROOT_ID = "__root__";
type ParentId = string | typeof ROOT_PARENT;

/**
 * Collects DOM-registered targets and groups and compiles them into a single
 * committed scan tree. Registration flows through callback refs; structural
 * changes mark the registry dirty and one reconciliation is published per
 * microtask, never a transient intermediate tree.
 */
export class ScanRegistry {
  private readonly targets = new Map<string, TargetEntry>();
  private readonly groups = new Map<string, GroupEntry>();
  private readonly groupElements = new Map<HTMLElement, string>();

  private scanner: Scanner | null = null;
  private dirty = false;
  private flushScheduled = false;

  attach(scanner: Scanner): Detach {
    this.scanner = scanner;
    this.markDirty();
    return () => {
      if (this.scanner === scanner) this.scanner = null;
    };
  }

  // -- target registration --------------------------------------------------

  mountTarget(
    id: string,
    getOptions: () => ScanTargetOptions,
    element: HTMLElement | null,
  ): Detach {
    if (this.groups.has(id)) {
      this.reportDuplicate("node", id);
      return () => {};
    }
    const existing = this.targets.get(id);
    if (existing && existing.element && element && existing.element !== element) {
      this.reportDuplicate("target", id);
      return () => {};
    }
    const entry: TargetEntry = { id, getOptions, element };
    this.targets.set(id, entry);
    this.markDirty();
    return () => {
      if (this.targets.get(id) !== entry) return;
      this.unmountTarget(id);
    };
  }

  unmountTarget(id: string): void {
    this.targets.delete(id);
    this.markDirty();
  }

  touchTarget(): void {
    this.markDirty();
  }

  getTarget(id: string): TargetEntry | undefined {
    return this.targets.get(id);
  }

  getTargetElement(id: string): HTMLElement | null {
    return this.targets.get(id)?.element ?? null;
  }

  getGroupElement(id: string): HTMLElement | null {
    return this.groups.get(id)?.element ?? null;
  }

  exitLabelFor(id: string): string {
    const opts = this.groups.get(id)?.getOptions();
    if (!opts) return "Back";
    return opts.exitLabel ?? `Back from ${opts.label}`;
  }

  /** Group elements that contain `element`, nearest first. */
  ancestorGroupElements(element: HTMLElement | null): HTMLElement[] {
    const result: HTMLElement[] = [];
    let cursor = element?.parentElement ?? null;
    while (cursor) {
      if (this.groupElements.has(cursor)) result.push(cursor);
      cursor = cursor.parentElement;
    }
    return result;
  }

  /** Whether a target is currently ineligible via its DOM element. */
  isTargetElementDisabled(id: string): boolean {
    return isElementDisabled(this.targets.get(id)?.element ?? null);
  }

  // -- group registration ---------------------------------------------------

  mountGroup(
    id: string,
    getOptions: () => ScanGroupOptions,
    element: HTMLElement | null,
  ): Detach {
    if (this.targets.has(id)) {
      this.reportDuplicate("node", id);
      return () => {};
    }
    const existing = this.groups.get(id);
    if (existing && existing.element && element && existing.element !== element) {
      this.reportDuplicate("group", id);
      return () => {};
    }
    if (existing?.element && existing.element !== element) {
      this.groupElements.delete(existing.element);
    }
    const entry: GroupEntry = { id, getOptions, element };
    this.groups.set(id, entry);
    if (element) this.groupElements.set(element, id);
    this.markDirty();
    return () => {
      if (this.groups.get(id) !== entry) return;
      this.unmountGroup(id);
    };
  }

  unmountGroup(id: string): void {
    const existing = this.groups.get(id);
    if (existing?.element) this.groupElements.delete(existing.element);
    this.groups.delete(id);
    this.markDirty();
  }

  touchGroup(): void {
    this.markDirty();
  }

  // -- reconciliation -------------------------------------------------------

  markDirty(): void {
    this.dirty = true;
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      if (this.dirty) this.flush();
    });
  }

  /** Rebuild and publish the tree synchronously. */
  flush(): void {
    this.dirty = false;
    if (!this.scanner) return;
    this.scanner.setTree(this.buildTree());
  }

  private buildTree(): ScanGroupNode {
    const childrenOf = new Map<ParentId, string[]>();
    const groupParents = new Map<string, ParentId>();
    const pushChild = (parent: ParentId, id: string): void => {
      const list = childrenOf.get(parent);
      if (list) list.push(id);
      else childrenOf.set(parent, [id]);
    };

    for (const entry of this.targets.values()) pushChild(this.resolveTargetParent(entry), entry.id);
    for (const entry of this.groups.values()) {
      groupParents.set(entry.id, this.resolveGroupParent(entry));
    }
    this.repairParentCycles(groupParents);
    for (const [id, parentId] of groupParents) pushChild(parentId, id);

    const buildNode = (id: string): ScanNode | null => {
      const group = this.groups.get(id);
      if (group) {
        const orderedIds = this.orderChildren(id, childrenOf.get(id) ?? []);
        const children = orderedIds
          .map(buildNode)
          .filter((node): node is ScanNode => node !== null);
        const opts = group.getOptions();
        const node: {
          kind: "group";
          id: string;
          label: string;
          children: ScanNode[];
          exitLabel?: string;
          disabled?: boolean;
        } = { kind: "group", id, label: opts.label, children };
        if (opts.exitLabel !== undefined) node.exitLabel = opts.exitLabel;
        if (opts.disabled) node.disabled = true;
        return node;
      }
      const target = this.targets.get(id);
      if (target) return this.buildTargetNode(target);
      return null;
    };

    const rootChildren = this.orderChildren(ROOT_PARENT, childrenOf.get(ROOT_PARENT) ?? [])
      .map(buildNode)
      .filter((node): node is ScanNode => node !== null);

    return {
      kind: "group",
      id: SYNTHETIC_ROOT_ID,
      label: "root",
      children: rootChildren,
    };
  }

  private buildTargetNode(entry: TargetEntry): ScanTargetNode {
    const opts = entry.getOptions();
    const disabled = opts.disabled === true || isElementDisabled(entry.element);
    const node: { kind: "target"; id: string; label: string; disabled?: boolean; metadata?: Readonly<Record<string, unknown>> } = {
      kind: "target",
      id: entry.id,
      label: opts.label,
    };
    if (disabled) node.disabled = true;
    if (opts.metadata !== undefined) node.metadata = opts.metadata;
    return node;
  }

  private resolveTargetParent(entry: TargetEntry): ParentId {
    const explicit = entry.getOptions().groupId;
    if (explicit !== undefined) return this.groups.has(explicit) ? explicit : ROOT_PARENT;
    return this.domParent(entry.element, entry.id);
  }

  private resolveGroupParent(entry: GroupEntry): ParentId {
    const explicit = entry.getOptions().parentId;
    if (explicit !== undefined) return this.groups.has(explicit) ? explicit : ROOT_PARENT;
    return this.domParent(entry.element, entry.id);
  }

  private domParent(element: HTMLElement | null, selfId: string): ParentId {
    let cursor = element?.parentElement ?? null;
    while (cursor) {
      const gid = this.groupElements.get(cursor);
      if (gid !== undefined && gid !== selfId) return gid;
      cursor = cursor.parentElement;
    }
    return ROOT_PARENT;
  }

  private repairParentCycles(parents: Map<string, ParentId>): void {
    for (const startId of parents.keys()) {
      const path: string[] = [];
      const position = new Map<string, number>();
      let currentId: string | undefined = startId;

      while (currentId !== undefined) {
        const cycleStart = position.get(currentId);
        if (cycleStart !== undefined) {
          const cycle = path.slice(cycleStart);
          this.reportParentCycle(cycle);
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

  private orderChildren(parentId: ParentId, ids: readonly string[]): string[] {
    const group = parentId === ROOT_PARENT ? null : this.groups.get(parentId);
    const sequence = group?.getOptions().sequence;

    if (parentId !== ROOT_PARENT && sequence && sequence.length > 0) {
      return this.applySequence(parentId, ids, sequence);
    }
    return this.domOrder(ids);
  }

  private applySequence(
    parentId: string,
    ids: readonly string[],
    sequence: readonly string[],
  ): string[] {
    const present = new Set(ids);
    const ordered: string[] = [];
    const used = new Set<string>();
    const seenInSequence = new Set<string>();

    for (const id of sequence) {
      if (isDevelopment()) {
        if (seenInSequence.has(id)) {
          this.warn("sequence-mismatch", `group "${parentId}" lists "${id}" more than once`);
        }
        if (!present.has(id)) {
          this.warn("sequence-mismatch", `group "${parentId}" sequence references unknown child "${id}"`);
        }
      }
      seenInSequence.add(id);
      if (present.has(id) && !used.has(id)) {
        ordered.push(id);
        used.add(id);
      }
    }

    // Append any eligible children not covered by the sequence, in DOM order,
    // so they remain reachable in production.
    const remainder = this.domOrder(ids.filter((id) => !used.has(id)));
    if (isDevelopment() && remainder.length > 0) {
      this.warn(
        "sequence-mismatch",
        `group "${parentId}" sequence omits ${remainder.length} child(ren); appended in DOM order`,
      );
    }
    return [...ordered, ...remainder];
  }

  private domOrder(ids: readonly string[]): string[] {
    return [...ids].sort((a, b) => {
      const ea = this.elementOf(a);
      const eb = this.elementOf(b);
      if (!ea || !eb) return 0;
      const position = ea.compareDocumentPosition(eb);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  private elementOf(id: string): HTMLElement | null {
    return this.targets.get(id)?.element ?? this.groups.get(id)?.element ?? null;
  }

  private reportDuplicate(kind: string, id: string): void {
    const message = `duplicate scan ${kind} id "${id}"`;
    if (isDevelopment()) throw new Error(`[switch-scanning] ${message}`);
    this.warn("duplicate-id", `${message}; keeping the first registration`);
  }

  private reportParentCycle(cycle: readonly string[]): void {
    const route = [...cycle, cycle[0]].join(" -> ");
    const message = `cyclic scan group parentage: ${route}`;
    if (isDevelopment()) throw new Error(`[switch-scanning] ${message}`);
    this.warn("parent-cycle", `${message}; keeping "${cycle[0]}" at the root`);
  }

  private warn(code: string, message: string): void {
    if (typeof console !== "undefined") {
      console.warn(`[switch-scanning] (${code}) ${message}`);
    }
  }
}

function isElementDisabled(element: HTMLElement | null): boolean {
  if (!element) return false;
  if ((element as HTMLButtonElement).disabled === true) return true;
  if (element.getAttribute("aria-disabled") === "true") return true;
  return false;
}
