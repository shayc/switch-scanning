import { describe, expect, it, vi } from "vitest";
import {
  activateObfButton,
  buildObfScanRows,
  classifyObfCell,
  speechFor,
  type ObfActivationHost,
  type ObfBoard,
} from "./adapter.ts";

const BOARD: ObfBoard = {
  id: "home",
  locale: "he-IL",
  buttons: [
    { id: "hello", label: "Hello", vocalization: "Hi" },
    { id: "sound", label: "Bell", sound_id: "bell" },
    { id: "next", label: "Next", load_board: { id: "next-board" } },
    { id: "clear", label: "Clear", action: ":clear" },
    { id: "disabled", label: "No", disabled: true },
    { id: "empty" },
  ],
  grid: {
    rows: 2,
    columns: 4,
    order: [
      ["hello", "sound", null, "disabled"],
      ["next", "clear", "empty", null],
    ],
  },
};

describe("OBF adapter", () => {
  it("keeps actionless labeled buttons vocalizable", () => {
    expect(speechFor(BOARD.buttons[0]!)).toBe("Hi");
    expect(
      classifyObfCell("hello", new Map([["hello", BOARD.buttons[0]!]])),
    ).toMatchObject({
      kind: "button",
      speech: "Hi",
    });
  });

  it("routes speech, sound, board navigation, and custom actions", () => {
    const speak = vi.fn();
    const playSound = vi.fn();
    const loadBoard = vi.fn();
    const performAction = vi.fn();
    const host: ObfActivationHost = {
      speak,
      playSound,
      loadBoard,
      performAction,
    };
    for (const button of BOARD.buttons.slice(0, 4))
      expect(activateObfButton(button, host)).toBe(true);
    expect(speak).toHaveBeenCalledWith("Hi");
    expect(playSound).toHaveBeenCalledWith("bell");
    expect(loadBoard).toHaveBeenCalledWith({ id: "next-board" });
    expect(performAction).toHaveBeenCalledWith(":clear", BOARD.buttons[3]);
  });

  it("omits null, empty, and disabled cells and reverses RTL explicitly", () => {
    const rows = buildObfScanRows(BOARD);
    expect(rows.map((row) => row.sequence)).toEqual([
      ["sound", "hello"],
      ["clear", "next"],
    ]);
    expect(rows[0]!.targets.map((target) => target.id)).toEqual(
      rows[0]!.sequence,
    );
  });
});
