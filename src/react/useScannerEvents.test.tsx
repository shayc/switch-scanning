import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScanner, stepScan, type ScannerEvent } from "../core/index.ts";
import { useScannerEvents } from "./useScannerEvents.ts";

afterEach(cleanup);

function Observer({
  scanner,
  listener,
}: {
  scanner: ReturnType<typeof createScanner>;
  listener: (event: ScannerEvent) => void;
}) {
  useScannerEvents(scanner, listener);
  return null;
}

describe("useScannerEvents", () => {
  it("uses the latest listener without resubscribing", () => {
    const scanner = createScanner({ style: stepScan() });
    const observe = vi.spyOn(scanner, "observe");
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<Observer scanner={scanner} listener={first} />);
    view.rerender(<Observer scanner={scanner} listener={second} />);
    scanner.start();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it("moves delivery to a replacement scanner and cleans up on unmount", () => {
    const first = createScanner({ style: stepScan() });
    const second = createScanner({ style: stepScan() });
    const listener = vi.fn();
    const view = render(<Observer scanner={first} listener={listener} />);
    view.rerender(<Observer scanner={second} listener={listener} />);

    first.start();
    expect(listener).not.toHaveBeenCalled();
    second.start();
    expect(listener).toHaveBeenCalled();
    listener.mockClear();
    view.unmount();
    second.stop();
    expect(listener).not.toHaveBeenCalled();
  });
});
