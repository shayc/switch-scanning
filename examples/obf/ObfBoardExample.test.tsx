import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ScannerProvider,
  createScanner,
  stepScan,
} from "@shayc/switch-scanning/react";
import { ObfBoardExample } from "./ObfBoardExample.tsx";
import type { ObfBoard } from "./adapter.ts";

const FIRST: ObfBoard = {
  id: "first",
  buttons: [{ id: "load", label: "Next", load_board: { id: "second" } }],
  grid: { rows: 1, columns: 1, order: [["load"]] },
};

const SECOND: ObfBoard = {
  id: "second",
  buttons: [{ id: "hello", label: "Hello" }],
  grid: { rows: 1, columns: 1, order: [["hello"]] },
};

describe("live OBF board replacement", () => {
  it("reconciles a load_board navigation through public registry APIs", async () => {
    const scanner = createScanner({ style: stepScan(), startOn: "command" });
    const view = render(
      <ScannerProvider scanner={scanner}>
        <ObfBoardExample
          initialBoard={FIRST}
          loadBoard={() => Promise.resolve(SECOND)}
          speak={vi.fn()}
          playSound={vi.fn()}
          performAction={vi.fn()}
        />
      </ScannerProvider>,
    );
    await act(async () => Promise.resolve());
    act(() => scanner.start());
    act(() => scanner.select());
    act(() => scanner.select());
    await act(async () => Promise.resolve());

    expect(view.queryByRole("button", { name: "Next" })).toBeNull();
    expect(view.getByRole("button", { name: "Hello" })).toBeTruthy();
    expect(scanner.getSnapshot().highlight).toEqual({
      kind: "group",
      id: "obf:second:row:0",
    });
  });
});
