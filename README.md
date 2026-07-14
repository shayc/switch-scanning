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

[Open the reference playground](https://shayc.github.io/switch-scanning/) to
try all four styles, row-column scanning, explicit keyboard ownership,
auditory prompts, transition timing, and a dedicated touch-switch surface.

## Install

```sh
npm install @shayc/switch-scanning
```

The core entry points work without React. The `/react` bindings support
`react` and `react-dom` v18 or v19 as peer dependencies.

## Entry points

| Import                                | Contents                                         |
| ------------------------------------- | ------------------------------------------------ |
| `@shayc/switch-scanning`              | Framework-agnostic engine, styles, switches      |
| `@shayc/switch-scanning/core`         | Compatibility alias for the core                 |
| `@shayc/switch-scanning/react`        | React bindings plus core re-exports              |
| `@shayc/switch-scanning/core/testing` | `manualClock`, `createScannerFixture`, recorders |
| `@shayc/switch-scanning/styles.css`   | Optional, forced-colors-aware highlight styles   |

## Automatic scanning in 30 seconds

```tsx
import {
  ScannerProvider,
  autoScan,
  useKeyboardSwitches,
  useScanner,
  useScanTarget,
} from "@shayc/switch-scanning/react";
import "@shayc/switch-scanning/styles.css";

function PhraseBoard({ phrases }: { phrases: Phrase[] }) {
  const scanner = useScanner({
    style: autoScan({ intervalMs: 1_200, loops: 3 }),
    switches: { select: { action: "select" } },
  });

  // The default binding captures mapped keys across the whole document.
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
autoScan({ intervalMs, loops, firstItemPauseMs?, transitionTimeMs? })
stepScan({ repeat? })                                    // next/previous can repeat while held
singleSwitchStepScan({ dwellTimeMs })                    // switch advances; stillness selects
inverseScan({ intervalMs, loops, firstItemPauseMs? })    // hold advances; release selects
```

Timing and loop values that materially define an access method are required —
no universal scan speed is implied. Style constructors return frozen, validated
data.

Step repeat uses the same delay and interval in both directions. Independent
reverse speed is reserved for a future overscan feature.

Use scanner-level `selectionDelay: { durationMs, resetOnInput? }` to protect
the next semantic selection independently of per-switch `ignoreRepeatMs`.
Input begun during that delay is intentionally suppressed through release;
`togglePause` remains available as the deliberate lifecycle exception. Leave
the delay at `0` for fast step users unless losing such a press is deliberate.

### Two switches (step scanning)

```tsx
const scanner = useScanner({
  style: stepScan(),
  switches: { next: { action: "next" }, select: { action: "select" } },
});
useKeyboardSwitches(scanner, { Space: "next", Enter: "select" });
```

Many commercial USB/Bluetooth switch interfaces appear to the browser as a
keyboard. Dedicated switch keyboards should use the default document capture.
Accepted mapped keys are prevented and stopped during capture so they cannot
also reach a focused control. Mixed-input applications should scope ownership
explicitly:

```tsx
useKeyboardSwitches(
  scanner,
  { Space: "next", Enter: "select" },
  {
    shouldHandle: (event) => !settingsPanel.contains(event.target as Node),
  },
);
```

The decision is remembered from keydown through keyup, so option changes
cannot strand an accepted gesture.

The React registry reserves `__root__` for its synthetic root; target and group
IDs must use another value.

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

Every entered non-root group gets a **virtual exit**. Advanced
`groupExit: "back-only"` removes it only when a declared logical switch maps to
`back`; unsafe configurations throw before scanner state changes.

## Physical input and semantic commands

`scanner.input` is the end-user path for hardware adapters. Declare logical
switches and translate device signals into `press`, `release`, and
`disconnect`. `scanner.next()`, `back()`, `pause()`, and the other methods are
semantic host/caregiver/testing commands; physical-switch safety validation
does not treat them as hardware bindings.

### Real hardware recipes

- Keyboard-emulating auto scan: map Space to a declared `select` switch.
- Two-switch step: map one channel to `next` and another to `select`; this has
  no moving-highlight response-time window.
- One-switch tap/hold: map tap to `next` and hold to `select` as shown above.
- Switch-driven rest: add `{ action: "togglePause" }` and bind a key/channel.
- Custom adapter: call `scanner.input.press("next", deviceSourceId)` and the
  matching `release`; call `disconnect(deviceSourceId)` when a release or
  connection is lost.

### Touch, pen, or mouse as a switch

```tsx
const touch = usePointerSwitch(scanner, { switchId: "select" });
return (
  <button {...touch.props} className="switch-pad">
    Press here
  </button>
);
```

Apply `touch-action: none` to this dedicated surface. It captures pointers,
coalesces multiple contacts, disconnects on lost capture/blur, and suppresses
generated pointer clicks on the surface while permitting programmatic
`.click()`. When the surface is focused, non-repeating Space or Enter keydown
and keyup events operate the same logical switch. It intentionally prevents
direct touch interaction, so do not place it over a mixed-input board.

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

For scoped keyboard input, `useKeyboardSwitches` treats an undefined `target`
as the global document and `target: null` as intentionally unattached. A key
accepted by an element target is still released if key-up occurs elsewhere in
that element's document.

Snapshots include zero-based `position` and effective `pending` timing. During
a post-selection wait, status is `transitioning`, the logical cursor is
retained, and the presented `highlight` is `null`. `highlight.changed` reports
both landings and clearing; check `event.current === null` before reading its
landing-only `label`.

See the [full API reference](docs/API.md),
[auditory scanning recipe](docs/auditory-scanning.md),
[OBF adapter example](examples/obf/README.md), and
[preview → 0.2.0 migration guide](docs/MIGRATION.md).

## Testing without a browser

```ts
import { createScanner, autoScan } from "@shayc/switch-scanning";
import {
  manualClock,
  createScannerFixture,
} from "@shayc/switch-scanning/core/testing";

const clock = manualClock();
const scanner = createScanner({
  style: autoScan({ intervalMs: 1_000, loops: 3 }),
  clock,
});
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
npm run dev            # Serve the demo playground (see below)
npm run demo:build     # Build the GitHub Pages playground
npm run lint           # ESLint, including the Rules of Hooks
npm run format:check   # Prettier check
npm run typecheck      # TypeScript without emitting
npm test               # Vitest in jsdom
npm run test:coverage  # Coverage with regression thresholds
npm run build          # ESM, declarations, source maps, and stylesheet
npm run publint        # Validate the packed library shape
```

`npm run dev` serves an AAC-style phrase board (in `demo/`, excluded from the
published package) that exercises the full public API: it switches between all
four scan styles with live timing controls, drives row–column scanning with
keyboard switches, streams the scanner's event log, and optionally speaks
highlights and activations.

## Support and limitations

The package supports React 18 and 19 and targets current evergreen Chromium,
Firefox, and WebKit browsers. Native controls, focus, keyboard behavior, and
ARIA remain host responsibilities so operating-system assistive technology can
coexist. The library enables accessible timing choices; it cannot make a host
WCAG or EN 301 549 conformant by itself.

Speech routing/voices, settings persistence, calibration, point scanning,
switch elimination, and application actions remain outside the package. Real
switch-user and AAC-practitioner evaluation is still required before treating
any timing preset as broadly suitable.

## Status

Implements automatic, step, single-switch step, and inverse styles; logical
switches with stabilization, tap/hold, and phaseful scan; causal dwell;
guaranteed group escape; observable transition timing; keyboard and pointer
adapters; deterministic time and a serialized runtime; host-owned native
activation; and wrapper-free React registration with imperative presentation.

## License

MIT
