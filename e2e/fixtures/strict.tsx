import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  SwitchScanner,
  stepScan,
  useScanTarget,
  useScannerCommands,
} from "@shayc/switch-scanning/react";

let lastTarget: HTMLElement | null = null;
let startScanning = (): void => {
  throw new Error("strict fixture: scanner commands are not ready");
};
const container = document.getElementById("root");
if (!container) throw new Error("strict fixture: #root is missing");
const root = createRoot(container);

function Target() {
  const target = useScanTarget({
    id: "target",
    label: "Target",
    ref: (element) => {
      if (element) lastTarget = element;
    },
  });
  return <button {...target}>Target</button>;
}

function CommandsBridge() {
  const { start } = useScannerCommands();
  useEffect(() => {
    startScanning = start;
  }, [start]);
  return null;
}

root.render(
  <StrictMode>
    <SwitchScanner method={stepScan()} start="manual">
      <CommandsBridge />
      <Target />
    </SwitchScanner>
  </StrictMode>,
);

declare global {
  interface Window {
    __strictFixture: {
      start(): void;
      unmount(): void;
      isDecorated(): boolean;
    };
  }
}

window.__strictFixture = {
  start: () => startScanning(),
  unmount: () => root.unmount(),
  isDecorated: () => lastTarget?.hasAttribute("data-scan-highlighted") ?? false,
};
