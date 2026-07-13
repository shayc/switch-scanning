import { useMemo, useState } from "react";
import { useScanGroup, useScanTarget } from "@shayc/switch-scanning";
import {
  activateObfButton,
  buildObfScanRows,
  buttonLookup,
  type ObfActivationHost,
  type ObfBoard,
  type ObfButton,
  type ObfScanRow,
} from "./adapter.ts";

export interface ObfBoardExampleProps {
  initialBoard: ObfBoard;
  loadBoard(reference: { id?: string; path?: string }): Promise<ObfBoard>;
  speak(text: string): void;
  playSound(soundId: string): void;
  performAction(action: string, button: ObfButton): void;
}

/** Public-API-only live OBF navigation example. */
export function ObfBoardExample({
  initialBoard,
  loadBoard,
  speak,
  playSound,
  performAction,
}: ObfBoardExampleProps) {
  const [board, setBoard] = useState(initialBoard);
  const rows = useMemo(() => buildObfScanRows(board), [board]);
  const buttons = useMemo(() => buttonLookup(board), [board]);
  const host: ObfActivationHost = {
    speak,
    playSound,
    performAction,
    loadBoard(reference) {
      void loadBoard(reference).then(setBoard);
    },
  };

  return (
    <section aria-label={board.name ?? board.id} dir={directionForRows(board)}>
      {rows.map((row) => (
        <ObfRow
          key={row.id}
          row={row}
          buttons={buttons}
          activate={(button) => activateObfButton(button, host)}
        />
      ))}
    </section>
  );
}

function ObfRow({
  row,
  buttons,
  activate,
}: {
  row: ObfScanRow;
  buttons: ReadonlyMap<string, ObfButton>;
  activate(button: ObfButton): boolean;
}) {
  const group = useScanGroup({
    id: row.id,
    label: row.label,
    sequence: row.sequence,
  });
  return (
    <div {...group.props} role="group" aria-label={row.label}>
      {row.targets.map((target) => {
        const button = buttons.get(target.id)!;
        return <ObfKey key={target.id} button={button} activate={activate} />;
      })}
    </div>
  );
}

function ObfKey({
  button,
  activate,
}: {
  button: ObfButton;
  activate(button: ObfButton): boolean;
}) {
  const target = useScanTarget({
    id: button.id,
    label: button.vocalization ?? button.label ?? button.id,
  });
  return (
    <button {...target.props} onClick={() => activate(button)}>
      {button.label ?? button.vocalization ?? button.id}
    </button>
  );
}

function directionForRows(board: ObfBoard): "ltr" | "rtl" {
  return ["ar", "fa", "he", "ur"].includes(
    board.locale?.toLowerCase().split(/[-_]/, 1)[0] ?? "",
  )
    ? "rtl"
    : "ltr";
}
