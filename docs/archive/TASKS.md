# Improvement Plan (v3) — Archived

> Historical implementation plan. Completed sections preserve the rationale
> and acceptance criteria that produced the current code; `README.md`,
> `docs/API.md`, and `docs/architecture.md` describe the current runtime.

The implementation roadmap for taking `@shayc/switch-scanning` from a strong
0.1 foundation to a production-grade, best-in-class web switch-scanning
library. This plan supersedes v2. It combines the research in `docs/SPEC.md`,
the code and runtime audits, the independent reviews, and the final
architecture review.

The goal is not maximum feature count. The goal is the best attainable AAC
user experience and developer experience through a small, predictable API,
explicit safety invariants, truthful compatibility, complete observability,
and unusually strong verification.

## Current assessment

- Architecture and API foundation: strong.
- Immediate production readiness for switch-dependent AAC users: not yet.
- Highest-risk defect: single-switch dwell can reactivate indefinitely without
  new input.
- Other release blockers: React 18 is advertised but broken, group escape can
  be configured away, lifecycle edges are inconsistent, and the default
  keyboard adapter conflicts with mixed-input controls unless manually scoped.

Projected overall score after this plan: approximately **9.3/10**, conditional
on the release gates and external evaluation at the end of this document.

## Implementation status (July 2026)

The repository now implements Phases 0–5 and the automatable work in Phase 6:
safety/state exploration, React 18/19 and Node matrices, three-engine
Playwright coverage, package-tarball smoke tests, a bundle baseline, risk-based
coverage gates, the OBF integration, and Pages deployment workflow. Phase
6.5 remains deliberately open: [`docs/EVALUATION.md`](./EVALUATION.md) records
the required real-hardware, switch-user, and AAC-practitioner protocol. A
workflow can deploy the demo after merge, but local implementation does not
claim that an external deployment or human evaluation has already occurred.

---

## Design principles

These principles resolve implementation questions throughout the plan.

1. **Causal activation.** The scanner must never request two target
   activations without a new accepted user gesture between them.
2. **Guaranteed escape.** Every entered group must have either a virtual exit
   candidate or a declared logical switch capable of `back`.
3. **Truthful state.** Every state a user or host can perceive—including a
   cleared highlight, blocked input, and a pending timer—must be observable.
4. **One host action path.** Pointer, keyboard, switch scanning, and assistive
   technology must ultimately invoke the host application's existing action.
5. **Separated timing layers.** Raw press stabilization, repeat suppression,
   selection delay, and automatic-scan resumption are related but distinct AAC
   concepts.
6. **Explicit policy.** Where behavior depends on the user's access setup,
   expose a deliberate policy rather than guessing from focus or DOM shape.
7. **Safe defaults, strict advanced modes.** The default should be difficult
   to misuse. Advanced opt-outs must state and validate their prerequisites.
8. **Small public API, richer internal guarantees.** Prefer one cohesive
   internal coordinator over several partially overlapping public settings.
9. **Compatibility claims are executable.** Every advertised React, browser,
   and package-entry contract must have a corresponding CI check.
10. **No 10/10 without users.** Real switch users, AAC practitioners, real
    hardware, and external hosts are release evidence—not optional polish.

## Target architecture

```text
physical signal
  -> input adapter
  -> gesture stabilization
  -> semantic switch action
  -> scanner/session transition
  -> transition coordinator
  -> observable snapshot/events
  -> host presentation/activation
```

Each layer owns one kind of policy. In particular:

- Input adapters translate browser/device signals; they do not implement scan
  semantics.
- The gesture engine owns hold thresholds and per-switch repeat suppression.
- The scanner owns lifecycle, user actions, transition state, and presentation
  state.
- The session owns deterministic tree traversal only.
- The host owns DOM presentation, native activation, speech, persistence, and
  application behavior.

---

# Phase 0 — Freeze the product contract

**Effort:** 0.5–1 day. **Release:** documentation prerequisite for 0.2.

Correct the requirements before changing the implementation. Tests and public
API decisions must point to the corrected contract, not to claims that will be
rewritten later. This ordering does not gate defect work: Phase 1's
characterization tests (1.1) may be written in parallel — nothing in Phase 0
blocks reproducing a known safety defect.

## 0.1 Correct `docs/SPEC.md`

Make all corrections in one reviewable pass:

1. Replace the unsupported “50 confirmed, 0 refuted” framing with a modest
   provenance statement, or link a reproducible claim-by-claim artifact.
