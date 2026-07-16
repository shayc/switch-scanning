import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScanner } from "../../core/index.ts";
import {
  SwitchScanner,
  autoScan,
  inverseScan,
  stepScan,
  useScanGroup,
  useScannerCommands,
  useScannerSnapshot,
  useScanTarget,
  useSwitch,
} from "../index.ts";
import { ScannerProvider } from "../ScannerProvider.tsx";
import { compileSwitchScannerInput } from "./SwitchScanner.tsx";

afterEach(cleanup);

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function pressKey(code: string): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }),
  );
  document.dispatchEvent(
    new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true }),
  );
}

function pointerEvent(type: string, pointerId: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: "touch" },
    button: { value: 0 },
  });
  return event;
}

function Target({
  label,
  onActivate,
}: {
  label: string;
  onActivate?: () => void;
}) {
  const scan = useScanTarget({ label });
  return (
    <button {...scan} onClick={onActivate}>
      {label}
    </button>
  );
}

describe("declarative React surface", () => {
  it("maps keys directly to actions and starts on the first input", async () => {
    const activated = vi.fn();
    const view = render(
      <SwitchScanner
        method={stepScan()}
        keyboard={{ Space: "next", Enter: "select" }}
      >
        <Target label="Yes" />
        <Target label="No" onActivate={activated} />
      </SwitchScanner>,
    );
    await flushMicrotasks();

    act(() => pressKey("Space"));
    expect(view.getByText("Yes").getAttribute("data-scan-highlighted")).toBe(
      "",
    );

    act(() => pressKey("Space"));
    expect(view.getByText("No").getAttribute("data-scan-highlighted")).toBe("");

    act(() => pressKey("Enter"));
    expect(activated).toHaveBeenCalledOnce();
  });

  it("spreads target and group bindings directly onto existing elements", async () => {
    function GroupedTargets() {
      const group = useScanGroup({ label: "Answers", exitLabel: "Back" });
      return (
        <section {...group} aria-label="Answers">
          <Target label="Yes" />
        </section>
      );
    }

    const view = render(
      <SwitchScanner method={stepScan()} start="manual">
        <GroupedTargets />
      </SwitchScanner>,
    );
    await flushMicrotasks();

    expect(view.getByLabelText("Answers").getAttribute("data-scan-group")).toBe(
      "",
    );
    expect(view.getByText("Yes").getAttribute("data-scan-target")).toBe("");
  });

  it("offers small context commands and a direct pointer switch binding", async () => {
    const activated = vi.fn();

    function Controls() {
      const scanner = useScannerCommands();
      const status = useScannerSnapshot((snapshot) => snapshot.status);
      const select = useSwitch("select");
      return (
        <>
          <output>{status}</output>
          <button onClick={scanner.start}>Start</button>
          <button {...select}>Select</button>
        </>
      );
    }

    const view = render(
      <SwitchScanner method={stepScan()} start="manual">
        <Target label="Yes" onActivate={activated} />
        <Controls />
      </SwitchScanner>,
    );
    await flushMicrotasks();

    act(() => view.getByText("Start").click());
    expect(view.getByText("scanning")).toBeTruthy();

    const surface = view.getByText("Select");
    act(() => {
      surface.dispatchEvent(pointerEvent("pointerdown", 1));
      surface.dispatchEvent(pointerEvent("pointerup", 1));
    });
    expect(activated).toHaveBeenCalledOnce();
  });
});

describe("declarative method helpers", () => {
  it("rejects a shared keyboard identity with conflicting gestures", () => {
    expect(() =>
      compileSwitchScannerInput({
        Space: { id: "primary", action: "next" },
        Enter: { id: "primary", action: "select" },
      }),
    ).toThrow(/conflicting gesture definitions/);
  });

  it("rejects invalid passes values naming the passes field", () => {
    expect(() => autoScan({ intervalMs: 800, passes: 0 })).toThrow(
      /passes must be "infinite" or a positive integer/,
    );
    expect(() => inverseScan({ intervalMs: 800, passes: 1.5 })).toThrow(
      /passes/,
    );
  });
});

