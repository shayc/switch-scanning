# Architecture decisions

## Dwell arming and causal activation

Single-switch dwell uses a one-shot arming token. An accepted switch-driven
`next`/`previous`, public `scanner.next()`/`previous()`, or a switch gesture
that starts `startOn: "switch"` supplies one token. A dwell selection consumes
it. Starts, resumes, selections, activation failures, group entry, tree
reconciliation, and option changes never arm dwell. This is the implementation
of SS-13 and prevents autonomous repeated output.

## Four timing layers and one transition coordinator

The gesture engine owns raw `holdDurationMs` stabilization and fixed
per-switch `ignoreRepeatMs`. The scanner owns resetting `selectionDelay`; the
automatic style contributes `transitionTimeMs`. One scanner transition
coordinator waits for the later effective deadline, hides presentation while
selection is blocked, exposes `status: "transitioning"` and `pending` timing,
and defines pause/resume/cancel behavior in one place.

Pending timing is pull-based: the snapshot reads `transition.pending ??
style.pending`, with a development invariant that both owners can never be
active together. This keeps each timer's state with its owner and avoids a
shared writable pending field.

## React 18/19 registration

React registration callbacks always return `void`. A shared callback-ref
helper explicitly cleans the previous registry entry and forwarded ref before
mounting a new element, and treats `null` as unmount. This uses one code path
for React 18 and 19 and does not depend on React 19 callback-ref cleanup
returns.

## Guaranteed group escape

`groupExit: "after" | "before"` inserts a virtual exit candidate in every
entered non-root group. Advanced `groupExit: "back-only"` omits that candidate
only when the normalized declared-switch map contains a `back` action,
including tap/hold mappings. Validation happens before active options mutate;
semantic host commands do not satisfy the physical-switch escape contract.
