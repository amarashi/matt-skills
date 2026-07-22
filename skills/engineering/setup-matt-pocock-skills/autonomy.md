# Autonomy

How much the agent skills should decide on their own versus ask the user.

**Default tier for this repo: `interactive`**

| Tier          | Behavior                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `interactive` | Every open question goes to the user, one at a time. Approval gates (seam checks, issue breakdowns) wait for the user.                  |
| `assisted`    | The agent settles everything it can itself; only decisions passing the critical test below go to the user. Approval gates become opt-in. |
| `autonomous`  | The agent never asks. It decides everything with its best judgment, records each decision, and flags its least-confident calls at the end. |

Naming a tier when invoking a skill overrides this default for that session (e.g. `/grill-with-docs autonomous`, "run /to-issues, assisted"). Edit the default above to match how you actually work.

## The critical test (`assisted` tier)

A decision goes to the user only if at least one holds:

- **Hard to reverse** once built (data migrations, deletions, published artifacts)
- **Externally visible contract** — public API shapes, persisted schemas, user-facing copy or flows
- **Security, privacy, or data-loss** implications
- **Contradicts** an existing ADR, the domain glossary, or something the user explicitly said
- **Commits significant spend** (paid services, long unattended runs beyond what was asked for)

Everything else: decide and log.

## The decision log (`assisted` and `autonomous` tiers)

Every non-obvious decision made without the user is recorded where the flow already writes: ADRs and `CONTEXT.md` when `/domain-modeling` is active, the *Implementation Decisions* section of a PRD, the issue body or comments, or — when nothing better exists — a **Decisions taken** list in the reply. Each entry is one line: the decision plus why. At the end of an `autonomous` run, the agent lists the two or three calls it was least confident in, so review effort lands where it matters.
