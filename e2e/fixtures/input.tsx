import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ScannerProvider,
  useKeyboardSwitches,
  usePointerSwitch,
  useScanTarget,
  useScannerEvents,
  useScannerSnapshot,
} from "@shayc/switch-scanning/react/advanced";
import { createScanner, stepScan } from "@shayc/switch-scanning";

const scanner = createScanner({
  method: stepScan(),
  startOn: "manual",
  switches: { next: { action: "next" } },
});
const container = document.getElementById("root");
if (!container) throw new Error("input fixture: #root is missing");
const root = createRoot(container);

function Target({ id }: { id: string }) {
  const target = useScanTarget({ id, label: id.toUpperCase() });
  return <button {...target}>{id.toUpperCase()}</button>;
}

function InputFixture() {
  const [eventCount, setEventCount] = useState(0);
  const position = useScannerSnapshot(scanner, (snapshot) => snapshot.position);
  const pointer = usePointerSwitch(scanner, { switchId: "next" });
  useKeyboardSwitches(scanner, { Space: "next" });
  useScannerEvents(scanner, () => setEventCount((count) => count + 1));

  return (
    <ScannerProvider scanner={scanner}>
      <button {...pointer} style={{ touchAction: "none" }}>
        Move
      </button>
      <output aria-label="Position">
        {position ? `${position.index + 1}/${position.count}` : "—"}
      </output>
      <output aria-label="Observed events">{eventCount}</output>
      <Target id="a" />
      <Target id="b" />
      <Target id="c" />
    </ScannerProvider>
  );
}

root.render(<InputFixture />);

declare global {
  interface Window {
    __inputFixture: {
      start(): void;
      unmount(): void;
    };
  }
}

window.__inputFixture = {
  start: () => scanner.start(),
  unmount: () => root.unmount(),
};
