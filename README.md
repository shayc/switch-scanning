# @shayc/switch-scanning

[![CI](https://github.com/shayc/switch-scanning/actions/workflows/ci.yml/badge.svg)](https://github.com/shayc/switch-scanning/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Add **switch scanning** to your web app: a highlight moves through your existing
controls, and users select the highlighted item with one or two switches — a
keyboard key, adaptive switch, touch surface, or any other reliable input.

Switch scanning is how people with significant motor disabilities operate
communication boards, on-screen keyboards, kiosks, and games. This library
provides the scanning engine; your controls, layout, and actions stay yours.

**[▶ Try the live playground](https://shayc.github.io/switch-scanning/)** — all
four scan styles, row–column scanning, and a touch-switch surface.

## Why this library

- **Four established scan styles** — automatic, two-switch step,
  single-switch step with dwell, and inverse scanning, covering the interaction
  patterns switch users already know from AAC and switch-access tools.
- **Works with your existing markup** — hooks decorate the elements you already
  render: no wrappers and no layout shifts. Selecting a target activates its
  existing action, so pointer, keyboard, screen reader, and scanner share one
  code path.
- **Row–column and group scanning** — nest groups to shape traversal. Every
  group includes an Exit item, preventing dead ends.
- **Safe with real hardware** — tremor filtering, repeat suppression,
  tap-versus-hold gestures, and stuck-switch protection when the window loses
  focus.
- **Framework-agnostic core, optional React bindings** — fully typed,
  dependency-free, and compatible with React 18 and 19. Highlight movement does
  not rerender your component tree.
- **Accessible and testable by design** — forced-colors-safe highlighting
  without changing DOM focus, tab order, or ARIA. A manual clock makes complete
  scan sessions deterministic in tests.

## Quick start

```sh
npm install @shayc/switch-scanning
```

A phrase board scanned automatically, with Space as the switch:

```tsx
import {
  ScannerProvider,
  autoScan,
  useKeyboardSwitches,
  useScanner,
  useScanTarget,
} from "@shayc/switch-scanning/react";
import "@shayc/switch-scanning/styles.css";

function PhraseBoard({ phrases }) {
  const scanner = useScanner({
    style: autoScan({ intervalMs: 1200, loops: 3 }),
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

function PhraseButton({ phrase }) {
  const target = useScanTarget({ id: phrase.id, label: phrase.text });
  // The scanner activates this existing onClick.
  return (
    <button {...target.props} onClick={() => speak(phrase.text)}>
      {phrase.text}
    </button>
  );
}
```

The highlight moves every 1.2 seconds. Pressing Space activates the highlighted
button's existing `onClick`.

## Packages

| Import                                | Contents                                    |
| ------------------------------------- | ------------------------------------------- |
| `@shayc/switch-scanning`              | Framework-agnostic engine, styles, switches |
| `@shayc/switch-scanning/react`        | React bindings and core re-exports          |
| `@shayc/switch-scanning/styles.css`   | Optional forced-colors-aware highlight CSS  |
| `@shayc/switch-scanning/core/testing` | Manual clock, fixtures, and recorders       |

React is an optional peer dependency supporting versions 18 and 19. The core has
no runtime dependencies.

## Scan styles

| Style                                   | Switches | How it works                           |
| --------------------------------------- | -------- | -------------------------------------- |
| `autoScan({ intervalMs, loops })`       | 1        | Timer advances; press selects          |
| `stepScan()`                            | 2        | One switch advances; the other selects |
| `singleSwitchStepScan({ dwellTimeMs })` | 1        | Press advances; pause to select        |
| `inverseScan({ intervalMs, loops })`    | 1        | Hold to advance; release selects       |

Timing values are required where they define the access method. There is no
universal scan speed.

A single switch can also use tap-to-advance and hold-to-select:

```tsx
const scanner = useScanner({
  style: stepScan(),
  switches: {
    primary: { tap: "next", hold: { afterMs: 700, action: "select" } },
  },
});
useKeyboardSwitches(scanner, { Space: "primary" });
```

## Row–column scanning

Rows are groups. `useScanGroup` decorates an element you already own. Selecting
a row enters it and scans its items; a virtual Exit item returns to the parent
group.

```tsx
function KeyboardRow({ row, index }) {
  const group = useScanGroup({ id: row.id, label: `Row ${index + 1}` });
  return (
    <div {...group.props}>
      {row.keys.map((key) => (
        <KeyButton key={key.id} value={key} />
      ))}
    </div>
  );
}
```

## Switch input

Most commercial USB and Bluetooth switch interfaces present as keyboards, so
`useKeyboardSwitches` covers them directly. For a dedicated on-screen touch
switch:

```tsx
const touch = usePointerSwitch(scanner, { switchId: "select" });
return <button {...touch.props}>Press here</button>;
```

For custom hardware or adapters, drive `scanner.input.press("select")` /
`.release("select")` directly.

## Testing without a browser

```ts
import { autoScan, createScanner } from "@shayc/switch-scanning";
import {
  createScannerFixture,
  manualClock,
} from "@shayc/switch-scanning/core/testing";

const clock = manualClock();
const scanner = createScanner({
  style: autoScan({ intervalMs: 1000, loops: 3 }),
  clock,
});
const fixture = createScannerFixture(scanner, [
  { kind: "target", id: "yes", label: "Yes" },
  { kind: "target", id: "no", label: "No" },
]);

scanner.start();
clock.advanceBy(1000);
scanner.select();

expect(fixture.activations).toEqual(["no"]);
```

## Documentation

- **[API reference](docs/API.md)** — options, events, snapshots, hooks, and CSS
  custom properties.
- **[Specification](docs/SPEC.md)** — the switch-scanning domain, vocabulary
  used across AAC products, and the normative behavior this library is tested
  against.
- **[OBF adapter example](examples/obf/README.md)** — scanning an Open Board
  Format AAC board.

## Scope

The library owns scanning — nothing else. Speech, settings UI, persistence,
application actions, and styling beyond the default highlight remain in your app.

It complements, and must not replace, OS-level Switch Control and Switch Access:
keep native HTML, focus behavior, and ARIA intact. Choosing timing presets
suitable for real users still requires evaluation with switch users and AAC
practitioners.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). `npm install && npm run dev` serves the
playground locally; `npm test` runs the deterministic suite.

## License

MIT
