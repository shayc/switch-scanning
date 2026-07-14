import {
  Accordion,
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
import type { ScanStyleKind, Timing } from "./App.tsx";
import classes from "./ControlsPanel.module.css";
import { DurationField } from "./DurationField.tsx";
import { STYLE_META, STYLE_ORDER } from "./styleMeta.ts";

interface ControlsPanelProps {
  styleKind: ScanStyleKind;
  onStyleKind: (kind: ScanStyleKind) => void;
  timing: Timing;
  onTiming: (patch: Partial<Timing>) => void;
  keyboardOwnership: "mixed" | "dedicated";
  onKeyboardOwnership: (value: "mixed" | "dedicated") => void;
  pointerSwitch: boolean;
  onPointerSwitch: (on: boolean) => void;
}

/**
 * Configuration controls are deliberately not part of the scan tree, and stay
 * editable while a preview runs: the scanner reconfigures live through
 * `setOptions`, so changes take effect without stopping first.
 */
export function ControlsPanel({
  styleKind,
  onStyleKind,
  timing,
  onTiming,
  keyboardOwnership,
  onKeyboardOwnership,
  pointerSwitch,
  onPointerSwitch,
}: ControlsPanelProps) {
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

      <Fieldset
        className={classes.fieldGroup}
        variant="unstyled"
        legend="Scanning method"
      >
        <Radio.Group value={styleKind} onChange={onStyleKind}>
          <Stack gap={4}>
            {STYLE_ORDER.map((kind) => {
              const option = STYLE_META[kind];
              return (
                <Radio.Card
                  key={kind}
                  value={kind}
                  className={classes.presetOption}
                  p="xs"
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
              <Fieldset variant="unstyled" legend="Touch input">
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

              <Fieldset variant="unstyled" legend="Keyboard mode">
                <Radio.Group
                  value={keyboardOwnership}
                  onChange={onKeyboardOwnership}
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

              <Fieldset variant="unstyled" legend="Advanced timing">
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
                        onChange={(repeatDelayMs) =>
                          onTiming({ repeatDelayMs })
                        }
                      />
                      <DurationField
                        label="Time between repeats"
                        description="Pace while the Move switch remains held."
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