2. Correct Windows: the On-Screen Keyboard includes scan-through-keys; the
   accurate gap is the absence of Apple/Android-equivalent system-wide switch
   access.
3. Change “every scanning method” to the baseline one- and two-switch methods;
   elimination and hybrid methods do not fit that binary taxonomy.
4. Change “no timing dependency” for two-switch step to “no response-time
   window.”
5. Rewrite SS-4 around parity of targets, hierarchy, activation, and feedback.
   Loops and first-item pauses are inherently timing-style-specific.
6. Re-scope SS-5 as a host-product responsibility. An unclamped milliseconds
   API enables, but does not itself satisfy, WCAG Timing Adjustable.
7. State that SS-4/SS-5 address only part of accessible timing; do not imply
   EN 301 549 conformance.
8. Rewrite SS-8 to allow declared-ineligible node pruning and configured
   virtual exit candidates.
9. Add **SS-13 (causal activation):** a timer-driven selection MUST be armed by
   exactly one accepted switch navigation or explicit public navigation
   command. That arming token MUST be consumed by the selection, and internal
   transitions MUST NOT create another token.
10. Reword SS-3 to distinguish fixed per-switch repeat suppression from
    resetting selection delay.
11. Correct OBF guidance: actionless labeled buttons may still vocalize;
    unregister only null/empty/ineligible cells.
12. Correct RTL guidance: scan order must be explicit and must match visual
    reading order; CSS visual reversal does not reorder the DOM.
13. Remove the Apple Auto Tap attribution from held step-repeat.
14. Refine scan-from-last-selection: `continue`/`repeat` are in-session
    policies, not fresh-start anchoring.
15. Document After Final Pass as `loops` + `scan.completed` + configured
    restart behavior rather than as a missing traversal primitive.

Primary references to retain:

- React 19 callback-ref cleanup:
  <https://react.dev/blog/2024/12/05/react-19>
- WCAG Timing Adjustable:
  <https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html>
- TD Snap manual:
  <https://download.mytobiidynavox.com/Snap/documents/TD_Snap_UsersManual_en-US.pdf>
- Android Switch Access settings:
  <https://support.google.com/accessibility/android/answer/6301497>

## 0.2 Define the public control contract

Document this distinction in the core API and README:

- `scanner.input` is the end-user physical-input path. Custom hardware
  adapters declare logical switches and call this port.
- `scanner.next()`, `back()`, `pause()`, and related methods are semantic host,
  caregiver, and testing commands.
- Switch safety guarantees refer to the declared logical-switch path.

This makes escape validation, input gating, and custom adapter guidance
coherent.

## 0.3 Record the architectural decisions

Keep four concise decision records in this document or a small
`docs/architecture.md`:

- Dwell arming and SS-13.
- The four timing layers and transition coordinator.
- React 18/19 compatibility strategy.
- Group escape and the `back-only` contract.

### Phase 0 acceptance

- No normative requirement contradicts the implementation it describes.
- Each release task cites a testable requirement.
- Standards language distinguishes library capabilities from host-product
  conformance.

---

# Phase 1 — Safety and compatibility

**Effort:** 3–4 days. **Release:** part of 0.2.0.

Write the failing reproductions before applying each fix.

## 1.1 Add safety characterization tests

Preserve executable reproductions for:

- Autonomous dwell: one input followed by multiple target activations.
- Dwell after group entry.
- Dwell after activation failure.
- React 18 callback-ref unmount producing a phantom target/group.
- `stop()` on idle emitting a false lifecycle event.
- Provider cleanup leaving host decorations behind.
- `dispose()` returning a stale snapshot.
- Mapped Space preventing the demo settings checkbox from toggling.
- `groupExit: "none"` with no back switch trapping a nested scope.

Use `manualClock` for all timing cases. Tests must demonstrate the defect before
the production change is made.

## 1.2 Fix dwell causality (SS-13)

**Current mechanism:** every `landed` call schedules single-step dwell, so
programmatic restart/reconcile/activation-failure landings act like new user
intent.

Do not pass a vague `"input" | "system"` cause through the style layer. Pass
the precise policy it needs:

```ts
styleRuntime.landed({
  firstOfPass,
  armDwell,
});
```

`armDwell` is true only after deliberate navigation. Each of these operations
supplies one arming token:

- An accepted switch-driven `next` or `previous`.
- Public `scanner.next()` or `scanner.previous()`.
- A switch gesture that starts `startOn: "switch"` scanning.

It is false after:

- `start()`, `restart()`, and `resume()`.
- Target activation or activation failure.
- Group entry caused by a dwell selection.
- Any `afterActivation` policy.
- Tree reconciliation.
- Option changes and style relanding.

