---
name: retro
description: Mine the AFK night-shift logs for recurring failures and reviewer findings, then turn them into prompt, doc, and calibration fixes.
disable-model-invocation: true
---

# Retro

The `/afk` night shift makes the same mistake every night until something updates its instructions. This skill is that something: it reads what actually happened and folds the lessons back into the machine. Run it weekly, or after any rough night.

## Inputs

Collect everything since the last retro (each retro note records its window — see Output):

- `.sandcastle/logs/` — implementation, review-round, and fix-round logs per issue, plus `night-report.md`
- "AFK night report" issues on the tracker
- `land agent/issue-<n>` merge commits (and any `Revert "land …"` commits — CI caught something both agent gates missed)
- Closed `[continuation]` issues and `needs-triage` failures from AFK runs

## Process

### 1. Mine for patterns, not incidents

One bad night is noise. Look for things that happened **two or more times**:

- **Recurring reviewer findings** — the same category of `CHANGES` verdict across different issues (missed migrations, untested error paths, style the repo cares about). Each recurring finding is a sentence missing from `prompt.md`.
- **Recurring blockers** — `BLOCKED` signals citing the same missing context (unclear glossary term, undocumented invariant). Each is a gap in `CONTEXT.md`, an ADR, or the agent-brief conventions.
- **Tier miscalibration** — `effort:light` tickets that needed multiple review rounds or ended in continuations (sizing runs too low), or `deep` tickets that sailed through in one round (money burned). Compare the dispatcher's judgments against outcomes too.
- **Mechanical failures** — rebase conflicts clustering in one subsystem (slices too entangled — feed back to `/to-issues` granularity), CI rejections after sandbox green (env drift between Dockerfile and CI), reverts on main (the most serious signal there is; diagnose individually).

### 2. Propose fixes at the right layer

| Pattern | Fix lands in |
| --- | --- |
| Reviewer keeps finding X | `.sandcastle/prompt.md` (implementer discipline) |
| Reviewer keeps *missing* X (found later by CI/human) | `.sandcastle/review.md` (checklist item) |
| Agents keep misunderstanding a term or invariant | `CONTEXT.md` / new ADR |
| Sizing repeatedly wrong in one direction | Effort-label guidance in the triage-labels doc; dispatcher system prompt |
| Slices keep colliding | Note for `/to-issues` granularity in its issue template usage |

Keep each fix one sentence where possible — prompts grow stale and bloated fast, and a retro that doubles the prompt every week is making the system worse. Prefer replacing a weak sentence over adding a new one.

### 3. Apply per the autonomy tier

Honor `docs/agents/autonomy.md`: at `interactive`, present the proposed edits and wait; at `assisted`, apply and flag only prompt-weakening or scope-expanding changes; at `autonomous`, apply everything and log.

### 4. Write the retro note

Save `.sandcastle/retros/<date>.md`: the window covered (so the next retro starts where this one ended), patterns found with evidence counts, edits applied (file + diff summary), and anything observed once that's worth watching for next time. Close the loop: if a previous retro's fix targeted a pattern that has since disappeared, say so — that's the system visibly learning.

## Guardrail

Never edit the merge-gate *thresholds* (review rounds, CI gate, double-green rule) from a retro — those loosen only by explicit human decision. A retro tunes what agents are told, not how much verification they must survive.
