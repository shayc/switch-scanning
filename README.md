# @shayc/switch-scanning

Add **switch scanning** to your web app: a moving highlight steps through your
existing buttons, and users select the highlighted one with one or two
switches (a key, a big-button switch, a touch surface — any single reliable
action).

Switch scanning is how people with severe motor disabilities operate AAC
communication boards, on-screen keyboards, kiosks, and games. This library
provides the scanning engine; your controls, layout, and actions stay yours.

**[▶ Try the live playground](https://shayc.github.io/switch-scanning/)** — all
four scan styles, row–column scanning, and a touch-switch surface.

## Why this library

- **All four standard scan styles** — automatic, two-switch step,
  single-switch step (dwell), and inverse; the same modes as Apple Switch
  Control, TD Snap, and Grid 3.
- **Zero markup changes** — hooks decorate the elements you already render; no
  wrappers, no layout shifts, no stolen focus.
- **Native activation** — selecting a target clicks your real button, so
  pointer, keyboard, screen reader, and scanner share one code path.
- **Row–column and group scanning** — nest groups to shape traversal; every
  group is guaranteed an exit (no dead ends).
- **Real-hardware safe** — tremor filtering, repeat suppression, tap-vs-hold
  gestures, and stuck-switch protection on window blur.
- **Framework-agnostic core + React bindings** — React 18/19 optional;
  highlight movement causes zero React rerenders.
- **Deterministic and testable** — inject a manual clock and simulate entire
  scan sessions without a browser or timeouts.
- **Accessible by default** — highlight styling works in forced-colors mode
  and never touches DOM focus, tab order, or ARIA.

## Quick start

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
  return (
    <button {...target.props} onClick={() => speak(phrase.text)}>
      {phrase.text}
    </button>
  );
}
```

The highlight steps through the buttons every 1.2 s; pressing Space activates
the highlighted button's own `onClick`.

## Install

```sh
npm install @shayc/switch-scanning
```

| Import                                 | Contents                                    |
| -------------------------------------- | ------------------------------------------- |
| `@shayc/switch-scanning`               | Framework-agnostic engine, styles, switches |
| `@shayc/switch-scanning/react`         | React bindings (re-exports the core)        |
| `@shayc/switch-scanning/styles.css`    | Optional forced-colors-aware highlight CSS  |
| `@shayc/switch-scanning/core/testing`  | Manual clock, fixtures, recorders           |

React is an optional peer dependency (v18 or v19); the core has none.

## Scan styles

| Style                                        | Switches | How it works                            |
| -------------------------------------------- | -------- | --------------------------------------- |
| `autoScan({ intervalMs, loops })`            | 1        | Timer advances; press selects           |
| `stepScan()`                                 | 2        | One switch advances, the other selects  |
| `singleSwitchStepScan({ dwellTimeMs })`      | 1        | Press advances; holding still selects   |
| `inverseScan({ intervalMs, loops })`         | 1        | Hold to advance; release selects        |

Timing values are required where they define the access method — there is no
universal scan speed. One switch can also do tap-to-advance / hold-to-select
as a switch gesture:

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

Rows are groups. `useScanGroup` decorates an element you already own —
selecting the row scans its items; every group gets a virtual exit.

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

Most commercial USB/Bluetooth switch interfaces present as keyboards —
`useKeyboardSwitches` covers them. For a dedicated on-screen touch switch:

```tsx
const touch = usePointerSwitch(scanner, { switchId: "select" });
return <button {...touch.props}>Press here</button>;
```

For any other hardware, drive `scanner.input.press("select")` /
`.release("select")` directly.

## Testing without a browser

```ts
import { createScanner, autoScan } from "@shayc/switch-scanning";
import {
  manualClock,
  createScannerFixture,
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

- **[API reference](docs/API.md)** — all options, events, snapshots, hooks,
  and CSS custom properties.
- **[Specification](docs/SPEC.md)** — what switch scanning is, the settings
  vocabulary across AAC products, and the normative behavioral requirements
  this library is tested against.
- **[OBF adapter example](examples/obf/README.md)** — scanning an Open Board
  Format (AAC) board.

## Scope

The library owns scanning — nothing else. Speech, settings UI and persistence,
styling beyond the default highlight, and your application actions stay in
your app. It complements, and must not replace, OS-level Switch Control /
Switch Access: keep your native HTML, focus, and ARIA intact. Choosing timing
presets suitable for real users still requires evaluation with switch users
and AAC practitioners.

## License

MIT

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). `npm install && npm run dev` serves
the playground locally; `npm test` runs the deterministic suite.
