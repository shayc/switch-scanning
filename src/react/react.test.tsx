import { act, cleanup, render } from "@testing-library/react";
import { createRef, StrictMode, useEffect, type Ref } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScanner, manualClock, type ManualClock } from "../core/index.ts";
import { autoScan, stepScan } from "../core/index.ts";
import {
  createScannerFixture,
  recordScannerEvents,
} from "../core/testing/index.ts";
import { ScannerProvider } from "./ScannerProvider.tsx";
import { useScanGroup } from "./hooks/useScanGroup.ts";
import { useOwnedScanner } from "./hooks/useOwnedScanner.ts";
import { useScannerSnapshot } from "./hooks/useScannerSnapshot.ts";
import { useScanTarget } from "./hooks/useScanTarget.ts";

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
  onReady: (scanner: ReturnType<typeof useOwnedScanner>) => void;
  grouped?: boolean;
}) {
  const scanner = useOwnedScanner({
    method: grouped ? stepScan() : autoScan({ intervalMs: 1000, passes: 3 }),
    startOn: "manual",
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
    <div {...group}>
      <TargetButton id="a" label="A" />
      <TargetButton id="b" label="B" />
    </div>
  );
}

describe("imperative driving", () => {
  it("writes data-scan-highlighted imperatively and follows the interval", async () => {
    const clock = manualClock();
    let scanner!: ReturnType<typeof useOwnedScanner>;
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
    let scanner!: ReturnType<typeof useOwnedScanner>;
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
    const first = createScanner({ method: stepScan(), startOn: "manual" });
    const second = createScanner({ method: stepScan(), startOn: "manual" });

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
    const scanner = createScanner({ method: stepScan(), startOn: "manual" });

    function DisabledTarget({ disabled }: { disabled: boolean }) {
      const target = useScanTarget({ id: "x", label: "X", disabled });
      return (
        <button {...target} disabled={disabled}>
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

describe("keyed DOM reorder", () => {
  it("updates target traversal order after keyed siblings move", async () => {
    const scanner = createScanner({ method: stepScan(), startOn: "manual" });

    function Targets({ ids }: { ids: readonly string[] }) {
      return ids.map((id) => <TargetButton key={id} id={id} label={id} />);
    }

    const app = (ids: readonly string[]) => (
      <ScannerProvider scanner={scanner}>
        <Targets ids={ids} />
      </ScannerProvider>
    );
    const view = render(app(["a", "b"]));
    await flushMicrotasks();
    act(() => scanner.start());
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "a",
    });

    view.rerender(app(["b", "a"]));
    await flushMicrotasks();
    act(() => scanner.restart());
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "b",
    });
    act(() => scanner.next());
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "target",
      id: "a",
    });
  });

  it("updates group traversal order after keyed group elements move", async () => {
    const scanner = createScanner({ method: stepScan(), startOn: "manual" });

    function Group({ id }: { id: string }) {
      const group = useScanGroup({ id, label: id });
      return (
        <section {...group}>
          <TargetButton id={`${id}-target`} label={`${id} target`} />
        </section>
      );
    }

    function Groups({ ids }: { ids: readonly string[] }) {
      return ids.map((id) => <Group key={id} id={id} />);
    }

    const app = (ids: readonly string[]) => (
      <ScannerProvider scanner={scanner}>
        <Groups ids={ids} />
      </ScannerProvider>
    );
    const view = render(app(["a", "b"]));
    await flushMicrotasks();
    act(() => scanner.start());
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "group",
      id: "a",
    });

    view.rerender(app(["b", "a"]));
    await flushMicrotasks();
    act(() => scanner.restart());
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "group",
      id: "b",
    });
    act(() => scanner.next());
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "group",
      id: "a",
    });
  });

  it("does not republish an unchanged tree across repeated renders", async () => {
    const scanner = createScanner({ method: stepScan(), startOn: "manual" });
    const app = () => (
      <ScannerProvider scanner={scanner}>
        <div>
          <TargetButton id="a" label="A" />
          <TargetButton id="b" label="B" />
        </div>
      </ScannerProvider>
    );
    const view = render(app());
    await flushMicrotasks();
    const setTree = vi.spyOn(scanner, "setTree");

    for (let renderCount = 1; renderCount <= 5; renderCount += 1) {
      view.rerender(app());
      await flushMicrotasks();
    }

    expect(setTree).not.toHaveBeenCalled();
  });
});

