import { Box, Group, NumberInput, Slider, Stack, Text } from "@mantine/core";
import { useId } from "react";
import classes from "./DurationField.module.css";

export function DurationField({
  label,
  description,
  valueMs,
  minMs,
  maxMs,
  range,
  disabled = false,
  onChange,
}: {
  label: string;
  description: string;
  valueMs: number;
  minMs: number;
  maxMs?: number;
  range?: boolean;
  disabled?: boolean;
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
    <Box>
      <Group justify="space-between" align="center" gap="sm" wrap="nowrap">
        <Box component="label" htmlFor={inputId} flex={1}>
          <Stack gap={0}>
            <Text component="strong" size="sm" fw={600}>
              {label}
            </Text>
            <Text component="small" size="xs" c="dimmed" id={descriptionId}>
              {description}
            </Text>
          </Stack>
        </Box>
        <NumberInput
          id={inputId}
          classNames={{ input: classes.durationInput }}
          w={76}
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
      </Group>
      {range && max != null && (
        <Slider
          mt="sm"
          mx="xs"
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
    </Box>
  );
}

function roundNumber(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
