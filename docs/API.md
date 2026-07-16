# API reference

## Imports and runtime

- `@shayc/switch-scanning` is the framework-agnostic core.
- `@shayc/switch-scanning/react` is the declarative React API.
- `@shayc/switch-scanning/react/advanced` exposes React engine assembly.
- `@shayc/switch-scanning/core/testing` provides deterministic fixtures and
  recorders.
- `@shayc/switch-scanning/styles.css` is the optional default presentation.

Published JavaScript is ESM targeting ES2022, with no separate CommonJS build.
Prefer `import` in a modern bundler or JavaScript runtime. CommonJS
interoperability depends on the consuming runtime's ESM support. The core has no
runtime dependencies; React 18 or 19 is an optional peer used only by the React
entry.

## Declarative React API

### `SwitchScanner`

```tsx
<SwitchScanner
  method={autoScan({ intervalMs: 1200, passes: 3 })}
  keyboard={{ Space: "select" }}
  start="input"
  enabled
  behavior={{ afterActivation: "restart" }}
>
  {children}
</SwitchScanner>
```

- `method` is `autoScan`, `stepScan`, `dwellScan`, or `inverseScan`.
- `keyboard` maps `KeyboardEvent.code` directly to a `SwitchAction`, or to a
  gesture definition such as
  `{ tap: "next", hold: { afterMs: 700, action: "select" } }`. Give a gesture
  an `id` to share one logical switch across keys or with a `useSwitch`
  surface; equal definitions may repeat an `id`, conflicting ones throw. The
  `action:`, `key:`, and `switch:` ID namespaces are reserved for generated
  controls and rejected as explicit `id` values.
- `useSwitch` controls declare their switch automatically; there is no
  separate declaration step for on-screen controls. Only bound controls
  exist — a key or surface must map an action before input can trigger it.
- `start` is `"input"` (default), `"mount"`, or `"manual"`.
- `enabled` defaults to `true`.
- `behavior` contains the less-common `afterActivation`, `groupExit`, and
  `selectionDelay` policies described under core options. `groupExit:
"back-only"` is fail-safe here: until some control binds `back`, the default
  group Exit item stays available and a development warning names the missing
  binding, so a misconfiguration can never trap the user inside a group.
- `keyboardOptions` narrows keyboard ownership with `target` or `shouldHandle`.
  Accepted mapped keys are captured, prevented, and stopped by default.

The component owns the scanner, keyboard adapter, DOM host, and target registry.
Its first accepted input starts a session by default. A gesture consumed only
to start does not also perform a discrete action; timed dwell and inverse
contacts continue according to their method.

The method constructors re-exported by the React entry use the same contract as
the package root:

- `autoScan({ intervalMs, passes, firstItemPauseMs?, transitionDurationMs? })`
- `stepScan({ repeat? })`
- `dwellScan({ dwellDurationMs, suspensionPolicy? })`
- `inverseScan({ intervalMs, passes, firstItemPauseMs? })`

`passes` is a positive integer or `"infinite"`. The constructors validate
`passes` themselves, so configuration errors name the field you wrote. The
event contract uses the same vocabulary: completion events report
`reason: "passes"`, and `dwellScan()` produces a method whose `kind` is
`"dwell"`.

### Targets and groups

`useScanTarget(options)` and `useScanGroup(options)` return element props
directly:

```tsx
const target = useScanTarget({ label: "Yes" });
return <button {...target}>Yes</button>;
```

IDs are optional and stable React-generated IDs are used by default. Explicit
`id`, `parentId`, and group `sequence` remain available for portals, durable
data identity, and non-DOM traversal order. Unknown explicit parents stay at
the root and produce a development diagnostic. `__root__` is reserved.

`activate` overrides the default native `element.click()` activation. It is
ignored while the target is structurally or natively disabled.

### Input, state, and lifecycle hooks

- `useSwitch(binding, options?)` returns props for a dedicated pointer/touch
  surface. The binding is a plain action (`useSwitch("select")`) or a gesture
  (`useSwitch({ tap: "next", hold: { afterMs: 700, action: "select" } })`);
  a gesture `id` shares one logical switch with an identical keyboard binding.
  Apply `touch-action: none`. A focused surface also maps Space and Enter.
  Disabled surfaces pass pointer input and generated clicks through. The
  phaseful `scan` action only drives `autoScan`/`inverseScan`; binding it
  under a discrete method produces a development warning.
- `useScannerSnapshot(selector?, equality?)` reads contextual scanner state.
- `useScannerEvents(listener)` observes contextual scanner events without
  resubscribing when the listener identity changes.
- `useScannerCommands()` exposes only `start`, `pause`, `resume`, `stop`, and
  `restart`, keeping input and host internals out of ordinary components.

All these hooks must be descendants of `SwitchScanner`.

## Core scanner options

