# Switch Scanning Specification

The contract for `@shayc/switch-scanning`: what switch scanning is, the
industry vocabulary, the normative `SS-*` requirements, and the runtime
semantics two independent implementations must resolve identically. The
`SS-*` identifiers are stable — tests and issues cite them. Sources in
[§11](#11-sources).

## Key terms

Defined precisely in [§6](#6-runtime-semantics). "Accept," "select," and
"activate" are **not** interchangeable.

- **Physical contact → recognized gesture → dispatched action → applied
  transition** — the four input-pipeline stages. Repeat suppression opens at
  _recognition_; the scanner may still decline to _dispatch_.
- **Claimed** — an adapter-owned event (default-prevented,
  propagation-stopped, capture phase) because it maps to a declared switch —
  decided _before_, and independent of, gesture recognition.
- **Arming token** — the single-use permission minted by a trusted navigation
  that allows one dwell selection (SS-13).
- **Selection transition** — the post-selection quiet/fixed window during
  which `status: "transitioning"` and input is blocked.
- **Scope frame** — one entered group's traversal state (index + pass
  counter); `loops` is counted per frame.

## 1. What switch scanning is

Switch scanning is an **indirect** access method: a highlight steps through
choices and the user selects the highlighted one by activating a switch. It
trades **speed and cognitive load** for **reduced motor demand** — one or two
reliable movements operate the whole interface (Burkhart).

Baseline methods use either a _timed_ activation of a _single_ switch, or
_two_ switches with no response-time window:

| Family               | Switches | Timed? | How it works                                             |
| -------------------- | -------- | ------ | -------------------------------------------------------- |
| Automatic (autoscan) | 1        | yes    | Highlight advances on a timer; press selects             |
| Inverse / directed   | 1        | yes    | Hold to advance; release (or separate press) selects     |
| Single-switch step   | 1        | yes    | Press advances; dwelling/holding selects after a timeout |
| Two-switch step      | 2        | **no** | One switch advances, a second selects                    |

The window differs by style: automatic/inverse time the **advance**;
single-switch step times the **dwell** after a press. Only two-switch step has
neither — timed methods assume the user can reliably time a movement, a
documented barrier for people with spastic cerebral palsy and similar motor
profiles (Goodgold-Edwards & Gianutsos, via Burkhart). Two-switch step is
therefore a first-class mode here, not a fallback.

## 2. Scan styles

| This library           | Behavior                                                   | Elsewhere                                                    |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| `autoScan`             | Timer advances; `select` switch picks                      | Apple "Auto Scanning"; TD Snap "1 Switch Autoscan"           |
| `stepScan`             | `next` advances, `select` picks; nontimed                  | Apple "Manual Scanning"; TD Snap "2 Switch Step Scan"        |
| `singleSwitchStepScan` | Press advances; dwell (no input) for `dwellTimeMs` selects | Apple "Single Switch Step Scanning"; TD Snap "1 Switch Dwell Scan" |
| `inverseScan`          | Hold advances; release selects                             | Proloquo2Go "Inverse Scanning"; Grid 3 "Hold to advance"     |

Variants documented elsewhere:

- **Auto-select on timeout** (Proloquo2Go "Automatic Selecting") — not
  implemented ([§9](#9-gaps), gap 3).
- **Hold-to-select on one switch** (TD Snap "1 Switch Scan") — expressible via
  a `tapHold` switch: `tap: "next"`, `hold: { afterMs: 800, action: "select" }`.
- **Switch elimination** (Grid 3: the grid halves/quarters toward a single
  cell) — roadmap only ([§9](#9-gaps), gap 5).
- **Point scanning** (Apple, Android: crosshairs pick screen coordinates) —
  out of scope; this library scans a tree of registered targets, not geometry.

## 3. Scan patterns (traversal order)

Patterns are **the host's concern**: the scanner traverses the group/target
tree the application registers, so pattern is expressed by tree shape.

- **Linear** — flat tree, every target one by one.
- **Row/Column** — one group per row; selecting a row scans its items.
  Column/Row is the transpose.
- **Group / block** — nested groups scanned as units, then their contents
  (also covers screen-region and user-defined-region patterns).

What this places on the engine: selecting a group **narrows** into it, a
group exit or `back` **widens** out, and traversal order is deterministic and
host-controlled.

## 4. Settings vocabulary

The same controls recur across every surveyed product under different names:

| Parameter                     | Meaning                                                                     | Elsewhere (representative)                          | Here                                         |
| ----------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| Scan interval                 | Time the highlight rests on each item                                       | Apple "Auto Scanning Time"; TD Snap "Speed"         | `intervalMs`                                 |
| First-item pause              | Extra dwell on the first item of each pass                                  | Apple "Pause on First Item"                         | `firstItemPauseMs`                           |
| Loops / passes                | Auto-scan cycles before stopping                                            | TD Snap "Number of Passes"; Apple "Loops"           | `loops`                                      |
| Minimum press duration        | Presses shorter than this are ignored (tremor filter)                       | Apple "Hold Duration"; Grid 3 "ignore presses shorter than" | `holdDurationMs`                     |
| Per-switch repeat suppression | After an accepted gesture, further activations ignored for a fixed window   | Android "Ignore repeated presses (Debounce)"        | `ignoreRepeatMs`                             |
| Selection delay               | Post-selection block on scanner actions; input may reset the quiet window   | TD Snap "Delay Between Selections"                  | `selectionDelay`                             |
| Accept on press vs. release   | Which edge of the switch signal triggers the action                         | Android "Release to perform action"                 | `performOn`                                  |
| Dwell to select               | Idle time after which the highlighted item auto-selects                     | TD Snap Dwell "Pause Time"                          | `dwellTimeMs`                                |
| Dwell suspension policy       | What an armed dwell does if the environment is suspended before it fires    | (library-specific safety control)                   | `singleSwitchStepScan({ suspensionPolicy })` |
| Step auto-repeat              | Held step switch repeats advancement after an explicit delay                | product-specific                                    | `stepScan({ repeat })`                       |
| Switch → action mapping       | Assign inputs to next/previous/select/back; many inputs per action          | all platforms                                       | `switches` record + `useKeyboardSwitches`    |
| Highlight style               | Outline/overlay/invert; color and thickness customizable                    | TD Snap "Highlighting"                              | `styles.css` + host CSS                      |
| Auditory prompt               | Speak description or play sound on highlight                                | Grid 3; CoughDrop                                   | host, via scanner events                     |
| Transition time               | Delay between a selection and automatic scanning resuming                   | TD Snap "Transition time"                           | `autoScan({ transitionTimeMs })`             |
| Scan from last selection      | Resume where the last pick was made                                         | TD Snap                                             | gap — [§9](#9-gaps)                          |
| Reverse speed / overscan      | Independent (slower) speed when scanning backwards                          | Grid 3 "overscan"                                   | gap — [§9](#9-gaps)                          |
| Skip empty cells              | Don't scan cells with no action                                             | Grid 3                                              | host (register only actionable targets)      |

## 5. Behavioral requirements

MUST/SHOULD per RFC 2119.

**SS-1 (release-before-advance).** In step scanning, each advancement MUST
require release and re-press. Holding the step switch MUST NOT advance unless
the user explicitly opts into auto-repeat. _Omitting this silently converts
step scanning into inverse scanning (Burkhart)._

**SS-2 (tremor filter).** A minimum press duration below which a press is
ignored, configurable per switch.

**SS-3 (repeat suppression and selection delay).** Two distinct controls:
`ignoreRepeatMs` — a fixed per-logical-switch suppression window opened at
gesture **recognition**, regardless of whether the scanner dispatches the
action — filters switch bounce; `selectionDelay` — a scanner-level
post-selection quiet window whose deadline can reset on newly begun
declared-switch input — protects the next selection.

**SS-4 (timing off-ramp).** Hosts MUST be able to offer a two-switch step
configuration with parity for targets, hierarchy, activation, and feedback.
Timing-only controls (loops, first-item pause) need not exist in step
scanning. _(Burkhart; WCAG 2.2.1 "turn off".)_

**SS-5 (host-adjustable timing).** The library MUST accept unclamped,
validated millisecond values so a host can expose an adjustment range of at
least 10× its default where WCAG 2.2.1 requires it. The host — not this
headless library — owns defaults, settings UI, and persistence.

**SS-6 (bounded passes).** Automatic and inverse styles MUST support a finite
loop limit (fatigue guard) and an explicit infinite option.

**SS-7 (accept edge).** Discrete switches MUST support acting on press or on
release.

**SS-8 (deterministic traversal).** Scan order MUST be fully determined by
the host-registered tree after pruning ineligible nodes (explicitly ineligible,
plus groups whose descendants are all ineligible) and inserting the configured
virtual exit candidate. The engine MUST NOT otherwise reorder, skip, or invent
targets.

**SS-9 (hierarchy).** Selecting a group narrows scanning into it; a group
exit or `back` widens scope again.

**SS-10 (observable highlight).** Every highlight change, selection,
activation, and lifecycle transition MUST be observable (events/snapshots) so
hosts can implement auditory prompts, progress indicators, zoom, and analytics
without engine changes.

**SS-11 (visible highlight).** Default highlight styling MUST remain visible
in forced-colors / high-contrast modes; hosts MUST be able to restyle it
completely. The highlight MUST NOT rely on color alone, MUST remain
distinguishable from the native focus indicator, and MUST NOT alter layout.

**SS-12 (no dead ends).** Scanning MUST never enter a state the user cannot
leave with their configured switches alone: every entered scope MUST have at
least one escape reachable through declared switches — a virtual exit
candidate, a `back` action, a host exit target, or (timed styles) finite scope
exhaustion. `groupExit: "back-only"` therefore _requires_ a declared `back`
switch, validated at construction.

**SS-13 (single-switch dwell arming).** In `singleSwitchStepScan`, a dwell
selection MUST be armed by exactly one **trusted navigation**; the selection
consumes that token, and internal landings never mint one. Public
`next()`/`previous()` are trusted by definition — they are the host's semantic
surface; a host driving them from timers assumes the causality obligation.
_Rationale: every surveyed single-switch dwell mode (TD Snap, Apple) measures
dwell only after a user press, so the initiating press arms; the no-rearm rule
keeps pure inaction from cascading into repeated activation._ A future
auto-selecting style ([§9](#9-gaps), gap 3), where selection by inaction is
designed behavior, is exempt.

| Event                                                           | Token effect | Can dwell then select?    |
| --------------------------------------------------------------- | ------------ | ------------------------- |
| Accepted `next`/`previous` from a declared switch               | **mint**     | yes                       |
| Public `next()` / `previous()` command                          | **mint**     | yes                       |
| Switch gesture that starts scanning under `startOn: "switch"`   | **mint**     | yes                       |
| Dwell selection fires                                           | **consume**  | no (until re-armed)       |
| `suspend()` under `suspensionPolicy: "disarm"` (default)        | **consume**  | no (until re-armed)       |
| `suspend()` under `suspensionPolicy: "continue"`                | no-op        | yes (pending dwell fires) |
| Internal landings: start, resume, `back`, group entry, activation success/failure, reconciliation, option changes | no-op | only if already armed |

The `scanner.invariants.test.ts` invariant "selections ≤ arming commands" is
exactly the statement that consumes never exceed mints.

**SS-14 (focus-independent highlight).** The scan cursor is presentation
state: highlighting MUST NOT move DOM focus, change tab order, or alter
native/ARIA semantics. The default host writes `data-*` attributes only;
focus-follows-cursor is an explicit host opt-in. _Moving real focus every
interval disrupts keyboard users, scrolling, screen readers, and OS-level
switch access._

## 6. Runtime semantics

### Input pipeline

A raw device signal becomes a scan effect in four stages:

1. **Physical contact** — a raw `press`/`release` (or synthetic disconnect)
   for one `(switch, source)` pair, before any stabilization.
2. **Recognized gesture** — a contact that passed stabilization
   (`holdDurationMs`, tap-vs-hold) and the repeat filter (`ignoreRepeatMs`).
   Recognition opens the repeat-suppression window **whether or not** the next
   stage runs.
3. **Dispatched action** — the semantic action the gesture maps to. The
   scanner may still ignore it based on lifecycle state captured at press.
4. **Applied transition** — the scanner mutates traversal/timing state and
   emits the observable effects.

Pre-stage: an event is **claimed** by an adapter the moment it maps to a
declared switch and passes the adapter's scope — before, and independent of,
recognition.

### Timing

- Elapsed time comes from a monotonic clock; only differences are meaningful.
  Deadlines are single-shot: after missed deadlines (background throttling,
  suspension), each pending timer fires at most once and the next deadline is
  scheduled from the actual fire time — never a catch-up burst.
- **Dwell suspension.** An armed dwell MUST NOT survive environment
  suspension under the default policy. `suspend()` — raised by hosts, and by
  the bundled adapters on window blur and visibility loss — cancels the
  pending dwell, retains the highlight, consumes the arming token (SS-13), and
  drops every held contact exactly like `disconnect()`.
  `suspensionPolicy: "continue"` is the explicit opt-out that lets a pending
  dwell fire regardless.
- `firstItemPauseMs` is **added** to `intervalMs` (never a replacement) and
  applies whenever an automatic or inverse pass lands on index 0 of the active
  scope — initial entry, every wrap, any repair landing. Step styles have no
  first-item pause.
- `loops` is counted **per scope frame**. Entering a group starts the child
  scope at pass 1; the parent frame is retained and restored on exit.
  Exhausting a nested scope exits **into the parent** (widening); only root
  exhaustion completes the scan (`scan.completed`, reason `loops`).
  Re-entering a group starts a fresh frame at pass 1. A selection does not
  reset the pass counter; repositioning after activation is governed by
  `afterActivation` (`restart` → root/pass 1, `continue` → step forward). The
  virtual exit candidate is an ordinary scope member and counts toward wrap.
  Only **forward** wrap completes a pass; `previous` never completes or
  reverses one.
- **Selection transition.** Begins when an accepted `select` resolves against
  the highlighted candidate — target, group, or exit alike — and does **not**
  begin for a `select` with no candidate. For a target it begins after the
  host activation attempt returns, **success or failure** (a real press earned
  its debounce either way); it does not begin when `afterActivation` already
  stopped the scanner. While active: `status: "transitioning"`, waiting for
  the **later** of `transitionTimeMs` (automatic style only) and the
  `selectionDelay` quiet window — max, not sum. New declared-switch input
  resets only the quiet component; the fixed component is a floor.
- **Highlight during the transition.** The coordinator hides the highlight
  (`highlight: null`) and re-presents it on resume — a deliberate signal of
  the input-blocked state, distinct from a stopped scanner. The selected
  item's identity is carried on the preceding `target.activated` /
  `group.entered` / `group.exited` event (SS-10); auditory or
  confirmation-highlight hosts render from that.

### Input edges

- With `performOn: "press"`, `holdDurationMs` is validated while the switch
  is down and the action fires at the threshold crossing; with `"release"`,
  nothing fires until release, where held duration is validated. Tap/hold
  switches fire the hold at its threshold; the tap fires on release only when
  the hold did not — mutually exclusive, and a repeat-blocked hold still
  consumes the gesture.
- `ignoreRepeatMs` opens at gesture **recognition** and is keyed per logical
  switch — even when the lifecycle state does not dispatch the action.
- Each `(switch, source)` pair tracks its own contact; duplicate press signals
  for a held source are ignored. For the phaseful inverse-advancement gesture,
  the logical switch opens on the first source press and closes on the
  **last** source release.
- Input during a selection transition still updates contact state and opens
  repeat suppression; the semantic decision is made at action-fire time from
  lifecycle state captured at press, and a suppressed gesture stays suppressed
  through its release.
- Adapters MUST synthesize a disconnect for held sources on window blur,
  visibility loss, adapter disable, and unmount — a lost key-up must never
  leave a logical switch held (an undetected stuck switch would advance
  inverse scanning indefinitely). Disconnect cancels the gesture without
  acting as a release. Blur and visibility loss additionally invoke
  `suspend()`.
- **Post-disconnect quarantine.** A source disconnected while still
  physically held stays quarantined until the adapter observes a real physical
  release. Repeated `down` signals for that source (OS key-repeat, re-fired
  press on refocus) are still **claimed** but MUST NOT open a fresh gesture —
  lost-release protection must not degrade into false re-press. _(Quarantine
  lives in the adapter, which alone sees physical edges.)_
- Keyboard adapters MUST NOT act on, or prevent the default of, unmapped keys.
  A mapped key is **claimed** (prevented, propagation-stopped, capture phase)
  the moment it maps to a declared switch and passes scope; recognition is
  decided later, so a claimed key whose gesture is filtered is still owned. A
  bare-key binding does **not** claim a modifier chord — mapping `Space`
  cannot swallow `Cmd+Space`; hosts widen/narrow ownership via
  `target`/`shouldHandle`.

### Selection and activation ordering

A single accepted `select` produces a fixed, observable event order (there is
no dedicated "selection" event — selection is observable through these):

1. The pending style deadline (dwell/advance) is cancelled.
2. The session resolves the candidate under the cursor.
3. **Target:** `target.activationRequested` → host `activate()` →
   `target.activated` **or** `target.activationFailed`. On success the
   `afterActivation` policy applies (may emit `group.*` / `scan.stopped` or
   silently reposition). **Group / exit:** `group.entered` / `group.exited`.
4. If still `scanning` and a quiet/fixed window is configured, the selection
   transition begins (`scan.transitionStarted`); the highlight hides. The
   transition begins on activation **failure** too; `afterActivation` runs
   only on success.
5. Re-entrant tree mutations from inside `activate()` do not interleave —
   they queue FIFO behind the in-flight command.
6. When the window elapses, `scan.transitionEnded` fires and the highlight is
   re-presented at the resumed position.

### Live tree changes

- Reconciliation runs synchronously inside the serialized command queue;
  re-entrant mutations queue FIFO and never interleave.
- Scopes rebuild top-down. An entered scope is dropped (`group.exited`,
  reason `reconcile`) when no longer an eligible group in its parent or empty.
  The highlight repairs by identity when the previous candidate survives;
  otherwise position is kept, clamped to the last candidate. An empty root
  completes the scan (reason `empty`).
- Reconciliation never preserves or arms a dwell (SS-13) and has no timing
  side effects beyond re-landing.

## 7. Conformance

Automated evidence per requirement (`npm test`, `npm run test:e2e`); paths
relative to `src/`. The switch-hardware protocol in
[EVALUATION.md](EVALUATION.md) is a separate release gate.

| Req   | Status      | Evidence                                                                                                       |
| ----- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| SS-1  | Implemented | `core/scanner.styles.test.ts` (no advancement deadline in step); `core/input/gestures.test.ts` (move repeat)   |
| SS-2  | Implemented | `core/input/gestures.test.ts` (press stabilization)                                                              |
| SS-3  | Implemented | `core/input/gestures.test.ts` (ignore repeat); `core/scanner.safety.test.ts` (transition coordinator)            |
| SS-4  | Implemented | `core/scanner.styles.test.ts`; `core/styles.test.ts` (timed-style identification)                                |
| SS-5  | Implemented | `core/scanner.edges.test.ts` (unclamped timing validation)                                                       |
| SS-6  | Implemented | `core/scanner.styles.test.ts` (completes after configured root passes)                                           |
| SS-7  | Implemented | `core/input/gestures.test.ts` (performOn press/release)                                                          |
| SS-8  | Implemented | `core/session.test.ts` (traversal, reconciliation, exhaustion); `core/session.integration.test.ts`               |
| SS-9  | Implemented | `core/session.integration.test.ts` (groups and exits)                                                            |
| SS-10 | Implemented | event/snapshot assertions across `core/scanner.*.test.ts`; `e2e/demo.spec.ts`                                    |
| SS-11 | Implemented | `e2e/demo.spec.ts` (forced-colors visibility; dark-background contrast)                                          |
| SS-12 | Implemented | `core/scanner.invariants.test.ts` (declared-switch escape); `core/scanner.safety.test.ts` (back-only validation) |
| SS-13 | Implemented (residual: [§9](#9-gaps) gap 6) | `core/scanner.safety.test.ts` (causal dwell; suspension policies); `core/scanner.invariants.test.ts` (selections ≤ arming commands) |
| SS-14 | Implemented | `react/domHost.test.ts` (attribute-only presentation)                                                            |

## 8. Standards & host integration

**WCAG 2.2 SC 2.1.1 Keyboard (A).** All functionality operable through a
keyboard interface; W3C's Understanding material names scanning software among
its beneficiaries. Hosts satisfy it by keeping real, keyboard-operable
controls intact; SS-14 keeps the scan cursor from disturbing them.

**WCAG 2.2 SC 2.2.1 Timing Adjustable (A).** Each time limit must be
turn-off-able, adjustable ≥ 10× the default, or warn-and-extendable. A scanner
cadence the user chooses as an access method is not automatically a
content-imposed limit — treat SS-4/SS-5 as inclusive-design requirements
first, and map to SC 2.2.1 only where the host's analysis finds a
content-set limit. This library alone establishes neither WCAG nor EN 301 549
conformance (EN 301 549 incorporates WCAG by reference; cite exact versions).

**OS-level AT coexistence.** The library scans in-app and must not break
native semantics: hosts keep real HTML controls, focus, keyboard interaction,
and ARIA intact so platform Switch Control / Switch Access still works.
Windows has no system-wide switch-access layer, which is precisely why
application-level scanning matters on Windows and the web.

**Auditory scanning.** First-class in Grid 3 and CoughDrop; clinical practice
adds the **two-voice pattern** — a private _prompt voice_ announces each
scanned item, a public _message voice_ speaks the selection. Speech stays
host-owned; the event stream makes dual prompting trivial (SS-10: highlight
events carry target identity, activation events differ from highlight events).

**Open Board Format.** OBF/OBZ (OpenAAC) is the natural interchange format
for AAC hosts. A board's `grid.order` (2-D array of button IDs or `null`) is
exactly a scanner's traversal matrix: each row → a scan group (row/column), or
flatten for linear. Omit `null`/empty/ineligible cells, but not labeled
buttons without actions (they may vocalize `vocalization ?? label`). Generate
an explicit sequence whose DOM and visual reading order agree for LTR/RTL —
CSS reversal alone does not change scan order. See
[`examples/obf`](../examples/obf); prior art: cboard-org's `react-obf`.

## 9. Gaps

Roughly in value order:

1. **Scan from last selection** (TD Snap): a new session always starts from
   the declared sequence anchor.
2. **Independent reverse speed / overscan** (Grid 3).
3. **Automatic Selecting style** (Proloquo2Go): auto-advance where _inaction_
   selects and a press skips — inverts the timing demand for some users.
4. **Guided calibration** (research direction): measure reaction times and
   suggest `intervalMs` / `holdDurationMs` / `ignoreRepeatMs`.
5. **Switch elimination** (Grid 3): binary/quaternary halving; new paradigm,
   roadmap only.
6. **Dwell suspension residual**
   ([#9](https://github.com/shayc/switch-scanning/issues/9)): a host that
   drives `scanner.input` manually, never calls `suspend()`, and whose tab
   freezes with a dwell pending could fire a stale selection. A
   deadline-overshoot guard in the dwell timer would close it; deferred
   because the deterministic test clock cannot yet exercise overshoot.

TD Snap's "After Final Pass" is not a missing primitive: configure `loops`,
observe `scan.completed`, apply the host's restart behavior.

## 10. Public API

The framework-agnostic core is the package root; React bindings live at
`@shayc/switch-scanning/react` (re-exporting the core).

### Styles — `createScanner({ style })`

| Constructor                                                             | Realizes                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `autoScan({ intervalMs, loops, firstItemPauseMs?, transitionTimeMs? })` | timed advance ([§2](#2-scan-styles)); SS-6; selection transition (§6) |
| `stepScan({ repeat? })`                                                 | nontimed two-switch step (SS-1/SS-4); optional held-step auto-repeat  |
| `singleSwitchStepScan({ dwellTimeMs, suspensionPolicy? })`              | dwell selection (SS-13); disarm-on-suspension (§6)                    |
| `inverseScan({ intervalMs, loops, firstItemPauseMs? })`                 | hold-to-advance, release-to-select; SS-6                              |
| `isTimedStyle(style)`                                                   | timed-vs-nontimed classification (SS-4)                               |

### Commands — `Scanner`

`start()` · `pause()` · `resume()` · `stop()` · `restart()` · `next()` ·
`previous()` · `select()` · `back()`. All serialized and idempotent against
the lifecycle. `next()`/`previous()` are trusted dwell-arming navigations
(SS-13); `back()` widens scope (SS-9) and is the escape for `back-only`
groups (SS-12). Event ordering for `select()` is fixed (§6).

### Input — `Scanner.input` (`ScannerInputPort`)

`press(switchId, sourceId?)` · `release(switchId, sourceId?)` ·
`disconnect(sourceId?)` · `suspend()`. The physical path for declared
switches. Bundled React adapters (`useKeyboardSwitches`, `usePointerSwitch`)
drive this port and own claim/quarantine/suspend behavior (§6, _Input edges_).

### Registration (host-owned tree, SS-8)

Core: `setTree(root: ScanGroupNode)`. React: `useScanTarget()` /
`useScanGroup()` register nodes declaratively; `ScannerProvider` /
`useScanner()` supply the instance.

### Observation (SS-10)

`getSnapshot()` · `subscribe(onChange)` · `observe(listener)`. React:
`useScannerSnapshot(selector, equality?)` · `useScannerEvents(listener)`.
Presentation attaches via `attachHost(host)`; the default DOM host writes
`data-*` only (SS-14).

### Configuration & lifecycle

`setOptions(behaviorOptions)` (clock/scheduler are creation-only) ·
`dispose()`. `ScannerOptions` also carries `switches`, `startOn`,
`afterActivation`, `groupExit`, `enabled`, and `selectionDelay`
([§4](#4-settings-vocabulary)).

## 11. Sources

Platform/vendor:
Apple Switch Control — <https://support.apple.com/guide/ipad/use-switch-control-ipad850ed4e3/ipados> ·
Android Switch Access — <https://support.google.com/accessibility/android/answer/6301497>, <https://support.google.com/accessibility/android/answer/6301490>, <https://support.google.com/accessibility/android/answer/6395627> ·
Proloquo2Go scanning — <https://www.assistiveware.com/support/proloquo2go/alternative-access/scanning-mode> ·
TD Snap User's Manual & Scanning Implementation Guide — <https://download.mytobiidynavox.com/Snap/documents/TD_Snap_UsersManual_en-US.pdf>, <https://downloads.tobiidynavox.com/Software/TD_Snap/TobiiDynavox_Snap_Scanning_ImplementationGuide_en-US.pdf> ·
Smartbox Grid 3 — <https://hub.thinksmartbox.com/knowledgebase/using-switch-scanning-with-grid-3/>, <https://hub.thinksmartbox.com/knowledgebase/how-can-i-speed-up-switch-access-in-grid-3>, <https://hub.thinksmartbox.com/knowledgebase/using-switch-elimination-in-grid-3/> ·
CoughDrop — <https://coughdrop.zendesk.com/hc/en-us/articles/201366669-How-do-I-set-up-scanning-and-switch-options-in-CoughDrop> ·
Windows accessibility / On-Screen Keyboard — <https://support.microsoft.com/en-us/accessibility/windows/discover-windows-accessibility-features>, <https://support.microsoft.com/en-us/windows/use-the-on-screen-keyboard-osk-to-type-ecbb5e08-5b4e-d8c8-f794-81dbf896267a> ·
OpenAAC / Open Board Format — <https://www.openboardformat.org/docs>, <https://github.com/open-aac/openboardformat>, <https://github.com/willwade/obf-node>, <https://github.com/cboard-org/react-obf>

Standards:
W3C WCAG 2.2 — <https://www.w3.org/TR/WCAG22/>, <https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html>, <https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html> ·
ETSI EN 301 549 — <https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf>

Clinical / academic:
Burkhart, L., _Switch Access_ (ASHA Perspectives SIG 12) — <https://lindaburkhart.com/wp-content/uploads/2018/06/ASHA_Persepctives_Switches_Burkhart.pdf> ·
Speed–accuracy optimization of switch keyboards — <https://link.springer.com/article/10.1186/s41235-016-0007-6>
