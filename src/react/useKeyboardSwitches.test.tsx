import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createScanner,
  inverseScan,
  manualClock,
  stepScan,
} from "../core/index.ts";
import { ScannerProvider } from "./ScannerProvider.tsx";
import { useKeyboardSwitches } from "./useKeyboardSwitches.ts";
import { useScanner } from "./useScanner.ts";
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
    <button {...target.props} onClick={onActivate}>
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
      const scanner = useScanner({
        style: stepScan(),
        startOn: "switch",
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
      style: inverseScan({ intervalMs: 1000, loops: "infinite" }),
      startOn: "command",
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
});
