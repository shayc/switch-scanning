# Switch Scanning Specification

A research-grounded specification for `@shayc/switch-scanning`: what switch
scanning is, the canonical taxonomy and settings vocabulary shared across the
industry, normative behavioral requirements, and how the current library API
maps onto them.

**Provenance.** This document synthesizes the primary platform/vendor,
standards, and clinical sources listed in [§14](#14-sources). Platform details
were reviewed in mid-2026, but UI labels and product behavior can drift; the
normative `SS-*` requirements are the library contract, while the product
survey is supporting context.

---

## 1. What switch scanning is

Switch scanning is an **indirect** access method: a highlight steps through
choices and the user selects the currently highlighted one by activating a
switch. It contrasts with **direct selection** (touching/pointing), which is
faster and less cognitively taxing but demands more motor control (Burkhart).

The trade at the heart of every design decision:

> Scanning exchanges **speed** and **cognitive load** for **reduced motor
> demand**. Users pay attention-and-waiting costs so that one or two reliable
> movements suffice to operate the whole interface.

### The unifying model

Burkhart's framework describes the baseline one- and two-switch methods with
one useful rule (elimination and hybrid methods sit outside this binary):

> **Baseline scanning uses either a _timed_ activation of a _single_ switch,
> or activations of _two_ switches without a response-time window.**

| Family               | Switches | Timed? | How it works                                             |
| -------------------- | -------- | ------ | -------------------------------------------------------- |
| Automatic (autoscan) | 1        | yes    | Highlight advances on a timer; press selects             |
| Inverse / directed   | 1        | yes    | Hold to advance; release (or separate press) selects     |
| Single-switch step   | 1        | yes    | Press advances; dwelling/holding selects after a timeout |
| Two-switch step      | 2        | **no** | One switch advances, a second selects                    |

**Two-switch step scanning is the baseline mode with no response-time
window.** Input stabilization and repeat filters may still use time, but the
user need not select before a moving highlight leaves. Timed methods assume
the user can reliably time a movement — a documented barrier for people with
spastic cerebral palsy and similar motor profiles (Goodgold-Edwards &
Gianutsos 1990, via Burkhart). A serious implementation treats two-switch step
scanning as a first-class mode, not a fallback.

## 2. Scan styles (advancing modes)

Canonical styles, with the names other products use for the same thing:

| This library           | Behavior                                                   | Elsewhere                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `autoScan`             | Timer advances; `select` switch picks                      | Apple "Auto Scanning"; Android "Auto-scan"; Proloquo2Go "Automatic Scanning"; TD Snap "1 Switch Autoscan"; Grid 3 "Automatically Advance" |
| `stepScan`             | `next` advances, `select` picks; nontimed                  | Apple "Manual Scanning"; Android "Step scanning"; Proloquo2Go "Step Scanning"; TD Snap "2 Switch Step Scan"; Grid 3 "Tap to advance"      |
| `singleSwitchStepScan` | Press advances; dwell (no input) for `dwellTimeMs` selects | Apple "Single Switch Step Scanning"; TD Snap "1 Switch Dwell Scan"                                                                        |
| `inverseScan`          | Hold advances; release selects                             | Proloquo2Go "Inverse Scanning"; TD Snap "Inverse Scan"; Grid 3 "Hold to advance"                                                          |

Variants documented elsewhere and their status here:

- **Auto-select on timeout** (Proloquo2Go "Automatic Selecting": auto-advance
  and auto-select unless the switch is pressed) — not implemented; see
  [§13](#13-gap-analysis).
- **Hold-to-select on one switch** (TD Snap "1 Switch Scan": press advances,
  _hold_ selects) — expressible today via a `tapHold` switch definition
  (`tap: "next"`, `hold: { afterMs: 800, action: "select" }`; `hold.afterMs`
  is required and sets the TD Snap "Pause Time" threshold at which the hold
  registers). TD Snap documents exactly this "two hit types on the same
  switch" pattern.
- **Switch elimination** (Grid 3): the grid splits into 2 or 4 groups with one
  switch per group; the chosen group re-splits until a single cell remains
  (two-way top/bottom, two-way left/right, or four-way). A distinct
  multi-switch paradigm — out of scope for now, recorded as roadmap.
- **Point scanning** (Android, Apple): moving crosshair lines select an x/y
  screen coordinate. Out of scope — this library scans a tree of registered
  targets, not screen geometry.

## 3. Scan patterns (traversal order)

Patterns are **the host's concern** in this library: the scanner traverses the
group/target tree the application registers, so linear vs. row-column vs.
block scanning is expressed by how the host structures groups.

Industry-standard patterns the host should be able to express (all verified
across TD Snap, Grid 3, Android, Proloquo2Go):

- **Linear** — every target one by one (flat tree).
- **Row/Column** — rows scanned top-down; selecting a row scans its items
  left-to-right (one group per row). **Column/Row** is the transpose.
- **Group / block** — arbitrary named regions scanned as units, then their
  contents (nested groups). Grid 3 allows block layout to differ per page;
  Proloquo2Go's "Linear (Grid only)" pattern scans screen regions (Message,
  Grid, Toolbar) before items — both are host tree-shape decisions.
- **Region scanning** (CoughDrop) — user-defined regions of rows/columns;
  again a grouping decision.

Requirements this places on the engine: selecting a group **narrows** into it;
a group exit (or `back` action) **widens** out; and traversal order must be
deterministic and host-controlled.

## 4. Canonical settings vocabulary

Across the surveyed products a consistent family of controls recurs, though
names, scope, defaults, and interactions differ per product. Cross-product
names are listed so issues/docs can speak every dialect:

| Parameter                     | Meaning                                                                                              | Elsewhere                                                                                                                   | Here                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Scan interval                 | Time the highlight rests on each item                                                                | Apple "Auto Scanning Time"; Android "Auto-scan time"; TD Snap "Speed"; Grid 3 "advance time"; CoughDrop "scanning interval" | `intervalMs`                                 |
| First-item pause              | Extra dwell on the first item of each pass                                                           | Android "Delay on first item"; Grid 3 "pause on first cell"; Apple "Pause on First Item"                                    | `firstItemPauseMs`                           |
| Loops / passes                | Auto-scan cycles before stopping                                                                     | Android "Number of scans"; TD Snap "Number of Passes"; Apple "Loops"                                                        | `loops`                                      |
| Minimum press duration        | Presses shorter than this are ignored (tremor filter)                                                | Apple "Hold Duration"; TD Snap "Pause/Hold Time"; Grid 3 "ignore presses shorter than"                                      | `holdDurationMs`                             |
| Per-switch repeat suppression | After an accepted gesture, further activations of that logical switch are ignored for a fixed window | Android "Ignore repeated presses (Debounce)"; Grid 3 "ignore presses within"; Burkhart "bounce"                             | `ignoreRepeatMs`                             |
| Selection delay               | After any semantic selection attempt, scanner actions are blocked; input may reset the quiet window  | TD Snap "Delay Between Selections"                                                                                          | `selectionDelay`                             |
| Accept on press vs. release   | Which edge of the switch signal triggers the action                                                  | Android "Release to perform action"; Grid 3 "Accept" option                                                                 | `performOn`                                  |
| Dwell to select               | Idle time after which the highlighted item auto-selects                                              | Apple Single Switch Step Scanning duration; TD Snap Dwell "Pause Time"                                                      | `dwellTimeMs`                                |
| Dwell suspension policy       | What an armed dwell does if the input environment is suspended before it fires                       | (library-specific safety control)                                                                                           | `singleSwitchStepScan({ suspensionPolicy })` |
| Step auto-repeat              | Held step switch repeats advancement after an explicit delay                                         | Product-specific held-step repeat settings                                                                                  | `stepScan({ repeat })`                       |
| Switch → action mapping       | Assign inputs to next/previous/select/back etc.; many inputs per action                              | All platforms                                                                                                               | `switches` record + `useKeyboardSwitches`    |
| Highlight style               | Outline / overlay / invert; color and thickness customizable                                         | TD Snap "Highlighting"; Grid 3 styles + progress indicator                                                                  | `styles.css` + host CSS                      |
| Auditory prompt               | Speak description or play sound on highlight                                                         | Grid 3 "Speak description when highlighting"; CoughDrop optional speech                                                     | host, via scanner events                     |
| Transition time               | Delay between a selection and automatic scanning resuming                                            | TD Snap "Transition time"                                                                                                   | `autoScan({ transitionTimeMs })`             |
| Scan from last selection      | Resume where the last pick was made rather than at the top                                           | TD Snap                                                                                                                     | gap — [§13](#13-gap-analysis)                |
| Reverse speed / overscan      | Independent (slower) speed when scanning backwards                                                   | Grid 3 "overscan"                                                                                                           | gap — [§13](#13-gap-analysis)                |
| Skip empty cells              | Don't scan cells with no action                                                                      | Grid 3 scan-coverage options                                                                                                | host (only register actionable targets)      |

## 5. Normative behavioral requirements

Numbered so tests and issues can cite them. MUST/SHOULD per RFC 2119.

**SS-1 (release-before-advance).** In step scanning, each advancement MUST
require the switch to be released and pressed again. Holding the step switch
MUST NOT advance the highlight unless the user explicitly opts into
auto-repeat. _Rationale: Burkhart — omitting the release requirement silently
converts step scanning into inverse scanning._

**SS-2 (tremor filter).** The engine MUST support a minimum press duration
below which a press is ignored, configurable per switch. _(Grid 3, TD Snap,
Apple.)_

**SS-3 (repeat suppression and selection delay).** After a **recognized
gesture** (the input-pipeline stage defined in [§6](#6-runtime-semantics)), the
engine MUST support a fixed, configurable per-logical-switch repeat suppression
window, opened at recognition regardless of whether the scanner's current
lifecycle state dispatches the resulting action. It MUST separately support a
scanner-level post-selection delay — the **selection transition** whose precise
trigger is defined in [§6](#6-runtime-semantics) — whose quiet deadline can
reset on newly begun declared-switch input. These are distinct controls:
`ignoreRepeatMs` filters switch bounce at the gesture stage; `selectionDelay`
protects the next selection at the scanner stage. _(Android, Grid 3, TD Snap,
Burkhart.)_

**SS-4 (timing off-ramp).** Hosts MUST be able to offer a two-switch step
configuration with parity for registered targets, hierarchy, activation, and
feedback. Timing-style-only controls such as loops and first-item pauses need
not exist in step scanning. _(Burkhart; WCAG 2.2.1 "turn off".)_

**SS-5 (host-adjustable timing).** The library MUST accept unclamped,
validated millisecond values so a host product can expose an adjustment range
of at least 10× its default where WCAG 2.2.1 requires it. The host—not this
headless library—owns defaults, settings UI, persistence, and the actual range
offered to users.

**SS-6 (bounded passes).** Automatic and inverse styles MUST support a
finite loop limit after which scanning stops (fatigue guard), as well as an
explicit infinite option. _(Android "Number of scans", TD Snap "Number of
Passes".)_

**SS-7 (accept edge).** Discrete switches MUST support acting on press or on
release. _(Grid 3.)_

**SS-8 (deterministic traversal).** Scan order MUST be deterministic and
fully determined by the host-registered tree after pruning ineligible nodes —
those explicitly declared ineligible, plus any group whose descendants are all
ineligible — and inserting the configured virtual exit candidate. The engine
MUST NOT otherwise reorder, skip, or invent application targets.

**SS-9 (hierarchy).** Selecting a group MUST narrow scanning into that group;
a group exit or `back` action MUST widen scope again. _(Apple Item mode,
Android group selection, TD Snap Group pattern.)_

**SS-10 (observable highlight).** Every highlight change, selection,
activation, and scan lifecycle transition MUST be observable by the host
(events/snapshots) so hosts can implement auditory prompts, progress
indicators, zoom, and analytics without engine changes. _(Grid 3 and CoughDrop
treat spoken/sounded highlight prompts as core; this library delegates the
speaking but MUST supply the signal.)_

**SS-11 (visible highlight).** Default highlight styling MUST remain visible
in forced-colors / high-contrast modes, and hosts MUST be able to restyle it
completely (style, color, thickness). _(TD Snap customizable highlighting.)_
The highlight MUST NOT rely on color alone, MUST remain distinguishable from
the browser's native focus indicator, and MUST NOT alter layout.

**SS-12 (no dead ends).** Scanning MUST never enter a state the user cannot
leave with their configured switches alone. Concretely: every entered scope
MUST have at least one escape reachable through the user's declared logical
switches — an inserted virtual exit candidate, a `back` action, a
host-provided exit target, or (for timed styles) finite scope exhaustion —
loop completion stops cleanly, and stopping is host-recoverable. The
`groupExit: "back-only"` configuration therefore _requires_ a declared switch
mapped to `back`, validated at construction. This is the invariant the
declared-switch escape test asserts; "every scope has an exit" is its
informal shorthand, not a claim that the exit must be a visible candidate.

**SS-13 (single-switch dwell arming).** In `singleSwitchStepScan`, a dwell
selection MUST be armed by exactly one trusted navigation: an accepted
`next`/`previous` from a declared switch, the public `next()`/`previous()`
commands, or a switch gesture that starts scanning under `startOn: "switch"`.
Public navigation commands are trusted **by definition** — they are the host's
semantic surface, and a host that drives them from timers or other non-user
sources assumes the causality obligation itself. The selection consumes that
arming token; so does environment suspension under the default
`suspensionPolicy: "disarm"` ([§6](#6-runtime-semantics)), which retains the
highlight but requires a fresh trusted navigation before dwell can select
again. Command/mount starts, resumes, `back`, group entry, activation
success/failure, tree reconciliation, option changes, and other internal
landings MUST NOT create a replacement token. This requirement is scoped to
dwell step scanning: a future auto-selecting style
([§13](#13-gap-analysis), gap 3), where selection by inaction is the designed
behavior, is exempt by definition. _Rationale: dwell selection follows a user
action in every surveyed single-switch mode — TD Snap 1 Switch Dwell Scan
("trigger the switch to advance… pause to select") and Apple Single Switch
Step Scanning both measure dwell only after a press — so the initiating press
arms. The no-rearm rule for internal landings is a conservative library safety
policy that keeps pure inaction from cascading into repeated activation._

**SS-14 (focus-independent highlight).** The scan cursor is presentation
state: highlighting MUST NOT move DOM focus, change tab order, or alter
native/ARIA semantics. The default host writes `data-*` attributes only.
Hosts that want focus to follow the cursor must opt in explicitly; the engine
never does it for them. _Rationale: moving real focus on every scan interval
disrupts keyboard users, scroll behavior, screen-reader output, and OS-level
switch access ([§8](#8-standards-conformance))._

## 6. Runtime semantics

Two independent implementations of this spec must resolve timing, input-edge,
and mutation questions identically. These are the decided semantics; [§7](#7-conformance)
links each requirement to its automated evidence.

### Input pipeline vocabulary

A raw device signal becomes a scan effect in four named stages. The rest of
this document uses these terms precisely; "accept," "select," and "activate"
are **not** interchangeable.

1. **Physical contact** — a raw `press`/`release` (or synthetic disconnect)
   for one `(switch, source)` pair, before any stabilization.
2. **Recognized gesture** — a contact that has passed stabilization
   (`holdDurationMs`, tap-vs-hold) and the per-switch repeat filter
   (`ignoreRepeatMs`). Recognition opens the repeat-suppression window
   **whether or not** the next stage runs.
3. **Dispatched action** — the semantic action (`next`, `select`, …) the
   recognized gesture maps to. The scanner may still ignore it based on
   lifecycle state captured at press (e.g. a gesture that began before a
   pause).
4. **Applied transition** — the scanner mutates traversal/timing state and
   emits the observable effects (highlight, group, activation, lifecycle
   events).

Adapter-side keyboard/pointer ownership adds a pre-stage term: an event is
**claimed** by an adapter (default prevented, propagation stopped, in the
capture phase) the moment it maps to a declared switch and passes the
adapter's scope — before, and independent of, whether the gesture is later
recognized.

### Timing

- Elapsed time MUST come from a monotonic clock; only differences are
  meaningful. Deadlines are single-shot: when execution resumes after missing
  one or more deadlines (background throttling, main-thread suspension), each
  pending timer fires at most once and the next deadline is scheduled relative
  to the actual fire time. The engine MUST NOT replay missed intervals as a
  catch-up burst.
- **Dwell suspension.** An armed single-switch dwell MUST NOT survive an
  environment suspension under the default policy. A host (or the bundled
  adapters, on window blur and document-visibility loss) signals suspension
  through `suspend()`; under `singleSwitchStepScan`'s default
  `suspensionPolicy: "disarm"` this cancels the pending dwell, retains the
  highlight, and consumes the arming token (SS-13) so a fresh trusted
  navigation is required before dwell can select again. `suspend()` also drops
  every held contact, exactly like a full `disconnect()`. `suspensionPolicy:
"continue"` is the explicit opt-out that lets a pending dwell fire
  regardless. This is symmetric with the held-source disconnect rule under
  _Input edges_: both treat an environment suspension as untrusted. The one
  residual is a host that drives input manually, never calls `suspend()`, and
  whose tab freezes with a dwell pending ([§13](#13-gap-analysis), gap 6).
- `firstItemPauseMs` is **added** to `intervalMs` (never a replacement) and
  applies whenever an automatic or inverse pass lands on index 0 of the
  active scope — initial entry, every pass wrap, and any repair or scope
  landing at index 0. Step styles have no first-item pause.
- `loops` is counted **per scope frame**. Entering a group starts the child
  scope at pass 1; the parent frame's index and pass counter are retained and
  restored on exit. Exhausting the root completes the scan
  (`scan.completed`, reason `loops`); exhausting a nested scope exits that
  group. _Rationale and boundary cases:_ a nested scope is a self-contained
  fatigue-bounded sub-traversal, so its local pass limit ejects **into the
  parent** (widening scope), never stopping the whole session — only the root
  frame's exhaustion completes the scan. Re-entering a group creates a fresh
  frame at pass 1 (the previous count is not resumed). A selection does **not**
  itself reset the pass counter; repositioning after activation is governed by
  `afterActivation` (`restart` returns to root/pass 1, `continue` steps
  forward normally). The inserted virtual exit candidate is an ordinary member
  of the scope, so it is visited within each pass and counts toward wrap.
  Passes are completed only by **forward** wrap (automatic ticks, inverse
  advancement, `next`); `previous`/backward stepping never completes or
  reverses a pass.
- **Selection transition.** The coordinator that enforces the post-selection
  quiet window begins when an accepted `select` resolves against the currently
  highlighted candidate — **target, group, or exit alike** — and does **not**
  begin for a `select` that finds no candidate (`status` stays `scanning`).
  For a target it begins after the host activation attempt returns, **whether
  it reports success or failure** (a real press earned its debounce either
  way); it does not begin when `afterActivation` has already stopped the
  scanner. While active it reports `status: "transitioning"` and waits for the
  **later** of the fixed `transitionTimeMs` (automatic style only) and the
  `selectionDelay` quiet window — max, not sum. Newly begun declared-switch
  input resets only the quiet component; the fixed component is a floor input
  cannot shorten.
- **Highlight during the transition (normative decision).** The coordinator
  **hides** the highlight (`highlight: null`) for the duration and re-presents
  it when scanning resumes. This is a deliberate choice, not an oversight: the
  hidden cursor signals the input-blocked state and distinguishes it, together
  with `status: "transitioning"`, from a stopped scanner. The just-selected
  item's identity is **not** lost — it is carried on the `target.activated` /
  `group.entered` / `group.exited` event that precedes the transition
  (SS-10), which is what auditory hosts speak. Hosts wanting a persistent
  "confirmation" highlight during the window can render one from that event
  plus `status`. A future option to keep the selected candidate visible
  (`highlightPresentation: "selected" | "suppressed"`) is recorded as a
  possible refinement, not a current requirement.

### Input edges

- With `performOn: "press"`, `holdDurationMs` is validated while the switch
  is down: the action fires at the threshold crossing. With
  `performOn: "release"`, nothing fires until release, where the held
  duration is validated. Tap/hold switches fire the hold action at its
  threshold; the tap fires on release only when the hold did not — the two
  are mutually exclusive, and a repeat-blocked hold still consumes the
  gesture.
- `ignoreRepeatMs` opens at gesture **recognition** (the threshold crossing or
  qualifying release) and is keyed per logical switch. A recognized gesture
  opens its window even when the scanner's current lifecycle state does not
  dispatch the resulting action — recognition, not dispatch, is what
  suppresses the next bounce.
- Each `(switch, source)` pair tracks its own contact; duplicate press
  signals for a held source are ignored. For the phaseful scan gesture
  (inverse advancement), the logical switch opens on the first source press
  and closes on the **last** source release.
- Input arriving during a selection transition still updates contact state
  and opens repeat suppression; the semantic decision is made at
  action-fire time from lifecycle state captured at press, and a suppressed
  gesture stays suppressed through its release.
- Adapters MUST synthesize a disconnect for held sources on window blur,
  document visibility loss, adapter disable, and unmount, so a lost key-up
  can never leave a logical switch held (an undetected stuck switch would
  otherwise advance inverse scanning indefinitely). Disconnect cancels the
  gesture without acting as a release. Blur and visibility loss additionally
  invoke `suspend()` (the _Timing_ dwell-suspension rule).
- **Post-disconnect quarantine.** A source disconnected while still
  physically held MUST remain quarantined until the adapter observes a real
  physical release (or an explicit source reset). Repeated `down` signals for
  that still-held source — OS key-repeat, a re-fired press on refocus — MUST
  be claimed (so focused controls do not react) but MUST NOT re-open a fresh
  gesture. Only the physical release clears the quarantine. This keeps
  lost-release protection from degrading into false re-press. _(Quarantine
  lives in the adapter, which alone sees the physical press/release edges; the
  core input port keys contacts by stable source ID and cannot distinguish a
  fresh press from a re-press on its own.)_
- Keyboard adapters MUST NOT act on, or prevent the default of, keys that are
  not mapped to a declared switch. A mapped key is **claimed** — prevented and
  propagation-stopped in the capture phase so focused application controls do
  not also react — at the moment it maps to a declared switch and passes the
  adapter's scope; **gesture recognition (and therefore acceptance) is decided
  later** by the input engine, so a claimed key whose gesture is ultimately
  filtered (hold duration, repeat, lifecycle state) is still owned. By default
  a bare-key binding does **not** claim a modifier chord (`Ctrl`/`Meta`/`Alt` +
  key), so mapping `Space` cannot swallow `Cmd+Space` or a browser shortcut;
  hosts bind chords, or otherwise widen/narrow ownership, through
  `target`/`shouldHandle` rather than the adapter guessing.

### Selection and activation ordering

A single accepted `select` produces a fixed, observable event order. Publishing
it removes ambiguity for subscribers, synchronous `.click()` handlers, and
React state updates, which could otherwise observe different intermediate
states. There is no dedicated "selection" event — the selection is observable
through the activation/group events below. For an accepted `select` on the
highlighted candidate:

1. The pending style deadline (dwell/advance) is cancelled.
2. The session resolves the candidate under the cursor.
3. **Target:** `target.activationRequested` → host `activate()` is invoked →
   `target.activated` **or** `target.activationFailed`. On success the
   `afterActivation` policy applies next, which may emit `group.*` /
   `scan.stopped` or silently reposition the cursor.
   **Group / exit:** `group.entered` / `group.exited`.
4. If the scanner is still `scanning`, the **selection transition** begins
   (`scan.transitionStarted`) when a quiet/fixed window is configured; the
   highlight hides.
5. Re-entrant tree mutations published from inside `activate()` do not
   interleave — they queue FIFO behind the in-flight command and reconcile
   only after it returns (see _Live tree changes_).
6. When the window elapses, `scan.transitionEnded` fires and the highlight is
   re-presented at the resumed position.

### Live tree changes

- Reconciliation runs synchronously inside the serialized command queue;
  re-entrant mutations (e.g. an activation handler publishing a new tree)
  queue FIFO behind the in-flight transition and never interleave.
- Scopes rebuild top-down. An entered scope is dropped — emitting
  `group.exited` with reason `reconcile` — when it is no longer an eligible
  group in its parent or has no remaining candidates. The highlight is
  repaired by identity when the previous candidate survives in the active
  scope; otherwise the same position is kept, clamped to the last candidate.
  An empty root completes the scan (reason `empty`).
- Reconciliation never preserves or arms a dwell (SS-13) and has no timing
  side effects beyond re-landing.

## 7. Conformance

Implementation status of each normative requirement, with automated evidence
a reader can run (`npm test`, `npm run test:e2e`). Paths are relative to
`src/` unless noted. The external switch-hardware protocol in
[EVALUATION.md](EVALUATION.md) remains a separate release gate.

| Req   | Status      | Evidence                                                                                                                                                           |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SS-1  | Implemented | `core/scanner.styles.test.ts` (step scanning schedules no advancement deadline); `core/input/gestures.test.ts` (move repeat)                                       |
| SS-2  | Implemented | `core/input/gestures.test.ts` (press stabilization; rejects presses shorter than `holdDurationMs`)                                                                 |
| SS-3  | Implemented | `core/input/gestures.test.ts` (ignore repeat; suppression across pause/stop/completion); `core/scanner.safety.test.ts` (transition coordinator)                    |
| SS-4  | Implemented | `core/scanner.styles.test.ts` (step scanning); `core/styles.test.ts` (timed-style identification)                                                                  |
| SS-5  | Implemented | `core/scanner.edges.test.ts` (unclamped runtime validation of timing options)                                                                                      |
| SS-6  | Implemented | `core/scanner.styles.test.ts` (completes after configured root passes)                                                                                             |
| SS-7  | Implemented | `core/input/gestures.test.ts` (performOn release with hold duration; press-edge acceptance)                                                                        |
| SS-8  | Implemented | `core/session.test.ts` (traversal, reconciliation, exhaustion); `core/session.integration.test.ts` (tree identity)                                                 |
| SS-9  | Implemented | `core/session.integration.test.ts` (groups and exits)                                                                                                              |
| SS-10 | Implemented | event/snapshot assertions throughout `core/scanner.*.test.ts`; `e2e/demo.spec.ts` (announcements, event inspector)                                                 |
| SS-11 | Implemented | `e2e/demo.spec.ts` (forced-colors visibility; dark-background contrast)                                                                                            |
| SS-12 | Implemented | `core/scanner.invariants.test.ts` (declared-switch escape invariant); `core/scanner.safety.test.ts` (back-only validation)                                         |
| SS-13 | Implemented | `core/scanner.safety.test.ts` (causal dwell selection; suspension disarm + `"continue"` opt-out); `core/scanner.invariants.test.ts` (selections ≤ arming commands) |
| SS-14 | Implemented | `react/domHost.test.ts` (attribute-only presentation); by construction, `react/domHost.ts` performs no focus or tab-order writes                                   |

## 8. Standards conformance

**WCAG 2.2 SC 2.1.1 Keyboard (Level A)** is the most directly applicable
criterion: all functionality must be operable through a keyboard interface
without requiring specific timings for individual keystrokes, and W3C's
Understanding material explicitly names scanning software and switch-emulating
hardware among its beneficiaries. Hosts satisfy it underneath this library by
keeping real, keyboard-operable controls intact (see coexistence below);
SS-14 keeps the scan cursor from disturbing that operability.

**WCAG 2.2 SC 2.2.1 Timing Adjustable (Level A).** For each time limit, at
least one of: the user can **turn it off** before encountering it; **adjust**
it over a range ≥ **10×** the default; or is **warned** before expiry and
given ≥ 20 s to extend by simple action, ≥ 10 times. A scanner cadence the
user chooses as an access method is not automatically a content-imposed time
limit under this criterion, so treat SS-4 and SS-5 first as inclusive-design
requirements; map them to SC 2.2.1 only where the host's own analysis
identifies a time limit the content sets. They cover only part of an end
product's accessible-timing responsibility; conformance depends on the host's
configuration and UI. The warn-and-extend branch fits session timeouts, not
scan intervals.

**EN 301 549** (EU ICT accessibility standard) incorporates WCAG by
reference; the harmonised v3.2.1 (2021) incorporates WCAG **2.1**, and later
editions aligned with WCAG 2.2 are in ETSI's approval pipeline. Conformance
claims should cite the exact version. SS-4/SS-5 can support a conforming
host, but this library alone does not establish EN 301 549 or WCAG
conformance.

**OS-level AT coexistence.** The library scans in-app and must not break
native semantics: hosts keep real HTML controls, focus, keyboard interaction,
and ARIA intact so platform Switch Control / Switch Access still works.
Windows' On-Screen Keyboard includes a scan-through-keys mode, but Windows
does not provide an Apple/Android-equivalent system-wide switch-access layer.
Application-level scanning therefore remains important on Windows and the
web.

## 9. Auditory scanning

Verified as first-class in Grid 3 (speak description / play sound on
highlight) and CoughDrop (optional spoken prompt alongside the visual box).
Clinical practice for non-visual and emergent-literacy users adds the
**two-voice pattern**: a _prompt voice_ (often quieter, or routed to a private
earpiece) announces each scanned item, and a distinct _message voice_ speaks
the final selection publicly.

Design consequence for this library: speech stays host-owned (per the
non-goals), but the event stream must make dual prompting trivial — a
highlight event carrying the target's identity at every step (SS-10), so the
host can speak on highlight and speak differently on activation.

## 10. Open Board Format (OBF) integration

OBF/OBZ are the open-licensed, vendor-neutral AAC board formats (OpenAAC), and
the natural interchange format for hosts building communication boards on this
library:

- A board is a **grid of buttons**; the grid object is
  `{ rows, columns, order }` where `order` is a 2-D array of button IDs or
  `null` — exactly the traversal matrix a scanner needs. Validators (e.g.
  `obf-node`) enforce rectangularity: `order.length === rows`, each row of
  length `columns`.
- Mapping recipe: each OBF row → a scan group (row/column pattern), or flatten
  `order` for linear scanning. Omit `null`, truly empty, disabled, or otherwise
  declared-ineligible cells. Do not omit a labeled button merely because it
  lacks an explicit action: it may still vocalize `vocalization ?? label`.
  Generate an explicit sequence whose DOM and visual reading order agree for
  LTR or RTL; CSS reversal alone does not change scan order.
- Prior art: `react-obf` (cboard-org) renders OBF boards with a built-in
  scanning mode driven by `scanning` / `scanInterval` props — a useful
  integration reference.

The [`examples/obf`](../examples/obf) adapter demonstrates this mapping.

## 11. Platform survey (condensed)

|                           | Styles                                                                 | Patterns                                                | Distinctive verified features                                                                                               |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Apple Switch Control**  | Auto, Manual (2-switch), Single Switch Step                            | Hierarchical item/group (default), point                | Default Item mode drills group → item                                                                                       |
| **Android Switch Access** | Auto-scan, step, group selection                                       | Linear (default), row-column, point                     | "Ignore repeated presses (Debounce)"; reverse-scan action; many keys per action; global actions                             |
| **Proloquo2Go**           | Automatic Scanning, Automatic Selecting, Inverse; Step, Automatic Step | Linear, Linear (Grid only), Row/Column                  | Auto-_selecting_ variant; screen-region pre-scan                                                                            |
| **TD Snap**               | 1S Autoscan, 2S Step, 1S Scan (hold-select), 1S Dwell, Inverse         | Linear, Row/Column, Column/Row, Group                   | Resetting debounce; transition time; scan-from-last-selection; zoom; outline/overlay/invert highlight                       |
| **Grid 3**                | Auto, Tap to advance, Hold to advance; switch elimination              | Single-cell, rows/columns-then-cells, blocks (per-grid) | Overscan (independent reverse speed); dual debounce; accept press/release; skip-empty; auditory prompts; progress indicator |
| **CoughDrop**             | Auto + Next/Select                                                     | Row, column, region                                     | Whole-screen-as-invisible-switch fallback; visual + spoken prompt                                                           |

## 12. Documented pitfalls

1. **Timed modes exclude users who can't time movements.** The strongest
   clinical finding. Mitigation: SS-4.
2. **Accidental/repeat activations** (tremor, spasm, double-hits) are the
   primary mis-selection source. Mitigation: SS-2 + SS-3.
3. **Scan speed is a real speed–accuracy trade-off** (peer-reviewed: too fast
   and corrections destroy throughput; too slow wastes the user's time), and
   tuning it is genuinely hard. Mitigation: sane defaults, SS-5 range, and —
   future — guided calibration.
4. **Fatigue on long scans.** Mitigation: SS-6 loop limits, first-item pause,
   patterns that shorten paths (row-column over linear; Grid 3's overscan).
5. **Silent mode drift**: an implementation detail (accepting a held switch as
   repeated steps) can silently change the access method the user relies on
   (step → inverse). Mitigation: SS-1; behavior changes only by explicit
   configuration.
6. **Invisible highlight** in high-contrast environments. Mitigation: SS-11.

## 13. Gap analysis

What the research surfaced versus the current API.

**Already covered:** four scan styles including two-switch step (SS-1/SS-4);
`holdDurationMs` (SS-2); fixed `ignoreRepeatMs` plus resetting
`selectionDelay` (SS-3); `performOn` (SS-7); `loops` +
`firstItemPauseMs` (SS-6); `transitionTimeMs`; tap/hold dual-action switches;
group trees with guaranteed exits (SS-8/SS-9/SS-12); complete
events/snapshots (SS-10); forced-colors highlight (SS-11); dwell arming plus
disarm-on-suspension (SS-13, `suspensionPolicy`); and post-disconnect
quarantine (SS-3/§6).

**Gaps, roughly in value order:**

1. **Fresh-start scan from last selection** (TD Snap): current `continue` and
   `repeat` policies retain in-session position, but a new session always
   starts from the declared sequence anchor.
2. **Independent reverse speed / overscan** (Grid 3): `previous` exists, but
   auto-scan cannot run a fast forward pass with a slower reverse pass.
3. **Automatic Selecting style** (Proloquo2Go): auto-advance where _inaction_
   selects and a press skips — inverts the timing demand for some users.
4. **Guided calibration** (research direction): measure reaction to prompts
   and suggest `intervalMs` / `holdDurationMs` / `ignoreRepeatMs`.
5. **Switch elimination** (Grid 3): binary/quaternary group halving with one
   switch per group. New paradigm; roadmap only.
6. **Suspension-aware dwell — residual only**
   ([#9](https://github.com/shayc/switch-scanning/issues/9)): the default
   `suspensionPolicy: "disarm"` now invalidates an armed dwell on any
   `suspend()` signal, and the bundled adapters raise it on window blur and
   visibility loss ([§6](#6-runtime-semantics)). The residual is narrow: a host
   that drives `scanner.input` manually, never calls `suspend()`, and whose tab
   freezes with a dwell pending could still fire a stale selection when the
   timer eventually resolves. A deadline-overshoot guard inside the dwell timer
   (disarm when the fire is implausibly late) would close it without any host
   signal; it is deferred because the deterministic test clock fires callbacks
   exactly at their deadline and so cannot yet exercise overshoot.

TD Snap's **After Final Pass** behavior is not a missing traversal primitive:
configure `loops`, observe `scan.completed`, and have the host apply its chosen
restart behavior.

## 14. Sources

Primary (official/vendor):
Apple Switch Control — <https://support.apple.com/guide/ipad/use-switch-control-ipad850ed4e3/ipados> ·
Android Switch Access — <https://support.google.com/accessibility/android/answer/6301497>, <https://support.google.com/accessibility/android/answer/6301490>, <https://support.google.com/accessibility/android/answer/6395627> ·
AssistiveWare Proloquo2Go scanning — <https://www.assistiveware.com/support/proloquo2go/alternative-access/scanning-mode> ·
TD Snap User's Manual & Scanning Implementation Guide — <https://download.mytobiidynavox.com/Snap/documents/TD_Snap_UsersManual_en-US.pdf>, <https://downloads.tobiidynavox.com/Software/TD_Snap/TobiiDynavox_Snap_Scanning_ImplementationGuide_en-US.pdf> ·
Smartbox Grid 3 — <https://hub.thinksmartbox.com/knowledgebase/using-switch-scanning-with-grid-3/>, <https://hub.thinksmartbox.com/knowledgebase/how-can-i-speed-up-switch-access-in-grid-3>, <https://hub.thinksmartbox.com/knowledgebase/using-switch-elimination-in-grid-3/> ·
CoughDrop — <https://coughdrop.zendesk.com/hc/en-us/articles/201366669-How-do-I-set-up-scanning-and-switch-options-in-CoughDrop> ·
Microsoft Windows accessibility overview and On-Screen Keyboard — <https://support.microsoft.com/en-us/accessibility/windows/discover-windows-accessibility-features>, <https://support.microsoft.com/en-us/windows/use-the-on-screen-keyboard-osk-to-type-ecbb5e08-5b4e-d8c8-f794-81dbf896267a> ·
OpenAAC / Open Board Format — <https://www.openboardformat.org/docs>, <https://github.com/open-aac/openboardformat>, <https://github.com/willwade/obf-node>, <https://github.com/cboard-org/react-obf> ·
W3C WCAG — <https://www.w3.org/TR/WCAG22/>, <https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html> (informative Understanding doc for SC 2.1.1), <https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html> ·
ETSI EN 301 549 — <https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf>

Implementation compatibility:
React 19 callback-ref cleanup — <https://react.dev/blog/2024/12/05/react-19>

Clinical / academic:
Burkhart, L., _Switch Access_ (ASHA Perspectives SIG 12) — <https://lindaburkhart.com/wp-content/uploads/2018/06/ASHA_Persepctives_Switches_Burkhart.pdf> ·
Speed–accuracy optimization of switch keyboards — <https://link.springer.com/article/10.1186/s41235-016-0007-6>

_Auditory two-voice practice (§9) draws on clinical AAC sources (AbleNet,
practitioner literature) that were fetched but fell outside the adversarially
verified claim set — well-established practice, flagged for transparency._

_SS-13's arming model (§5) was verified against the TD Snap User's Manual
(1 Switch Dwell Scan: "trigger the switch to advance the highlight… pause (do
nothing) for the specified Pause Time") and the AbleNet iOS Switch Control
guide / Apple Single Switch Step Scanning ("requires a switch to move focus…
if no action is taken, the item with focus is automatically activated"): in
every surveyed single-switch mode dwell is measured after a user press, so the
initiating gesture arms and pure inaction never does. No vendor documents the
post-selection idle case explicitly; the arming model follows from that
press-then-dwell framing plus the AAC safety constraint that inaction must not
produce repeated output._

---

## 15. Public API contract

The concrete package surface, so adopters can tell the conceptual spec above
from what `@shayc/switch-scanning` actually exports. The framework-agnostic
core is the package root; the React bindings live at
`@shayc/switch-scanning/react` (and re-export the core). Each surface links to
the requirements and runtime clauses it realizes.

### Styles — `createScanner({ style })`

| Constructor                                                             | Realizes                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `autoScan({ intervalMs, loops, firstItemPauseMs?, transitionTimeMs? })` | timed advance ([§2](#2-scan-styles-advancing-modes)); SS-6; selection transition ([§6](#6-runtime-semantics)) |
| `stepScan({ repeat? })`                                                 | nontimed two-switch step (SS-1/SS-4); optional held-step auto-repeat                                          |
| `singleSwitchStepScan({ dwellTimeMs, suspensionPolicy? })`              | dwell selection (SS-13); disarm-on-suspension ([§6](#6-runtime-semantics))                                    |
| `inverseScan({ intervalMs, loops, firstItemPauseMs? })`                 | hold-to-advance, release-to-select; SS-6                                                                      |
| `isTimedStyle(style)`                                                   | timed-vs-nontimed classification (SS-4)                                                                       |

### Commands — `Scanner`

`start()` · `pause()` · `resume()` · `stop()` · `restart()` · `next()` ·
`previous()` · `select()` · `back()`. All are serialized and idempotent against
the lifecycle. `next()`/`previous()` are trusted dwell-arming navigations
(SS-13); `back()` widens scope (SS-9) and is the escape for `back-only` groups
(SS-12). Event ordering for `select()` is fixed
([§6](#6-runtime-semantics), _Selection and activation ordering_).

### Input — `Scanner.input` (`ScannerInputPort`)

`press(switchId, sourceId?)` · `release(switchId, sourceId?)` ·
`disconnect(sourceId?)` · `suspend()`. The end-user physical path for declared
switches; `suspend()` drops held contacts and disarms an armed dwell
([§6](#6-runtime-semantics)). Bundled React adapters (`useKeyboardSwitches`,
`usePointerSwitch`) drive this port and own claim/quarantine/suspend behavior
(SS-2/SS-3/SS-7, _Input edges_).

### Registration (host-owned tree, SS-8)

Core: `setTree(root: ScanGroupNode)` publishes the traversal tree; the host
owns pattern and pruning ([§3](#3-scan-patterns-traversal-order)). React:
`useScanTarget()` / `useScanGroup()` register nodes declaratively;
`ScannerProvider` / `useScanner()` supply the instance.

### Observation (SS-10)

`getSnapshot()` · `subscribe(onChange)` · `observe(listener)` for events.
React: `useScannerSnapshot(selector, equality?)` and
`useScannerEvents(listener)`. Host presentation attaches via
`attachHost(host)`; the default DOM host writes `data-*` only (SS-14).

### Configuration & lifecycle

`setOptions(behaviorOptions)` (clock/scheduler are creation-only) ·
`dispose()`. `ScannerOptions` also carries `switches`, `startOn`,
`afterActivation`, `groupExit`, `enabled`, and `selectionDelay`
([§4](#4-canonical-settings-vocabulary)).
