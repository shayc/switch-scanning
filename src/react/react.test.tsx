import { act, cleanup, render } from "@testing-library/react";
import { createRef, StrictMode, useEffect, type Ref } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createScanner,
  inverseScan,
  manualClock,
  type ManualClock,
} from "../core/index.ts";
import { autoScan, stepScan } from "../core/index.ts";
import { ScannerProvider } from "./ScannerProvider.tsx";
import { ScanRegistry } from "./registry.ts";
import { useKeyboardSwitches } from "./useKeyboardSwitches.ts";
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

    // First keydown starts scanning (consumed).
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    });
    // Advance to Y.
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    });
    // Select Y.
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

describe("registry ownership", () => {
  it("does not let stale cleanup remove a newer registration", () => {
    const registry = new ScanRegistry();
    const element = document.createElement("button");
    const firstCleanup = registry.mountTarget(
      "x",
      () => ({ id: "x", label: "First" }),
      element,
    );
    registry.mountTarget("x", () => ({ id: "x", label: "Second" }), element);
    firstCleanup();
    expect(registry.getTarget("x")?.getOptions().label).toBe("Second");
  });

  it("keeps the synthetic root outside the user ID namespace", () => {
    const registry = new ScanRegistry();
    const scanner = createScanner({ style: stepScan(), startOn: "command" });
    const group = document.createElement("div");
    const target = document.createElement("button");

    registry.attach(scanner);
    registry.mountGroup(
      "__root__",
      () => ({ id: "__root__", label: "User root" }),
      group,
    );
    registry.mountTarget(
      "inside",
      () => ({ id: "inside", label: "Inside", groupId: "__root__" }),
      target,
    );
    registry.flush();
    scanner.start();

    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "group",
      id: "__root__",
    });
  });

  it("rejects IDs shared by a target and group", () => {
    const registry = new ScanRegistry();
    const element = document.createElement("button");
    registry.mountTarget(
      "shared",
      () => ({ id: "shared", label: "Target" }),
      element,
    );

    expect(() =>
      registry.mountGroup(
        "shared",
        () => ({ id: "shared", label: "Group" }),
        element,
      ),
    ).toThrow('duplicate scan node id "shared"');
  });

  it("rejects cycles in explicit group parentage", () => {
    const registry = new ScanRegistry();
    registry.mountGroup(
      "a",
      () => ({ id: "a", label: "A", parentId: "b" }),
      null,
    );
    registry.mountGroup(
      "b",
      () => ({ id: "b", label: "B", parentId: "a" }),
      null,
    );
    registry.attach(createScanner({ style: stepScan() }));

    expect(() => registry.flush()).toThrow(
      "cyclic scan group parentage: a -> b -> a",
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
