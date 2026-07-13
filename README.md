# @shayc/switch-scanning

A small, serious switch-scanning library. It provides in-application scanning
for AAC boards, on-screen keyboards, kiosks, games, and other deliberate
control surfaces: mark your existing controls as scan targets, arrange them into
optional groups, and drive a deterministic highlight-and-activate loop from one
or more switches.

> A scanner advances one highlight through a tree of groups and targets.
> Physical sources operate configured logical switches. Accepted switch
> gestures produce scan actions. Selecting a group narrows the tree; selecting
> an exit widens it. Selecting a target asks the host to activate the
> application's existing action.

The library owns scanning. It does **not** own your controls, layout, styling,
speech, persistence, analytics, or business behavior. It is not a replacement
for operating-system Switch Control / Switch Access — keep your native HTML,
keyboard interaction, focus, and ARIA intact so system-level AT still works.

## Install

```sh
npm install @shayc/switch-scanning
```

`react` and `react-dom` v19 are peer dependencies.

## Entry points

| Import                                    | Contents                                          |
| ----------------------------------------- | ------------------------------------------------- |
| `@shayc/switch-scanning`                  | React hooks + provider (re-exports the core)      |
| `@shayc/switch-scanning/core`             | Framework-agnostic engine, styles, switches       |
| `@shayc/switch-scanning/core/testing`     | `manualClock`, `createScannerFixture`, recorders  |
| `@shayc/switch-scanning/styles.css`       | Optional, forced-colors-aware highlight styles    |

## Automatic scanning in 30 seconds

```tsx
import {
  ScannerProvider,
  autoScan,
  useKeyboardSwitches,
  useScanner,
  useScanTarget,
} from "@shayc/switch-scanning";
import "@shayc/switch-scanning/styles.css";

function PhraseBoard({ phrases }: { phrases: Phrase[] }) {
  const scanner = useScanner({
    style: autoScan({ intervalMs: 1_200, loops: 3 }),
    switches: { select: { action: "select" } },
  });

  useKeyboardSwitches(scanner, { Space: "select" });

  return (
    <ScannerProvider scanner={scanner}>
      {phrases.map((phrase) => (
        <PhraseButton key={phrase.id} phrase={phrase} />
      ))}
    </ScannerProvider>
  );
}

function PhraseButton({ phrase }: { phrase: Phrase }) {
  const target = useScanTarget({ id: phrase.id, label: phrase.text });
  return (
    <button {...target.props} onClick={() => speak(phrase.text)}>
      {phrase.text}
    </button>
  );
}
```

Selecting a DOM target invokes its **existing native activation** (its own
`onClick`). Pointer, touch, keyboard, screen reader, and the scanner therefore
share one application action path.

Pass the same `disabled` value to `useScanTarget` and the underlying control.
Changing the hook option republishes scan-tree eligibility. Native `disabled`
and `aria-disabled` are also read whenever the tree rebuilds and checked again
at activation time, but DOM-only changes do not themselves schedule a rebuild.

## Scan styles

```ts
autoScan({ intervalMs, loops, firstItemPauseMs? })       // timer advances; switch selects
stepScan({ repeat? })                                    // one action advances; another selects
singleSwitchStepScan({ dwellTimeMs })                    // switch advances; stillness selects
inverseScan({ intervalMs, loops, firstItemPauseMs? })    // hold advances; release selects
```

Timing and loop values that materially define an access method are required —
no universal scan speed is implied. Style constructors return frozen, validated
data.

### Two switches (step scanning)

```tsx
const scanner = useScanner({
  style: stepScan(),
  switches: { next: { action: "next" }, select: { action: "select" } },
});
useKeyboardSwitches(scanner, { Space: "next", Enter: "select" });
```

### One switch: tap to advance, hold to select

```tsx
const scanner = useScanner({
  style: stepScan(),
  switches: {
    primary: {
      tap: "next",
      hold: { afterMs: 700, action: "select" },
      holdDurationMs: 80,
      ignoreRepeatMs: 150,
    },
  },
});
useKeyboardSwitches(scanner, { Space: "primary" });
```

Tap-versus-hold is a switch **gesture**, not another scan style.

## Groups and row–column scanning, without inserted markup

`useScanGroup` decorates an element you already own; it inserts no wrapper and
changes no layout. The nearest containing registered group owns descendant
targets by default. Rows are groups, so row–column scanning needs no separate
traversal algorithm.

```tsx
function KeyboardRow({ row, index }: RowProps) {
  const group = useScanGroup({
    id: `row:${row.id}`,
    label: `Row ${index + 1}`,
    exitLabel: "Back to rows",
  });
  return (
    <div {...group.props} className="keyboard-row">
      {row.keys.map((key) => (
        <KeyButton key={key.id} value={key} />
      ))}
    </div>
  );
}
```

Every entered non-root group gets a **virtual exit** (unless `groupExit: "none"`)
so a one-switch route out always exists.

## Two DOM channels

Static registration attributes flow through React once (`data-scan-target`,
`data-scan-group`). Dynamic presentation attributes are written **imperatively**
by the DOM host, so ordinary highlight movement causes **zero React rerenders**:

```
data-scan-highlighted   data-scan-within
data-scan-exit-highlighted   data-scan-exit-label
```

Components that want reactive scanner state opt in with
`useScannerSnapshot(selector, isEqual?)`. Feedback (speech, tones, haptics,
analytics) observes events with `useScannerEvents(listener)`. Commands issued
by a listener run after the transition being observed; listener failures are
reported without interrupting scanning.

## Testing without a browser

```ts
import { createScanner, autoScan } from "@shayc/switch-scanning/core";
import { manualClock, createScannerFixture } from "@shayc/switch-scanning/core/testing";

const clock = manualClock();
const scanner = createScanner({ style: autoScan({ intervalMs: 1_000, loops: 3 }), clock });
const fixture = createScannerFixture(scanner, [
  { kind: "target", id: "yes", label: "Yes" },
  { kind: "target", id: "no", label: "No" },
]);

scanner.start();
clock.advanceBy(1_000);
scanner.select();

expect(fixture.activations).toEqual(["no"]);
```

No browser events, wall-clock waiting, or reducer internals required.

## Development

```sh
npm install
npm test          # vitest
npm run build     # tsc --noEmit && vite build (ESM + .d.ts)
```

## Status

Implements the v1 design: automatic, step, single-switch step, and
inverse styles; logical switches with stabilization, tap/hold, and phaseful
scan; nested scopes with virtual exits; deterministic time and a serialized
runtime; host-owned native activation; and wrapper-free React registration with
imperative highlight presentation.

## License

MIT
