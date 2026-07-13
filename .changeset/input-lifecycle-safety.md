---
"@shayc/switch-scanning": minor
---

Fix gesture release and lifecycle safety, including truthful re-entrant host
attachment, held-key disconnect on adapter disable, owner-document pointer
cleanup, distinct start/restart commands, scoped keyboard cleanup, inherited
disabled controls, selector freshness, host ownership, and behavior-only
runtime option updates. Replacement hosts now restore an active visible cursor,
and invalid runtime option updates throw synchronously at their own call site.