- `method`: a `ScanMethod` returned by `autoScan`, `stepScan`, `dwellScan`, or
  `inverseScan`.
- `switches`: declared logical switches. Physical adapters call
  `scanner.input.press/release/disconnect` with these IDs.
- `startOn`: `"input"` (default), `"mount"`, or `"manual"`.
  A mount start is a one-shot request for the first eligible moment: the
  scanner must be enabled and idle with a published tree containing at least
  one candidate. An initially empty tree stays `idle` without emitting
  `scan.completed`; the request remains pending until content is published.
  Attaching or replacing a host does not re-arm a consumed mount start.
- `afterActivation`: `"restart"` (default), `"continue"`, `"repeat"`, or
  `"stop"`.
- `groupExit`: `"after"` (default), `"before"`, or `"back-only"`.
  `back-only` requires a declared switch action mapped to `back`.
- `enabled`: disabling cancels active scanning and timers.
- `selectionDelay`: `{ durationMs, resetOnInput?: true }`. Every semantic
  group, exit, or target selection starts protection, including failed target
  activation. Navigation and selection gestures begun during the delay are
  suppressed through release; the deliberate `togglePause` lifecycle action
  remains available. Fast steppers should leave this at `0` unless losing such
  input is an intentional access-method decision.
- `clock`/`scheduler`: creation-only deterministic timing infrastructure.

`scanner.setOptions(...)` **replaces** the complete behavior configuration; it
does not merge a partial update. Omitted optional fields return to their
defaults, and omitting `switches` removes every declared switch. Keep the full
configuration in application state and pass the complete next value:

```ts
const behavior = {
  method: stepScan(),
  switches: {
    move: { action: "next" as const },
    choose: { action: "select" as const },
  },
  startOn: "manual" as const,
};

scanner.setOptions({ ...behavior, enabled: false });
```

Only behavior is replaceable; the clock and scheduler remain fixed for the
scanner's lifetime. Validation is synchronous at the call site even when a
valid update is queued behind event delivery. React applications normally pass
the complete options object to `useOwnedScanner` (from `react/advanced`),
which forwards committed changes.

Method constructors validate eagerly and take per-method options. Their public
types are `AutoScanMethod`, `StepScanMethod`, `DwellScanMethod`, and
`InverseScanMethod`, united by `ScanMethod`; timed pass counts use `PassLimit`:

- `autoScan`: `intervalMs`, `passes` (a positive integer or `"infinite"`),
  optional `firstItemPauseMs`, and optional `transitionDurationMs` — a fixed wait
  before automatic movement resumes after selection. The scanner waits for
  the later of transition time and selection-delay quiet time.
- `stepScan`: optional `repeat: { delayMs, intervalMs }` auto-repeats steps
  while a switch is held; defaults to no repeat.
- `dwellScan`: `dwellDurationMs`, plus `suspensionPolicy` governing an
  armed dwell when the input environment is suspended between arming and
  firing — `"disarm"` (default) retains the highlight but requires a fresh
  navigation before dwell can select again; `"continue"` lets the pending
  dwell fire regardless.
- `inverseScan`: `intervalMs`, `passes`, and optional `firstItemPauseMs`.

## Commands and physical input

`start`, `pause`, `resume`, `stop`, `restart`, `next`, `previous`, `select`,
and `back` are semantic host/caregiver/testing commands. They do not represent
a physical source and bypass gesture stabilization. `scanner.input` is the
end-user path; safety guarantees involving declared switches apply there.

`start()` begins a session only from `idle` or `complete`; while an active or
paused session exists it is diagnosed and ignored. `restart()` explicitly
discards any current session and begins again from the root. Restarting an
active or paused session emits `scan.stopped` before the new `scan.started`.

The bindable `togglePause` switch action pauses from `scanning` or
`transitioning` and resumes from `paused`. Pausing forgets held gestures, so a
fresh gesture is required after resume.

`scanner.attachHost(host)` returns `{ attached, detach() }`. The `attached`
property reports whether the exclusive host slot was acquired, and `detach()`
is idempotent. A second live host is diagnosed and receives a handle with
`attached: false`. Detaching
clears the old host's presentation without discarding the logical session; a
replacement host restores any visible active cursor before accepting input.

## Snapshot

- `status`: `idle`, `scanning`, `transitioning`, `paused`, or `complete`.
- `highlight`: the currently presented group/target/exit, or `null` when no
  highlight is visible.
- `path`: entered group IDs from root to active scope.
- `pass`: one-based active pass, or `0` without a session.
- `position`: zero-based `{ index, count }` in the active scope.
- `pending`: `{ kind, startedAt, dueAt }` for the effective `advance`, `dwell`,
  or `transition` wait. Times use the injected clock.

## Events

Every event carries `at`: the injected clock's time when the event was
produced, on the same time base as snapshot `pending` times. Observers can
measure user reaction times (highlight landing to activation) without owning
the clock.

