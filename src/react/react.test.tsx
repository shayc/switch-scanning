import { act, cleanup, render } from "@testing-library/react";
import { createRef, StrictMode, useEffect, type Ref } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createScanner, manualClock, type ManualClock } from "../core/index.ts";
import { autoScan, stepScan } from "../core/index.ts";
import {
  createScannerFixture,
  recordScannerEvents,
} from "../core/testing/index.ts";
import { ScannerProvider } from "./ScannerProvider.tsx";
import { useScanGroup } from "./useScanGroup.ts";
import { useScanner } from "./useScanner.ts";
import { useScannerSnapshot } from "./useScannerSnapshot.ts";
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

/**
 * A harness that exposes the scanner so we can drive commands and assert
 * imperative DOM attributes.
 */
function Harness({
  clock,
  onReady,
  grouped = false,
}: {
  clock: ManualClock;
  onReady: (scanner: ReturnType<typeof useScanner>) => void;
  grouped?: boolean;
}) {
  const scanner = useScanner({
    style: grouped ? stepScan() : autoScan({ intervalMs: 1000, loops: 3 }),
    startOn: "command",
    switches: { select: { action: "select" }, next: { action: "next" } },
    clock,
  });
  onReady(scanner);
  return (
    <ScannerProvider scanner={scanner}>
      {grouped ? (
        <Row />
      ) : (
        <>
          <TargetButton id="yes" label="Yes" />
          <TargetButton id="no" label="No" />
        </>
      )}
    </ScannerProvider>
  );
}

function Row() {
  const group = useScanGroup({ id: "row1", label: "Row 1", exitLabel: "Back" });
  return (
    <div {...group.props}>
      <TargetButton id="a" label="A" />
      <TargetButton id="b" label="B" />
    </div>
  );
}

describe("imperative driving", () => {
  it("writes data-scan-highlighted imperatively and follows the interval", async () => {
    const clock = manualClock();
    let scanner!: ReturnType<typeof useScanner>;
    const view = render(
      <Harness clock={clock} onReady={(s) => (scanner = s)} />,
    );
    await flushMicrotasks();

    act(() => scanner.start());
    expect(view.getByText("Yes").getAttribute("data-scan-highlighted")).toBe(
      "",
    );
    expect(view.getByText("No").hasAttribute("data-scan-highlighted")).toBe(
      false,
    );

    act(() => clock.advanceBy(1000));
    expect(view.getByText("Yes").hasAttribute("data-scan-highlighted")).toBe(
      false,
    );
    expect(view.getByText("No").getAttribute("data-scan-highlighted")).toBe("");
  });

  it("derives group structure from DOM containment and exposes an exit", async () => {
    const clock = manualClock();
    let scanner!: ReturnType<typeof useScanner>;
    const view = render(
      <Harness clock={clock} grouped onReady={(s) => (scanner = s)} />,
    );
    await flushMicrotasks();

    act(() => scanner.start());
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "group",
      id: "row1",
    });
    act(() => scanner.select());
    expect(scanner.getSnapshot().path).toEqual(["row1"]);
    expect(view.getByText("A").getAttribute("data-scan-highlighted")).toBe("");
    expect(
      view
        .getByText("A")
        .closest("[data-scan-group]")
        ?.getAttribute("data-scan-within"),
    ).toBe("");
  });

  it("follows a replacement scanner through provider context", async () => {
    const first = createScanner({ style: stepScan(), startOn: "command" });
    const second = createScanner({ style: stepScan(), startOn: "command" });

    function Status() {
      const status = useScannerSnapshot((snapshot) => snapshot.status);
      return <output>{status}</output>;
    }

    const app = (scanner: typeof first) => (
      <ScannerProvider scanner={scanner}>
        <TargetButton id="x" label="X" />
        <Status />
      </ScannerProvider>
    );

    const view = render(app(first));
    await flushMicrotasks();
    view.rerender(app(second));
    await flushMicrotasks();
    act(() => second.start());
    expect(view.getByText("scanning")).toBeTruthy();
  });

  it("reconciles when the target disabled option changes", async () => {
    const scanner = createScanner({ style: stepScan(), startOn: "command" });

    function DisabledTarget({ disabled }: { disabled: boolean }) {
      const target = useScanTarget({ id: "x", label: "X", disabled });
      return (
        <button {...target.props} disabled={disabled}>
          X
        </button>
      );
    }

    const app = (disabled: boolean) => (
      <ScannerProvider scanner={scanner}>
        <DisabledTarget disabled={disabled} />
        <TargetButton id="y" label="Y" />
      </ScannerProvider>
    );

    const view = render(app(false));
    await flushMicrotasks();
    act(() => scanner.start());
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "x",
    });

    view.rerender(app(true));
    await flushMicrotasks();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "y",
    });
  });
});

describe("clearing decorations on exit", () => {
  it("removes highlight decorations when the scanner stops", async () => {
    const clock = manualClock();
    let scanner!: ReturnType<typeof useScanner>;
    const view = render(
      <Harness clock={clock} onReady={(s) => (scanner = s)} />,
    );
    await flushMicrotasks();

    act(() => scanner.start());
    expect(view.getByText("Yes").getAttribute("data-scan-highlighted")).toBe(
      "",
    );

    act(() => scanner.stop());
    expect(document.querySelector("[data-scan-highlighted]")).toBeNull();
  });

  it("removes highlight decorations when a timed scan completes", async () => {
    const clock = manualClock();
    let scanner!: ReturnType<typeof useScanner>;
    render(<Harness clock={clock} onReady={(s) => (scanner = s)} />);
    await flushMicrotasks();

    act(() => scanner.start());
    act(() => {
      // Exhaust the loop budget so the scan completes.
      for (
        let i = 0;
        i < 20 && scanner.getSnapshot().status === "scanning";
        i++
      ) {
        clock.advanceBy(1000);
      }
    });
    expect(scanner.getSnapshot().status).toBe("complete");
    expect(document.querySelector("[data-scan-highlighted]")).toBeNull();
  });

  it("retains the highlight decoration while paused", async () => {
    const clock = manualClock();
    let scanner!: ReturnType<typeof useScanner>;
    const view = render(
      <Harness clock={clock} onReady={(s) => (scanner = s)} />,
    );
    await flushMicrotasks();

    act(() => scanner.start());
    act(() => scanner.pause());
    expect(view.getByText("Yes").getAttribute("data-scan-highlighted")).toBe(
      "",
    );
  });
});

