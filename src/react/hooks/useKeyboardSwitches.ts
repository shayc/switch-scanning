import { useEffect, useRef } from "react";
import type { Scanner } from "../../core/index.ts";
import { useCommittedRef } from "./refs.ts";

/** Map from `KeyboardEvent.code` to a declared logical switch ID. */
export type KeyboardSwitchBindings = Readonly<Record<string, string>>;

/** Options for {@link useKeyboardSwitches}. */
export interface KeyboardSwitchesOptions {
  /** When false, listeners are attached but ignore events. Defaults to true. */
  enabled?: boolean;
  /** Element/document to listen on. Undefined uses global document; null disables capture. */
  target?: Document | HTMLElement | null;
  /** Explicit ownership policy for mapped keydown events. */
  shouldHandle?: (event: KeyboardEvent) => boolean;
}

/**
 * Operate declared logical switches from the keyboard. Uses `KeyboardEvent.code`,
 * claims mapped events during capture, ignores browser auto-repeat, and lets the
 * deterministic scheduler implement move repeat. Blur, visibility loss, and
 * unmount disconnect their stable source IDs so a lost key-up cannot leave a
 * switch stuck down; blur and visibility loss additionally suspend the scanner
 * so a stale dwell cannot fire on return.
 *
 * Ownership is two-staged (see SPEC §6): a mapped keydown is *claimed* — its
 * default prevented and propagation stopped in the capture phase — before the
 * input engine decides whether the eventual gesture is *accepted*. A source
 * disconnected while still physically held stays quarantined in `held` until a
 * real key-up clears it; repeated `keydown`s for a still-held key are claimed
 * but never re-open a fresh press.
 */
export function useKeyboardSwitches(
  scanner: Scanner,
  bindings: KeyboardSwitchBindings,
  options: KeyboardSwitchesOptions = {},
): void {
  const bindingsRef = useCommittedRef(bindings);
  const enabledRef = useCommittedRef(options.enabled ?? true);
  const shouldHandleRef = useCommittedRef(options.shouldHandle);
  const disconnectAllRef = useRef<(() => void) | null>(null);

  const explicitTarget = options.target;

  useEffect(() => {
    if (explicitTarget === null) return;
    const target: Document | HTMLElement =
      explicitTarget ?? (typeof document !== "undefined" ? document : null!);
    if (!target) return;
    const ownerDocument =
      target.nodeType === 9
        ? (target as Document)
        : (target as HTMLElement).ownerDocument;
    const ownerWindow = ownerDocument.defaultView;

    // Remember the switch claimed on keydown. Bindings may change before
    // keyup, but the logical switch that opened the gesture must be released.
    // An entry survives a synthetic disconnect (`connected: false`) so a still
    // physically-held key is quarantined until its real key-up.
    const held = new Map<
      string,
      | { claimed: true; connected: boolean; switchId: string }
      | { claimed: false }
    >();
    const sourceId = (code: string): string => `key:${code}`;

    const onKeyDown = (event: KeyboardEvent): void => {
      const existing = held.get(event.code);
      if (existing) {
        // A still-held key (including auto-repeat after a synthetic disconnect)
        // stays claimed but never re-opens a fresh press. Resolve new bindings
        // only after this check: a binding may disappear before physical keyup.
        if (existing.claimed) own(event);
        return;
      }
      const switchId = bindingsRef.current[event.code];
      if (switchId === undefined) return;
      if (!enabledRef.current || event.repeat) return;

      if (!claims(event)) {
        held.set(event.code, { claimed: false });
        return;
      }

      own(event);
      held.set(event.code, { claimed: true, connected: true, switchId });
      scanner.input.press(switchId, sourceId(event.code));
    };

    const claims = (event: KeyboardEvent): boolean => {
      const decide = shouldHandleRef.current;
      if (decide) return decide(event);
      // Default ownership excludes modifier chords so a bare-key binding (e.g.
      // Space) does not swallow an OS/browser shortcut (Cmd/Ctrl/Alt + key).
      // Hosts that intend to bind a chord opt in through `shouldHandle`.
      return !(event.ctrlKey || event.metaKey || event.altKey);
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      const decision = held.get(event.code);
      if (!decision) return;
      held.delete(event.code);
      if (!decision.claimed) return;
      own(event);
      if (decision.connected) {
        scanner.input.release(decision.switchId, sourceId(event.code));
      }
    };

    const disconnectAll = (): void => {
      for (const [code, decision] of held) {
        if (decision.claimed && decision.connected) {
          scanner.input.disconnect(sourceId(code));
          decision.connected = false;
        }
      }
    };
    disconnectAllRef.current = disconnectAll;

    // Blur / tab-hidden are environment suspensions: drop held contacts and
    // invalidate an armed dwell so it cannot fire when the user returns.
    const onEnvironmentSuspend = (): void => {
      disconnectAll();
      scanner.input.suspend();
    };

    const onVisibility = (): void => {
      if (ownerDocument.visibilityState === "hidden") {
        onEnvironmentSuspend();
      }
    };

    target.addEventListener("keydown", onKeyDown as EventListener, true);
    target.addEventListener("keyup", onKeyUp as EventListener, true);
    if (target !== ownerDocument)
      ownerDocument.addEventListener("keyup", onKeyUp as EventListener, true);
    ownerWindow?.addEventListener("blur", onEnvironmentSuspend);
    ownerDocument.addEventListener("visibilitychange", onVisibility);

    return () => {
      target.removeEventListener("keydown", onKeyDown as EventListener, true);
      target.removeEventListener("keyup", onKeyUp as EventListener, true);
      if (target !== ownerDocument)
        ownerDocument.removeEventListener(
          "keyup",
          onKeyUp as EventListener,
          true,
        );
      ownerWindow?.removeEventListener("blur", onEnvironmentSuspend);
      ownerDocument.removeEventListener("visibilitychange", onVisibility);
      if (disconnectAllRef.current === disconnectAll) {
        disconnectAllRef.current = null;
      }
      disconnectAll();
    };
  }, [scanner, explicitTarget, bindingsRef, enabledRef, shouldHandleRef]);

  useEffect(() => {
    if (options.enabled === false) disconnectAllRef.current?.();
  }, [options.enabled]);
}

function own(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}
