import { useMemo, useState } from "react";
import {
  ScannerProvider,
  useKeyboardSwitches,
  usePointerSwitch,
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
  selectionDelayMs: number;
  transitionTimeMs: number;
}

const DEFAULT_TIMING: Timing = {
  intervalMs: 1200,
  loops: 3,
  firstItemPauseMs: 0,
  dwellTimeMs: 1000,
  repeatEnabled: false,
  repeatDelayMs: 600,
  repeatIntervalMs: 500,
  selectionDelayMs: 0,
  transitionTimeMs: 0,
};

/**
 * Logical switches per style. Selection invokes each target's native action, so
 * the demo never wires activation itself — only the switch-to-action mapping.
 */
const SWITCHES: Record<
  ScanStyleKind,
  Readonly<Record<string, SwitchDefinition>>
> = {
  auto: {
    select: { action: "select" },
    pause: { action: "togglePause" },
  },
  step: {
    next: { action: "next" },
    select: { action: "select" },
    pause: { action: "togglePause" },
  },
  singleStep: {
    next: { action: "next" },
    pause: { action: "togglePause" },
  },
  inverse: {
    hold: { action: "scan" },
    pause: { action: "togglePause" },
  },
};

/** Keyboard bindings mirror the switch IDs declared above. */
const BINDINGS: Record<ScanStyleKind, KeyboardSwitchBindings> = {
  auto: { Space: "select", KeyP: "pause" },
  step: { Space: "next", Enter: "select", KeyP: "pause" },
  singleStep: { Space: "next", KeyP: "pause" },
  inverse: { Space: "hold", KeyP: "pause" },
};

const POINTER_SWITCH: Record<ScanStyleKind, string> = {
  auto: "select",
  step: "next",
  singleStep: "next",
  inverse: "hold",
};

function buildStyle(kind: ScanStyleKind, t: Timing): ScanStyle {
  switch (kind) {
    case "auto":
      return autoScan({
        intervalMs: t.intervalMs,
        loops: t.loops,
        firstItemPauseMs: t.firstItemPauseMs,
        transitionTimeMs: t.transitionTimeMs,
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
  const [keyboardOwnership, setKeyboardOwnership] = useState<
    "mixed" | "dedicated"
  >("mixed");
  const [pointerSwitch, setPointerSwitch] = useState(false);

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
    selectionDelay: { durationMs: timing.selectionDelayMs },
  });
  useKeyboardSwitches(
    scanner,
    BINDINGS[styleKind],
    keyboardOwnership === "dedicated"
      ? {}
      : {
          shouldHandle: (event) =>
            !(
              event.target instanceof Element &&
              event.target.closest('[aria-label="Controls"]')
            ),
        },
  );

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
          keyboardOwnership={keyboardOwnership}
          onKeyboardOwnership={setKeyboardOwnership}
          pointerSwitch={pointerSwitch}
          onPointerSwitch={setPointerSwitch}
        />
        <PointerSurface
          scanner={scanner}
          switchId={POINTER_SWITCH[styleKind]}
          enabled={pointerSwitch}
        />
        <PhraseBoard />
        <EventLog scanner={scanner} speech={speech} styleKind={styleKind} />
      </main>
    </ScannerProvider>
  );
}

function PointerSurface({
  scanner,
  switchId,
  enabled,
}: {
  scanner: ReturnType<typeof useScanner>;
  switchId: string;
  enabled: boolean;
}) {
  const binding = usePointerSwitch(scanner, { switchId, enabled });
  if (!enabled) return null;
  return (
    <section className="panel pointer-panel" aria-label="Touch switch">
      <h2>Dedicated touch switch</h2>
      <button {...binding.props} className="pointer-switch" type="button">
        Press and release here
      </button>
      <p className="hint">
        This surface intentionally owns touch and pen input.
      </p>
    </section>
  );
}
