# Switch Scanning Specification

A research-grounded specification for `@shayc/switch-scanning`: what switch
scanning is, the canonical taxonomy and settings vocabulary shared across the
industry, normative behavioral requirements, and how the current library API
maps onto them.

**Provenance.** This document synthesizes the primary platform/vendor,
standards, and clinical sources listed in [§12](#12-sources). Platform details
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
  [§11](#11-gap-analysis).
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

The industry converged on one parameter set. Cross-product names are listed so
issues/docs can speak every dialect:

| Parameter                     | Meaning                                                                                              | Elsewhere                                                                                                                   | Here                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Scan interval                 | Time the highlight rests on each item                                                                | Apple "Auto Scanning Time"; Android "Auto-scan time"; TD Snap "Speed"; Grid 3 "advance time"; CoughDrop "scanning interval" | `intervalMs`                              |
| First-item pause              | Extra dwell on the first item of each pass                                                           | Android "Delay on first item"; Grid 3 "pause on first cell"; Apple "Pause on First Item"                                    | `firstItemPauseMs`                        |
| Loops / passes                | Auto-scan cycles before stopping                                                                     | Android "Number of scans"; TD Snap "Number of Passes"; Apple "Loops"                                                        | `loops`                                   |
| Minimum press duration        | Presses shorter than this are ignored (tremor filter)                                                | Apple "Hold Duration"; TD Snap "Pause/Hold Time"; Grid 3 "ignore presses shorter than"                                      | `holdDurationMs`                          |
| Per-switch repeat suppression | After an accepted gesture, further activations of that logical switch are ignored for a fixed window | Android "Ignore repeated presses (Debounce)"; Grid 3 "ignore presses within"; Burkhart "bounce"                             | `ignoreRepeatMs`                          |
| Selection delay               | After any semantic selection attempt, scanner actions are blocked; input may reset the quiet window  | TD Snap "Delay Between Selections"                                                                                          | `selectionDelay`                          |
| Accept on press vs. release   | Which edge of the switch signal triggers the action                                                  | Grid 3 "Accept" option; Apple "Tap Behavior"                                                                                | `performOn`                               |
| Dwell to select               | Idle time after which the highlighted item auto-selects                                              | Apple Single Switch Step Scanning duration; TD Snap Dwell "Pause Time"                                                      | `dwellTimeMs`                             |
| Step auto-repeat              | Held step switch repeats advancement after an explicit delay                                         | Product-specific held-step repeat settings                                                                                  | `stepScan({ repeat })`                    |
| Switch → action mapping       | Assign inputs to next/previous/select/back etc.; many inputs per action                              | All platforms                                                                                                               | `switches` record + `useKeyboardSwitches` |
| Highlight style               | Outline / overlay / invert; color and thickness customizable                                         | TD Snap "Highlighting"; Grid 3 styles + progress indicator                                                                  | `styles.css` + host CSS                   |
| Auditory prompt               | Speak description or play sound on highlight                                                         | Grid 3 "Speak description when highlighting"; CoughDrop optional speech                                                     | host, via scanner events                  |
| Transition time               | Delay between a selection and automatic scanning resuming                                            | TD Snap "Transition time"                                                                                                   | `autoScan({ transitionTimeMs })`          |
| Scan from last selection      | Resume where the last pick was made rather than at the top                                           | TD Snap                                                                                                                     | gap — [§11](#11-gap-analysis)             |
| Reverse speed / overscan      | Independent (slower) speed when scanning backwards                                                   | Grid 3 "overscan"                                                                                                           | gap — [§11](#11-gap-analysis)             |
| Skip empty cells              | Don't scan cells with no action                                                                      | Grid 3 scan-coverage options                                                                                                | host (only register actionable targets)   |

## 5. Normative behavioral requirements

Numbered so tests and issues can cite them. MUST/SHOULD per RFC 2119.

**SS-1 (release-before-advance).** In step scanning, each advancement MUST
require the switch to be released and pressed again. Holding the step switch
MUST NOT advance the highlight unless the user explicitly opts into
auto-repeat. _Rationale: Burkhart — omitting the release requirement silently
converts step scanning into inverse scanning._ (Current: `stepScan` defaults
`repeat: false`. ✅)

**SS-2 (tremor filter).** The engine MUST support a minimum press duration
below which a press is ignored, configurable per switch. _(Grid 3, TD Snap,
Apple.)_ (Current: `holdDurationMs`. ✅)

**SS-3 (repeat suppression and selection delay).** After an accepted gesture,
the engine MUST support a fixed, configurable per-logical-switch repeat
suppression window. It MUST separately support a scanner-level post-selection
delay whose quiet deadline can reset on newly begun declared-switch input.
These are distinct controls: `ignoreRepeatMs` filters switch bounce;
`selectionDelay` protects the next semantic selection. _(Android, Grid 3, TD
Snap, Burkhart.)_

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
Passes".)_ (Current: `loops`. ✅)

**SS-7 (accept edge).** Discrete switches MUST support acting on press or on
release. _(Grid 3.)_ (Current: `performOn`. ✅)

**SS-8 (deterministic traversal).** Scan order MUST be deterministic and
fully determined by the host-registered tree after pruning ineligible nodes —
those explicitly declared ineligible, plus any group whose descendants are all
ineligible — and inserting the configured virtual exit candidate. The engine
MUST NOT otherwise reorder, skip, or invent application targets.

**SS-9 (hierarchy).** Selecting a group MUST narrow scanning into that group;
a group exit or `back` action MUST widen scope again. _(Apple Item mode,
Android group selection, TD Snap Group pattern.)_ (Current. ✅)

**SS-10 (observable highlight).** Every highlight change, selection,
activation, and scan lifecycle transition MUST be observable by the host
(events/snapshots) so hosts can implement auditory prompts, progress
indicators, zoom, and analytics without engine changes. _(Grid 3 and CoughDrop
treat spoken/sounded highlight prompts as core; this library delegates the
speaking but MUST supply the signal.)_

**SS-11 (visible highlight).** Default highlight styling MUST remain visible
in forced-colors / high-contrast modes, and hosts MUST be able to restyle it
completely (style, color, thickness). _(TD Snap customizable highlighting.)_
(Current: `styles.css` forced-colors-aware. ✅)

**SS-12 (no dead ends).** Scanning MUST never enter a state the user cannot
leave with their configured switches alone — every scope has an exit, loop
completion stops cleanly, and stopping is host-recoverable.

**SS-13 (causal activation).** A timer-driven selection MUST be armed by
exactly one user-caused navigation: an accepted `next`/`previous` from a
declared switch, the public `next()`/`previous()` commands, or a switch
gesture that starts scanning under `startOn: "switch"`. The selection consumes
that arming token. Command/mount starts, resumes, `back`, group entry,
activation success/failure, tree reconciliation, option changes, and other
internal landings MUST NOT create a replacement token. _Rationale: dwell
selection follows a user action in every surveyed single-switch mode — TD Snap
1 Switch Dwell Scan ("trigger the switch to advance… pause to select") and
Apple Single Switch Step Scanning both measure dwell only after a press — so
the initiating press arms, but pure inaction (an internal landing) never does._

## 6. Standards conformance

**WCAG 2.2 SC 2.2.1 Timing Adjustable (Level A).** For each time limit, at
least one of: the user can **turn it off** before encountering it; **adjust**
it over a range ≥ **10×** the default; or is **warned** before expiry and
given ≥ 20 s to extend by simple action, ≥ 10 times. SS-4 and SS-5 provide
capabilities a host can use for the turn-off and adjust branches. They cover
only part of an end product's accessible-timing responsibility; conformance
depends on the host's configuration and UI. The warn-and-extend branch fits
session timeouts, not scan intervals.

**EN 301 549** (EU ICT accessibility standard) incorporates WCAG requirements
by reference. SS-4/SS-5 can support a conforming host, but this library alone
does not establish EN 301 549 or WCAG conformance.

**OS-level AT coexistence.** The library scans in-app and must not break
native semantics: hosts keep real HTML controls, focus, keyboard interaction,
and ARIA intact so platform Switch Control / Switch Access still works.
Windows' On-Screen Keyboard includes a scan-through-keys mode, but Windows
does not provide an Apple/Android-equivalent system-wide switch-access layer.
Application-level scanning therefore remains important on Windows and the
web.

## 7. Auditory scanning

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

## 8. Open Board Format (OBF) integration

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

An `examples/obf` adapter demonstrating this mapping is a natural follow-up.

## 9. Platform survey (condensed)

|                           | Styles                                                                 | Patterns                                                | Distinctive verified features                                                                                               |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Apple Switch Control**  | Auto, Manual (2-switch), Single Switch Step                            | Hierarchical item/group (default), point                | Default Item mode drills group → item                                                                                       |
| **Android Switch Access** | Auto-scan, step, group selection                                       | Linear (default), row-column, point                     | "Ignore repeated presses (Debounce)"; reverse-scan action; many keys per action; global actions                             |
| **Proloquo2Go**           | Automatic Scanning, Automatic Selecting, Inverse; Step, Automatic Step | Linear, Linear (Grid only), Row/Column                  | Auto-_selecting_ variant; screen-region pre-scan                                                                            |
| **TD Snap**               | 1S Autoscan, 2S Step, 1S Scan (hold-select), 1S Dwell, Inverse         | Linear, Row/Column, Column/Row, Group                   | Resetting debounce; transition time; scan-from-last-selection; zoom; outline/overlay/invert highlight                       |
| **Grid 3**                | Auto, Tap to advance, Hold to advance; switch elimination              | Single-cell, rows/columns-then-cells, blocks (per-grid) | Overscan (independent reverse speed); dual debounce; accept press/release; skip-empty; auditory prompts; progress indicator |
| **CoughDrop**             | Auto + Next/Select                                                     | Row, column, region                                     | Whole-screen-as-invisible-switch fallback; visual + spoken prompt                                                           |

## 10. Documented pitfalls

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

## 11. Gap analysis

What the research surfaced versus the current API.

**Already covered:** four scan styles including two-switch step (SS-1/SS-4);
`holdDurationMs` (SS-2); fixed `ignoreRepeatMs` plus resetting
`selectionDelay` (SS-3); `performOn` (SS-7); `loops` +
`firstItemPauseMs` (SS-6); `transitionTimeMs`; tap/hold dual-action switches;
group trees with guaranteed exits (SS-8/SS-9/SS-12); complete
events/snapshots (SS-10); forced-colors highlight (SS-11); and dwell arming
(SS-13).

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

TD Snap's **After Final Pass** behavior is not a missing traversal primitive:
configure `loops`, observe `scan.completed`, and have the host apply its chosen
restart behavior.

## 12. Sources

Primary (official/vendor):
Apple Switch Control — <https://support.apple.com/guide/ipad/use-switch-control-ipad850ed4e3/ipados> ·
Android Switch Access — <https://support.google.com/accessibility/android/answer/6301497>, <https://support.google.com/accessibility/android/answer/6301490>, <https://support.google.com/accessibility/android/answer/6395627> ·
AssistiveWare Proloquo2Go scanning — <https://www.assistiveware.com/support/proloquo2go/alternative-access/scanning-mode> ·
TD Snap User's Manual & Scanning Implementation Guide — <https://download.mytobiidynavox.com/Snap/documents/TD_Snap_UsersManual_en-US.pdf>, <https://downloads.tobiidynavox.com/Software/TD_Snap/TobiiDynavox_Snap_Scanning_ImplementationGuide_en-US.pdf> ·
Smartbox Grid 3 — <https://hub.thinksmartbox.com/knowledgebase/using-switch-scanning-with-grid-3/>, <https://hub.thinksmartbox.com/knowledgebase/how-can-i-speed-up-switch-access-in-grid-3>, <https://hub.thinksmartbox.com/knowledgebase/using-switch-elimination-in-grid-3/> ·
CoughDrop — <https://coughdrop.zendesk.com/hc/en-us/articles/201366669-How-do-I-set-up-scanning-and-switch-options-in-CoughDrop> ·
Microsoft Windows accessibility overview and On-Screen Keyboard — <https://support.microsoft.com/en-us/accessibility/windows/discover-windows-accessibility-features>, <https://support.microsoft.com/en-us/windows/use-the-on-screen-keyboard-osk-to-type-ecbb5e08-5b4e-d8c8-f794-81dbf896267a> ·
OpenAAC / Open Board Format — <https://www.openboardformat.org/docs>, <https://github.com/open-aac/openboardformat>, <https://github.com/willwade/obf-node>, <https://github.com/cboard-org/react-obf> ·
W3C WCAG — <https://www.w3.org/TR/WCAG22/>, <https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html> ·
ETSI EN 301 549 — <https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf>

Implementation compatibility:
React 19 callback-ref cleanup — <https://react.dev/blog/2024/12/05/react-19>

Clinical / academic:
Burkhart, L., _Switch Access_ (ASHA Perspectives SIG 12) — <https://lindaburkhart.com/wp-content/uploads/2018/06/ASHA_Persepctives_Switches_Burkhart.pdf> ·
Speed–accuracy optimization of switch keyboards — <https://link.springer.com/article/10.1186/s41235-016-0007-6>

_Auditory two-voice practice (§7) draws on clinical AAC sources (AbleNet,
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
