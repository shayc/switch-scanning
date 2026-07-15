# OBF adapter example

[`adapter.ts`](./adapter.ts) maps an Open Board Format grid into explicit scan
rows. Render each row's `targets` in its `sequence` order and pass that same
sequence to `useScanGroup`; this keeps DOM, visual, and scan order aligned.

[`ObfBoardExample.tsx`](./ObfBoardExample.tsx) is an executable,
public-API-only React integration; its test navigates through `load_board` and
verifies live registry reconciliation.

Board navigation stays in host state. A `load_board` target loads the next OBF
document, React replaces the rendered rows, and the registry republishes the
new tree to the existing scanner. No scanner reset or private API is needed.

```tsx
const [board, setBoard] = useState(initialBoard);
const rows = buildObfScanRows(board);

return rows.map((row) => (
  <ObfRow
    key={row.id}
    row={row}
    onActivate={(button) =>
      activateObfButton(button, {
        speak,
        playSound,
        performAction,
        loadBoard: async (reference) => setBoard(await loadBoard(reference)),
      })
    }
  />
));
```

Null cells, truly empty buttons, and disabled buttons are omitted. Labeled
buttons without an explicit action remain eligible because they can speak
`vocalization ?? label`.
