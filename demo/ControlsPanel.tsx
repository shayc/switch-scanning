import { useId } from "react";
import {
  Fieldset,
  NumberInput,
  Paper,
  Radio,
  Slider,
  Switch,
} from "@mantine/core";
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
    <Paper
      component="aside"
      className="controls-panel"
      withBorder
      shadow="xs"
      radius="md"
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

      <Fieldset
        className="field-group"
        variant="unstyled"
        legend="Scanning preset"
        disabled={!canConfigure}
      >
        <Radio.Group
          value={styleKind}
          onChange={onStyleKind}
          disabled={!canConfigure}
        >
          <div className="preset-list">
            {STYLE_ORDER.map((kind) => {
              const option = STYLE_META[kind];
              return (
                <Radio.Card
                  key={kind}
                  value={kind}
                  className="preset-option"
                  disabled={!canConfigure}
                  aria-label={option.label}
                  aria-describedby={`scan-style-${kind}-description`}
                >
                  <Radio.Indicator size="xs" aria-hidden="true" />
                  <span className="preset-copy">
                    <span className="preset-title">
                      <strong>{option.shortLabel}</strong>
                      <small>{option.switchCount}</small>
                    </span>
                    <span id={`scan-style-${kind}-description`}>
                      {option.summary}
                    </span>
                  </span>
                </Radio.Card>
              );
            })}
          </div>
        </Radio.Group>
      </Fieldset>

      <Fieldset
        className="field-group"
        variant="unstyled"
        legend={styleKind === "singleStep" ? "Selection timing" : "Pace"}
        disabled={!canConfigure}
      >
        {(styleKind === "auto" || styleKind === "inverse") && (
          <DurationField
            label="Time on each item"
            description="How long the highlight stays before moving."
            valueMs={timing.intervalMs}
            minMs={100}
            maxMs={4000}
            range
            disabled={!canConfigure}
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
            disabled={!canConfigure}
            onChange={(dwellTimeMs) => onTiming({ dwellTimeMs })}
          />
        )}
        {styleKind === "step" && (
          <Switch
            size="sm"
            labelPosition="left"
            label="Repeat while held"
            description="Keep moving until the Next switch is released."
            checked={timing.repeatEnabled}
            onChange={(event) =>
              onTiming({ repeatEnabled: event.currentTarget.checked })
            }
          />
        )}
      </Fieldset>

      <details className="advanced-settings">
        <summary>More options</summary>
        <div className="advanced-body">
          <Fieldset
            className="nested-fieldset"
            variant="unstyled"
            legend="Touch input"
            disabled={!canConfigure}
          >
            <Switch
              size="sm"
              labelPosition="left"
              label="Show touch controls"
              description={
                styleKind === "step"
                  ? "Adds separate Next and Select surfaces."
                  : "Adds a large touch and pen surface to the preview."
              }
              checked={pointerSwitch}
              onChange={(event) => onPointerSwitch(event.currentTarget.checked)}
            />
          </Fieldset>

          <Fieldset
            className="nested-fieldset"
            variant="unstyled"
            legend="Feedback and test scenarios"
          >
            <Switch
              size="sm"
              labelPosition="left"
              label="Speak highlighted items"
              description="Uses the browser’s current speech voice."
              checked={speech}
              onChange={(event) => onSpeech(event.currentTarget.checked)}
              aria-label="Speak highlighted and selected items"
            />
            <Switch
              size="sm"
              labelPosition="left"
              label="Test a disabled target"
              description="Disables “Thank you” so the scanner skips it."
              checked={thanksDisabled}
              onChange={(event) =>
                onThanksDisabled(event.currentTarget.checked)
              }
            />
          </Fieldset>

          <Fieldset
            className="nested-fieldset"
            variant="unstyled"
            legend="Keyboard mode"
            disabled={!canConfigure}
          >
            <Radio.Group
              value={keyboardOwnership}
              onChange={onKeyboardOwnership}
              disabled={!canConfigure}
            >
              <div className="keyboard-options">
                <Radio
                  value="mixed"
                  size="xs"
                  label="Standard"
                  description="Settings keep their normal keyboard behavior."
                  aria-label="Use the keyboard normally"
                />
                <Radio
                  value="dedicated"
                  size="xs"
                  label="Dedicated switch keyboard"
                  description="Capture mapped keys across the whole page."
                  aria-label="Use the keyboard as a dedicated switch"
                />
              </div>
            </Radio.Group>
          </Fieldset>

          <Fieldset
            className="nested-fieldset"
            variant="unstyled"
            legend="Advanced timing"
            disabled={!canConfigure}
          >
            <div className="advanced-timing">
              {(styleKind === "auto" || styleKind === "inverse") && (
                <NumberInput
                  size="xs"
                  label="Passes before stopping"
                  description="How many times to scan the board."
                  value={timing.loops}
                  min={1}
                  step={1}
                  allowDecimal={false}
                  clampBehavior="strict"
                  role="spinbutton"
                  aria-valuemin={1}
                  onChange={(value) => {
                    if (typeof value === "number" && value >= 1) {
                      onTiming({ loops: Math.round(value) });
                    }
                  }}
                />
              )}
              {styleKind === "auto" && (
                <DurationField
                  label="Pause after selection"
                  description="Minimum pause before automatic scanning continues."
                  valueMs={timing.transitionTimeMs}
                  minMs={0}
                  disabled={!canConfigure}
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
                  disabled={!canConfigure}
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
                    disabled={!canConfigure}
                    onChange={(repeatDelayMs) => onTiming({ repeatDelayMs })}
                  />
                  <DurationField
                    label="Time between repeats"
                    description="Pace while Next remains held."
                    valueMs={timing.repeatIntervalMs}
                    minMs={100}
                    disabled={!canConfigure}
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
                disabled={!canConfigure}
                onChange={(selectionDelayMs) => onTiming({ selectionDelayMs })}
              />
            </div>
          </Fieldset>
        </div>
      </details>
    </Paper>
  );
}