The dwell timer consumes its arming token when it fires. No internal landing
may recreate that token. Explicit host commands remain explicit operations;
SS-13 prevents autonomous rearming rather than forbidding a host from issuing
multiple commands.

**Touch points:**

- `src/core/styleRuntime.ts`
- `src/core/scanner.ts`
- `src/core/styleRuntime.test.ts`
- `src/core/scanner.styles.test.ts`
- Safety invariant suite added later in 6.1

**Acceptance:**

- The original five-activation reproduction produces exactly one activation,
  followed by silence until new input.
- Every timer-driven selection is causally preceded by one accepted switch
  navigation or explicit public navigation command, and each arming token can
  produce at most one selection.
- Selecting a group never autonomously selects its first child.
- Activation failure, pause/resume, tree changes, and option changes never
  rearm dwell.
- Existing automatic/inverse advancement remains unchanged.

## 1.3 Support React 18 and 19 truthfully

**Decision:** fix the registration seam; do not drop React 18.

Returning cleanup from callback refs is React 19-specific. Replace both
registration refs with one cross-version implementation that:

- Returns `void` from the callback.
- Cleans the previous registration before mounting a new element.
- Handles `element === null` as unmount.
- Applies forwarded refs consistently.
- Handles ref identity and ID changes without double registration.

This is one implementation path, not a permanent feature fork.

**Touch points:**

- `src/react/hooks/useScanTarget.ts`
- `src/react/hooks/useScanGroup.ts`
- A small shared registration-ref helper if it removes real duplication.
- `src/react/registry.test.tsx`
- CI React-version matrix.

**Acceptance:**

- Mount, ref replacement, ID change, Strict Mode, and unmount work under React
  18 and React 19.
- No phantom element-less registration survives unmount.
- Peer ranges remain `^18 || ^19` only after both CI jobs pass.

## 1.4 Make lifecycle and host ownership coherent

Implement these as one lifecycle task:

1. `stop()` while idle is a truly silent no-op. Do not emit either
   `scan.stopped` or `command-inapplicable`; cleanup methods must be safely
   repeatable.
2. `ScannerProvider` cleanup order is `scanner.stop()` ->
   `detachRegistry()` -> `detachHost()` so the host can clear presentation.
3. `dispose()` is silent but accurate: halt/reset/clear, set idle, clear the
   visible highlight, call `commit()`, then clear listeners and drop the host.
   Document “call `stop()` first when observers need a final lifecycle event.”
4. A second live `attachHost()` is diagnosed and rejected; it must not replace
   the first host.
5. Detaching a host asks that host to clear its presentation before ownership
   is released.
6. Attaching a host while a highlight is visible synchronizes the current
   presentation.

**Touch points:**

- `src/core/scanner.ts`
- `src/core/types.ts` JSDoc
- `src/core/scanner.test.ts`
- `src/react/ScannerProvider.tsx`
- `src/react/react.test.tsx`

**Acceptance:**

- Strict Mode mount/unmount/remount produces no false stop event while idle.
- Unmount while scanning clears every decoration before detachment.
- Repeated stop/dispose/detach calls are safe and do not lie through events.
- `getSnapshot()` after dispose is idle with no highlight/path/position.

## 1.5 Guarantee group escape by construction (SS-12)

Replace the ambiguous advanced value:

```ts
type GroupExit = "after" | "before" | "back-only";
```

`"back-only"` means “do not create a virtual exit candidate; a declared
logical switch provides escape.” Validation requires at least one normalized
switch capable of `back`, including tap/hold mappings.

The default remains `"after"`. This is safe, understandable, and needs no
tree-shape predicate.

Validate before mutating the active options. A rejected `setOptions` call must
leave style, switches, session, schedules, and presentation untouched.

**Acceptance:**

- Unsafe `back-only` creation/update throws a consistent `RangeError` naming
  the two fixes.
- Virtual exits remain guaranteed for `before`/`after`.
- Every nested-scope configuration accepted through the declared-switch path
  has a non-activating route back to root.
- Migration notes explain the 0.1 `"none"` rename.

## 1.6 Add an explicit keyboard coexistence policy

Keep dedicated-switch capture as the default. Add:

```ts
shouldHandle?: (event: KeyboardEvent) => boolean;
```

Semantics:

- Consult only for mapped keydown events.
- Returning false means no scanner input and no `preventDefault()`.
- Remember the decision made for each held code.
- Always close an accepted gesture on keyup, even if `enabled`, bindings, or
  the predicate changes before release.
