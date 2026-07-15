---
"@shayc/switch-scanning": minor
---

Stamp every scanner event with `at`, the injected clock's time at emission.
Timestamps share the time base of snapshot `pending` values, so hosts can
measure reaction times and build scan-rate analytics without owning the
clock. Consumers that deep-equal whole event objects must account for the
new field.
