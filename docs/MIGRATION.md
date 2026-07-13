# Migrating from 0.1 to 0.2

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

The preview adds `selectionDelay`, automatic `transitionTimeMs`, the
`togglePause` switch action, and `usePointerSwitch`.
