---
"mattpocock-skills": patch
---

Add a security note to the **`triage`** skill: `ready-for-agent` is a security boundary — the issue text becomes instructions executed by an unattended agent with merge rights, so externally-authored issues must be fully read before the label is applied, and requests touching CI, deploy config, secrets, or dependencies deserve extra suspicion.
