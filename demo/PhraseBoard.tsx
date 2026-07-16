import { Button, Group, Paper, SimpleGrid, Stack } from "@mantine/core";
import { useScanGroup, useScanTarget } from "@shayc/switch-scanning/react";
import { useState } from "react";
import classes from "./PhraseBoard.module.css";

interface Phrase {
  id: string;
  text: string;
}

interface Row {
  id: string;
  label: string;
  phrases: Phrase[];
}

const ROWS: Row[] = [
  {
    id: "row-wants",
    label: "Row 1",
    phrases: [
      { id: "i-want", text: "I want" },
      { id: "yes", text: "Yes" },
      { id: "no", text: "No" },
    ],
  },
  {
    id: "row-social",
    label: "Row 2",
    phrases: [
      { id: "please", text: "Please" },
      { id: "thank-you", text: "Thank you" },
      { id: "help", text: "Help" },
    ],
  },
  {
    id: "row-more",
    label: "Row 3",
    phrases: [
      { id: "more", text: "More" },
      { id: "stop", text: "Stop" },
      { id: "done", text: "Done" },
    ],
  },
];

/**
 * A grid of phrase keys. Each row is a scan group (row–column scanning) and each
 * phrase is a scan target whose native `onClick` writes to the message bar.
 */
export function PhraseBoard() {
  const [message, setMessage] = useState<string[]>([]);

  const append = (text: string) => setMessage((prev) => [...prev, text]);
  const clear = () => setMessage([]);
  const backspace = () => setMessage((prev) => prev.slice(0, -1));

  // With nothing selected, Clear and Backspace have nothing to do. Disabling
  // them keeps both channels aligned — the control can't be clicked and the
  // scanner skips them — which also demonstrates a live-updating disabled target.
  const empty = message.length === 0;

  return (
    <Paper
      component="section"
      className={classes.boardPanel}
      p={{ base: "sm", sm: "lg" }}
      aria-label="Phrase board content"
    >
      <Group gap="sm" align="stretch" wrap="nowrap">
        <Paper
          component="output"
          className={classes.messageBar}
          withBorder
          p="md"
          aria-label="Selected phrases"
        >
          {message.join(" ")}
        </Paper>

        <ClearKey onClear={clear} disabled={empty} />
        <BackspaceKey onBackspace={backspace} disabled={empty} />
      </Group>

      <Stack gap="sm" mt="md">
        {ROWS.map((row) => (
          <RowGroup key={row.id} row={row} onSelect={append} />
        ))}
      </Stack>
    </Paper>
  );
}

function RowGroup({
  row,
  onSelect,
}: {
  row: Row;
  onSelect: (text: string) => void;
}) {
  const group = useScanGroup({
    id: row.id,
    label: row.label,
    exitLabel: "Back to rows",
  });

  return (
    <SimpleGrid {...group} cols={3} spacing="sm">
      {row.phrases.map((phrase) => (
        <PhraseKey key={phrase.id} phrase={phrase} onSelect={onSelect} />
      ))}
    </SimpleGrid>
  );
}

function PhraseKey({
  phrase,
  onSelect,
}: {
  phrase: Phrase;
  onSelect: (text: string) => void;
}) {
  const target = useScanTarget({ id: phrase.id, label: phrase.text });
  return (
    <Button
      {...target}
      className={classes.key}
      classNames={{ label: classes.keyLabel }}
      variant="default"
      fullWidth
      onClick={() => onSelect(phrase.text)}
    >
      {phrase.text}
    </Button>
  );
}

function ClearKey({
  onClear,
  disabled,
}: {
  onClear: () => void;
  disabled: boolean;
}) {
  // The same `disabled` flows to the hook (scan-tree eligibility) and to the
  // control (native activation), so the scanner skips exactly what can't be used.
  const target = useScanTarget({ id: "clear", label: "Clear", disabled });
  return (
    <Button
      {...target}
      className={classes.keyClear}
      variant="default"
      disabled={disabled}
      onClick={onClear}
    >
      Clear
    </Button>
  );
}

function BackspaceKey({
  onBackspace,
  disabled,
}: {
  onBackspace: () => void;
  disabled: boolean;
}) {
  const target = useScanTarget({
    id: "backspace",
    label: "Backspace",
    disabled,
  });
  return (
    <Button
      {...target}
      className={classes.keyClear}
      variant="default"
      disabled={disabled}
      onClick={onBackspace}
    >
      Backspace
    </Button>
  );
}
