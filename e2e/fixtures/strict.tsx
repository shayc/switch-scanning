import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  ScannerProvider,
  createScanner,
  stepScan,
  useScanTarget,
} from "@shayc/switch-scanning";

let lastTarget: HTMLElement | null = null;
const scanner = createScanner({ style: stepScan(), startOn: "command" });
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
  return <button {...target.props}>Target</button>;
}

root.render(
  <StrictMode>
    <ScannerProvider scanner={scanner}>
      <Target />
    </ScannerProvider>
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
  start: () => scanner.start(),
  unmount: () => root.unmount(),
  isDecorated: () => lastTarget?.hasAttribute("data-scan-highlighted") ?? false,
};