describe("forwarded refs", () => {
  it("moves target ownership when the forwarded ref changes", () => {
    const first = createRef<HTMLElement>();
    const second = createRef<HTMLElement>();
    const scanner = createScanner({ style: stepScan() });

    function RefTarget({ forwardedRef }: { forwardedRef: Ref<HTMLElement> }) {
      const target = useScanTarget({ id: "x", label: "X", ref: forwardedRef });
      return <button {...target.props}>X</button>;
    }

    const app = (forwardedRef: Ref<HTMLElement>) => (
      <ScannerProvider scanner={scanner}>
        <RefTarget forwardedRef={forwardedRef} />
      </ScannerProvider>
    );
    const view = render(app(first));
    expect(first.current?.textContent).toBe("X");

    view.rerender(app(second));
    expect(first.current).toBeNull();
    expect(second.current?.textContent).toBe("X");
  });

  it("moves registry identity when a target ID changes", async () => {
    const scanner = createScanner({ style: stepScan(), startOn: "command" });
    function DynamicTarget({ id }: { id: string }) {
      const target = useScanTarget({ id, label: id.toUpperCase() });
      return <button {...target.props}>{id}</button>;
    }
    const app = (id: string) => (
      <ScannerProvider scanner={scanner}>
        <DynamicTarget id={id} />
      </ScannerProvider>
    );
    const view = render(app("first"));
    await flushMicrotasks();
    view.rerender(app("second"));
    await flushMicrotasks();
    act(() => scanner.start());
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "second",
    });
  });

  it("leaves no phantom registration after callback-ref unmount", async () => {
    const scanner = createScanner({ style: stepScan(), startOn: "command" });
    function App({ show }: { show: boolean }) {
      return (
        <ScannerProvider scanner={scanner}>
          {show ? <TargetButton id="x" label="X" /> : null}
        </ScannerProvider>
      );
    }
    const view = render(<App show />);
    await flushMicrotasks();
    view.rerender(<App show={false} />);
    await flushMicrotasks();
    act(() => scanner.start());
    expect(scanner.getSnapshot()).toMatchObject({
      status: "complete",
      highlight: null,
      position: null,
    });
  });
});

describe("unmount cleanup", () => {
  it("stops a provider-less scanner and cancels its timers on unmount", () => {
    const clock = manualClock();
    let scanner!: ReturnType<typeof useScanner>;

    function Headless({ onReady }: { onReady: (s: typeof scanner) => void }) {
      const current = useScanner({
        style: autoScan({ intervalMs: 1000, loops: 3 }),
        startOn: "command",
        clock,
      });
      onReady(current);
      return null;
    }

    const view = render(<Headless onReady={(s) => (scanner = s)} />);
    const fixture = createScannerFixture(scanner, [
      { kind: "target", id: "yes", label: "Yes" },
      { kind: "target", id: "no", label: "No" },
    ]);

    act(() => scanner.start());
    expect(scanner.getSnapshot().status).toBe("scanning");
    expect(clock.pending).toBeGreaterThan(0);

    view.unmount();
    expect(scanner.getSnapshot().status).toBe("idle");
    expect(clock.pending).toBe(0);

    fixture.dispose();
  });

  it("emits no scan.stopped when the scanner is already idle at unmount", () => {
    let scanner!: ReturnType<typeof useScanner>;

    function Headless({ onReady }: { onReady: (s: typeof scanner) => void }) {
      const current = useScanner({ style: stepScan(), startOn: "command" });
      onReady(current);
      return null;
    }

    const view = render(<Headless onReady={(s) => (scanner = s)} />);
    const recorded = recordScannerEvents(scanner);

    view.unmount();
    expect(recorded.ofType("scan.stopped")).toHaveLength(0);
    recorded.stop();
  });
});

describe("Strict Mode", () => {
  it("survives the extra setup/cleanup/setup cycle without disposing", async () => {
    const clock = manualClock();
    let scanner!: ReturnType<typeof useScanner>;

    render(
      <StrictMode>
        <Harness clock={clock} onReady={(s) => (scanner = s)} />
      </StrictMode>,
    );
    await flushMicrotasks();

    act(() => scanner.start());
    expect(scanner.getSnapshot().status).toBe("scanning");
    act(() => clock.advanceBy(1000));
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "no",
    });
  });

  it("reapplies mount startup after the extra attachment cycle", async () => {
    const clock = manualClock();
    let scanner!: ReturnType<typeof useScanner>;

    function MountApp() {
      const current = useScanner({
        style: stepScan(),
        startOn: "mount",
        clock,
      });
      useEffect(() => {
        scanner = current;
      }, [current]);
      return (
        <ScannerProvider scanner={current}>
          <TargetButton id="x" label="X" />
        </ScannerProvider>
      );
    }

    render(
      <StrictMode>
        <MountApp />
      </StrictMode>,
    );
    await flushMicrotasks();
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { kind: "target", id: "x" },
    });
  });
});
