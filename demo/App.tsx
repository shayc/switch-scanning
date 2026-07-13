import { useMemo, useState } from "react";
import {
  ScannerProvider,
  useKeyboardSwitches,
  useScanner,
  autoScan,
  inverseScan,
  singleSwitchStepScan,
  stepScan,
  type KeyboardSwitchBindings,
  type ScanStyle,
  type SwitchDefinition,
} from "@shayc/switch-scanning";
import { ControlsPanel } from "./ControlsPanel.tsx";
import { EventLog } from "./EventLog.tsx";
import { PhraseBoard } from "./PhraseBoard.tsx";

/** The four access methods the demo can switch between at runtime. */
export type ScanStyleKind = "auto" | "step" | "singleStep" | "inverse";

/** Every timing value any style might read; the panel shows the relevant subset. */
export interface Timing {
  intervalMs: number;
  loops: number;
  firstItemPauseMs: number;
  dwellTimeMs: number;
  repeatEnabled: boolean;
  repeatDelayMs: number;
  repeatIntervalMs: number;
}

const DEFAULT_TIMING: Timing = {
  intervalMs: 1200,
  loops: 3,
  firstItemPauseMs: 0,
  dwellTimeMs: 1000,
  repeatEnabled: false,
  repeatDelayMs: 600,
  repeatIntervalMs: 500,
};

/**
 * Logical switches per style. Selection invokes each target's native action, so
 * the demo never wires activation itself — only the switch-to-action mapping.
 */
const SWITCHES: Record<
  ScanStyleKind,
  Readonly<Record<string, SwitchDefinition>>
> = {
  auto: { select: { action: "select" } },
  step: { next: { action: "next" }, select: { action: "select" } },
  singleStep: { next: { action: "next" } },
  inverse: { hold: { action: "scan" } },
};

/** Keyboard bindings mirror the switch IDs declared above. */
const BINDINGS: Record<ScanStyleKind, KeyboardSwitchBindings> = {
  auto: { Space: "select" },
  step: { Space: "next", Enter: "select" },
  singleStep: { Space: "next" },
  inverse: { Space: "hold" },
};

function buildStyle(kind: ScanStyleKind, t: Timing): ScanStyle {
  switch (kind) {
    case "auto":
      return autoScan({
        intervalMs: t.intervalMs,
        loops: t.loops,
        firstItemPauseMs: t.firstItemPauseMs,
      });
    case "inverse":
      return inverseScan({
        intervalMs: t.intervalMs,
        loops: t.loops,
        firstItemPauseMs: t.firstItemPauseMs,
      });
    case "step":
      return stepScan(
        t.repeatEnabled
          ? {
              repeat: {
                delayMs: t.repeatDelayMs,
                intervalMs: t.repeatIntervalMs,
              },
            }
          : {},
      );
    case "singleStep":
      return singleSwitchStepScan({ dwellTimeMs: t.dwellTimeMs });
  }
}

export function App() {
  const [styleKind, setStyleKind] = useState<ScanStyleKind>("auto");
  const [timing, setTiming] = useState<Timing>(DEFAULT_TIMING);
  const [speech, setSpeech] = useState(false);

  // Style constructors throw on invalid values; while a field is mid-edit the
  // parsed number may be out of range, so fall back to the defaults for that
  // style rather than crash the playground.
  const style = useMemo<ScanStyle>(() => {
    try {
      return buildStyle(styleKind, timing);
    } catch {
      return buildStyle(styleKind, DEFAULT_TIMING);
    }
  }, [styleKind, timing]);

  const scanner = useScanner({
    style,
    switches: SWITCHES[styleKind],
    startOn: "switch",
  });
  useKeyboardSwitches(scanner, BINDINGS[styleKind]);

  return (
    <ScannerProvider scanner={scanner}>
      <header className="app-header">
        <h1>switch-scanning playground</h1>
        <p>
          A tiny AAC-style phrase board driven by the library. Pick a scan
          style, then operate it from the keyboard — every target runs its own
          native <code>onClick</code>.
        </p>
      </header>
      <main className="app-grid">
        <ControlsPanel
          scanner={scanner}
          styleKind={styleKind}
          onStyleKind={setStyleKind}
          timing={timing}
          onTiming={(patch) => setTiming((prev) => ({ ...prev, ...patch }))}
          speech={speech}
          onSpeech={setSpeech}
        />
        <PhraseBoard />
        <EventLog speech={speech} />
      </main>
    </ScannerProvider>
  );
}