describe("switch compilation safety", () => {
  it("registers only the switches the app actually binds", () => {
    const compiled = compileSwitchScannerInput({ Space: "select" });
    expect(Object.keys(compiled.switches)).toEqual(["action:select"]);
  });

  it("accepts a shared identity whose gestures differ only in property order", () => {
    expect(() =>
      compileSwitchScannerInput({
        Space: {
          id: "primary",
          tap: "next",
          hold: { afterMs: 700, action: "select" },
        },
        Enter: {
          id: "primary",
          hold: { afterMs: 700, action: "select" },
          tap: "next",
        },
      }),
    ).not.toThrow();
  });

  it("rejects user ids inside the reserved namespaces", () => {
    expect(() =>
      compileSwitchScannerInput({
        Space: { id: "action:next", action: "next" },
      }),
    ).toThrow(/reserved "action:" namespace/);
  });
});

describe("declarative safety behavior", () => {
  it('keeps the default group Exit and warns when "back-only" has no back control', async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <SwitchScanner
        method={stepScan()}
        keyboard={{ Space: "next" }}
        behavior={{ groupExit: "back-only" }}
      >
        <Target label="Yes" />
      </SwitchScanner>,
    );
    await flushMicrotasks();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("back-only-unbound"),
    );
    warn.mockRestore();
  });

  it('applies "back-only" without warning once a back control is bound', async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    function BackSurface() {
      const back = useSwitch("back");
      return <button {...back}>Back</button>;
    }

    render(
      <SwitchScanner
        method={stepScan()}
        keyboard={{ Space: "next" }}
        behavior={{ groupExit: "back-only" }}
      >
        <Target label="Yes" />
        <BackSurface />
      </SwitchScanner>,
    );
    await flushMicrotasks();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("back-only-unbound"),
    );
    warn.mockRestore();
  });

  it('warns when the phaseful "scan" action is bound under a discrete method', async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <SwitchScanner method={stepScan()} keyboard={{ Space: "scan" }}>
        <Target label="Yes" />
      </SwitchScanner>,
    );
    await flushMicrotasks();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("scan-action-ignored"),
    );
    warn.mockRestore();
  });
});

describe("useSwitch", () => {
  it("drives a tap/hold gesture from an on-screen switch surface", async () => {
    function GestureSurface() {
      const primary = useSwitch({
        tap: "next",
        hold: { afterMs: 700, action: "select" },
      });
      return <button {...primary}>Primary</button>;
    }

    function StartControl() {
      const scanner = useScannerCommands();
      return <button onClick={scanner.start}>Start</button>;
    }

    const view = render(
      <SwitchScanner method={stepScan()} start="manual">
        <Target label="Yes" />
        <Target label="No" />
        <GestureSurface />
        <StartControl />
      </SwitchScanner>,
    );
    await flushMicrotasks();

    act(() => view.getByText("Start").click());
    expect(view.getByText("Yes").getAttribute("data-scan-highlighted")).toBe(
      "",
    );

    const surface = view.getByText("Primary");
    act(() => {
      surface.dispatchEvent(pointerEvent("pointerdown", 1));
      surface.dispatchEvent(pointerEvent("pointerup", 1));
    });
    expect(view.getByText("No").getAttribute("data-scan-highlighted")).toBe("");
  });

  it("fails loudly outside <SwitchScanner>, including under an advanced provider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    function SelectSurface() {
      const select = useSwitch("select");
      return <button {...select}>Select</button>;
    }

    const scanner = createScanner({ method: stepScan(), startOn: "manual" });
    expect(() =>
      render(
        <ScannerProvider scanner={scanner}>
          <SelectSurface />
        </ScannerProvider>,
      ),
    ).toThrow(/inside <SwitchScanner>/);
    error.mockRestore();
  });
});
