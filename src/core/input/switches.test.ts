import { describe, expect, it } from "vitest";
import { normalizeSwitch } from "./switches.ts";

describe("JavaScript switch definition validation", () => {
  it.each([null, undefined, 1, "select", []])(
    "rejects malformed definition %j with a library validation error",
    (definition) => {
      expect(() => normalizeSwitch("bad", definition as never)).toThrow(
        /\[switch-scanning\].*definition must be an object/,
      );
    },
  );

  it.each([null, undefined, 1, "hold", []])(
    "rejects malformed tap/hold shape %j predictably",
    (hold) => {
      expect(() =>
        normalizeSwitch("bad", { tap: "select", hold } as never),
      ).toThrow(/\[switch-scanning\].*hold must be an object/);
    },
  );

  it.each(["PRESS", "tap", null, false])(
    "rejects invalid performOn value %j",
    (performOn) => {
      expect(() =>
        normalizeSwitch("bad", { action: "select", performOn } as never),
      ).toThrow(/performOn must be "press" or "release"/);
    },
  );

  it.each([{}, { action: null }, { action: "activate" }])(
    "rejects malformed discrete definition %j predictably",
    (definition) => {
      expect(() => normalizeSwitch("bad", definition as never)).toThrow(
        /\[switch-scanning\].*unknown action/,
      );
    },
  );
});