- A rejected keyup passes through untouched.
- Preserve disconnect-on-blur/visibility/unmount behavior.

Document two explicit personas:

- Dedicated switch keyboard: default document capture prevents native
  double-activation.
- Mixed-input application: use `target` scoping or `shouldHandle`.

Fix the demo by excluding/scoping away from its settings panel.

**Touch points:**

- `src/react/hooks/useKeyboardSwitches.ts`
- `src/react/hooks/useKeyboardSwitches.test.tsx`
- `demo/App.tsx` / relevant board container
- README keyboard-ownership section

### Phase 1 acceptance

- All characterization regressions pass.
- The React 18/19 compatibility matrix is green.
- No accepted configuration can produce autonomous repeated target output or
  a nested group without an escape mechanism.

---

# Phase 2 — State and observability foundation

**Effort:** 2–3 days. **Release:** part of 0.2.0.

Implement this before transition timing; otherwise the timing feature will
force a second scanner-state rewrite.

## 2.1 Separate logical cursor from presented highlight

The session may retain a logical cursor while presentation is intentionally
hidden during a transition. Therefore `ScannerSnapshot.highlight` must not
always be derived directly from `session.currentHighlight`.

Add scanner-owned presentation state and one mutation path. Make invalid
highlight/label combinations unrepresentable:

```ts
type Presentation =
  | {
      highlight: NonNullable<Highlight>;
      label: string;
    }
  | null;

setPresentation(next: Presentation);
```

It must:

- Update the visible-highlight snapshot state.
- Call `host.reveal(next?.highlight ?? null)` safely.
- Emit exactly one observable highlight change.
- Suppress duplicate clear/no-change events.

Session traversal remains presentation-agnostic.

## 2.2 Make `highlight.changed` complete

Do not introduce a second `highlight.cleared` concept. Change the existing
event into a union that can express landing and clearing:

```ts
type HighlightChangedEvent =
  | {
      type: "highlight.changed";
      previous: Highlight;
      current: NonNullable<Highlight>;
      label: string;
    }
  | {
      type: "highlight.changed";
      previous: NonNullable<Highlight>;
      current: null;
    };
```

Deliberate trade-off to document in the event reference: both shapes share
one `type`, so consumers discriminate on `current === null` rather than on
the event tag, and `label` exists only for landings. This buys a single
subscription point at the cost of exhaustive-switch ergonomics. If the
discrimination proves awkward in the auditory recipe (5.2), that recipe is
the checkpoint for revisiting a separate `highlight.cleared` type before
0.2.0 ships — not after.

All stop, completion, disable, transition, host-detach, and
after-activation-stop paths use `setPresentation`.

**Acceptance:** a host learns every visible highlight mutation by subscribing
to one event type, with no need to infer clearing from lifecycle events.

## 2.3 Add scan position and pending timing to snapshots

Add:

```ts
position: {
  index: number; // zero-based; document explicitly
  count: number;
} | null;

pending: {
  kind: "advance" | "dwell" | "transition";
  startedAt: number;
  dueAt: number;
} | null;
```

These are stable AAC domain concepts, not scheduler implementation details.
All timestamps use the scanner's injected `Clock`.

`startedAt` is when the currently effective deadline was established. When
input extends the effective transition `dueAt`, update both timestamps. If a
fixed transition deadline still dominates and the effective `dueAt` does not
change, leave both timestamps unchanged. This gives progress UIs one precise,
stable interpretation.

The runtime/style scheduler must report schedule, cancel, expiry, and reset to
the scanner store so snapshots stay accurate. Update `snapshotEquals` and
testing helpers.

This enables accurate:

- Item/pass indicators.
- Auto-scan and dwell progress UI.
- Resetting selection-delay countdowns.
- Caregiver/debugging displays.

## 2.4 Centralize scanner behavior equality for React

`useScanner.ts` manually serializes every behavior option. New fields can be
silently omitted, causing React callers' updates to do nothing.

Create one internal behavior-signature/equality helper and test it against all
public serializable option fields. Infrastructure (`clock`/`scheduler`) remains
creation-only.

Every future scanner option task must include this helper in its touch points.

**Touch points:**

- `src/core/scanner.ts`
- `src/core/scannerStore.ts`
- `src/core/session.ts`
- `src/core/styleRuntime.ts`
- `src/core/types.ts`
- `src/react/hooks/useScanner.ts`
- Snapshot/event consumers in demo and tests

### Phase 2 acceptance

- Snapshots never claim a highlight is visible when the host has been told to
  clear it.
