import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createScanner,
  inverseScan,
  manualClock,
  stepScan,
} from "../../core/index.ts";
import { createScannerFixture } from "../../core/testing/index.ts";
import { ScannerProvider } from "../ScannerProvider.tsx";
import { useKeyboardSwitches } from "./useKeyboardSwitches.ts";
import { useOwnedScanner } from "./useOwnedScanner.ts";
import { useScanTarget } from "./useScanTarget.ts";

afterEach(cleanup);

function TargetButton({
  id,
  label,
  onActivate,
}: {
  id: string;
  label: string;
  onActivate?: () => void;
}) {
  const target = useScanTarget({ id, label });
  return (
    <button {...target} onClick={onActivate}>
      {label}
    </button>
  );
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("keyboard switches", () => {
  it("operates a declared switch from KeyboardEvent.code", async () => {
    const clock = manualClock();
    const activated: string[] = [];

    function KeyApp() {
      const scanner = useOwnedScanner({
        method: stepScan(),
        startOn: "input",
        switches: { select: { action: "select" }, next: { action: "next" } },
        clock,
      });
      useKeyboardSwitches(scanner, { Space: "next", Enter: "select" });
      return (
        <ScannerProvider scanner={scanner}>
          <TargetButton
            id="x"
            label="X"
            onActivate={() => activated.push("x")}
          />
          <TargetButton
            id="y"
            label="Y"
            onActivate={() => activated.push("y")}
          />
        </ScannerProvider>
      );
    }

    render(<KeyApp />);
    await flushMicrotasks();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "Enter" }));
    });
    expect(activated).toEqual(["y"]);
  });

  it("releases the binding accepted on keydown after bindings change", async () => {
    const activated: string[] = [];
    const scanner = createScanner({
      method: inverseScan({ intervalMs: 1000, passes: "infinite" }),
      startOn: "manual",
      switches: {
        first: { action: "scan" },
        second: { action: "scan" },
      },
    });

    function KeyApp({ binding }: { binding: string }) {
      useKeyboardSwitches(scanner, { Space: binding });
      return (
        <ScannerProvider scanner={scanner}>
          <TargetButton
            id="x"
            label="X"
            onActivate={() => activated.push("x")}
          />
        </ScannerProvider>
      );
    }

    const view = render(<KeyApp binding="first" />);
    await flushMicrotasks();
    act(() => scanner.start());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    });
    view.rerender(<KeyApp binding="second" />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    });
    expect(activated).toEqual(["x"]);
  });

  it("keeps a held key claimed after its binding is removed", () => {
    const scanner = createScanner({
      method: stepScan(),
      startOn: "input",
      switches: { next: { action: "next" } },
    });

    function KeyApp({ mapped }: { mapped: boolean }) {
      useKeyboardSwitches(scanner, mapped ? { Space: "next" } : {});
      return null;
    }

    const view = render(<KeyApp mapped />);
    const down = new KeyboardEvent("keydown", {
      code: "Space",
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);

    view.rerender(<KeyApp mapped={false} />);
    const repeated = new KeyboardEvent("keydown", {
      code: "Space",
      repeat: true,
      cancelable: true,
    });
    const up = new KeyboardEvent("keyup", {
      code: "Space",
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(repeated);
      document.dispatchEvent(up);
    });

    expect(repeated.defaultPrevented).toBe(true);
    expect(up.defaultPrevented).toBe(true);

    const afterRelease = new KeyboardEvent("keydown", {
      code: "Space",
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(afterRelease);
    });
    expect(afterRelease.defaultPrevented).toBe(false);
  });

  it("passes rejected mapped keys through without opening a gesture", () => {
    const scanner = createScanner({
      method: stepScan(),
      startOn: "input",
      switches: { next: { action: "next" } },
    });

    function KeyApp() {
      useKeyboardSwitches(
        scanner,
        { Space: "next" },
        {
          shouldHandle: () => false,
        },
      );
      return null;
    }

    render(<KeyApp />);
    const down = new KeyboardEvent("keydown", {
      code: "Space",
      cancelable: true,
    });
    const up = new KeyboardEvent("keyup", {
      code: "Space",
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(down);
      document.dispatchEvent(up);
    });
    expect(down.defaultPrevented).toBe(false);
    expect(up.defaultPrevented).toBe(false);
    expect(scanner.getSnapshot().status).toBe("idle");
  });

  it("owns accepted keys before descendant keyboard handlers", () => {
    const scanner = createScanner({
      method: stepScan(),
      startOn: "input",
      switches: { next: { action: "next" } },
    });
    const descendantEvents: string[] = [];

    function KeyApp() {
      useKeyboardSwitches(scanner, { Space: "next" });
      return (
        <button
          onKeyDown={() => descendantEvents.push("down")}
          onKeyUp={() => descendantEvents.push("up")}
        >
          Direct control
        </button>
      );
    }

    const view = render(<KeyApp />);
    const button = view.getByRole("button", { name: "Direct control" });
    const down = new KeyboardEvent("keydown", {
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    const up = new KeyboardEvent("keyup", {
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      button.dispatchEvent(down);
      button.dispatchEvent(up);
    });

    expect(down.defaultPrevented).toBe(true);
    expect(up.defaultPrevented).toBe(true);
    expect(descendantEvents).toEqual([]);
    expect(scanner.getSnapshot().status).toBe("complete");
  });

  it("stops later listeners on the same capture target", () => {
    const scanner = createScanner({
      method: stepScan(),
      startOn: "input",
      switches: { next: { action: "next" } },
    });
    function KeyApp() {
      useKeyboardSwitches(scanner, { Space: "next" });
      return null;
    }
    render(<KeyApp />);
    const laterListener = vi.fn();
    document.addEventListener("keydown", laterListener, true);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", cancelable: true }),
      );
      document.dispatchEvent(
        new KeyboardEvent("keyup", { code: "Space", cancelable: true }),
      );
    });

    document.removeEventListener("keydown", laterListener, true);
    expect(laterListener).not.toHaveBeenCalled();
  });

  it("honors an explicit target across rejected, disabled, and repeated keys", () => {
    const scanner = createScanner({
      method: stepScan(),
      startOn: "input",
      switches: { next: { action: "next" } },
    });
    const target = document.createElement("div");

    function KeyApp({
      enabled,
      accept,
    }: {
      enabled: boolean;
      accept: boolean;
    }) {
      useKeyboardSwitches(
        scanner,
        { Space: "next" },
        {
          target,
          enabled,
          shouldHandle: () => accept,
        },
      );
      return null;
    }

    const view = render(<KeyApp enabled accept={false} />);
    const unmapped = new KeyboardEvent("keydown", {
      code: "KeyA",
      cancelable: true,
    });
    const rejected = new KeyboardEvent("keydown", {
      code: "Space",
      cancelable: true,
    });
    const rejectedAgain = new KeyboardEvent("keydown", {
      code: "Space",
      cancelable: true,
    });
    act(() => {
      target.dispatchEvent(unmapped);
      target.dispatchEvent(rejected);
      target.dispatchEvent(rejectedAgain);
    });
    expect(unmapped.defaultPrevented).toBe(false);
    expect(rejected.defaultPrevented).toBe(false);
    expect(rejectedAgain.defaultPrevented).toBe(false);

    // Cleanup includes a remembered rejected key but must not disconnect it.
    view.unmount();
    const disabledView = render(<KeyApp enabled={false} accept />);
    const disabled = new KeyboardEvent("keydown", {
      code: "Space",
      cancelable: true,
    });
    act(() => {
      target.dispatchEvent(disabled);
    });
    expect(disabled.defaultPrevented).toBe(false);

    disabledView.rerender(<KeyApp enabled accept />);
    const repeated = new KeyboardEvent("keydown", {
      code: "Space",
      repeat: true,
      cancelable: true,
    });
    act(() => {
      target.dispatchEvent(repeated);
    });
    expect(repeated.defaultPrevented).toBe(false);

    const accepted = new KeyboardEvent("keydown", {
      code: "Space",
      cancelable: true,
    });
    act(() => {
      target.dispatchEvent(accepted);
      target.dispatchEvent(
        new KeyboardEvent("keyup", { code: "Space", cancelable: true }),
      );
    });
    expect(accepted.defaultPrevented).toBe(true);
    // No scan tree is attached in this adapter-only test, so the accepted
    // start gesture reaches the deterministic empty-tree completion state.
    expect(scanner.getSnapshot().status).toBe("complete");
  });

  it("attaches no global listeners when target is explicitly null", () => {
    const scanner = createScanner({
      method: stepScan(),
      startOn: "input",
      switches: { next: { action: "next" } },
    });

    function KeyApp() {
      useKeyboardSwitches(scanner, { Space: "next" }, { target: null });
      return null;
    }

    render(<KeyApp />);
    const down = new KeyboardEvent("keydown", {
      code: "Space",
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(down);
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    });
    expect(down.defaultPrevented).toBe(false);
    expect(scanner.getSnapshot().status).toBe("idle");
  });

  it("releases a scoped key when keyup occurs outside the target", () => {
    const scanner = createScanner({
      method: inverseScan({ intervalMs: 1000, passes: "infinite" }),
      startOn: "manual",
      switches: { scan: { action: "scan" } },
    });
    const fixture = createScannerFixture(scanner, [
      { kind: "target", id: "x", label: "X" },
    ]);
    const target = document.createElement("div");

    function KeyApp() {
      useKeyboardSwitches(scanner, { Space: "scan" }, { target });
      return null;
    }

    render(<KeyApp />);
    act(() => scanner.start());
    const up = new KeyboardEvent("keyup", {
      code: "Space",
      cancelable: true,
    });
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      document.dispatchEvent(up);
    });
    expect(up.defaultPrevented).toBe(true);
    expect(fixture.activations).toEqual(["x"]);
  });

  it("keeps a held key quarantined while its explicit target changes", () => {
    const scanner = createScanner({
      method: stepScan(),
      startOn: "manual",
      switches: { next: { action: "next" } },
    });
    createScannerFixture(scanner, [
      { kind: "target", id: "a", label: "A" },
      { kind: "target", id: "b", label: "B" },
      { kind: "target", id: "c", label: "C" },
    ]);
    const first = document.createElement("div");
    const second = document.createElement("div");

    function KeyApp({ target }: { target: HTMLElement }) {
      useKeyboardSwitches(scanner, { Space: "next" }, { target });
      return null;
    }

    const view = render(<KeyApp target={first} />);
    act(() => scanner.start());
    act(() => {
      first.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "b" });

    view.rerender(<KeyApp target={second} />);
    const refired = new KeyboardEvent("keydown", {
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      second.dispatchEvent(refired);
    });
    expect(refired.defaultPrevented).toBe(true);
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "b" });

    act(() => {
      second.dispatchEvent(
        new KeyboardEvent("keyup", {
          code: "Space",
          bubbles: true,
          cancelable: true,
        }),
      );
      second.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "c" });
  });

  it("disconnects an accepted key when disabled before keyup", () => {
    const clock = manualClock();
    const scanner = createScanner({
      method: inverseScan({ intervalMs: 1000, passes: "infinite" }),
      startOn: "manual",
      switches: { scan: { action: "scan" } },
      clock,
    });
    const fixture = createScannerFixture(scanner, [
      { kind: "target", id: "x", label: "X" },
      { kind: "target", id: "y", label: "Y" },
    ]);

    function KeyApp({ enabled }: { enabled: boolean }) {
      useKeyboardSwitches(scanner, { Space: "scan" }, { enabled });
      return null;
    }

    const view = render(<KeyApp enabled />);
    act(() => scanner.start());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      clock.advanceBy(1000);
    });
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "y" });

    view.rerender(<KeyApp enabled={false} />);
    expect(clock.pending).toBe(0);
    act(() => clock.advanceBy(5000));
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "y" });

    const repeatedAfterDisconnect = new KeyboardEvent("keydown", {
      code: "Space",
      repeat: true,
      cancelable: true,
    });
    const up = new KeyboardEvent("keyup", {
      code: "Space",
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(repeatedAfterDisconnect);
      document.dispatchEvent(up);
    });
    expect(repeatedAfterDisconnect.defaultPrevented).toBe(true);
    expect(up.defaultPrevented).toBe(true);
    expect(fixture.activations).toEqual([]);
  });

  it("disconnects a held phaseful switch on window blur", () => {
    const scanner = createScanner({
      method: inverseScan({ intervalMs: 1000, passes: "infinite" }),
      startOn: "manual",
      switches: { scan: { action: "scan" } },
    });
    const fixture = createScannerFixture(scanner, [
      { kind: "target", id: "x", label: "X" },
    ]);
    function KeyApp() {
      useKeyboardSwitches(scanner, { Space: "scan" });
      return null;
    }
    render(<KeyApp />);
    act(() => scanner.start());
    const repeated = new KeyboardEvent("keydown", {
      code: "Space",
      repeat: true,
      cancelable: true,
    });
    const repeatedAfterBlur = new KeyboardEvent("keydown", {
      code: "Space",
      repeat: true,
      cancelable: true,
    });
    const up = new KeyboardEvent("keyup", {
      code: "Space",
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      document.dispatchEvent(repeated);
      window.dispatchEvent(new Event("blur"));
      document.dispatchEvent(repeatedAfterBlur);
      document.dispatchEvent(up);
    });
    expect(repeated.defaultPrevented).toBe(true);
    expect(repeatedAfterBlur.defaultPrevented).toBe(true);
    expect(up.defaultPrevented).toBe(true);
    expect(fixture.activations).toEqual([]);
  });

  it("disconnects a held phaseful switch when the document becomes hidden", () => {
    const scanner = createScanner({
      method: inverseScan({ intervalMs: 1000, passes: "infinite" }),
      startOn: "manual",
      switches: { scan: { action: "scan" } },
    });
    const fixture = createScannerFixture(scanner, [
      { kind: "target", id: "x", label: "X" },
    ]);
    function KeyApp() {
      useKeyboardSwitches(scanner, { Space: "scan" });
      return null;
    }
    render(<KeyApp />);
    act(() => scanner.start());
    const previousVisibility = document.visibilityState;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: previousVisibility,
      });
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    });
    expect(fixture.activations).toEqual([]);
  });
});
