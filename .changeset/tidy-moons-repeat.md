---
"@shayc/switch-scanning": patch
---

Fix four input and presentation defects.

- **The highlight survives an element swap.** Replacing the element behind a
  stable scan id (a conditional render, a `key` change) publishes an identical
  tree, so the scanner had no highlight change to reveal and kept the decoration
  on the detached node — until the next advance, or indefinitely under step
  scanning. The registry now re-decorates whenever an element is rebound.
- **`ignoreRepeatMs` filters bounce on the release edge.** The window opened
  only at gesture recognition, so any hold longer than it — routine for
  held-step repeat and inverse advancement — released into an already-expired
  window, and contact chatter read as a second actuation: a second `next`, or a
  second selection on an inverse-scan switch. It now re-anchors when a
  recognized contact ends and never shrinks (SPEC SS-3).
- **A quarantined key no longer wedges `usePointerSwitch`.** When window blur
  disconnected a held Space whose key-up was delivered elsewhere, the surface
  claimed and dropped every later Enter press for the rest of its life.
  Quarantine is now tracked per physical key rather than in a single slot.
- **`setOptions` applies `groupExit` alongside a method-kind change.** Passing
  both in one update skipped the exit-policy rebuild, leaving entered scopes
  offering an exit that `"back-only"` forbids (or missing one the new policy
  requires).
