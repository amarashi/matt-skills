---
"mattpocock-skills": minor
---

Add **autonomy tiers** across the interview-and-approval skills. A new `docs/agents/autonomy.md` config (seeded by `setup-matt-pocock-skills`) defines three tiers: `interactive` (every question goes to the user — the previous behavior and still the default), `assisted` (the agent settles everything it can itself and asks only decisions passing a critical test: hard to reverse, externally visible contract, security/data-loss, contradicts an ADR or the user, significant spend), and `autonomous` (no questions — the agent grills the plan itself, records every non-obvious decision with rationale in ADRs/`CONTEXT.md`/PRD/issue notes, and flags its least-confident calls for review). **`grilling`** implements the tiers; **`grill-me`** and **`grill-with-docs`** pass them through (e.g. `/grill-with-docs autonomous`); **`to-prd`**'s seam check and **`to-issues`**' breakdown quiz honor them. A tier named at invocation overrides the repo default.
