import type {
  ActivationResult,
  Highlight,
  ScannerHost,
} from "../core/index.ts";
import type { ScanRegistry } from "./registry.ts";

const ATTR_HIGHLIGHTED = "data-scan-highlighted";
const ATTR_WITHIN = "data-scan-within";
const ATTR_EXIT_HIGHLIGHTED = "data-scan-exit-highlighted";
const ATTR_EXIT_LABEL = "data-scan-exit-label";

/** The default DOM host, plus the re-decoration hook the registry drives. */
export interface DomHost extends ScannerHost {
  /**
   * Re-apply presentation for the current highlight. The registry calls this
   * when an element is (re)bound, because the scanner cannot: the compiled tree
   * carries ids and labels only, so an element swapped under a stable id
   * produces no highlight change to reveal.
   */
  refresh(): void;
}

/**
 * The default DOM host. It activates a target through its native action path
 * (the element's own `click()`, or a custom `activate` callback) and writes
 * presentation attributes imperatively so that ordinary highlight movement
 * causes zero React rerenders. It touches no roles, focus, or tab order.
 */
export function createDomHost(
  registry: ScanRegistry,
  exitLabelFor: (groupId: string) => string,
): DomHost {
  // Elements we decorated last reveal, so we can clear them precisely.
  const decorated = new Set<HTMLElement>();
  let current: Highlight = null;

  function clearDecorations(): void {
    for (const el of decorated) {
      el.removeAttribute(ATTR_HIGHLIGHTED);
      el.removeAttribute(ATTR_WITHIN);
      el.removeAttribute(ATTR_EXIT_HIGHLIGHTED);
      el.removeAttribute(ATTR_EXIT_LABEL);
    }
    decorated.clear();
  }

  function decorate(el: HTMLElement, attr: string, value = ""): void {
    el.setAttribute(attr, value);
    decorated.add(el);
  }

  function reveal(highlight: Highlight): void {
    current = highlight;
    clearDecorations();
    if (!highlight) return;

    if (highlight.kind === "exit") {
      const groupEl = registry.getGroupElement(highlight.groupId);
      if (groupEl) {
        decorate(groupEl, ATTR_EXIT_HIGHLIGHTED);
        decorate(groupEl, ATTR_EXIT_LABEL, exitLabelFor(highlight.groupId));
        markWithin(groupEl);
        scrollIntoView(groupEl);
      }
      return;
    }

    const el =
      highlight.kind === "target"
        ? registry.getTargetElement(highlight.id)
        : registry.getGroupElement(highlight.id);
    if (!el) return;
    decorate(el, ATTR_HIGHLIGHTED);
    markWithin(el);
    scrollIntoView(el);
  }

  function markWithin(el: HTMLElement): void {
    for (const ancestor of registry.ancestorGroupElements(el)) {
      decorate(ancestor, ATTR_WITHIN);
    }
  }

  const host: DomHost = {
    refresh() {
      reveal(current);
    },
    activate(targetId: string): ActivationResult {
      const entry = registry.getTarget(targetId);
      if (!entry) return { activated: false, reason: "target not registered" };

      const options = entry.getOptions();
      if (
        options.disabled === true ||
        registry.isTargetElementDisabled(targetId)
      ) {
        return { activated: false, reason: "target disabled" };
      }

      if (options.activate) {
        options.activate();
        return { activated: true };
      }

      const el = entry.element;
      if (!el) return { activated: false, reason: "target has no element" };
      el.click(); // native activation path, shared with pointer/keyboard
      return { activated: true };
    },
    reveal,
  };

  return host;
}

function scrollIntoView(el: HTMLElement): void {
  if (typeof el.scrollIntoView !== "function") return;
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
}