- All scheduled user-perceivable waits have accurate pending metadata.
- New option fields cannot be silently ignored by `useScanner`.

---

# Phase 3 — AAC timing and user control

**Effort:** 3–4 days. **Release:** part of 0.2.0.

## 3.1 Preserve four distinct timing layers

| Layer              | Begins when                     | Scope          | Purpose                                                           |
| ------------------ | ------------------------------- | -------------- | ----------------------------------------------------------------- |
| `holdDurationMs`   | Raw press                       | Source gesture | Ignore contacts that are too short                                |
| `ignoreRepeatMs`   | Gesture accepted                | Logical switch | Fixed bounce/repeat suppression                                   |
| `selectionDelay`   | A semantic selection occurs     | Scanner        | Prevent immediate second selections; optionally reset until quiet |
| `transitionTimeMs` | Automatic scanning would resume | Auto style     | Give the user time before highlighting advances again             |

Do not add `ignoreRepeatMode`. Keep the existing fixed per-switch filter
simple.

Recommended public API:

```ts
interface ScannerBehaviorOptions {
  selectionDelay?: {
    durationMs: number;
    resetOnInput?: boolean; // default true
  };
}

autoScan({
  intervalMs,
  loops,
  firstItemPauseMs,
  transitionTimeMs?, // default 0
});
```

Rationale: TD Snap documents Delay Between Selections (including countdown
reset) and autoscan Transition Time separately. They share implementation
machinery but serve different configuration needs.

Validate finite non-negative values. Constructors remain frozen data.

## 3.2 Implement one internal transition coordinator

Use one scanner-owned coordinator for both public timing controls.

Semantics:

1. A semantic selection includes selecting a group, exit, or target. Start
   selection protection even when target activation fails; the user still made
   a selection attempt.
2. Apply the logical group/exit/`afterActivation` transition immediately.
3. Clear the presented highlight while the transition is active. Do not leave
   an active-looking highlight that cannot be selected.
4. Set public status to `"transitioning"` while presentation/resumption is
   blocked, and keep the event stream symmetric with pause/resume/stop: emit
   `scan.transitionStarted` when the transition begins and
   `scan.transitionEnded` on natural expiry. Cancellation paths do not emit
   `scan.transitionEnded`; they already emit their own lifecycle event
   (`scan.paused`, `scan.stopped`, …), and hosts must not receive two events
   for one exit.
5. In automatic scan, resume only after both the fixed transition deadline and
   the resetting selection-delay quiet deadline have expired.
6. In step/single-step/inverse modes, selection delay still protects the next
   user action even though there is no autonomous advance to resume.
7. When a raw press begins, store `startedDuringTransition` on its gesture
   `SourceState`. The value is immutable for that gesture and is included in
   every `GestureSink` context it produces; never infer it later from the
   scanner's current status.
8. With `resetOnInput: true`, a new declared-switch press moves the quiet
   deadline and updates snapshot timing, including contacts that later fail a
   hold threshold.
9. Discard every resolved action from a gesture whose
   `startedDuringTransition` flag is true except `togglePause`. This suppresses
   the entire gesture through release and prevents an action from leaking
   after the deadline.
10. Tree reconciliation updates hidden logical state but may not prematurely
    reveal or schedule it.
11. When the transition ends, reveal the repaired logical cursor once and
    schedule the applicable style exactly once.

Cancellation/interaction table to specify and test:

- `pause()` during transition: cancel schedules, retain logical cursor,
  become paused.
- `resume()`: continue any remaining transition or reveal immediately if it
  has elapsed.
- `stop()`, `dispose()`, `enabled: false`: cancel and clear everything.
- `restart()`: cancel the old transition and create a fresh normal start;
  command start does not arm dwell.
- Style-kind change: cancel incompatible pending work and reconcile safely.
- Tree change: preserve transition timing, repair logical session silently.
- `afterActivation: "stop"`: stop immediately; do not create a transition.

## 3.3 Add one bindable pause action

Add `"togglePause"` to the discrete switch-action union.

It must:

- Work while scanning, transitioning, or paused.
- Be exempt from transition suppression: any accepted gesture whose resolved
  action is `togglePause` performs even when `startedDuringTransition` is true.
  Exemption is by action, not by switch—there is no "dedicated switch" concept
  in the engine.
- Cancel/forget held scan gestures when pausing.
- Require a fresh gesture after resuming.
- Retain the logical cursor and resume policy.

Do not add separate pause/resume/stop/start action families in 0.x. One toggle
addresses the real switch-user rest need without expanding every mapping.

