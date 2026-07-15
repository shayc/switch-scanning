import type { Detach, Scanner, ScannerDiagnosticCode } from "../core/index.ts";
import { reportScannerDiagnostic } from "../core/scanner/scanner.ts";
import { isDevelopment } from "./env.ts";
import {
  createDiagnosticWarner,
  formatDiagnostic,
} from "../core/shared/diagnostics.ts";
import {
  compileRegistryTree,
  isElementDisabled,
  SYNTHETIC_ROOT_ID,
  type RegistryGroupEntry,
  type RegistryTargetEntry,
} from "./registryTree.ts";

const noop = (): void => undefined;

/** Registration options for a scan target. */
export interface ScanTargetOptions {
  /** Unique node ID. `__root__` is reserved by the React registry. */
  id: string;
  label: string;
  /** Explicit parent group for portals or non-contained composition. */
  parentId?: string;
  /** Structural eligibility; keep this aligned with the control's disabled state. */
  disabled?: boolean;
  activate?: () => void;
}

/** Registration options for a scan group. */
export interface ScanGroupOptions {
  /** Unique node ID. `__root__` is reserved by the React registry. */
  id: string;
  label: string;
  parentId?: string;
  exitLabel?: string;
  disabled?: boolean;
  sequence?: readonly string[];
}

/** @internal Curated fields that can change the published target tree. */
export function scanTargetStructuralSignature(
  options: ScanTargetOptions,
): string {
  return JSON.stringify({
    id: options.id,
    label: options.label,
    parentId: options.parentId ?? null,
    disabled: options.disabled ?? null,
  });
}

/** @internal Curated fields that can change the published group tree. */
export function scanGroupStructuralSignature(
  options: ScanGroupOptions,
): string {
  return JSON.stringify({
    id: options.id,
    label: options.label,
    parentId: options.parentId ?? null,
    exitLabel: options.exitLabel ?? null,
    disabled: options.disabled ?? null,
    sequence: options.sequence ?? null,
  });
}

/**
 * Owns live DOM registrations and publishes one compiled scan tree per
 * microtask. Tree construction itself lives in registryTree.ts.
 */
export class ScanRegistry {
  private readonly targets = new Map<string, RegistryTargetEntry>();
  private readonly groups = new Map<string, RegistryGroupEntry>();
  private readonly groupElements = new Map<HTMLElement, string>();

  private scanner: Scanner | null = null;
  private publishedScanner: Scanner | null = null;
  private publishedTreeSignature: string | null = null;
  private dirty = false;
  private flushScheduled = false;
  private readonly warnOnce = createDiagnosticWarner();
  private readonly pendingDiagnostics: Array<{
    code: ScannerDiagnosticCode;
    message: string;
  }> = [];

  attach(scanner: Scanner): Detach {
    this.scanner = scanner;
    this.publishedScanner = null;
    for (const diagnostic of this.pendingDiagnostics.splice(0)) {
      reportScannerDiagnostic(scanner, diagnostic.code, diagnostic.message);
    }
    this.markDirty();
    return () => {
      if (this.scanner === scanner) {
        this.scanner = null;
        this.publishedScanner = null;
      }
    };
  }

