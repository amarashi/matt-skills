---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go. Accepts an autonomy tier (assisted, autonomous).
disable-model-invocation: true
---

Run a `/grilling` session, using the `/domain-modeling` skill.

Pass through any autonomy tier the user named (e.g. `/grill-with-docs autonomous`); otherwise `/grilling` falls back to the repo default in `docs/agents/autonomy.md`. In the `assisted` and `autonomous` tiers, the ADRs and `CONTEXT.md` updates that `/domain-modeling` writes double as the decision log.