## 3.4 Complete timing tests

Use `manualClock` and cover:

- Fixed and resetting selection delay.
- Group, exit, successful target, and failed target selections.
- Transition time with every `afterActivation` value.
- Selection delay longer/shorter than auto transition time.
- Input begun during the transition and released afterward.
- The fast intentional stepper: a two-switch user selects a group and
  immediately presses `next` during transition. Assert the press is suppressed
  _by design_, and document this consequence prominently wherever
  `selectionDelay` is described — losing that press must be a configured
  decision, never a surprise.
- Inverse scan and tap/hold gestures crossing the transition boundary.
- Pause/resume/restart/stop/dispose/disable/style/tree changes.
- Snapshot `pending` changes at schedule, reset, cancel, and expiry.
- Zero-duration/default behavior remains unchanged.

### Phase 3 acceptance

- The public state never says `scanning` while all user input and presentation
  are silently blocked.
- Every transition timer is observable and cancellable.
- Raw debounce and selection delay remain independently useful.
- Dwell SS-13 remains true under every timing combination.

---

# Phase 4 — Input breadth and user reach

**Effort:** 1.5–2 days. **Release:** 0.3.0.

## 4.1 Add a dedicated pointer-switch surface

Create `usePointerSwitch` using a returned-props/ref pattern consistent with
the existing React hooks.

Requirements:

- Require an `HTMLElement`; never listen globally on `document`.
- Capture each pointer on `pointerdown`.
- Accept primary mouse button, touch, and pen deliberately.
- Coalesce multiple simultaneous contacts into one logical switch gesture:
  first contact presses, last contact releases.
- `pointercancel`, lost capture, blur, visibility loss, disable, and unmount
  safely disconnect the logical source.
- Suppress native/generated clicks only on the dedicated surface.
- Never interfere with programmatic target `el.click()`.
- Document that the surface intentionally prevents direct touch interaction.
- Expose a stable data attribute and document required `touch-action: none`;
  do not force a conflicting consumer `style` prop.

Use one stable source ID per surface, not one activation-capable source per
finger.

**Testing:** jsdom unit tests plus real-browser pointer capture/click tests in
Phase 6.

## 4.2 Document real switch hardware

Add README recipes for:

- A keyboard-emulating Bluetooth/USB switch using Space or Enter.
- Two-switch step scanning.
- One-switch tap/hold.
- Dedicated keyboard capture.
- Mixed keyboard/direct-input ownership.
- Touch-as-switch surface.
- A custom adapter using declared switches and `scanner.input`.

State that many commercial switch interfaces appear to browsers as keyboards;
`useKeyboardSwitches` is therefore the primary hardware path, not merely a
developer convenience.

### Phase 4 acceptance

- Touch, pen, mouse, and keyboard switch inputs share the same logical-switch
  and gesture semantics.
- No pointer path can double-activate an underlying scan target.
- Lost release/capture cannot leave inverse scanning held open.

---

# Phase 5 — AAC ecosystem, documentation, and storefront

**Effort:** 3–4 days. **Release:** 0.3.0.

## 5.1 Build a correct OBF example

Keep it in `examples/obf/`; do not add package API or runtime dependencies.

Create pure, tested adapter functions for:

- OBF button lookup/classification.
- Speak: `vocalization ?? label`, including labeled buttons without an
  explicit action.
- Sound playback.
- `load_board` navigation through host state.
- Explicit custom actions.
- Disabled/ineligible buttons.
- Truly empty/null cells.
- Row groups and explicit sequence generation.
- LTR/RTL visual and scan-order agreement.

Do not rely on `row-reverse` or visual CSS order to define scan order. Use DOM
order or `useScanGroup({ sequence })` deliberately.

Exercise live tree replacement so registry reconciliation is demonstrated,
not merely unit-tested.

## 5.2 Add an auditory scanning recipe

Demonstrate host-owned speech using scanner events:

- A prompt voice for highlights and a distinct activation/message voice.
- Pause automatic movement until a full audio cue finishes.
- Cancel stale prompt speech when the highlight changes.
- Avoid replay loops across pause/resume.
- Resume safely after synthesis cancellation/error.
- Keep final application speech in the target's existing action path.

If the current event/command API cannot implement this cleanly, treat that as
an API defect and resolve it before documenting a workaround.

## 5.3 Make the demo the reference implementation

The deployed playground must model recommended integration, not only expose
controls.

Include:

