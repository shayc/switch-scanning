import {
  usePointerSwitch,
  useScannerSnapshot,
  type Scanner,
  type ScannerStatus,
} from "@shayc/switch-scanning";
import { Badge, Button, Kbd, Paper } from "@mantine/core";
import type { ScanStyleKind } from "./App.tsx";
import { STYLE_META } from "./ControlsPanel.tsx";
import { PhraseBoard } from "./PhraseBoard.tsx";

interface PreviewPanelProps {
  scanner: Scanner;
  styleKind: ScanStyleKind;
  pointerSwitch: boolean;
  thanksDisabled: boolean;
}

export function PreviewPanel({
  scanner,
  styleKind,
  pointerSwitch,
  thanksDisabled,
}: PreviewPanelProps) {
  const meta = STYLE_META[styleKind];

  return (
    <Paper
      component="section"
      className="preview-panel"
      withBorder
      shadow="xs"
      radius="md"
      aria-labelledby="preview-heading"
    >
      <header className="preview-toolbar" data-scanner-controls="">
        <div className="preview-title">
          <h2 id="preview-heading">Phrase board</h2>
          <p>
            {meta.shortLabel} <span aria-hidden="true">·</span>{" "}
            {meta.switchCount}
          </p>
        </div>
        <RuntimeControls scanner={scanner} />
      </header>

      <div className="binding-strip" aria-label="Active switch bindings">
        {meta.keys.map((binding) => (
          <span key={binding.action}>
            <strong>{binding.action}</strong>
            <Kbd>{binding.key}</Kbd>
          </span>
        ))}
      </div>

      <div className="preview-canvas">
        <PhraseBoard thanksDisabled={thanksDisabled} />
      </div>

      {pointerSwitch && (
        <PointerControls scanner={scanner} styleKind={styleKind} />
      )}
    </Paper>
  );
}

function RuntimeControls({ scanner }: { scanner: Scanner }) {
  const status = useScannerSnapshot(scanner, (snapshot) => snapshot.status);
  const position = useScannerSnapshot(scanner, (snapshot) => snapshot.position);
  const pending = useScannerSnapshot(scanner, (snapshot) => snapshot.pending);
  const isActive =
    status === "scanning" || status === "transitioning" || status === "paused";

  const labels: Partial<Record<ScannerStatus, string>> = {
    scanning: "Scanning",
    transitioning: "Waiting",
    paused: "Paused",
    complete: "Complete",
  };

  const primaryAction = (() => {
    switch (status) {
      case "idle":
        return { label: "Start scanning", run: () => scanner.start() };
      case "complete":
        return { label: "Start again", run: () => scanner.restart() };
      case "paused":
        return { label: "Resume scanning", run: () => scanner.resume() };
      case "scanning":
      case "transitioning":
        return { label: "Pause scanning", run: () => scanner.pause() };
    }
  })();

  let detail = "";
  if (status === "complete") detail = "Configured passes finished";
  if (position) {
    detail = `Item ${position.index + 1} of ${position.count}`;
    if (pending?.kind === "dwell") detail += " · selecting soon";
    if (pending?.kind === "transition") detail += " · input locked";
  }

  return (
    <div className="runtime-controls">
      {status !== "idle" && (
        <div className="runtime-state" role="status" aria-live="polite">
          <Badge
            variant="light"
            size="sm"
            color={
              status === "complete"
                ? "teal"
                : status === "paused"
                  ? "yellow"
                  : "demoBlue"
            }
          >
            {labels[status]}
          </Badge>
          {detail && <small>{detail}</small>}
        </div>
      )}
      <div className="run-actions">
        <Button type="button" size="sm" h={44} onClick={primaryAction.run}>
          {primaryAction.label}
        </Button>
        {isActive && (
          <Button
            type="button"
            variant="subtle"
            color="gray"
            size="sm"
            h={44}
            onClick={() => scanner.stop()}
          >
            Stop scanning
          </Button>
        )}
      </div>
    </div>
  );
}

function PointerControls({
  scanner,
  styleKind,
}: {
  scanner: Scanner;
  styleKind: ScanStyleKind;
}) {
  const definitions: Record<
    ScanStyleKind,
    readonly { id: string; label: string; hint: string }[]
  > = {
    auto: [
      {
        id: "select",
        label: "Select",
        hint: "Press when the item is highlighted",
      },
    ],
    step: [
      { id: "next", label: "Next", hint: "Move the highlight" },
      { id: "select", label: "Select", hint: "Activate the highlighted item" },
    ],
    singleStep: [
      { id: "next", label: "Next", hint: "Move, then wait to select" },
    ],
    inverse: [{ id: "hold", label: "Hold to scan", hint: "Release to select" }],
  };

  return (
    <section
      className={`pointer-controls${styleKind === "step" ? " pointer-controls--pair" : ""}`}
      aria-label="Touch controls"
      data-scanner-controls=""
    >
      <div className="pointer-heading">
        <strong>Touch controls</strong>
        <span>Touch or pen input</span>
      </div>
      <div className="pointer-grid">
        {definitions[styleKind].map((definition) => (
          <PointerSurface
            key={definition.id}
            scanner={scanner}
            switchId={definition.id}
            label={definition.label}
            hint={definition.hint}
          />
        ))}
      </div>
    </section>
  );
}

function PointerSurface({
  scanner,
  switchId,
  label,
  hint,
}: {
  scanner: Scanner;
  switchId: string;
  label: string;
  hint: string;
}) {
  const binding = usePointerSwitch(scanner, { switchId });
  return (
    <button
      {...binding.props}
      className="pointer-switch"
      type="button"
      aria-label={label}
    >
      <strong>{label}</strong>
      <span>{hint}</span>
    </button>
  );
}
