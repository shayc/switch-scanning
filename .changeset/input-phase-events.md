---
"@shayc/switch-scanning": minor
---

Make physical contact on declared switches observable: `input.pressed`
carries a `PressRecognition` descriptor so hosts can animate hold and
stabilization progress, `input.holdRecognized` marks a still-held press
crossing its threshold, and `input.released` / `input.cancelled` close every
tracked contact. Hold-progress feedback no longer requires re-implementing
gesture timing outside the engine.