- All four scan styles.
- Safe presets before advanced timing controls.
- Dedicated and mixed keyboard ownership.
- Visible dwell armed/waiting state.
- Selection-delay/transition status and progress.
- Position/pass indicators.
- Switch-driven pause/resume.
- Linear and row-column grouping.
- Auditory prompting.
- Touch-as-switch mode.
- Forced-colors/high-contrast-compatible presentation.
- Friendly surfacing of configuration errors.

Deploy through GitHub Pages and link the live demo near the top of the README.
Keep deployment separate from package release logic; reuse existing build/test
steps rather than duplicating them.

## 5.4 Complete documentation

Add or expand:

- Five-minute quickstart.
- Full option and event reference.
- Recipes by access method rather than only by API function.
- Browser and React support policy.
- Host responsibilities versus library guarantees.
- Keyboard/pointer ownership guidance.
- Dynamic-tree and portal guidance.
- Auditory scanning recipe.
- CSS custom-property and forced-colors reference.
- 0.1 -> 0.2 migration guide.
- Common unsafe/misleading configurations and corrected alternatives.
- Accessibility limitations statement.

Test `useScannerEvents` directly: delivery, listener identity changes without
resubscription, scanner replacement, and unmount cleanup.

### Phase 5 acceptance

- A new consumer can implement auto, two-switch step, row-column, hardware
  keyboard, and auditory feedback without reading source.
- Examples use only public APIs and are exercised in CI.
- Documentation never claims host-product conformance on the library's behalf.

---

# Phase 6 — Verification and release gates

**Effort:** 2–3 days plus external evaluation time.

## 6.1 Add invariant and state-machine verification

Use three levels of tests:

1. Focused regression tests for every discovered defect.
2. Table-driven mode/action tests for expected semantics.
3. Bounded state exploration over small trees and action sequences.

The state exploration must assert:

- SS-13: every timer-driven selection consumes exactly one arming token
  supplied by accepted switch navigation or an explicit public navigation
  command; internal transitions never create tokens.
- SS-12: every entered group in every accepted declared-switch configuration
  has a non-activating path back to root.
- Timers cannot fire after stop/dispose/disable/cancellation.
- Presentation and snapshot highlight never disagree.
- Serialized listener reentrancy preserves event and snapshot order.

Avoid relying only on a large Cartesian parameter matrix; it produces volume
without necessarily exploring meaningful state transitions.

## 6.2 Add real-browser tests

Use Playwright on Chromium, Firefox, and WebKit for the behaviors jsdom cannot
prove:

- Native `.click()` activation and form/button behavior.
- Keyboard `preventDefault` and mixed-input pass-through.
- Pointer capture, cancellation, multi-contact coalescing, and generated click
  suppression.
- Visibility/blur disconnect behavior.
- Scrolling to highlighted offscreen targets.
- Strict Mode DOM decoration cleanup.
- Forced-colors/high-contrast styling where supported.

Run an automated accessibility check against the demo, while recognizing that
automated checks do not validate switch usability.

## 6.3 Add package and compatibility tests

- CI React 18 and React 19 React-suite jobs.
- Node 22 and 24 core/build jobs.
- Build and `npm pack` the actual tarball.
- Install/import the tarball in a React fixture.
- Install/import `@shayc/switch-scanning/core` without React present.
- Validate all exports, declarations, source maps, CSS, and package metadata.
- Keep `publint`; add an exported-types/package-shape check such as
  `@arethetypeswrong/cli` if it works cleanly with the package.
- Establish a bundle-size baseline and fail only meaningful regressions.

## 6.4 Use risk-based coverage gates

Do not optimize for a vanity global percentage. Raise expectations around
critical modules:

- Scanner coordinator.
- Session traversal.
- Gesture engine.
- Style runtime.
- Registry and DOM host.
- Keyboard and pointer adapters.

Target approximately 90% statements and 85% branches in these modules, with
explicit justified exclusions only for unreachable platform boundaries.

## 6.5 External AAC evaluation

Before 1.0, evaluate at minimum:

- Keyboard-emulating switch hardware on desktop.
- A touch-switch surface on at least one tablet.
- Automatic, two-switch step, single-step dwell, and inverse scanning.
- Linear and row-column boards.
- Auditory scanning.
- Mixed direct-input/caregiver controls.
- Dynamic board navigation using the OBF example.

Seek structured review from switch users and AAC practitioners. Record issues
by access method, motor behavior, timing configuration, device/browser, and
severity. Do not convert individual preferences into global defaults without
evidence.

### Phase 6 acceptance

