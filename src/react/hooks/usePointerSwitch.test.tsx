import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createScanner, stepScan } from "../../core/index.ts";
import { createScannerFixture } from "../../core/testing/index.ts";
import { usePointerSwitch } from "./usePointerSwitch.ts";

afterEach(cleanup);

function pointerEvent(
  type: string,
  pointerId: number,
  pointerType = "touch",
  button = 0,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
    button: { value: button },
  });
  return event;
}

describe("pointer switch surface", () => {
  it("coalesces contacts and releases on the final pointer", () => {
    const scanner = createScanner({
      style: stepScan(),
      startOn: "command",
      switches: { select: { action: "select", performOn: "release" } },
    });
    const fixture = createScannerFixture(scanner, [
      { kind: "target", id: "yes", label: "Yes" },
    ]);

    function Surface() {
      const binding = usePointerSwitch(scanner, { switchId: "select" });
      return <button {...binding.props}>Switch</button>;
    }

    const view = render(<Surface />);
    const surface = view.getByText("Switch");
    act(() => scanner.start());
    act(() => {
      surface.dispatchEvent(pointerEvent("pointerdown", 1));
      surface.dispatchEvent(pointerEvent("pointerdown", 2));
      surface.dispatchEvent(pointerEvent("pointerup", 1));
    });
    expect(fixture.activations).toEqual([]);
    act(() => {
      surface.dispatchEvent(pointerEvent("pointerup", 2));
    });
    expect(fixture.activations).toEqual(["yes"]);
  });

  it("suppresses generated pointer clicks but permits programmatic clicks", () => {
    const scanner = createScanner({ style: stepScan() });
    let clicks = 0;
    function Surface() {
      const binding = usePointerSwitch(scanner, { switchId: "unused" });
      return (
        <button {...binding.props} onClick={() => clicks++}>
          Switch
        </button>
      );
    }
    const surface = render(<Surface />).getByText("Switch");
    const generated = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    act(() => {
      surface.dispatchEvent(generated);
    });
    expect(generated.defaultPrevented).toBe(true);
    expect(clicks).toBe(0);

    act(() => surface.click());
    expect(clicks).toBe(1);
  });

  it("ignores disabled/right-button input and disconnects cancelled contacts", () => {
    const scanner = createScanner({
      style: stepScan(),
      startOn: "command",
      switches: { select: { action: "select", performOn: "release" } },
    });
    const fixture = createScannerFixture(scanner, [
      { kind: "target", id: "yes", label: "Yes" },
    ]);

    function Surface({ enabled }: { enabled: boolean }) {
      const binding = usePointerSwitch(scanner, {
        switchId: "select",
        enabled,
      });
      return <button {...binding.props}>Switch</button>;
    }

    const view = render(<Surface enabled={false} />);
    const surface = view.getByText("Switch");
    act(() => scanner.start());
    act(() => {
      surface.dispatchEvent(pointerEvent("pointerdown", 1));
      surface.dispatchEvent(pointerEvent("pointerup", 1));
    });
    expect(fixture.activations).toEqual([]);

    view.rerender(<Surface enabled />);
    act(() => {
      surface.dispatchEvent(pointerEvent("pointerdown", 2, "mouse", 2));
      surface.dispatchEvent(pointerEvent("pointerup", 2, "mouse", 2));
      surface.dispatchEvent(pointerEvent("pointerdown", 3));
      surface.dispatchEvent(pointerEvent("pointercancel", 3));
      surface.dispatchEvent(pointerEvent("pointerdown", 4));
      window.dispatchEvent(new Event("blur"));
      surface.dispatchEvent(pointerEvent("pointerup", 4));
    });
    expect(fixture.activations).toEqual([]);
  });

  it("disconnects on lost capture and hidden visibility", () => {
    const scanner = createScanner({
      style: stepScan(),
      startOn: "command",
      switches: { next: { action: "next" } },
    });
    const fixture = createScannerFixture(scanner, [
      { kind: "target", id: "yes", label: "Yes" },
      { kind: "target", id: "no", label: "No" },
    ]);

    function Surface() {
      const binding = usePointerSwitch(scanner, { switchId: "next" });
      return <button {...binding.props}>Switch</button>;
    }

    const surface = render(<Surface />).getByText("Switch");
    act(() => scanner.start());

    // An event without pointerType exercises the browser-compatible mouse
    // fallback; a primary button is still accepted.
    const fallbackMouse = new Event("pointerdown", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperties(fallbackMouse, {
      pointerId: { value: 5 },
      button: { value: 0 },
    });
    act(() => {
      surface.dispatchEvent(fallbackMouse);
      surface.dispatchEvent(pointerEvent("lostpointercapture", 5));
      surface.dispatchEvent(pointerEvent("lostpointercapture", 99));
      surface.dispatchEvent(pointerEvent("pointerup", 5));
    });
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "no" });

    const previousVisibility = document.visibilityState;
    act(() => {
      surface.dispatchEvent(pointerEvent("pointerdown", 6));
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: previousVisibility,
      });
      surface.dispatchEvent(pointerEvent("pointerup", 6));
    });
    expect(fixture.activations).toEqual([]);

    // The disconnect cleared contact 6, so a fresh contact is accepted.
    act(() => {
      surface.dispatchEvent(pointerEvent("pointerdown", 7));
      surface.dispatchEvent(pointerEvent("pointerup", 7));
    });
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "no" });
  });

  it("uses the surface owner document for lifecycle cleanup", () => {
    const scanner = createScanner({
      style: stepScan(),
      startOn: "command",
      switches: { select: { action: "select", performOn: "release" } },
    });
    const fixture = createScannerFixture(scanner, [
      { kind: "target", id: "yes", label: "Yes" },
    ]);
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const ownerDocument = iframe.contentDocument!;
    const ownerWindow = iframe.contentWindow!;

    function Surface() {
      const binding = usePointerSwitch(scanner, { switchId: "select" });
      return <button {...binding.props}>Switch</button>;
    }

    const view = render(<Surface />, { container: ownerDocument.body });
    const surface = view.getByText("Switch");
    act(() => scanner.start());

    act(() => {
      surface.dispatchEvent(pointerEvent("pointerdown", 1));
      window.dispatchEvent(new Event("blur"));
      surface.dispatchEvent(pointerEvent("pointerup", 1));
    });
    expect(fixture.activations).toEqual(["yes"]);

    act(() => {
      surface.dispatchEvent(pointerEvent("pointerdown", 2));
      ownerWindow.dispatchEvent(new Event("blur"));
      surface.dispatchEvent(pointerEvent("pointerup", 2));
    });
    expect(fixture.activations).toEqual(["yes"]);

    view.unmount();
    iframe.remove();
  });
});
