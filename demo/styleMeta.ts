import type { ScanStyleKind } from "./App.tsx";

export interface StyleMeta {
  label: string;
  shortLabel: string;
  summary: string;
  switchCount: string;
  keys: readonly { action: string; key: string }[];
}

export const STYLE_META: Record<ScanStyleKind, StyleMeta> = {
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
      { action: "Pause", key: "P" },
    ],
  },
  singleStep: {
    label: "Step and wait",
    shortLabel: "Step and wait",
    summary: "Press to advance. Wait to select the highlighted item.",
    switchCount: "1 switch",
    keys: [
      { action: "Move", key: "Space" },
      { action: "Pause", key: "P" },
    ],
  },
  inverse: {
    label: "Hold and release",
    shortLabel: "Hold and release",
    summary: "Hold to advance. Release to select.",
    switchCount: "1 switch",
    keys: [
      { action: "Scan", key: "Hold Space" },
      { action: "Pause", key: "P" },
    ],
  },
};

export const STYLE_ORDER: ScanStyleKind[] = [
  "auto",
  "step",
  "singleStep",
  "inverse",
];
