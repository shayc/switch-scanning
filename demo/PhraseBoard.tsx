import { useState } from "react";
import { useScanGroup, useScanTarget } from "@shayc/switch-scanning";

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
    <section className="board-panel" aria-label="Phrase board content">
      <output className="message-bar">
        {message.length === 0 ? (
          <span className="message-placeholder">
            Selected phrases appear here…
          </span>
        ) : (
          message.join(" ")
        )}
      </output>

      <div className="board">
        {ROWS.map((row) => (
          <RowGroup
            key={row.id}
            row={row}
            disabledIds={thanksDisabled ? THANKS_DISABLED : NONE_DISABLED}
            onSelect={append}
          />
        ))}
        <ClearKey onClear={clear} />
      </div>
    </section>
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
    <div {...group.props} className="board-row">
      {row.phrases.map((phrase) => (
        <PhraseKey
          key={phrase.id}
          phrase={phrase}
          disabled={disabledIds.has(phrase.id)}
          onSelect={onSelect}
        />
      ))}
    </div>
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
    <button
      {...target.props}
      className="key"
      disabled={disabled}
      onClick={() => onSelect(phrase.text)}
    >
      {phrase.text}
    </button>
  );
}

function ClearKey({ onClear }: { onClear: () => void }) {
  const target = useScanTarget({ id: "clear", label: "Clear" });
  return (
    <button {...target.props} className="key key--clear" onClick={onClear}>
      Clear
    </button>
  );
}
