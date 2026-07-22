---
"mattpocock-skills": minor
---

Add **effort labels** (`effort:light` / `effort:standard` / `effort:deep`) sizing how much model capability a ticket needs. **`triage`** applies one alongside `ready-for-agent`, **`to-issues`** applies one per published slice, and the `setup-matt-pocock-skills` label-mapping seed documents the vocabulary. Downstream AFK runs use the label to route each ticket to the cheapest capable model tier, with `standard` as the fail-safe for unlabeled tickets.
