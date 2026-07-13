import { useId, type ChangeEvent } from "react";
import { useScannerSnapshot, type Scanner } from "@shayc/switch-scanning";
import type { ScanStyleKind, Timing } from "./App.tsx";

export interface StyleMeta {
  label: string;
  shortLabel: string;
  summary: string;
  switchCount: string;
  keys: readonly { action: string; key: string }[];
}

export const STYLE_META: Record<ScanStyleKind, StyleMeta> = {
  auto: {
    label: "Automatic scanning",
    shortLabel: "Automatic",
    summary: "The highlight moves automatically. Press once to select.",
    switchCount: "1 switch",
    keys: [
      { action: "Select", key: "Space" },
      { action: "Pause", key: "P" },
    ],
  },
  step: {
    label: "Two-switch step",
    shortLabel: "Manual",
    summary: "Use one switch to move and another to select.",
    switchCount: "2 switches",
    keys: [
      { action: "Next", key: "Space" },
      { action: "Select", key: "Enter" },
      { action: "Pause", key: "P" },
    ],
  },
  singleStep: {
    label: "Single-switch step",
    shortLabel: "Step and dwell",
    summary: "Press to move, then wait on an item to select it.",
    switchCount: "1 switch",
    keys: [
      { action: "Next", key: "Space" },
      { action: "Pause", key: "P" },
    ],
  },
  inverse: {
    label: "Inverse scanning",
    shortLabel: "Hold and release",
    summary: "Hold to move through items, then release to select.",
    switchCount: "1 switch",
    keys: [
      { action: "Scan", key: "Hold Space" },
      { action: "Pause", key: "P" },
    ],
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
  thanksDisabled: boolean;
  onThanksDisabled: (on: boolean) => void;
}

/** Configuration controls are deliberately not part of the scan tree. */
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
  thanksDisabled,
  onThanksDisabled,
}: ControlsPanelProps) {
  const status = useScannerSnapshot(scanner, (snapshot) => snapshot.status);
  const canConfigure = status === "idle" || status === "complete";

  return (
    <aside
      className="panel controls-panel"
      aria-labelledby="scanning-setup-heading"
      data-scanner-controls=""
    >
      <header className="controls-heading">
        <h2 id="scanning-setup-heading">Setup</h2>
      </header>

      {!canConfigure && (
        <p className="setup-locked" role="status">
          Stop the preview to change its setup.
        </p>
      )}

      <fieldset className="field-group" disabled={!canConfigure}>
        <legend>Scanning preset</legend>
        <div className="preset-list">
          {STYLE_ORDER.map((kind) => {
            const option = STYLE_META[kind];
            return (
              <label
                key={kind}
                className={`preset-option${styleKind === kind ? " preset-option--selected" : ""}`}
              >
                <input
                  type="radio"
                  name="scan-style"
                  value={kind}
                  aria-label={option.label}
                  aria-describedby={`scan-style-${kind}-description`}
                  checked={styleKind === kind}
                  onChange={() => onStyleKind(kind)}
                />
                <span className="preset-copy">
                  <span className="preset-title">
                    <strong>{option.shortLabel}</strong>
                    <small>{option.switchCount}</small>
                  </span>
                  <span id={`scan-style-${kind}-description`}>
                    {option.summary}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="field-group" disabled={!canConfigure}>
        <legend>
          {styleKind === "singleStep" ? "Selection timing" : "Pace"}
        </legend>
        {(styleKind === "auto" || styleKind === "inverse") && (
          <DurationField
            label="Time on each item"
            description="How long the highlight stays before moving."
            valueMs={timing.intervalMs}
            minMs={100}
            maxMs={4000}
            range
            onChange={(intervalMs) => onTiming({ intervalMs })}
          />
        )}
        {styleKind === "singleStep" && (
          <DurationField
            label="Wait before selecting"
            description="How long to remain on an item before it activates."
            valueMs={timing.dwellTimeMs}
            minMs={100}
            maxMs={4000}
            range
            onChange={(dwellTimeMs) => onTiming({ dwellTimeMs })}
          />
        )}
        {styleKind === "step" && (
          <ToggleRow
            label="Repeat while held"
            description="Keep moving until the Next switch is released."
            checked={timing.repeatEnabled}
            onChange={(repeatEnabled) => onTiming({ repeatEnabled })}
          />
        )}
      </fieldset>

      <details className="advanced-settings">
        <summary>More options</summary>
        <div className="advanced-body">
          <fieldset className="nested-fieldset" disabled={!canConfigure}>
            <legend>Touch input</legend>
            <ToggleRow
              label="Show touch controls"
              description={
                styleKind === "step"
                  ? "Adds separate Next and Select surfaces."
                  : "Adds a large touch and pen surface to the preview."
              }
              checked={pointerSwitch}
              onChange={onPointerSwitch}
            />
          </fieldset>

          <fieldset className="nested-fieldset">
            <legend>Feedback and test scenarios</legend>
            <ToggleRow
              label="Speak highlighted items"
              description="Uses the browser’s current speech voice."
              checked={speech}
              onChange={onSpeech}
              ariaLabel="Speak highlighted and selected items"
            />
            <ToggleRow
              label="Test a disabled target"
              description="Disables “Thank you” so the scanner skips it."
              checked={thanksDisabled}
              onChange={onThanksDisabled}
            />
          </fieldset>

          <fieldset className="nested-fieldset" disabled={!canConfigure}>
            <legend>Keyboard mode</legend>
            <label className="radio-row">
              <input
                type="radio"
                name="keyboard-ownership"
                aria-label="Use the keyboard normally"
                checked={keyboardOwnership === "mixed"}
                onChange={() => onKeyboardOwnership("mixed")}
              />
              <span>
                <strong>Standard</strong>
                <small>Settings keep their normal keyboard behavior.</small>
              </span>
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="keyboard-ownership"
                aria-label="Use the keyboard as a dedicated switch"
                checked={keyboardOwnership === "dedicated"}
                onChange={() => onKeyboardOwnership("dedicated")}
              />
              <span>
                <strong>Dedicated switch keyboard</strong>
                <small>Capture mapped keys across the whole page.</small>
              </span>
            </label>
          </fieldset>

          <fieldset className="nested-fieldset" disabled={!canConfigure}>
            <legend>Advanced timing</legend>
            <div className="advanced-timing">
              {(styleKind === "auto" || styleKind === "inverse") && (
                <NumberField
                  label="Passes before stopping"
                  description="How many times to scan the board."
                  value={timing.loops}
                  min={1}
                  step={1}
                  onChange={(loops) => onTiming({ loops })}
                />
              )}
              {styleKind === "auto" && (
                <DurationField
                  label="Pause after selection"
                  description="Minimum pause before automatic scanning continues."
                  valueMs={timing.transitionTimeMs}
                  minMs={0}
                  onChange={(transitionTimeMs) =>
                    onTiming({ transitionTimeMs })
                  }
                />
              )}
              {(styleKind === "auto" || styleKind === "inverse") && (
                <DurationField
                  label="Extra time on first item"
                  description="Makes the start of each pass easier to notice."
                  valueMs={timing.firstItemPauseMs}
                  minMs={0}
                  onChange={(firstItemPauseMs) =>
                    onTiming({ firstItemPauseMs })
                  }
                />
              )}
              {styleKind === "step" && timing.repeatEnabled && (
                <>
                  <DurationField
                    label="Wait before repeating"
                    description="Delay before a held switch moves again."
                    valueMs={timing.repeatDelayMs}
                    minMs={0}
                    onChange={(repeatDelayMs) => onTiming({ repeatDelayMs })}
                  />
                  <DurationField
                    label="Time between repeats"
                    description="Pace while Next remains held."
                    valueMs={timing.repeatIntervalMs}
                    minMs={100}
                    onChange={(repeatIntervalMs) =>
                      onTiming({ repeatIntervalMs })
                    }
                  />
                </>
              )}
              <DurationField
                label="Input lockout after selection"
                description="Ignores rapid repeats immediately after selection."
                valueMs={timing.selectionDelayMs}
                minMs={0}
                onChange={(selectionDelayMs) => onTiming({ selectionDelayMs })}
              />
            </div>
          </fieldset>
        </div>
      </details>
    </aside>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  ariaLabel,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <label className="toggle-row">
      <span className="toggle-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="switch-control">
        <input
          type="checkbox"
          aria-label={ariaLabel ?? label}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span aria-hidden="true" />
      </span>
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  description: string;
  value: number;
  min: number;
  max?: number;
  step: number;
  unit?: string;
  range?: boolean;
  onChange: (value: number) => void;
}

function NumberField({
  label,
  description,
  value,
  min,
  max,
  step,
  unit,
  range = false,
  onChange,
}: NumberFieldProps) {
  const inputId = useId();
  const descriptionId = `${inputId}-description`;

  const update = (next: number) => {
    if (!Number.isFinite(next) || next < min || (max != null && next > max)) {
      return;
    }
    onChange(roundNumber(next));
  };

  const handle = (event: ChangeEvent<HTMLInputElement>) => {
    update(event.target.valueAsNumber);
  };

  return (
    <div className={`number-field${range ? " number-field--range" : ""}`}>
      <div className="number-heading">
        <label htmlFor={inputId} className="field-copy">
          <strong>{label}</strong>
          <small id={descriptionId}>{description}</small>
        </label>
        <span className="number-input-wrap">
          <input
            id={inputId}
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={unit ? `${label} (${unit})` : label}
            aria-describedby={descriptionId}
            onChange={handle}
          />
          {unit && (
            <span aria-hidden="true">{unit === "seconds" ? "s" : unit}</span>
          )}
        </span>
      </div>
      {range && (
        <input
          className="range-input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={`Adjust ${label}`}
          onChange={handle}
        />
      )}
    </div>
  );
}

function DurationField({
  label,
  description,
  valueMs,
  minMs,
  maxMs,
  range,
  onChange,
}: {
  label: string;
  description: string;
  valueMs: number;
  minMs: number;
  maxMs?: number;
  range?: boolean;
  onChange: (valueMs: number) => void;
}) {
  return (
    <NumberField
      label={label}
      description={description}
      value={valueMs / 1000}
      min={minMs / 1000}
      {...(maxMs == null ? {} : { max: maxMs / 1000 })}
      step={0.1}
      unit="seconds"
      {...(range == null ? {} : { range })}
      onChange={(seconds) => onChange(Math.round(seconds * 1000))}
    />
  );
}

function roundNumber(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
