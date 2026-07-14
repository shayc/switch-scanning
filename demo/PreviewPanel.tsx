import {
  Badge,
  Box,
  Button,
  Group,
  Kbd,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  usePointerSwitch,
  useScannerSnapshot,
  type Scanner,
  type ScannerStatus,
} from "@shayc/switch-scanning/react";
import type { ScanStyleKind } from "./App.tsx";
import { STYLE_META } from "./styleMeta.ts";
import classes from "./PreviewPanel.module.css";
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
      className={classes.previewPanel}
      withBorder
      shadow="xs"
      radius="md"
      aria-labelledby="preview-heading"
    >
      <Group
        component="header"
        className={classes.previewToolbar}
        justify="space-between"
        wrap="nowrap"
        p="md"
        data-scanner-controls=""
      >
        <Stack gap={0} flex={1}>
          <Title order={2} size="h4" id="preview-heading">
            Phrase board
          </Title>
          <Text size="xs" c="dimmed">
            {meta.shortLabel} <span aria-hidden="true">·</span>{" "}
            {meta.switchCount}
          </Text>
        </Stack>
        <RuntimeControls scanner={scanner} />
      </Group>

      <Group
        className={classes.bindingStrip}
        gap="md"
        px="md"
        py="xs"
        aria-label="Active switch bindings"
      >
        {meta.keys.map((binding) => (
          <Group key={binding.action} gap="xs" wrap="nowrap">
            <Text size="xs" fw={600}>
              {binding.action}
            </Text>
            <Kbd>{binding.key}</Kbd>
          </Group>
        ))}
      </Group>

      <Box className={classes.previewCanvas}>
        <PhraseBoard thanksDisabled={thanksDisabled} />
      </Box>

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
    <Group
      className={classes.runtimeControls}
      justify="flex-end"
      gap="md"
      wrap="nowrap"
    >
      {status !== "idle" && (
        <Group
          className={classes.runtimeState}
          justify="flex-end"
          gap="xs"
          wrap="nowrap"
          role="status"
          aria-label="Scanner status"
          aria-live="polite"
        >
          <Badge
            variant="light"
            size="sm"
            {...(status === "complete"
              ? { color: "teal" }
              : status === "paused"
                ? { color: "yellow" }
                : {})}
          >
            {labels[status]}
          </Badge>
          {detail && (
            <Text component="small" size="xs" c="dimmed" truncate="end">
              {detail}
            </Text>
          )}
        </Group>
      )}
      <Group gap="xs" wrap="nowrap">
        <Button type="button" onClick={primaryAction.run}>
          {primaryAction.label}
        </Button>
        {isActive && (
          <Button
            type="button"
            variant="subtle"
            color="gray"
            onClick={() => scanner.stop()}
          >
            Stop scanning
          </Button>
        )}
      </Group>
    </Group>
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
      { id: "next", label: "Move", hint: "Advance the highlight" },
      { id: "select", label: "Select", hint: "Choose the highlighted item" },
    ],
    singleStep: [
      { id: "next", label: "Move", hint: "Advance, then wait to select" },
    ],
    inverse: [{ id: "hold", label: "Hold to scan", hint: "Release to select" }],
  };

  return (
    <section
      className={classes.pointerControls}
      aria-label="Touch controls"
      data-scanner-controls=""
    >
      <Group className={classes.pointerHeading} justify="space-between" mb="xs">
        <Text size="sm" fw={600}>
          Touch controls
        </Text>
        <Text size="xs" c="dimmed">
          Touch or pen input
        </Text>
      </Group>
      <SimpleGrid cols={styleKind === "step" ? 2 : 1} spacing="sm">
        {definitions[styleKind].map((definition) => (
          <PointerSurface
            key={definition.id}
            scanner={scanner}
            switchId={definition.id}
            label={definition.label}
            hint={definition.hint}
          />
        ))}
      </SimpleGrid>
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
    <Button
      {...binding.props}
      className={classes.pointerSwitch}
      type="button"
      fullWidth
      aria-label={label}
    >
      <Stack gap={0}>
        <Text component="strong" inherit>
          {label}
        </Text>
        <Text component="small" size="xs" inherit>
          {hint}
        </Text>
      </Stack>
    </Button>
  );
}
