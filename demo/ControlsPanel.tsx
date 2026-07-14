import {
  Accordion,
  Alert,
  Divider,
  Fieldset,
  Group,
  NumberInput,
  Paper,
  Radio,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { useScannerSnapshot, type Scanner } from "@shayc/switch-scanning";
import type { ScanStyleKind, Timing } from "./App.tsx";
import { DurationField } from "./DurationField.tsx";
import { STYLE_META, STYLE_ORDER } from "./styleMeta.ts";
import classes from "./ControlsPanel.module.css";

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
      className={classes.controlsPanel}
      withBorder
      shadow="xs"
      radius="md"
      p="md"
      aria-labelledby="scanning-setup-heading"
      data-scanner-controls=""
    >
      <Title order={2} size="h4" id="scanning-setup-heading">
        Setup
      </Title>

      {!canConfigure && (
        <Alert mt="sm" role="status">
          Stop the preview to change its setup.
        </Alert>
      )}

      <Fieldset
        className={classes.fieldGroup}
        variant="unstyled"
        legend="Scanning method"
        disabled={!canConfigure}
      >
        <Radio.Group
          value={styleKind}
          onChange={onStyleKind}
          disabled={!canConfigure}
        >
          <Stack gap={4}>
            {STYLE_ORDER.map((kind) => {
              const option = STYLE_META[kind];
              return (
                <Radio.Card
                  key={kind}
                  value={kind}
                  className={classes.presetOption}
                  p="xs"
                  disabled={!canConfigure}
                  aria-label={option.label}
                  aria-describedby={`scan-style-${kind}-description`}
                >
                  <Radio.Indicator size="xs" aria-hidden="true" />
                  <Stack gap={2} flex={1}>
                    <Group justify="space-between" gap="xs" wrap="nowrap">
                      <Text size="sm" fw={600}>
                        {option.shortLabel}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {option.switchCount}
                      </Text>
                    </Group>
                    <Text
                      component="span"
                      size="xs"
                      c="dimmed"
                      id={`scan-style-${kind}-description`}
                    >
                      {option.summary}
                    </Text>
                  </Stack>
                </Radio.Card>
              );
            })}
          </Stack>
        </Radio.Group>
      </Fieldset>

      <Fieldset
        className={classes.fieldGroup}
        variant="unstyled"
        legend={
          styleKind === "singleStep"
            ? "Selection timing"
            : styleKind === "step"
              ? "Movement"
              : "Pace"
        }
        disabled={!canConfigure}
      >
        <Stack gap="xs">
          {(styleKind === "auto" || styleKind === "inverse") && (
            <DurationField
              label="Time on each item"
              description={
                styleKind === "auto"
                  ? "How long the highlight stays on each item before advancing."
                  : "How long each item stays highlighted while the switch is held."
              }
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
              description="After you move, how long the highlight remains on an item before it is selected."
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
              className={classes.fullWidthSwitch}
              size="sm"
              labelPosition="left"
              label="Repeat while held"
              description="Keep advancing while the Move switch is held."
              checked={timing.repeatEnabled}
              onChange={(event) =>
                onTiming({ repeatEnabled: event.currentTarget.checked })
              }
            />
          )}
        </Stack>
      </Fieldset>

      <Accordion mt="sm">
        <Accordion.Item value="more-options">
          <Accordion.Control>More options</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Fieldset
                variant="unstyled"
                legend="Touch input"
                disabled={!canConfigure}
              >
                <Switch
                  className={classes.fullWidthSwitch}
                  size="sm"
                  labelPosition="left"
                  label="Show touch controls"
                  description={
                    styleKind === "step"
                      ? "Adds separate Move and Select surfaces."
                      : "Adds a large touch and pen surface to the preview."
                  }
                  checked={pointerSwitch}
                  onChange={(event) =>
                    onPointerSwitch(event.currentTarget.checked)
                  }
                />
              </Fieldset>

              <Divider />

              <Fieldset variant="unstyled" legend="Feedback and test scenarios">
                <Stack gap="sm">
                  <Switch
                    className={classes.fullWidthSwitch}
                    size="sm"
                    labelPosition="left"
                    label="Speak highlighted items"
                    description="Uses the browser’s current speech voice."
                    checked={speech}
                    onChange={(event) => onSpeech(event.currentTarget.checked)}
                    aria-label="Speak highlighted and selected items"
                  />
                  <Switch
                    className={classes.fullWidthSwitch}
                    size="sm"
                    labelPosition="left"
                    label="Test a disabled target"
                    description="Disables “Thank you” so the scanner skips it."
                    checked={thanksDisabled}
                    onChange={(event) =>
                      onThanksDisabled(event.currentTarget.checked)
                    }
                  />
                </Stack>
              </Fieldset>

              <Divider />

              <Fieldset
                variant="unstyled"
                legend="Keyboard mode"
                disabled={!canConfigure}
              >
                <Radio.Group
                  value={keyboardOwnership}
                  onChange={onKeyboardOwnership}
                  disabled={!canConfigure}
                >
                  <Stack gap="xs">
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
                  </Stack>
                </Radio.Group>
              </Fieldset>

              <Divider />

              <Fieldset
                variant="unstyled"
                legend="Advanced timing"
                disabled={!canConfigure}
              >
                <Stack gap="sm">
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
                        onChange={(repeatDelayMs) =>
                          onTiming({ repeatDelayMs })
                        }
                      />
                      <DurationField
                        label="Time between repeats"
                        description="Pace while the Move switch remains held."
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
                    onChange={(selectionDelayMs) =>
                      onTiming({ selectionDelayMs })
                    }
                  />
                </Stack>
              </Fieldset>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Paper>
  );
}
