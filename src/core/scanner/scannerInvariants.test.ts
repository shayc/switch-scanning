import { describe, expect, it } from "vitest";
import type { ScannerRuntimeInvariantState } from "./scannerInvariants.ts";
import { assertScannerRuntimeInvariants } from "./scannerInvariants.ts";

const IDLE: ScannerRuntimeInvariantState = {
  status: "idle",
  sessionDepth: 0,
  hasPresentation: false,
  transition: null,
  stylePending: null,
  suspendedDwellRemaining: null,
  styleKind: "step",
};

const TRANSITION_PENDING = {
  kind: "transition" as const,
  startedAt: 10,
  dueAt: 20,
};

describe("scanner runtime invariants", () => {
  it.each<ScannerRuntimeInvariantState>([
    IDLE,
    { ...IDLE, status: "complete" },
    {
      ...IDLE,
      status: "scanning",
      sessionDepth: 1,
      hasPresentation: true,
    },
    {
      ...IDLE,
      status: "transitioning",
      sessionDepth: 1,
      transition: { pending: TRANSITION_PENDING },
    },
    {
      ...IDLE,
      status: "paused",
      sessionDepth: 1,
      hasPresentation: true,
    },
    {
      ...IDLE,
      status: "paused",
      sessionDepth: 1,
      transition: { pending: null },
    },
    {
      ...IDLE,
      status: "paused",
      sessionDepth: 1,
      hasPresentation: true,
      suspendedDwellRemaining: 5,
      styleKind: "singleStep",
    },
  ])("accepts a valid $status state", (state) => {
    expect(() => assertScannerRuntimeInvariants(state)).not.toThrow();
  });

  it.each([
    {
      state: { ...IDLE, sessionDepth: 1 },
      message: "idle status cannot retain a session",
    },
    {
      state: {
        ...IDLE,
        status: "scanning" as const,
        sessionDepth: 1,
        transition: { pending: null },
      },
      message: "scanning cannot retain transition data",
    },
    {
      state: {
        ...IDLE,
        status: "transitioning" as const,
        sessionDepth: 1,
        transition: { pending: null },
      },
      message: "transitioning requires a scheduled deadline",
    },
    {
      state: {
        ...IDLE,
        status: "paused" as const,
        sessionDepth: 1,
        stylePending: { kind: "advance" as const, startedAt: 0, dueAt: 1 },
      },
      message: "paused cannot retain style timing",
    },
    {
      state: {
        ...IDLE,
        status: "paused" as const,
        sessionDepth: 1,
        suspendedDwellRemaining: 5,
      },
      message: "suspended dwell requires a paused single-step scan",
    },
    {
      state: {
        ...IDLE,
        status: "transitioning" as const,
        sessionDepth: 1,
        transition: { pending: { ...TRANSITION_PENDING, dueAt: 5 } },
      },
      message: "pending deadline cannot precede its start time",
    },
  ])("rejects $message", ({ state, message }) => {
    expect(() => assertScannerRuntimeInvariants(state)).toThrow(message);
  });
});
