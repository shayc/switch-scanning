---
"@shayc/switch-scanning": patch
---

Preserve per-switch repeat suppression across pause, make accepted keyboard
switches capture and stop their owned key events before focused controls, and
reject React target or group registrations that use the reserved `__root__` ID.
