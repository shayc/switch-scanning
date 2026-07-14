import { useState } from "react";
import { useScanGroup, useScanTarget } from "@shayc/switch-scanning";
import { Button, Paper, SimpleGrid, Stack, Text } from "@mantine/core";

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

/** The one phrase whose eligibility the demo lets you toggle at runtime. */
const TOGGLEABLE_ID = "thank-you";

/**
 * A grid of phrase keys. Each row is a scan group (row–column scanning) and each
 * phrase is a scan target whose native `onClick` writes to the message bar.
 */
export function PhraseBoard({ thanksDisabled }: { thanksDisabled: boolean }) {
  const [message, setMessage] = useState<string[]>([]);

  const append = (text: string) => setMessage((prev) => [...prev, text]);
  const clear = () => setMessage([]);

  return (
    <Paper
      component="section"
      className="board-panel"
      p={{ base: "sm", sm: "lg" }}
      aria-label="Phrase board content"
    >
      <Paper component="output" className="message-bar" withBorder p="md">
        {message.length === 0 ? (
          <Text component="span" c="dimmed">
            Selected phrases appear here…
          </Text>
        ) : (
          message.join(" ")
        )}
      </Paper>

      <Stack gap="sm" mt="md">
        {ROWS.map((row) => (
          <RowGroup
            key={row.id}
            row={row}
            disabledIds={thanksDisabled ? THANKS_DISABLED : NONE_DISABLED}
            onSelect={append}
          />
        ))}
        <ClearKey onClear={clear} />
      </Stack>
    </Paper>
  );
}

const NONE_DISABLED: ReadonlySet<string> = new Set();
const THANKS_DISABLED: ReadonlySet<string> = new Set([TOGGLEABLE_ID]);

function RowGroup({
  row,
  disabledIds,
  onSelect,
}: {
  row: Row;
  disabledIds: ReadonlySet<string>;
  onSelect: (text: string) => void;
}) {
  const group = useScanGroup({
    id: row.id,
    label: row.label,
    exitLabel: "Back to rows",
  });
  return (
    <SimpleGrid {...group.props} cols={3} spacing="sm">
      {row.phrases.map((phrase) => (
        <PhraseKey
          key={phrase.id}
          phrase={phrase}
          disabled={disabledIds.has(phrase.id)}
          onSelect={onSelect}
        />
      ))}
    </SimpleGrid>
  );
}

function PhraseKey({
  phrase,
  disabled,
  onSelect,
}: {
  phrase: Phrase;
  disabled: boolean;
  onSelect: (text: string) => void;
}) {
  // The same `disabled` value flows to the hook (scan-tree eligibility) and to
  // the control (native activation), keeping the two channels aligned.
  const target = useScanTarget({ id: phrase.id, label: phrase.text, disabled });
  return (
    <Button
      {...target.props}
      className="key"
      variant="default"
      fullWidth
      disabled={disabled}
      onClick={() => onSelect(phrase.text)}
    >
      {phrase.text}
    </Button>
  );
}

function ClearKey({ onClear }: { onClear: () => void }) {
  const target = useScanTarget({ id: "clear", label: "Clear" });
  return (
    <Button
      {...target.props}
      className="key key--clear"
      variant="default"
      fullWidth
      onClick={onClear}
    >
      Clear
    </Button>
  );
}
