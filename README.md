# @shayc/switch-scanning

[![CI](https://github.com/shayc/switch-scanning/actions/workflows/ci.yml/badge.svg)](https://github.com/shayc/switch-scanning/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Add **switch scanning** to existing React controls. The library moves a visual
highlight through your interface and activates the highlighted element through
its normal click path. Your markup, layout, actions, focus behavior, and ARIA
stay yours.

**[▶ Try the live playground](https://shayc.github.io/switch-scanning/)** — all
four scan methods, row–column scanning, and an on-screen switch.

## Why this library

- Four established methods: automatic, two-switch step, single-switch dwell,
  and inverse scanning.
- Existing controls become targets by spreading one hook result. There are no
  wrappers or parallel action handlers.
- Nested groups provide row–column scanning and always include an escape.
- Physical input is stabilized with tremor filtering, repeat suppression,
  tap/hold recognition, and stuck-switch cleanup.
- Highlight movement is imperative, so it does not rerender your React tree.
- The engine is framework-agnostic, deterministic in tests, and has no runtime
  dependencies. The optional bindings support React 18 and 19.

## Quick start

```sh
npm install @shayc/switch-scanning
```

```tsx
import {
  SwitchScanner,
  autoScan,
  useScanTarget,
} from "@shayc/switch-scanning/react";
import "@shayc/switch-scanning/styles.css";

function Board({ phrases }) {
  return (
    <SwitchScanner
      method={autoScan({ intervalMs: 1200, passes: 3 })}
      keyboard={{ Space: "select" }}
    >
      {phrases.map((phrase) => (
        <BoardButton key={phrase.id} phrase={phrase} />
      ))}
    </SwitchScanner>
  );
}

function BoardButton({ phrase }) {
  const scan = useScanTarget({ label: phrase.text });

  return (
    <button {...scan} onClick={() => speak(phrase.text)}>
      {phrase.text}
    </button>
  );
}
```

That is the complete ordinary integration:

1. `SwitchScanner` owns the session, DOM registry, and input adapter.
2. `method` describes how scanning behaves.
3. `keyboard` maps `KeyboardEvent.code` directly to intent.
4. `useScanTarget` decorates the controls you already have.

The first accepted input starts scanning by default, so the first Space press
lands on the first target and later presses select. Use `start="mount"` to
start when targets appear, or `start="manual"` with `useScannerCommands()`.

## Scan methods

Timing values have no universal good default. Persist values selected with the
switch user rather than hiding them in the integration.

| Method                                | Inputs | Behavior                            |
| ------------------------------------- | ------ | ----------------------------------- |
| `autoScan({ intervalMs, passes })`    | 1      | Timer advances; input selects       |
| `stepScan()`                          | 2      | One input advances; another selects |
| `dwellScan({ dwellDurationMs })`      | 1      | Input advances; waiting selects     |
| `inverseScan({ intervalMs, passes })` | 1      | Holding advances; releasing selects |

```tsx
// Automatic
<SwitchScanner
  method={autoScan({ intervalMs: 1200, passes: 3 })}
  keyboard={{ Space: "select" }}
/>

// Two-switch step
<SwitchScanner
  method={stepScan()}
  keyboard={{ Space: "next", Enter: "select" }}
/>

// Single-switch dwell
<SwitchScanner
  method={dwellScan({ dwellDurationMs: 1000 })}
  keyboard={{ Space: "next" }}
/>

// Inverse: hold to scan, release to choose
<SwitchScanner
  method={inverseScan({ intervalMs: 1000, passes: 3 })}
  keyboard={{ Space: "scan" }}
/>
```

For a single switch that distinguishes tap from hold, put the gesture at the
input it belongs to:

```tsx
<SwitchScanner
  method={stepScan()}
  keyboard={{
    Space: { tap: "next", hold: { afterMs: 700, action: "select" } },
  }}
/>
```

## Groups

`useScanGroup` also returns props directly. Selecting a group enters it;
scanning exposes a virtual Exit item that returns to the parent.

```tsx
function KeyboardRow({ row, index }) {
  const scan = useScanGroup({ label: `Row ${index + 1}` });
  return (
    <div {...scan}>
      {row.keys.map((key) => (
        <KeyButton key={key.id} value={key} />
      ))}
    </div>
  );
}
```

IDs are optional for normal DOM composition. Provide `id`, `parentId`, or an
explicit `sequence` when identity or scan order must outlive the rendered DOM
position, such as portals and data-driven AAC boards.

## On-screen switches and controls

`useSwitch` decorates a dedicated pointer/touch surface. Rendering the surface
declares its logical switch; there is no separate declaration step.

```tsx
function SelectSurface() {
  const scan = useSwitch("select");
  return (
    <button {...scan} style={{ touchAction: "none" }}>
      Select
    </button>
  );
}
```

A surface can also carry a full gesture, so one touch surface distinguishes
tap from hold exactly like a key can:

```tsx
const scan = useSwitch({
  tap: "next",
  hold: { afterMs: 700, action: "select" },
});
```

Keyboard actions are declared by mapping their key code.

Components can read feedback or lifecycle controls without gaining ownership
of the engine:

```tsx
function ScanStatus() {
  const status = useScannerSnapshot((snapshot) => snapshot.status);
  const { pause, resume } = useScannerCommands();
  useScannerEvents((event) => log(event));
  return <output>{status}</output>;
}
```

## Behavior options

Less-common traversal policy stays grouped away from the setup path:

```tsx
<SwitchScanner
  method={stepScan()}
  keyboard={{ Space: "next", Enter: "select", Escape: "back" }}
  behavior={{
    afterActivation: "restart",
    groupExit: "back-only",
    selectionDelay: { durationMs: 250 },
  }}
>
  {children}
</SwitchScanner>
```

## Advanced composition

The default React entry intentionally exposes the application concepts, not
the engine assembly. Import the advanced layer only when you need to share an
externally owned scanner, attach input to a custom event target, replace the
DOM host, or drive custom hardware.

```tsx
import { stepScan } from "@shayc/switch-scanning";
import {
  ScannerProvider,
  useKeyboardSwitches,
  useOwnedScanner,
} from "@shayc/switch-scanning/react/advanced";

function CustomBoundary({ children }) {
  const scanner = useOwnedScanner({
    method: stepScan(),
    switches: {
      move: { action: "next" },
      choose: { action: "select" },
    },
  });
  useKeyboardSwitches(scanner, { Space: "move", Enter: "choose" });
  return <ScannerProvider scanner={scanner}>{children}</ScannerProvider>;
}
```

The framework-agnostic scanner remains available at the package root. Custom
device adapters call `scanner.input.press(id)`, `release(id)`, `disconnect()`,
and `suspend()`.

## Package entries

| Import                                  | Purpose                                  |
| --------------------------------------- | ---------------------------------------- |
| `@shayc/switch-scanning/react`          | Small declarative React API              |
| `@shayc/switch-scanning/react/advanced` | React engine assembly and custom hosts   |
| `@shayc/switch-scanning`                | Framework-agnostic engine                |
| `@shayc/switch-scanning/core/testing`   | Manual clock, fixtures, and recorders    |
| `@shayc/switch-scanning/styles.css`     | Optional accessible highlight stylesheet |

Published JavaScript is ESM targeting ES2022. React is an optional peer
dependency; importing the core does not load React.

## Testing the core

```ts
import { autoScan } from "@shayc/switch-scanning";
import { createTestScanner } from "@shayc/switch-scanning/core/testing";

const { clock, scanner, fixture, events } = createTestScanner(
  { method: autoScan({ intervalMs: 1000, passes: 3 }) },
  [
    { kind: "target", id: "yes", label: "Yes" },
    { kind: "target", id: "no", label: "No" },
  ],
);

scanner.start();
clock.advanceBy(1000);
scanner.select();

expect(fixture.activations).toEqual(["no"]);
expect(events.ofType("target.activated")).toHaveLength(1);
```

## Documentation

- **[API reference](docs/API.md)** — React façade, advanced composition, core
  options, events, snapshots, and CSS.
- **[Specification](docs/SPEC.md)** — behavior and accessibility vocabulary.
- **[OBF adapter](examples/obf/README.md)** — an Open Board Format AAC board.

The library owns scanning, not speech, settings, persistence, or application
actions. It complements rather than replaces OS-level Switch Control and Switch
Access; keep native HTML, focus behavior, and ARIA intact.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). `npm install && npm run dev` serves the
playground; `npm test` runs the deterministic suite.

## License

MIT
