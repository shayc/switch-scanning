import type { Detach, Scanner } from "../core/index.ts";
import { isDevelopment } from "./env.ts";
import {
  compileRegistryTree,
  isElementDisabled,
  type RegistryGroupEntry,
  type RegistryTargetEntry,
} from "./registryTree.ts";

const noop = (): void => undefined;

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

/**
 * Owns live DOM registrations and publishes one compiled scan tree per
 * microtask. Tree construction itself lives in registryTree.ts.
 */
export class ScanRegistry {
  private readonly targets = new Map<string, RegistryTargetEntry>();
  private readonly groups = new Map<string, RegistryGroupEntry>();
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

  mountTarget(
    id: string,
    getOptions: () => ScanTargetOptions,
    element: HTMLElement | null,
  ): Detach {
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
    this.scanner.setTree(
      compileRegistryTree(this.targets, this.groups, this.groupElements, {
        reportParentCycle: (cycle) => this.reportParentCycle(cycle),
        warn: (code, message) => this.warn(code, message),
      }),
    );
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
