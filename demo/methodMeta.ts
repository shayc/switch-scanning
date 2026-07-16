import type { ScanMethodKind } from "./App.tsx";

export interface MethodMeta {
  label: string;
  shortLabel: string;
  summary: string;
  switchCount: string;
  keys: readonly { action: string; key: string }[];
}

export const METHOD_META: Record<ScanMethodKind, MethodMeta> = {
  auto: {
    label: "Automatic",
    shortLabel: "Automatic",
    summary: "The highlight moves automatically. Press the switch to select.",
    switchCount: "1 switch",
    keys: [
      { action: "Select", key: "Space" },
      { action: "Pause", key: "P" },
    ],
  },
  step: {
    label: "Move and select",
    shortLabel: "Move and select",
    summary: "Press Move to advance and Select to choose.",
    switchCount: "2 switches",
    keys: [
      { action: "Move", key: "Space" },
      { action: "Select", key: "Enter" },
    ],
  },
  dwell: {
    label: "Step and wait",
    shortLabel: "Step and wait",
    summary: "Press to advance. Wait to select the highlighted item.",
    switchCount: "1 switch",
    keys: [{ action: "Move", key: "Space" }],
  },
  inverse: {
    label: "Hold and release",
    shortLabel: "Hold and release",
    summary: "Hold to advance. Release to select.",
    switchCount: "1 switch",
    keys: [{ action: "Scan", key: "Hold Space" }],
  },
};

export const METHOD_ORDER: ScanMethodKind[] = [
  "auto",
  "step",
  "dwell",
  "inverse",
];
