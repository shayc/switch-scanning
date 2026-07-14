# Migrating from 0.1 to 0.2

- The package root is now the framework-agnostic core. React applications must
  import hooks and `ScannerProvider` from `@shayc/switch-scanning/react`.
  `@shayc/switch-scanning/core` remains a compatibility alias.
- `scanner.attachHost(host)` now returns `{ attached, detach() }`; replace calls
  to a callable attachment handle with `attachment.detach()`.
- Rename `snapshot.loop` to `snapshot.pass`. It remains one-based in an active
  scope and `0` without a session. Style configuration still uses `loops`.
- Held step repeat now applies symmetrically to `next` and `previous` using the
  same delay and interval.

- Replace `groupExit: "none"` with `groupExit: "back-only"` and declare at
  least one logical switch whose discrete or tap/hold action is `back`.
  `before`/`after` remain the safe virtual-exit choices.
- `highlight.changed` now also reports clearing. Check
  `event.current === null` before reading `event.label`.
- Snapshots add `position` and `pending`; status can be `transitioning`.
- Single-switch dwell no longer arms on start, resume, selection, activation
  failure, group entry, tree reconciliation, or option changes. Navigate with
  an accepted `next`/`previous` gesture or public command to arm one dwell.
- React registration refs now return `void` and work on both React 18 and 19.
- `stop()` while idle is silent. `dispose()` is silent and leaves an accurate
  idle snapshot; call `stop()` first when observers need a lifecycle event.
- Dedicated keyboard capture remains the default. Mixed-input controls should
  scope `target` or provide `shouldHandle`.
- Remove `metadata` from scan targets. The engine never interpreted or exposed
  it; keep application data in a host-owned map keyed by target ID.

The preview adds `selectionDelay`, automatic `transitionTimeMs`, the
`togglePause` switch action, and `usePointerSwitch`.
