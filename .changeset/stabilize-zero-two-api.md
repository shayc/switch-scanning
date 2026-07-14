---
"@shayc/switch-scanning": minor
---

Move the framework-agnostic core to the package root and the React bindings to
`/react`, retaining `/core` as an alias. Replace callable host attachments with
`{ attached, detach() }`, rename snapshot `loop` to `pass`, add symmetric
reverse step repeat, harden runtime validation and deterministic registry
ordering, and surface deduplicated integration diagnostics in development.