function DurationField({
  label,
  description,
  valueMs,
  minMs,
  maxMs,
  range,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  valueMs: number;
  minMs: number;
  maxMs?: number;
  range?: boolean;
  disabled: boolean;
  onChange: (valueMs: number) => void;
}) {
  const inputId = useId();
  const descriptionId = `${inputId}-description`;
  const value = valueMs / 1000;
  const min = minMs / 1000;
  const max = maxMs == null ? undefined : maxMs / 1000;

  const update = (next: number | string) => {
    if (
      typeof next !== "number" ||
      !Number.isFinite(next) ||
      next < min ||
      (max != null && next > max)
    ) {
      return;
    }
    onChange(Math.round(roundNumber(next) * 1000));
  };

  return (
    <div className="number-field">
      <div className="number-heading">
        <label htmlFor={inputId} className="field-copy">
          <strong>{label}</strong>
          <small id={descriptionId}>{description}</small>
        </label>
        <NumberInput
          id={inputId}
          className="duration-input"
          size="xs"
          value={value}
          min={min}
          {...(max == null ? {} : { max })}
          step={0.1}
          decimalScale={1}
          hideControls
          rightSection={<span aria-hidden="true">s</span>}
          rightSectionPointerEvents="none"
          clampBehavior="strict"
          disabled={disabled}
          role="spinbutton"
          aria-label={`${label} (seconds)`}
          aria-describedby={descriptionId}
          aria-valuemin={min}
          {...(max == null ? {} : { "aria-valuemax": max })}
          onChange={update}
        />
      </div>
      {range && max != null && (
        <Slider
          className="duration-slider"
          value={value}
          min={min}
          max={max}
          step={0.1}
          size="sm"
          disabled={disabled}
          thumbLabel={`Adjust ${label}`}
          thumbValueText={(seconds) => `${seconds} seconds`}
          label={(seconds) => `${seconds} s`}
          onChange={update}
        />
      )}
    </div>
  );
}

function roundNumber(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
