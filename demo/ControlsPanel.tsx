import type { ChangeEvent } from "react";
import { useScannerSnapshot, type Scanner } from "@shayc/switch-scanning";
import type { ScanStyleKind, Timing } from "./App.tsx";

interface StyleMeta {
  label: string;
  summary: string;
  keys: string;
}

const STYLE_META: Record<ScanStyleKind, StyleMeta> = {
  auto: {
    label: "Automatic",
    summary: "A timer advances the highlight; the switch selects.",
    keys: "Space = select",
  },
  step: {
    label: "Step",
    summary: "One switch advances; another selects.",
    keys: "Space = next · Enter = select",
  },
  singleStep: {
    label: "Single-switch step",
    summary: "The switch advances; holding still (dwell) selects.",
    keys: "Space = next",
  },
  inverse: {
    label: "Inverse",
    summary: "Holding advances; releasing selects.",
    keys: "Hold Space = scan",
  },
};

const STYLE_ORDER: ScanStyleKind[] = ["auto", "step", "singleStep", "inverse"];

interface ControlsPanelProps {
  scanner: Scanner;
  styleKind: ScanStyleKind;
  onStyleKind: (kind: ScanStyleKind) => void;
  timing: Timing;
  onTiming: (patch: Partial<Timing>) => void;
  speech: boolean;
  onSpeech: (on: boolean) => void;
  keyboardOwnership: "mixed" | "dedicated";
  onKeyboardOwnership: (value: "mixed" | "dedicated") => void;
  pointerSwitch: boolean;
  onPointerSwitch: (on: boolean) => void;
}

/**
 * Plain, non-scannable controls: they configure and drive the scanner but are
 * never registered as scan targets, so the scan never lands on them.
 */
export function ControlsPanel({
  scanner,
  styleKind,
  onStyleKind,
  timing,
  onTiming,
  speech,
  onSpeech,
  keyboardOwnership,
  onKeyboardOwnership,
  pointerSwitch,
  onPointerSwitch,
}: ControlsPanelProps) {
  const meta = STYLE_META[styleKind];

  return (
    <section className="panel" aria-label="Controls">
      <h2>Controls</h2>

      <fieldset className="field-group">
        <legend>Scan style</legend>
        {STYLE_ORDER.map((kind) => (
          <label key={kind} className="radio">
            <input
              type="radio"
              name="scan-style"
              value={kind}
              checked={styleKind === kind}
              onChange={() => onStyleKind(kind)}
            />
            {STYLE_META[kind].label}
          </label>
        ))}
        <p className="hint">{meta.summary}</p>
      </fieldset>

      <fieldset className="field-group">
        <legend>Timing</legend>
        {(styleKind === "auto" || styleKind === "inverse") && (
          <>
            <NumberField
              label="Interval (ms)"
              value={timing.intervalMs}
              min={1}
              onChange={(intervalMs) => onTiming({ intervalMs })}
            />
            {styleKind === "auto" && (
              <NumberField
                label="Transition time (ms)"
                value={timing.transitionTimeMs}
                min={0}
                onChange={(transitionTimeMs) => onTiming({ transitionTimeMs })}
              />
            )}
            <NumberField
              label="Loops"
              value={timing.loops}
              min={1}
              onChange={(loops) => onTiming({ loops })}
            />
            <NumberField
              label="First-item pause (ms)"
              value={timing.firstItemPauseMs}
              min={0}
              onChange={(firstItemPauseMs) => onTiming({ firstItemPauseMs })}
            />
          </>
        )}

        {styleKind === "singleStep" && (
          <NumberField
            label="Dwell time (ms)"
            value={timing.dwellTimeMs}
            min={1}
            onChange={(dwellTimeMs) => onTiming({ dwellTimeMs })}
          />
        )}

        {styleKind === "step" && (
          <>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={timing.repeatEnabled}
                onChange={(e) => onTiming({ repeatEnabled: e.target.checked })}
              />
              Held-switch repeat
            </label>
            {timing.repeatEnabled && (
              <>
                <NumberField
                  label="Repeat delay (ms)"
                  value={timing.repeatDelayMs}
                  min={0}
                  onChange={(repeatDelayMs) => onTiming({ repeatDelayMs })}
                />
                <NumberField
                  label="Repeat interval (ms)"
                  value={timing.repeatIntervalMs}
                  min={1}
                  onChange={(repeatIntervalMs) =>
                    onTiming({ repeatIntervalMs })
                  }
                />
              </>
            )}
          </>
        )}
        <NumberField
          label="Selection delay (ms)"
          value={timing.selectionDelayMs}
          min={0}
          onChange={(selectionDelayMs) => onTiming({ selectionDelayMs })}
        />
      </fieldset>

      <fieldset className="field-group">
        <legend>Input ownership</legend>
        <label className="radio">
          <input
            type="radio"
            name="keyboard-ownership"
            checked={keyboardOwnership === "mixed"}
            onChange={() => onKeyboardOwnership("mixed")}
          />
          Mixed input (settings keep native keys)
        </label>
        <label className="radio">
          <input
            type="radio"
            name="keyboard-ownership"
            checked={keyboardOwnership === "dedicated"}
            onChange={() => onKeyboardOwnership("dedicated")}
          />
          Dedicated switch keyboard
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={pointerSwitch}
            onChange={(event) => onPointerSwitch(event.target.checked)}
          />
          Show dedicated touch switch
        </label>
      </fieldset>

      <fieldset className="field-group">
        <legend>Run</legend>
        <div className="button-row">
          <button type="button" onClick={() => scanner.start()}>
            Start
          </button>
          <button type="button" onClick={() => scanner.pause()}>
            Pause
          </button>
          <button type="button" onClick={() => scanner.resume()}>
            Resume
          </button>
          <button type="button" onClick={() => scanner.stop()}>
            Stop
          </button>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={speech}
            onChange={(e) => onSpeech(e.target.checked)}
          />
          Speak highlights &amp; activations
        </label>
      </fieldset>

      <div className="field-group">
        <p className="hint">
          <strong>Keys:</strong> {meta.keys} · P = pause/resume
        </p>
        <StatusLine />
      </div>
    </section>
  );
}

/** Opt-in reactive state: this line rerenders, the phrase board does not. */
function StatusLine() {
  const status = useScannerSnapshot((s) => s.status);
  const loop = useScannerSnapshot((s) => s.loop);
  const path = useScannerSnapshot(
    (s) => s.path.join(" › "),
    (a, b) => a === b,
  );
  const position = useScannerSnapshot((s) => s.position);
  const pending = useScannerSnapshot((s) => s.pending);

  return (
    <dl className="status">
      <div>
        <dt>Status</dt>
        <dd data-status={status}>{status}</dd>
      </div>
      <div>
        <dt>Position</dt>
        <dd>{position ? `${position.index + 1}/${position.count}` : "—"}</dd>
      </div>
      <div>
        <dt>Pending</dt>
        <dd>{pending?.kind ?? "waiting"}</dd>
      </div>
      <div>
        <dt>Scope</dt>
        <dd>{path === "" ? "root" : path}</dd>
      </div>
      <div>
        <dt>Loop</dt>
        <dd>{loop}</dd>
      </div>
    </dl>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}

function NumberField({ label, value, min, onChange }: NumberFieldProps) {
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.valueAsNumber;
    if (Number.isFinite(next) && next >= min) onChange(next);
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <input type="number" min={min} value={value} onChange={handle} />
    </label>
  );
}
