---
name: grilling
description: Interview the user relentlessly about a plan or design. Use when the user wants to stress-test a plan before building, or uses any 'grill' trigger phrases. Supports autonomy tiers — assisted (only critical questions) and autonomous (no questions, decisions logged).
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

If a question can be answered by exploring the codebase, explore the codebase instead — at every tier.

## Autonomy tier

Resolve the tier before the first question, in this order:

1. The user's words in this invocation ("autonomous", "don't ask me anything", "assisted", "only bug me for the big stuff")
2. The repo default in `docs/agents/autonomy.md`, if the file exists
3. `interactive`

**`interactive`** — every question goes to the user, **one at a time**, waiting for feedback on each before continuing. Asking multiple questions at once is bewildering.

**`assisted`** — walk the same design tree, but answer each question yourself when the codebase, docs, or your own judgment can settle it. Bring the user only questions that pass the critical test in `docs/agents/autonomy.md` (hard to reverse, externally visible contract, security/data-loss, contradicts an ADR or the user's own words, significant spend) — still one at a time. Log every decision you made without them per that file's decision-log rules.

**`autonomous`** — ask nothing. Grill the plan *yourself*: pose each question, state your recommended answer, adopt it, move down the branch. Record every non-obvious decision with a one-line rationale in the decision log (ADRs and `CONTEXT.md` when `/domain-modeling` is active, otherwise a **Decisions taken** list in your reply). Close by naming the two or three calls you were least confident in, so the user knows exactly what to review.

The tier changes who answers the questions — never whether the questions get asked. Skipping a branch of the design tree because nobody will push back is not autonomy, it's negligence.
