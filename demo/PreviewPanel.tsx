import { useState } from "react";
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
  useScannerCommands,
  useScannerEvents,
  useScannerSnapshot,
  useSwitch,
  type ScannerStatus,
  type SwitchAction,
} from "@shayc/switch-scanning/react";
import type { ScanMethodKind } from "./App.tsx";
import { METHOD_META } from "./methodMeta.ts";
import classes from "./PreviewPanel.module.css";
import { PhraseBoard } from "./PhraseBoard.tsx";

interface PreviewPanelProps {
  methodKind: ScanMethodKind;
  pointerSwitch: boolean;
}

export function PreviewPanel({ methodKind, pointerSwitch }: PreviewPanelProps) {
  const meta = METHOD_META[methodKind];

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
        data-scan-controls=""
      >
        <Title order={2} size="h4" id="preview-heading" flex={1}>
          Phrase board
        </Title>
        <RuntimeControls />
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
        <PhraseBoard />
      </Box>

      {pointerSwitch && <PointerControls methodKind={methodKind} />}
    </Paper>
  );
}

function RuntimeControls() {
  const [announcement, setAnnouncement] = useState("");
  const commands = useScannerCommands();
  const status = useScannerSnapshot((snapshot) => snapshot.status);
  const position = useScannerSnapshot((snapshot) => snapshot.position);
  const pending = useScannerSnapshot((snapshot) => snapshot.pending);
  const isActive =
    status === "scanning" || status === "transitioning" || status === "paused";

  useScannerEvents((event) => {
    switch (event.type) {
      case "target.activated":
        setAnnouncement(`Selected ${event.label}`);
        break;
      case "group.entered":
        setAnnouncement(`Entered ${event.label}`);
        break;
      case "group.exited":
        setAnnouncement(`Exited ${event.label}`);
        break;
    }
  });

  const labels: Partial<Record<ScannerStatus, string>> = {
    scanning: "Scanning",
    transitioning: "Waiting",
    paused: "Paused",
    complete: "Complete",
  };

  const primaryAction = (() => {
    switch (status) {
      case "idle":
        return { label: "Start scanning", run: commands.start };
      case "complete":
        return { label: "Start again", run: commands.restart };
      case "paused":
        return { label: "Resume scanning", run: commands.resume };
      case "scanning":
      case "transitioning":
        return { label: "Pause scanning", run: commands.pause };
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
      <span
        className={classes.liveRegion}
        role="status"
        aria-label="Scanner announcements"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </span>
      {status !== "idle" && (
        <Group
          className={classes.runtimeState}
          justify="flex-end"
          gap="xs"
          wrap="nowrap"
          data-scan-status=""
          aria-label="Scanner status"
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
            onClick={commands.stop}
          >
            Stop scanning
          </Button>
        )}
      </Group>
    </Group>
  );
}

function PointerControls({ methodKind }: { methodKind: ScanMethodKind }) {
  const definitions: Record<
    ScanMethodKind,
    readonly { action: SwitchAction; label: string; hint: string }[]
  > = {
    auto: [
      {
        action: "select",
        label: "Select",
        hint: "Press when the item is highlighted",
      },
    ],
    step: [
      { action: "next", label: "Move", hint: "Advance the highlight" },
      {
        action: "select",
        label: "Select",
        hint: "Choose the highlighted item",
      },
    ],
    dwell: [
      {
        action: "next",
        label: "Move",
        hint: "Advance, then wait to select",
      },
    ],
    inverse: [
      {
        action: "scan",
        label: "Hold to scan",
        hint: "Release to select",
      },
    ],
  };

  return (
    <section
      className={classes.pointerControls}
      aria-label="Touch controls"
      data-scan-controls=""
    >
      <Group className={classes.pointerHeading} justify="space-between" mb="xs">
        <Text size="sm" fw={600}>
          Touch controls
        </Text>
        <Text size="xs" c="dimmed">
          Touch or pen input
        </Text>
      </Group>
      <SimpleGrid cols={methodKind === "step" ? 2 : 1} spacing="sm">
        {definitions[methodKind].map((definition) => (
          <PointerSurface
            key={definition.action}
            action={definition.action}
            label={definition.label}
            hint={definition.hint}
          />
        ))}
      </SimpleGrid>
    </section>
  );
}

function PointerSurface({
  action,
  label,
  hint,
}: {
  action: SwitchAction;
  label: string;
  hint: string;
}) {
  const binding = useSwitch(action);
  return (
    <Button
      {...binding}
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
