# API reference

## Scanner options

- `style`: `autoScan`, `stepScan`, `singleSwitchStepScan`, or `inverseScan`.
- `switches`: declared logical switches. Physical adapters call
  `scanner.input.press/release/disconnect` with these IDs.
- `startOn`: `"switch"` (default), `"mount"`, or `"command"`.
- `afterActivation`: `"restart"` (default), `"continue"`, `"repeat"`, or
  `"stop"`.
- `groupExit`: `"after"` (default), `"before"`, or `"back-only"`.
  `back-only` requires a declared switch action mapped to `back`.
- `enabled`: disabling cancels active scanning and timers.
- `selectionDelay`: `{ durationMs, resetOnInput?: true }`. Every semantic
  group, exit, or target selection starts protection, including failed target
  activation. Any switch gesture begun during the delay is suppressed through
  release; fast steppers should leave this at `0` unless losing such input is
  an intentional access-method decision.
- `clock`/`scheduler`: creation-only deterministic timing infrastructure.

`autoScan` additionally accepts `transitionTimeMs`, a fixed wait before
automatic movement resumes after selection. The scanner waits for the later
of transition time and selection-delay quiet time.

## Commands and physical input

`start`, `pause`, `resume`, `stop`, `restart`, `next`, `previous`, `select`,
and `back` are semantic host/caregiver/testing commands. They do not represent
a physical source and bypass gesture stabilization. `scanner.input` is the
end-user path; safety guarantees involving declared switches apply there.

The bindable `togglePause` switch action pauses from `scanning` or
`transitioning` and resumes from `paused`. Pausing forgets held gestures, so a
fresh gesture is required after resume.

`scanner.attachHost(host)` returns a callable detach handle whose `attached`
property reports whether the exclusive host slot was acquired. A second live
host is diagnosed and receives a handle with `attached: false`.

## Snapshot

- `status`: `idle`, `scanning`, `transitioning`, `paused`, or `complete`.
- `highlight`: the currently presented group/target/exit, or `null` when no
  highlight is visible.
- `path`: entered group IDs from root to active scope.
- `loop`: one-based active pass, or `0` without a session.
- `position`: zero-based `{ index, count }` in the active scope.
- `pending`: `{ kind, startedAt, dueAt }` for the effective `advance`, `dwell`,
  or `transition` wait. Times use the injected clock.

## Events

Lifecycle events are `scan.started`, `scan.paused`, `scan.resumed`,
`scan.transitionStarted`, `scan.transitionEnded`, `scan.completed`, and
`scan.stopped`. Cancellation paths such as pause/stop do not also emit a
transition-ended event.

`highlight.changed` is the single presentation stream. Discriminate on
`current === null`; `label` is present only for a non-null landing. Group and
target events report hierarchy and activation attempts/results. Diagnostics
report recoverable integration errors.

`scanner.input.disconnect(sourceId)` cancels a physical source without treating
it as a normal release. Omit `sourceId` to disconnect every active source.

## React bindings

- `ScannerProvider` attaches the DOM host and registry.
- `useScanTarget` and `useScanGroup` decorate existing elements without
  wrappers. Use explicit `groupId`/`parentId` for portals and `sequence` when
  DOM order is not scan order.
- `useKeyboardSwitches` captures a dedicated switch keyboard by default. Use
  `target` or `shouldHandle` for mixed-input applications. An undefined target
  defaults to the global document; `target: null` attaches no listeners, which
  is useful while a target ref is unavailable.
- `usePointerSwitch` turns one dedicated element into a coalesced pointer
  source. Apply `touch-action: none`; direct touch on that surface is
  intentionally unavailable.
- `useScannerSnapshot` selects reactive state; `useScannerEvents` observes
  events without resubscribing when listener identity changes.

## CSS

The optional stylesheet uses `data-scan-highlighted`, `data-scan-within`, and
`data-scan-exit-highlighted`. Customize `--scan-outline-width`,
`--scan-outline-color`, `--scan-outline-offset`, `--scan-within-width`,
`--scan-within-color`, and `--scan-within-offset`. Canvas system colors remain
visible in forced-colors modes.