Lifecycle events are `scan.started`, `scan.paused`, `scan.resumed`,
`scan.transitionStarted`, `scan.transitionEnded`, `scan.completed`, and
`scan.stopped`. Resuming after a transition deadline and changing to a different
method kind both close an in-flight transition with `scan.transitionEnded`.
Terminal cancellation paths such as stop and disable do not also emit it.

`scan.completed` carries reason `passes` or `empty`; `scan.stopped` carries
reason `command`, `disabled`, or `after-activation`.

`highlight.changed` is the single presentation stream. Discriminate on
`current === null`; `label` is present only for a non-null landing.

Physical contact on declared switches is observable through `input.pressed`,
`input.released` (with `heldMs`), and `input.cancelled` (disconnect,
suspension, pause, or a switch-definition change dropping the contact).
`input.pressed` carries a `recognition` descriptor — `immediate`, `stabilize`
(`holdDurationMs`), `hold` (decides on release), or `tapHold` (`holdAfterMs`)
— so hosts can animate hold or stabilization progress without re-implementing
gesture timing. `input.holdRecognized` fires when a still-held press crosses
its nonzero threshold, marking the moment progress feedback should latch.
Commands are not physical input and emit none of these.

`group.entered` and `group.exited` report hierarchy movement. `group.exited`
carries reason `selected-exit`, `back`, `passes-complete`, `empty`, or
`reconcile`; `reconcile` means a live tree change removed or invalidated an
entered scope. Each activation attempt emits `target.activationRequested`,
resolved by `target.activated` or `target.activationFailed` with a
host-supplied `reason`. `diagnostic` events report recoverable integration
errors with a stable `code`.

`scanner.input.disconnect(sourceId)` cancels a physical source without treating
it as a normal release. Omit `sourceId` to disconnect every active source.
`scanner.input.suspend()` signals that the input environment was suspended
(window blur, hidden tab, device lock): it drops every held contact like a
full disconnect and additionally invalidates an armed single-switch dwell per
the method's `suspensionPolicy`, so a stale dwell cannot fire on return.

## Advanced React composition

`@shayc/switch-scanning/react/advanced` is the escape hatch for applications
that need explicit engine ownership or custom adapters. It exports:

- `ScannerProvider`, which attaches the DOM host and registry to an existing
  scanner.
- `useOwnedScanner(options)`, which keeps one scanner instance for a component
  lifetime. Committed option changes are applied in a passive effect; call
  `scanner.setOptions` for a synchronous imperative update.
- `useKeyboardSwitches(scanner, bindings, options?)` and
  `usePointerSwitch(scanner, options)`, which expose the logical-switch adapter
  layer. `usePointerSwitch` returns bare spreadable props.
- `useScanTarget` and `useScanGroup`, exported with the same optional-ID,
  bare-props contract as the declarative entry.
- `useScannerSnapshot` and `useScannerEvents`, exported with the same contextual
  calls as the declarative entry plus explicit-scanner overloads.
- `useScannerContext()`, which exposes the current `scanner` and `registry` as a
  `ScannerContextValue` for custom provider integrations.
- `ScanRegistry` for custom-provider integrations.

The advanced entry does not re-export the core. Import scanner constructors and
types from `@shayc/switch-scanning` and compose the two layers explicitly.

## Testing utilities

`@shayc/switch-scanning/core/testing` exports `manualClock`,
`createScannerFixture`, `recordScannerEvents`, and `createTestScanner`.
`createTestScanner(options, nodes)` accepts
`Omit<ScannerOptions, "clock" | "scheduler">` and returns
`{ clock, scanner, fixture, events }`; its returned manual clock owns both timing
ports, and event recording starts before the fixture attaches so mount-start
events are included.

## CSS

The optional stylesheet uses `data-scan-highlighted`, `data-scan-within`, and
`data-scan-exit-highlighted`. Customize `--scan-outline-width`,
`--scan-outline-color`, `--scan-outline-offset`, `--scan-within-width`,
`--scan-within-color`, and `--scan-within-offset`. Canvas system colors remain
visible in forced-colors modes.

Outside forced-colors mode, the primary indicator combines the
`--scan-outline-color` foreground (default `CanvasText`) with a `Canvas` halo.
Overriding `--scan-outline-color` changes only that foreground layer. The two
system colors follow the element's effective `color-scheme`, so hosts that
support both light and dark themes should declare `color-scheme` accurately.

The default exit indicator is a dashed outline only: it never changes the
group's positioning or containing block, so highlighting cannot reposition
application-owned descendants. The host still receives the exit text in
`data-scan-exit-label` and may render a badge or overlay within its own layout.
Applications that need a programmatic exit announcement should observe
`group.exited` (and, for entry feedback, `group.entered`) with
`useScannerEvents` rather than relying on generated CSS content.
