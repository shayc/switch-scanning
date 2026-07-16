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
      method: stepScan(),
      startOn: "manual",
      switches: { select: { action: "select", performOn: "release" } },
    });
    const fixture = createScannerFixture(scanner, [
      { kind: "target", id: "yes", label: "Yes" },
    ]);

    function Surface() {
      const binding = usePointerSwitch(scanner, { switchId: "select" });
      return <button {...binding}>Switch</button>;
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

  it("suppresses generated pointer clicks only while enabled", () => {
    const scanner = createScanner({ method: stepScan() });
    let clicks = 0;
    function Surface({ enabled = true }: { enabled?: boolean }) {
      const binding = usePointerSwitch(scanner, {
        switchId: "unused",
        enabled,
      });
      return (
        <button {...binding} onClick={() => clicks++}>
          Switch
        </button>
      );
    }
    const view = render(<Surface />);
    const surface = view.getByText("Switch");
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

    view.rerender(<Surface enabled={false} />);
    const passThrough = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    act(() => {
      surface.dispatchEvent(passThrough);
    });
    expect(passThrough.defaultPrevented).toBe(false);
    expect(clicks).toBe(2);
  });

  it("maps non-repeating Space and Enter key contacts to press and release", () => {
    const scanner = createScanner({
      method: stepScan(),
      startOn: "manual",
      switches: { select: { action: "select", performOn: "release" } },
    });
    const fixture = createScannerFixture(scanner, [
      { kind: "target", id: "yes", label: "Yes" },
    ]);
    function Surface() {
      const binding = usePointerSwitch(scanner, { switchId: "select" });
      return <button {...binding}>Switch</button>;
    }
    const surface = render(<Surface />).getByText("Switch");
    act(() => scanner.start());

    const down = new KeyboardEvent("keydown", {
      code: "Space",
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      surface.dispatchEvent(down);
      surface.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          key: " ",
          repeat: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(down.defaultPrevented).toBe(true);
    expect(fixture.activations).toEqual([]);
    act(() => {
      surface.dispatchEvent(
        new KeyboardEvent("keyup", {
          code: "Space",
          key: " ",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(fixture.activations).toEqual(["yes"]);

    act(() => {
      surface.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Enter",
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      surface.dispatchEvent(
        new KeyboardEvent("keyup", {
          code: "Enter",
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(fixture.activations).toEqual(["yes", "yes"]);
  });

  it("quarantines a keyboard contact after blur until its real keyup", () => {
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
    function Surface() {
      const binding = usePointerSwitch(scanner, { switchId: "next" });
      return <button {...binding}>Switch</button>;
    }
    const surface = render(<Surface />).getByText("Switch");
    act(() => scanner.start());

    const key = (type: "keydown" | "keyup") =>
      new KeyboardEvent(type, {
        code: "Space",
        key: " ",
        bubbles: true,
        cancelable: true,
      });
    act(() => {
      surface.dispatchEvent(key("keydown"));
    });
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "b" });

    const refired = key("keydown");
    act(() => {
      window.dispatchEvent(new Event("blur"));
      surface.dispatchEvent(refired);
    });
    expect(refired.defaultPrevented).toBe(true);
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "b" });

    act(() => {
      surface.dispatchEvent(key("keyup"));
      surface.dispatchEvent(key("keydown"));
    });
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "c" });
  });

  it("does not wedge the next element when a contact is held across an element swap", () => {
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
    function Surface({ slot }: { slot: string }) {
      const binding = usePointerSwitch(scanner, { switchId: "next" });
      return (
        <button key={slot} {...binding}>
          Switch
        </button>
      );
    }

    const view = render(<Surface slot="first" />);
    act(() => scanner.start());
    // Hold a contact on the first element (advancing to b), then swap the
    // element under it. No pointerup/pointercancel can reach the removed
    // element to clear the stale id.
    act(() => {
      view.getByText("Switch").dispatchEvent(pointerEvent("pointerdown", 1));
    });
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "b" });
    view.rerender(<Surface slot="second" />);

    // A fresh contact on the new element must still register a press. A stale
    // id would keep `size === 1` from holding, pinning the highlight at b.
    const swapped = view.getByText("Switch");
    act(() => {
      swapped.dispatchEvent(pointerEvent("pointerdown", 2));
      swapped.dispatchEvent(pointerEvent("pointerup", 2));
    });
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "c" });
  });

  it("releases a fallback key when its key-up is delivered away from the surface", () => {
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
    function Surface() {
      const binding = usePointerSwitch(scanner, { switchId: "next" });
      return <button {...binding}>Switch</button>;
    }
    const surface = render(<Surface />).getByText("Switch");
    act(() => scanner.start());

    const spaceKey = (type: "keydown" | "keyup") =>
      new KeyboardEvent(type, {
        code: "Space",
        key: " ",
        bubbles: true,
        cancelable: true,
      });
    act(() => {
      surface.dispatchEvent(spaceKey("keydown"));
    });
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "b" });

    // Focus moved mid-hold (e.g. the activation opened a dialog), so the key-up
    // lands on the document rather than the surface.
    act(() => {
      document.dispatchEvent(spaceKey("keyup"));
    });

    // The fallback key must not be stuck down: a fresh press advances again.
    act(() => {
      surface.dispatchEvent(spaceKey("keydown"));
    });
    expect(scanner.getSnapshot().highlight).toMatchObject({ id: "c" });
  });

  it("ignores disabled/right-button input and disconnects cancelled contacts", () => {
    const scanner = createScanner({
      method: stepScan(),
      startOn: "manual",
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
      return <button {...binding}>Switch</button>;
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
      surface.dispatchEvent(pointerEvent("pointerdown", 4));
      surface.dispatchEvent(pointerEvent("pointerup", 4));
    });
    expect(fixture.activations).toEqual([]);
  });

  it("disconnects on lost capture and hidden visibility", () => {
    const scanner = createScanner({
      method: stepScan(),
      startOn: "manual",
      switches: { next: { action: "next" } },
    });
    const fixture = createScannerFixture(scanner, [
      { kind: "target", id: "yes", label: "Yes" },
      { kind: "target", id: "no", label: "No" },
    ]);

    function Surface() {
      const binding = usePointerSwitch(scanner, { switchId: "next" });
      return <button {...binding}>Switch</button>;
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
      method: stepScan(),
      startOn: "manual",
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
      return <button {...binding}>Switch</button>;
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