- No unresolved safety-critical or high-severity lifecycle defect.
- Advertised browser, React, and package contracts are executable in CI.
- At least one external host uses the public API successfully.
- Real switch/touch evaluation produces no autonomous action, trapped scope,
  lost release, or double activation.

---

# Cut and defer list

## Do not add in the 0.x plan

| Item                                | Decision                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Raw `ignoreRepeatMode: "reset"`     | Do not add. Resetting belongs to scanner-level selection delay; keep per-switch repeat suppression fixed and understandable. |
| Focused-element keyboard heuristics | Do not add. They can natively activate the focused control from a dedicated switch. Use explicit `target`/`shouldHandle`.    |
| Global document pointer capture     | Do not add. It breaks direct touch, scrolling, and mixed input. Require a dedicated surface.                                 |
| Built-in speech                     | Do not add. Speech voice, routing, queuing, and message behavior belong to the host. Prove composition through events.       |
| Settings persistence/profiles       | Do not add. Persistence, identity, sync, and caregiver UI are host-product responsibilities.                                 |
| Point scanning                      | Do not add to this tree engine. It is a geometry-based access method and should be a separate future package/design.         |

## Defer until after 1.0 evidence

- Fresh-start scan-from-last-selection.
- Overscan/independent reverse speed.
- Automatic Selecting.
- Switch elimination.
- Guided calibration.
- Additional framework bindings.
- Larger lifecycle switch-action families beyond `togglePause`.

Reconsider these only with a concrete host/user need and a design that does
not distort the core traversal model.

---

# Release plan

## `0.2.0-next`

One deliberate pre-1.0 breaking preview containing:

- Corrected specification and contracts.
- Dwell causality.
- React 18/19 compatibility.
- Lifecycle/host ownership fixes.
- `groupExit: "back-only"` migration.
- Keyboard coexistence policy.
- Presented-highlight/event changes.
- Position/pending snapshot fields.
- Selection delay, auto transition time, and `"transitioning"` status.
- `togglePause` if its state semantics are complete.

Every consumer-facing change gets a changeset and migration note.

## `0.2.0`

Promote after the compatibility/browser suites are green and at least one
external-host preview has been exercised.

## `0.3.0`

- Pointer switch surface.
- Hardware and auditory recipes.
- OBF example.
- Deployed reference demo.
- Documentation completion.

## `1.0.0`

Release only after:

- The safety/state suites have baked through a full minor cycle.
- No open critical/high defect remains.
- At least one real external application integration exists.
- Real hardware and tablet testing is recorded.
- AAC practitioner and switch-user feedback has been addressed or explicitly
  documented.
- The public API and migration story are stable.

Total engineering estimate: **15–20 focused days**, plus external evaluation
time. This is intentionally more conservative than v2's 7–8 day estimate
because it includes cross-version, real-browser, package, and AAC validation —
and three-browser Playwright suites, bounded state exploration, and the tested
OBF adapter reliably cost more than first estimates suggest.

---

# Projected scorecard

Scores assume every acceptance and release gate is completed, not merely that
the implementation tasks are checked off.

| Dimension                    |   Today | After plan | Remaining gap                                   |
| ---------------------------- | ------: | ---------: | ----------------------------------------------- |
| Switch-user safety           |     4.5 |        9.6 | Longer-term evidence across more motor profiles |
| AAC end-user UX              |     5.5 |        9.1 | Calibration and broader user evaluation         |
| Developer experience         |     7.0 |        9.3 | Only one framework binding                      |
| API coherence                |     8.0 |        9.3 | Real integrations may expose naming refinements |
| Architecture                 |     8.5 |        9.4 | Avoid feature pressure after 1.0                |
| Runtime robustness           |     7.0 |        9.5 | Long-term field behavior                        |
| Testing confidence           |     7.5 |        9.5 | Hardware diversity cannot be fully automated    |
| Documentation/spec integrity |     6.5 |        9.4 | Ongoing vendor/platform drift                   |
| Performance                  |     9.0 |        9.2 | Validate larger real boards                     |
| Ecosystem/adoption readiness |     5.0 |        8.8 | Published third-party integrations              |
| Maintainability              |     8.0 |        9.3 | Sustained contributor experience                |
| Production readiness         |     5.5 |        9.0 | Earned only through real deployments            |
| **Overall**                  | **6.7** |    **9.3** | The last fraction comes from users and time     |

The completed plan should leave the library more capable **and** easier to
understand: one deterministic session, one gesture engine, one transition
coordinator, one presentation channel, explicit input adapters, and a small
declarative API. New complexity is accepted only where it represents a real
AAC concept or closes a verified safety/compatibility gap.
