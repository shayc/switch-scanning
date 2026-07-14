# External switch-access evaluation protocol

This is a release gate, not an automated test. Do not mark it complete without
sessions involving real switch hardware and representative users/practitioners.

The library is application-agnostic, so this protocol is written around scanning
primitives (surfaces, groups, targets, timing, prompting) rather than any one
consumer. Run at least one full domain profile below; add others as they apply.

## Minimum matrix

- Keyboard-emulating switch interface on desktop.
- Dedicated touch-switch surface on at least one tablet.
- Automatic, two-switch step, single-step dwell, and inverse access.
- Linear and row-column surface layouts.
- Visual and auditory prompting.
- Mixed assisted/direct input alongside switch input.

## Domain profiles

Exercise at least one end-to-end consumer so the engine is validated behind a
real application, not only the reference playground.

- **AAC** — dynamic `load_board` navigation through the OBF example, with mixed
  caregiver/direct input.
- **On-screen keyboard / text entry** — sustained selection into a text field.
- **Media / kiosk control** — a small fixed target set with hold-to-repeat.

## Session record

Record device/interface, OS/browser/version, access method, switch placement,
timing values, surface pattern/size, prompt mode, and facilitator role. For every
issue record the triggering gesture sequence, expected/observed result,
reproducibility, severity, and whether it reflects a personal preference or a
general safety/usability problem.

The release blocks on any autonomous action, trapped scope, lost release,
double activation, or unresolved critical/high-severity lifecycle defect.
Individual preferences should inform profiles and documentation rather than
becoming global defaults without broader evidence.

## Current status

Pending external sessions. Automated unit, state-exploration, package, and
three-engine browser suites are supporting evidence, not a substitute for this
evaluation.
