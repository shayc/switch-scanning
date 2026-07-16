import { describe, expect, it, vi } from "vitest";
import { manualClock, type ManualClock } from "../shared/clock.ts";
import {
  autoScan,
  inverseScan,
  dwellScan,
  stepScan,
  type ScanMethod,
} from "../methods/methods.ts";
import { createScannerFixture } from "../testing/index.ts";
import type { SwitchDefinition } from "../input/switches.ts";
import type { Scanner, ScannerBehaviorOptions, ScanNode } from "../types.ts";
import { createScanner } from "./scanner.ts";

const SWITCHES: Readonly<Record<string, SwitchDefinition>> = {
  next: { action: "next" },
  select: { action: "select" },
  back: { action: "back" },
  pause: { action: "togglePause" },
  scan: { action: "scan" },
};

const TREES: readonly (readonly ScanNode[])[] = [
  [
    {
      kind: "group",
      id: "group",
      label: "Group",
      children: [
        { kind: "target", id: "a", label: "A" },
        { kind: "target", id: "b", label: "B" },
      ],
    },
    { kind: "target", id: "c", label: "C" },
  ],
  [
    { kind: "target", id: "c", label: "C" },
    {
      kind: "group",
      id: "group",
      label: "Updated group",
      children: [
        { kind: "target", id: "b", label: "B" },
        { kind: "target", id: "a", label: "A", disabled: true },
        { kind: "target", id: "d", label: "D" },
      ],
    },
  ],
  [],
];

const METHODS: readonly ScanMethod[] = [
  stepScan(),
  stepScan({ repeat: { delayMs: 6, intervalMs: 4 } }),
  autoScan({ intervalMs: 5, passes: 2, transitionDurationMs: 3 }),
  dwellScan({ dwellDurationMs: 6 }),
  inverseScan({ intervalMs: 5, passes: 2 }),
];

const OPERATIONS = [
  "start",
  "pause",
  "resume",
  "stop",
  "restart",
  "next",
  "previous",
  "select",
  "back",
  "tick",
  "tree",
  "toggle-enabled",
  "method",
  "press",
  "release",
  "disconnect",
  "suspend",
] as const;

const SWITCH_IDS = Object.keys(SWITCHES);
const SEEDS = [
  0x10203040, 0x13579bdf, 0x2468ace0, 0x31415926, 0x5eed1234, 0x6a09e667,
  0x7f4a7c15, 0x89abcdef, 0x9e3779b9, 0xcafebabe,
] as const;

function pseudoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function pick<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)]!;
}

function assertPublicInvariants(
  scanner: Scanner,
  clock: ManualClock,
  seed: number,
  trace: readonly string[],
): void {
  const snapshot = scanner.getSnapshot();
  const fail = (message: string): never => {
    const recent = trace.slice(-25).join(" -> ");
    throw new Error(
      `seed 0x${seed.toString(16)} violated ${message}; trace: ${recent}`,
    );
  };

  if (snapshot.status === "idle" || snapshot.status === "complete") {
    if (snapshot.highlight !== null) fail("terminal highlight invariant");
    if (snapshot.path.length !== 0) fail("terminal path invariant");
    if (snapshot.pass !== 0) fail("terminal pass invariant");
    if (snapshot.position !== null) fail("terminal position invariant");
    if (snapshot.pending !== null) fail("terminal pending invariant");
    return;
  }

  const position = snapshot.position;
  if (!position) return fail("live position invariant");
  if (position.count <= 0) fail("live position count invariant");
  if (position.index < 0 || position.index >= position.count) {
    fail("position bounds invariant");
  }
  if (snapshot.pass < 1) fail("live pass invariant");

  if (snapshot.status === "scanning" && snapshot.highlight === null) {
    fail("scanning presentation invariant");
  }
  if (snapshot.status === "transitioning" && snapshot.highlight !== null) {
    fail("transition presentation invariant");
  }
  if (snapshot.status === "transitioning") {
    if (snapshot.pending?.kind !== "transition") {
      fail("transition timing invariant");
    }
  }
  if (snapshot.status === "paused" && snapshot.pending !== null) {
    fail("paused timing invariant");
  }

  const pending = snapshot.pending;
  if (pending) {
    if (pending.dueAt < pending.startedAt) fail("deadline ordering invariant");
    if (pending.dueAt < clock.now()) fail("overdue pending invariant");
    if (pending.kind === "transition" && snapshot.status !== "transitioning") {
      fail("transition timer ownership invariant");
    }
    if (pending.kind !== "transition" && snapshot.status !== "scanning") {
      fail("method timer ownership invariant");
    }
  }
}

describe("deterministic scanner interaction sequences", () => {
  it.each(SEEDS)("preserves public invariants for seed %#", (seed) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const random = pseudoRandom(seed);
    const clock = manualClock();
    let methodIndex = 0;
    let enabled = true;
    const behavior = (): ScannerBehaviorOptions => ({
      method: METHODS[methodIndex]!,
      switches: SWITCHES,
      enabled,
      afterActivation: "continue",
      selectionDelay: { durationMs: 7 },
    });
    const scanner = createScanner({ ...behavior(), clock });
    const fixture = createScannerFixture(scanner, TREES[0]!);
    const trace: string[] = [];

    for (let step = 0; step < 120; step += 1) {
      const operation = pick(OPERATIONS, random);
      switch (operation) {
        case "start":
        case "pause":
        case "resume":
        case "stop":
        case "restart":
        case "next":
        case "previous":
        case "select":
        case "back":
          trace.push(operation);
          scanner[operation]();
          break;
        case "tick": {
          const amount = Math.floor(random() * 21);
          trace.push(`tick(${amount})`);
          clock.advanceBy(amount);
          break;
        }
        case "tree": {
          const index = Math.floor(random() * TREES.length);
          trace.push(`tree(${index})`);
          fixture.setNodes(TREES[index]!);
          break;
        }
        case "toggle-enabled":
          enabled = !enabled;
          trace.push(`enabled(${enabled})`);
          scanner.setOptions(behavior());
          break;
        case "method":
          methodIndex = Math.floor(random() * METHODS.length);
          trace.push(`method(${METHODS[methodIndex]!.kind}:${methodIndex})`);
          scanner.setOptions(behavior());
          break;
        case "press": {
          const switchId = pick(SWITCH_IDS, random);
          trace.push(`press(${switchId})`);
          scanner.input.press(switchId);
          break;
        }
        case "release": {
          const switchId = pick(SWITCH_IDS, random);
          trace.push(`release(${switchId})`);
          scanner.input.release(switchId);
          break;
        }
        case "disconnect":
          trace.push("disconnect");
          scanner.input.disconnect();
          break;
        case "suspend":
          trace.push("suspend");
          scanner.input.suspend();
          break;
      }
      assertPublicInvariants(scanner, clock, seed, trace);
    }

    scanner.input.disconnect();
    scanner.stop();
    clock.advanceBy(100);
    expect(clock.pending).toBe(0);
  });
});