  mountTarget(
    id: string,
    getOptions: () => ScanTargetOptions,
    element: HTMLElement | null,
  ): Detach {
    if (id === SYNTHETIC_ROOT_ID) {
      this.reportReservedId(id);
      return noop;
    }
    if (this.groups.has(id)) {
      this.reportDuplicate("node", id);
      return noop;
    }
    const existing = this.targets.get(id);
    if (
      existing &&
      existing.element &&
      element &&
      existing.element !== element
    ) {
      this.reportDuplicate("target", id);
      return noop;
    }
    const entry: RegistryTargetEntry = { id, getOptions, element };
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

  getTarget(id: string): RegistryTargetEntry | undefined {
    return this.targets.get(id);
  }

  getTargetElement(id: string): HTMLElement | null {
    return this.targets.get(id)?.element ?? null;
  }

  getGroupElement(id: string): HTMLElement | null {
    return this.groups.get(id)?.element ?? null;
  }

  exitLabelFor(id: string): string {
    const options = this.groups.get(id)?.getOptions();
    if (!options) return "Back";
    return options.exitLabel ?? `Back from ${options.label}`;
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

  isTargetElementDisabled(id: string): boolean {
    return isElementDisabled(this.targets.get(id)?.element ?? null);
  }

  mountGroup(
    id: string,
    getOptions: () => ScanGroupOptions,
    element: HTMLElement | null,
  ): Detach {
    if (id === SYNTHETIC_ROOT_ID) {
      this.reportReservedId(id);
      return noop;
    }
    if (this.targets.has(id)) {
      this.reportDuplicate("node", id);
      return noop;
    }
    const existing = this.groups.get(id);
    if (
      existing &&
      existing.element &&
      element &&
      existing.element !== element
    ) {
      this.reportDuplicate("group", id);
      return noop;
    }
    if (existing?.element && existing.element !== element) {
      this.groupElements.delete(existing.element);
    }
    const entry: RegistryGroupEntry = { id, getOptions, element };
    const cycle = findParentCycle(this.groups, entry, false);
    if (cycle && isDevelopment()) this.reportParentCycle(cycle);
    this.groups.set(id, entry);
    if (!isDevelopment()) this.repairParentCycles();
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
    if (!isDevelopment()) this.repairParentCycles();
    this.markDirty();
  }

  touchGroup(): void {
    const cycle = findParentCycle(this.groups, undefined, false);
    if (cycle && isDevelopment()) this.reportParentCycle(cycle);
    if (!isDevelopment()) this.repairParentCycles();
    this.markDirty();
  }

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
    const scanner = this.scanner;
    if (!scanner) return;
    const tree = compileRegistryTree(
      this.targets,
      this.groups,
      this.groupElements,
      {
        reportParentCycle: (cycle) => this.reportParentCycle(cycle),
        warn: (code, message) => this.warnOnce(code, message),
      },
    );
    const signature = JSON.stringify(tree);
    if (
      this.publishedScanner === scanner &&
      this.publishedTreeSignature === signature
    ) {
      return;
    }
    scanner.setTree(tree);
    this.publishedScanner = scanner;
    this.publishedTreeSignature = signature;
  }

  /**
   * A configuration mistake is fatal in development so it surfaces at its
   * source; in production the registry degrades gracefully, reporting the
   * mistake plus how it recovered.
   */
  private raise(
    code: ScannerDiagnosticCode,
    message: string,
    recovery: string,
  ): void {
    if (isDevelopment()) throw new Error(formatDiagnostic(code, message));
    this.reportDiagnostic(code, `${message}; ${recovery}`);
  }

  private reportDuplicate(kind: string, id: string): void {
    this.raise(
      "duplicate-id",
      `duplicate scan ${kind} id "${id}"`,
      "keeping the first registration",
    );
  }

  private reportReservedId(id: string): void {
    this.raise(
      "reserved-id",
      `scan node id "${id}" is reserved for the registry root`,
      "registration ignored",
    );
  }

  private reportParentCycle(cycle: readonly string[]): void {
    const route = [...cycle, cycle[0]].join(" -> ");
    this.raise(
      "parent-cycle",
      `cyclic scan group parentage: ${route}`,
      `keeping "${cycle[0]}" at the root`,
    );
  }

  private reportDiagnostic(code: ScannerDiagnosticCode, message: string): void {
    if (this.scanner) reportScannerDiagnostic(this.scanner, code, message);
    else this.pendingDiagnostics.push({ code, message });
  }

  private repairParentCycles(): void {
    for (const entry of this.groups.values()) {
      delete entry.parentIdOverride;
    }
    let cycle = findParentCycle(this.groups);
    while (cycle) {
      this.reportParentCycle(cycle);
      this.groups.get(cycle[0]!)!.parentIdOverride = null;
      cycle = findParentCycle(this.groups);
    }
  }
}

function findParentCycle(
  groups: ReadonlyMap<string, RegistryGroupEntry>,
  candidate?: RegistryGroupEntry,
  respectOverrides = true,
): readonly string[] | null {
  const entries = new Map(groups);
  if (candidate) entries.set(candidate.id, candidate);

  for (const startId of entries.keys()) {
    const path: string[] = [];
    const positions = new Map<string, number>();
    let currentId: string | undefined = startId;

    while (currentId !== undefined && entries.has(currentId)) {
      const cycleStart = positions.get(currentId);
      if (cycleStart !== undefined) return path.slice(cycleStart);
      positions.set(currentId, path.length);
      path.push(currentId);
      const entry: RegistryGroupEntry = entries.get(currentId)!;
      const parentId: string | undefined =
        respectOverrides && entry.parentIdOverride === null
          ? undefined
          : ((respectOverrides ? entry.parentIdOverride : undefined) ??
            entry.getOptions().parentId);
      currentId = parentId;
    }
  }
  return null;
}
