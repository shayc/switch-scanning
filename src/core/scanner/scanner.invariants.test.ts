import { describe, expect, it } from "vitest";
import { manualClock } from "../shared/clock.ts";
import { singleSwitchStepScan, stepScan } from "../styles/styles.ts";
import { createScannerFixture } from "../testing/index.ts";
import type { GroupExit } from "../types.ts";
import { createScanner } from "./scanner.ts";

const DWELL_NODES = [
  { kind: "target" as const, id: "a", label: "A" },
  { kind: "target" as const, id: "b", label: "B" },
];

describe("bounded safety exploration", () => {
  it("never produces more timer selections than explicit dwell arming commands", () => {
    const operations = ["next", "tick", "pause", "resume", "tree"] as const;
    const sequences: (typeof operations)[number][][] = [[]];
    for (let depth = 0; depth < 3; depth += 1) {
      for (const prefix of sequences.filter((item) => item.length === depth)) {
        for (const operation of operations)
          sequences.push([...prefix, operation]);
      }
    }

    for (const sequence of sequences.filter((item) => item.length === 3)) {
      const clock = manualClock();
      const scanner = createScanner({
        style: singleSwitchStepScan({ dwellTimeMs: 10 }),
        clock,
      });
      const fixture = createScannerFixture(scanner, DWELL_NODES);
      scanner.start();
      let armingCommands = 0;
      for (const operation of sequence) {
        switch (operation) {
          case "next":
            if (scanner.getSnapshot().status === "scanning") armingCommands++;
            scanner.next();
            break;
          case "tick":
            clock.advanceBy(10);
            break;
          case "pause":
            scanner.pause();
            break;
          case "resume":
            scanner.resume();
            break;
          case "tree":
            fixture.setNodes([...DWELL_NODES]);
            break;
        }
      }
      clock.advanceBy(100);
      expect(fixture.activations.length).toBeLessThanOrEqual(armingCommands);

      const beforeStop = fixture.activations.length;
      scanner.stop();
      clock.advanceBy(1_000);
      expect(fixture.activations).toHaveLength(beforeStop);
      expect(scanner.getSnapshot()).toMatchObject({
        status: "idle",
        highlight: null,
        pending: null,
      });
    }
  });
});

describe("declared-switch escape invariant", () => {
  const cases: Array<{
    exit: GroupExit;
    switches?: Record<string, { action: "back" }>;
  }> = [
    { exit: "before" },
    { exit: "after" },
    { exit: "back-only", switches: { back: { action: "back" } } },
  ];

  for (const { exit, switches } of cases) {
    it(`provides a non-activating route out with ${exit}`, () => {
      const scanner = createScanner({
        style: stepScan(),
        groupExit: exit,
        ...(switches ? { switches } : {}),
      });
      const fixture = createScannerFixture(scanner, [
        {
          kind: "group",
          id: "nested",
          label: "Nested",
          children: [{ kind: "target", id: "inside", label: "Inside" }],
        },
      ]);
      scanner.start();
      scanner.select();
      expect(scanner.getSnapshot().path).toEqual(["nested"]);

      if (exit === "after") scanner.next();
      if (exit === "back-only") {
        scanner.input.press("back");
        scanner.input.release("back");
      } else {
        scanner.select();
      }

      expect(scanner.getSnapshot().path).toEqual([]);
      expect(fixture.activations).toEqual([]);
    });
  }
});
