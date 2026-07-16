import { Anchor, Group, ThemeIcon, Title } from "@mantine/core";
import {
  autoScan,
  dwellScan,
  inverseScan,
  stepScan,
  SwitchScanner,
  type KeyboardActionBindings,
  type ScanMethod,
} from "@shayc/switch-scanning/react";
import { useMemo, useState } from "react";
import classes from "./App.module.css";
import { ControlsPanel } from "./ControlsPanel.tsx";
import { EventLog } from "./EventLog.tsx";
import { PreviewPanel } from "./PreviewPanel.tsx";

/** The four access methods the demo can switch between at runtime. */
export type ScanMethodKind = "auto" | "step" | "dwell" | "inverse";

/** Every timing value any method might read; the panel shows the relevant subset. */
export interface Timing {
  intervalMs: number;
  passes: number;
  firstItemPauseMs: number;
  dwellDurationMs: number;
  repeatEnabled: boolean;
  repeatDelayMs: number;
  repeatIntervalMs: number;
  selectionDelayMs: number;
  transitionDurationMs: number;
}

const DEFAULT_TIMING: Timing = {
  intervalMs: 1200,
  passes: 3,
  firstItemPauseMs: 0,
  dwellDurationMs: 1000,
  repeatEnabled: false,
  repeatDelayMs: 600,
  repeatIntervalMs: 500,
  selectionDelayMs: 0,
  transitionDurationMs: 0,
};

/** Keyboard bindings map directly to scanner actions on the simple surface. */
const KEYBOARD: Record<ScanMethodKind, KeyboardActionBindings> = {
  auto: { Space: "select", KeyP: "togglePause" },
  step: { Space: "next", Enter: "select" },
  dwell: { Space: "next" },
  inverse: { Space: "scan" },
};

function buildMethod(kind: ScanMethodKind, t: Timing): ScanMethod {
  switch (kind) {
    case "auto":
      return autoScan({
        intervalMs: t.intervalMs,
        passes: t.passes,
        firstItemPauseMs: t.firstItemPauseMs,
        transitionDurationMs: t.transitionDurationMs,
      });
    case "inverse":
      return inverseScan({
        intervalMs: t.intervalMs,
        passes: t.passes,
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
    case "dwell":
      return dwellScan({ dwellDurationMs: t.dwellDurationMs });
  }
}

function isInteractiveApplicationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-scan-pointer-switch]")) return false;
  const interactive = target.closest(
    "button, a, input, select, textarea, [tabindex]",
  );
  if (!interactive) return false;
  if (interactive.matches("button, a, input, select, textarea")) return true;
  return interactive instanceof HTMLElement && interactive.tabIndex >= 0;
}

export function App() {
  const [methodKind, setMethodKind] = useState<ScanMethodKind>("auto");
  const [timing, setTiming] = useState<Timing>(DEFAULT_TIMING);
  const [keyboardOwnership, setKeyboardOwnership] = useState<
    "mixed" | "dedicated"
  >("mixed");
  const [pointerSwitch, setPointerSwitch] = useState(false);

  // Method constructors throw on invalid values; while a field is mid-edit the
  // parsed number may be out of range, so fall back to the defaults for that
  // method rather than crash the playground.
  const method = useMemo<ScanMethod>(() => {
    try {
      return buildMethod(methodKind, timing);
    } catch {
      return buildMethod(methodKind, DEFAULT_TIMING);
    }
  }, [methodKind, timing]);

  return (
    <SwitchScanner
      method={method}
      keyboard={KEYBOARD[methodKind]}
      behavior={{
        selectionDelay: { durationMs: timing.selectionDelayMs },
      }}
      keyboardOptions={
        keyboardOwnership === "dedicated"
          ? {}
          : {
              shouldHandle: (event) =>
                !(
                  event.target instanceof Element &&
                  event.target.closest("[data-scan-controls]")
                ) && !isInteractiveApplicationTarget(event.target),
            }
      }
    >
      <Group
        component="header"
        className={classes.appHeader}
        justify="space-between"
        wrap="nowrap"
      >
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon aria-hidden="true">S</ThemeIcon>
          <Title order={1} size="h6">
            Switch scanning
          </Title>
        </Group>
        <Anchor
          className={classes.sourceLink}
          c="dimmed"
          href="https://github.com/shayc/switch-scanning"
          size="xs"
        >
          <span className={classes.sourceLabel}>View source</span>{" "}
          <span aria-hidden="true">↗</span>
        </Anchor>
      </Group>
      <main className={classes.workbench}>
        <div className={classes.previewColumn}>
          <PreviewPanel methodKind={methodKind} pointerSwitch={pointerSwitch} />
          <EventLog />
        </div>
        <ControlsPanel
          methodKind={methodKind}
          onMethodKind={setMethodKind}
          timing={timing}
          onTiming={(patch) => setTiming((prev) => ({ ...prev, ...patch }))}
          keyboardOwnership={keyboardOwnership}
          onKeyboardOwnership={setKeyboardOwnership}
          pointerSwitch={pointerSwitch}
          onPointerSwitch={setPointerSwitch}
        />
      </main>
    </SwitchScanner>
  );
}
