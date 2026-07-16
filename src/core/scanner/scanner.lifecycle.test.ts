import { describe, expect, it, vi } from "vitest";
import { manualClock } from "../shared/clock.ts";
import { stepScan } from "../methods/methods.ts";
import { createScannerFixture, recordScannerEvents } from "../testing/index.ts";
import type { Scanner, ScannerStatus } from "../types.ts";
import { createScanner } from "./scanner.ts";

const TARGETS = [
  { kind: "target" as const, id: "yes", label: "Yes" },
  { kind: "target" as const, id: "no", label: "No" },
];

type ArrangedState =
  | "idle"
  | "scanning"
  | "transitioning"
  | "paused-scan"
  | "paused-transition"
  | "complete";

function arrange(state: ArrangedState): Scanner {
  const clock = manualClock();
  const scanner = createScanner({
    method: stepScan(),
    selectionDelay: { durationMs: 50 },
    clock,
  });
  const fixture = createScannerFixture(scanner, TARGETS);

  switch (state) {
    case "idle":
      break;
    case "scanning":
      scanner.start();
      break;
    case "transitioning":
      scanner.start();
      scanner.select();
      break;
    case "paused-scan":
      scanner.start();
      scanner.pause();
      break;
    case "paused-transition":
      scanner.start();
      scanner.select();
      scanner.pause();
      break;
    case "complete":
      scanner.start();
      fixture.setNodes([]);
      fixture.setNodes(TARGETS);
      break;
  }
  return scanner;
}

interface LifecycleCase {
  readonly from: ArrangedState;
  readonly command: keyof Pick<
    Scanner,
    "start" | "pause" | "resume" | "stop" | "restart"
  >;
  readonly to: ScannerStatus;
  readonly events: readonly string[];
}

const LIFECYCLE_CASES: readonly LifecycleCase[] = [
  { from: "idle", command: "start", to: "scanning", events: ["scan.started"] },
  {
    from: "complete",
    command: "start",
    to: "scanning",
    events: ["scan.started"],
  },
  {
    from: "scanning",
    command: "pause",
    to: "paused",
    events: ["scan.paused"],
  },
  {
    from: "transitioning",
    command: "pause",
    to: "paused",
    events: ["scan.paused"],
  },
  {
    from: "paused-scan",
    command: "resume",
    to: "scanning",
    events: ["scan.resumed"],
  },
  {
    from: "paused-transition",
    command: "resume",
    to: "transitioning",
    events: ["scan.resumed"],
  },
  {
    from: "scanning",
    command: "stop",
    to: "idle",
    events: ["scan.stopped"],
  },
  {
    from: "transitioning",
    command: "stop",
    to: "idle",
    events: ["scan.stopped"],
  },
  {
    from: "paused-scan",
    command: "stop",
    to: "idle",
    events: ["scan.stopped"],
  },
  {
    from: "complete",
    command: "stop",
    to: "idle",
    events: ["scan.stopped"],
  },
  {
    from: "scanning",
    command: "restart",
    to: "scanning",
    events: ["scan.stopped", "scan.started"],
  },
  {
    from: "paused-transition",
    command: "restart",
    to: "scanning",
    events: ["scan.stopped", "scan.started"],
  },
];

describe("scanner lifecycle transition table", () => {
  it.each(LIFECYCLE_CASES)(
    "$from + $command -> $to",
    ({ from, command, to, events: expectedEvents }) => {
      const scanner = arrange(from);
      const events = recordScannerEvents(scanner);

      scanner[command]();

      expect(scanner.getSnapshot().status).toBe(to);
      expect(
        events.events
          .filter((event) => event.type.startsWith("scan."))
          .map((event) => event.type),
      ).toEqual(expectedEvents);
    },
  );

  const inapplicable: ReadonlyArray<{
    from: ArrangedState;
    command: keyof Pick<
      Scanner,
      "start" | "pause" | "resume" | "next" | "select"
    >;
    status: ScannerStatus;
  }> = [
    { from: "idle", command: "pause", status: "idle" },
    { from: "idle", command: "resume", status: "idle" },
    { from: "scanning", command: "start", status: "scanning" },
    { from: "transitioning", command: "next", status: "transitioning" },
    { from: "paused-scan", command: "select", status: "paused" },
    { from: "complete", command: "select", status: "complete" },
  ];

  it.each(inapplicable)(
    "diagnoses $command from $from",
    ({ from, command, status }) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const scanner = arrange(from);
      const events = recordScannerEvents(scanner);

      scanner[command]();

      expect(scanner.getSnapshot().status).toBe(status);
      expect(events.ofType("diagnostic").at(-1)?.code).toBe(
        "command-inapplicable",
      );
    },
  );
});
