import type { ScanTargetNode } from "@shayc/switch-scanning";

export interface ObfButton {
  id: string;
  label?: string;
  vocalization?: string;
  action?: string;
  sound_id?: string;
  load_board?: { id?: string; path?: string };
  disabled?: boolean;
}

export interface ObfBoard {
  id: string;
  name?: string;
  locale?: string;
  buttons: readonly ObfButton[];
  grid: {
    rows: number;
    columns: number;
    order: readonly (readonly (string | null)[])[];
  };
}

export type ObfCell =
  | { kind: "empty"; id: string | null }
  | { kind: "ineligible"; button: ObfButton }
  | { kind: "button"; button: ObfButton; speech: string | null };

export interface ObfActivationHost {
  speak(text: string): void;
  playSound(soundId: string): void;
  loadBoard(reference: { id?: string; path?: string }): void;
  performAction(action: string, button: ObfButton): void;
}

export interface ObfScanRow {
  id: string;
  label: string;
  /** Explicit DOM/visual/scan order for this row. */
  sequence: readonly string[];
  targets: readonly ScanTargetNode[];
}

export function buttonLookup(board: ObfBoard): ReadonlyMap<string, ObfButton> {
  return new Map(board.buttons.map((button) => [button.id, button]));
}

export function speechFor(button: ObfButton): string | null {
  const text = button.vocalization ?? button.label;
  return text && text.trim() !== "" ? text : null;
}

export function classifyObfCell(
  id: string | null,
  buttons: ReadonlyMap<string, ObfButton>,
): ObfCell {
  if (id === null) return { kind: "empty", id };
  const button = buttons.get(id);
  if (!button) return { kind: "empty", id };
  if (button.disabled === true) return { kind: "ineligible", button };
  const speech = speechFor(button);
  const actionable =
    speech !== null ||
    button.sound_id !== undefined ||
    button.load_board !== undefined ||
    (button.action !== undefined && button.action.trim() !== "");
  return actionable
    ? { kind: "button", button, speech }
    : { kind: "empty", id };
}

/** Invoke one host-owned OBF action path; returns false for ineligible cells. */
export function activateObfButton(
  button: ObfButton,
  host: ObfActivationHost,
): boolean {
  if (button.disabled === true) return false;
  if (button.load_board) {
    host.loadBoard(button.load_board);
    return true;
  }
  if (button.action && button.action.trim() !== "") {
    host.performAction(button.action, button);
    return true;
  }
  if (button.sound_id) {
    host.playSound(button.sound_id);
    return true;
  }
  const speech = speechFor(button);
  if (speech) {
    host.speak(speech);
    return true;
  }
  return false;
}

/** Generate row groups with identical DOM, visual, and scan order. */
export function buildObfScanRows(board: ObfBoard): readonly ObfScanRow[] {
  const buttons = buttonLookup(board);
  return board.grid.order.flatMap((sourceRow, rowIndex) => {
    const cells = sourceRow
      .map((id) => classifyObfCell(id, buttons))
      .filter(
        (cell): cell is Extract<ObfCell, { kind: "button" }> =>
          cell.kind === "button",
      );
    if (cells.length === 0) return [];
    const targets: ScanTargetNode[] = cells.map(({ button, speech }) => ({
      kind: "target",
      id: button.id,
      label: speech ?? button.id,
    }));
    return [
      {
        id: `obf:${board.id}:row:${rowIndex}`,
        label: `Row ${rowIndex + 1}`,
        sequence: targets.map((target) => target.id),
        targets,
      },
    ];
  });
}