describe("snapshot selection", () => {
  it("recomputes when a selector closure changes without a scanner update", () => {
    const scanner = createScanner({ method: stepScan() });

    function SelectedStatus({ prefix }: { prefix: string }) {
      const selected = useScannerSnapshot(
        scanner,
        (snapshot) => `${prefix}:${snapshot.status}`,
      );
      return <output>{selected}</output>;
    }

    const view = render(<SelectedStatus prefix="first" />);
    expect(view.getByText("first:idle")).toBeTruthy();
    view.rerender(<SelectedStatus prefix="second" />);
    expect(view.getByText("second:idle")).toBeTruthy();
  });

  it("uses a custom isEqual to suppress equivalent selected objects", () => {
    const scanner = createScanner({ method: stepScan() });
    createScannerFixture(scanner, [
      { kind: "target", id: "a", label: "A" },
      { kind: "target", id: "b", label: "B" },
    ]);
    const isEqual = vi.fn(
      (a: { status: string }, b: { status: string }) => a.status === b.status,
    );
    const renders = vi.fn();

    function SelectedStatus() {
      useEffect(() => {
        renders();
      });
      const selected = useScannerSnapshot(
        scanner,
        (snapshot) => ({ status: snapshot.status }),
        isEqual,
      );
      return <output>{selected.status}</output>;
    }

    render(<SelectedStatus />);
    act(() => scanner.start());
    const afterStart = renders.mock.calls.length;
    act(() => scanner.next());

    expect(renders).toHaveBeenCalledTimes(afterStart);
    expect(isEqual).toHaveBeenCalled();
  });
});

describe("live useOwnedScanner options", () => {
  it("forwards committed behavior changes through setOptions", async () => {
    const onReady =
      vi.fn<(scanner: ReturnType<typeof useOwnedScanner>) => void>();

    function Headless({ intervalMs }: { intervalMs: number }) {
      const scanner = useOwnedScanner({
        method: autoScan({ intervalMs, passes: 2 }),
        startOn: "manual",
      });
      useEffect(() => onReady(scanner), [scanner]);
      return null;
    }

    const view = render(<Headless intervalMs={100} />);
    const scanner = onReady.mock.calls[0]![0];
    const setOptions = vi.spyOn(scanner, "setOptions");
    view.rerender(<Headless intervalMs={250} />);
    await flushMicrotasks();

    expect(setOptions).toHaveBeenCalledOnce();
    expect(setOptions.mock.calls[0]?.[0]).toMatchObject({
      method: { kind: "auto", intervalMs: 250 },
    });
  });
});

describe("provider host ownership", () => {
  it("keeps the owning provider attached when a second provider is rejected", async () => {
    const scanner = createScanner({ method: stepScan(), startOn: "manual" });

    function App({ showRejected }: { showRejected: boolean }) {
      return (
        <>
          <ScannerProvider key="owner" scanner={scanner}>
            <TargetButton id="owner" label="Owner" />
          </ScannerProvider>
          {showRejected ? (
            <ScannerProvider key="rejected" scanner={scanner}>
              <TargetButton id="rejected" label="Rejected" />
            </ScannerProvider>
          ) : null}
        </>
      );
    }

    const view = render(<App showRejected />);
    await flushMicrotasks();
    act(() => scanner.start());
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { kind: "target", id: "owner" },
    });

    view.rerender(<App showRejected={false} />);
    await flushMicrotasks();
    expect(scanner.getSnapshot()).toMatchObject({
      status: "scanning",
      highlight: { kind: "target", id: "owner" },
    });
  });
});

describe("clearing decorations on exit", () => {
  it("removes highlight decorations when the scanner stops", async () => {
    const clock = manualClock();
    let scanner!: ReturnType<typeof useOwnedScanner>;
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
    let scanner!: ReturnType<typeof useOwnedScanner>;
    render(<Harness clock={clock} onReady={(s) => (scanner = s)} />);
    await flushMicrotasks();

    act(() => scanner.start());
    act(() => {
      // Exhaust the pass budget so the scan completes.
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
    let scanner!: ReturnType<typeof useOwnedScanner>;
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
    const scanner = createScanner({ method: stepScan() });

    function RefTarget({ forwardedRef }: { forwardedRef: Ref<HTMLElement> }) {
      const target = useScanTarget({ id: "x", label: "X", ref: forwardedRef });
      return <button {...target}>X</button>;
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
    const scanner = createScanner({ method: stepScan(), startOn: "manual" });
    function DynamicTarget({ id }: { id: string }) {
      const target = useScanTarget({ id, label: id.toUpperCase() });
      return <button {...target}>{id}</button>;
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
    const scanner = createScanner({ method: stepScan(), startOn: "manual" });
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
    let scanner!: ReturnType<typeof useOwnedScanner>;

    function Headless({ onReady }: { onReady: (s: typeof scanner) => void }) {
      const current = useOwnedScanner({
        method: autoScan({ intervalMs: 1000, passes: 3 }),
        startOn: "manual",
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
    let scanner!: ReturnType<typeof useOwnedScanner>;

    function Headless({ onReady }: { onReady: (s: typeof scanner) => void }) {
      const current = useOwnedScanner({
        method: stepScan(),
        startOn: "manual",
      });
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
    let scanner!: ReturnType<typeof useOwnedScanner>;

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

  it("does not re-arm mount startup on the extra attachment cycle", async () => {
    const clock = manualClock();
    let scanner!: ReturnType<typeof useOwnedScanner>;

    function MountApp() {
      const current = useOwnedScanner({
        method: stepScan(),
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
    expect(scanner.getSnapshot()).toMatchObject({ status: "idle" });
  });
});
