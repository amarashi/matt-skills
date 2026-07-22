---
name: afk
description: Launch an AFK night shift — a Ralph loop of sandboxed Sandcastle agents that drains the ready-for-agent queue and lands double-green work straight on main.
disable-model-invocation: true
---

# AFK

Turn the `ready-for-agent` queue into merged commits on main while the user is away, with a single invocation. Each issue runs a fully unattended pipeline — **implement → independent review → merge → close** — and only lands when it is *double green*: the implementer's full test suite passes AND a reviewer agent with fresh context approves. Work that can't converge is handed to a fresh session via a `[continuation]` issue instead of waiting for a human. This skill combines two pieces:

- **The Ralph technique** — a dumb outer loop that starts a *fresh* agent for each unit of work, with all state living outside the agent (here: the issue tracker and git). No context carries over between iterations; the tracker is the memory.
- **[Sandcastle](https://github.com/mattpocock/sandcastle)** (`@ai-hero/sandcastle`) — runs each agent in an isolated Docker/Podman sandbox on its own branch and manages the worktrees and commits.

The user should never have to hand-configure Sandcastle. `/afk` does the preflight, scaffolds and configures everything it can, launches the loop as a detached process, and reports how to watch and stop it. The only thing it can never do for the user is provide credentials.

## Reference docs

- [RALPH-LOOP.md](RALPH-LOOP.md) — templates for the orchestration script (`main.ts`, sequential and parallel), the implementer prompt (`prompt.md`), and the independent reviewer prompt (`review.md`)

## Preconditions

1. **`/setup-matt-pocock-skills` has been run** — `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` exist. If not, stop and tell the user to run it first.
2. **A container runtime is up** — `docker info` (or `podman info`) succeeds. If not, stop: the whole point is sandboxed agents; never fall back to running unsandboxed.
3. **Credentials exist** (checked in step 3 below) — this is the one manual step the user must do once.

## Invocation

The user invokes `/afk`, optionally with arguments:

- `/afk` — sequential Ralph loop (default): one sandboxed agent at a time, one issue per iteration.
- `/afk parallel` — fan out over the queue, one sandboxed agent *per issue* on its own branch, capped at 3 concurrent sandboxes (the user can name a different cap).
- `/afk dry-run` — do all the preflight and generation, show what would launch, but don't start the loop.

## Process

### 1. Check the queue

Read `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`. Query the tracker for open issues carrying the label mapped to the `ready-for-agent` role.

- **Zero issues** → report that the queue is empty and stop. Suggest `/triage` or `/to-issues` to fill it. Don't scaffold anything.
- Otherwise, list the queue (number, title) so the run report has a baseline.

Only issues with the `ready-for-agent` label are ever touched. `ready-for-human`, `needs-info`, and unlabeled issues are invisible to this skill.

### 2. Ensure Sandcastle exists

If `.sandcastle/` is missing:

1. Scaffold non-interactively: `npx @ai-hero/sandcastle init --sandbox docker --template blank --issue-tracker github` (adjust `--sandbox` if the user runs Podman, and `--issue-tracker` per the tracker config; use the flags — don't drop the user into interactive prompts).
2. Build the sandbox image: `npx @ai-hero/sandcastle docker build-image`.
3. Check the scaffolded `Dockerfile` includes the tracker CLI the prompt expansions need (e.g. `gh` for GitHub). Add it if missing and rebuild.

If `.sandcastle/` already exists, leave the user's `Dockerfile` and `.env` alone — only regenerate the files this skill owns (`main.ts`, `prompt.md`, see step 4).

### 3. Check credentials

Verify `.sandcastle/.env` contains:

- `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` — for the agent inside the sandbox.
- A tracker token if the tracker CLI needs one inside the sandbox (e.g. `GH_TOKEN`).

If anything is missing, **stop and tell the user exactly which variable to add to `.sandcastle/.env`**, then have them re-invoke `/afk`. Never generate, guess, echo, or commit token values, and confirm `.env` is git-ignored (the scaffold's `.gitignore` handles this — verify it survived).

This is the single one-time manual step. Every later `/afk` run sails through this check.

### 4. Generate the loop

Write three files from the templates in [RALPH-LOOP.md](RALPH-LOOP.md), substituting the repo's actual label strings and tracker CLI commands:

- `.sandcastle/main.ts` — the Ralph loop running the per-issue pipeline (implement → review → merge → close). Sequential template by default; parallel template for `/afk parallel`.
- `.sandcastle/prompt.md` — the implementer prompt. It must be **self-contained** (the sandbox agent does not have this skills repo): the issue's agent brief is the contract, TDD where possible, keep working until the full suite is green, file out-of-scope discoveries as new `ready-for-agent` issues, emit the completion signal only when earned.
- `.sandcastle/review.md` — the independent reviewer prompt: fresh context, re-runs the suite itself, checks the diff against the brief, approves or writes findings to `REVIEW.md` for a fix round.

The launch must start from a clean checkout of the default branch — merges land on whatever branch the host is on.

Show the user a one-paragraph summary of what was generated (mode, cap, branch naming, review rounds) before launching — unless they invoked with arguments that already pin these down.

### 5. Launch

Run `npx tsx .sandcastle/main.ts` as a detached background process with output to `.sandcastle/logs/`. The loop must survive this Claude session ending — that is what makes it AFK. Then report:

- queue size and mode (sequential / parallel×N)
- branch naming scheme (`agent/issue-<n>`)
- how to watch: `tail -f .sandcastle/logs/*.log`
- how to stop: kill the `tsx` process (report its PID)

For `/afk dry-run`, print this report without launching.

### 6. The morning after

When the user returns, point them at:

- **Main** — every landed issue is already merged and pushed (`land agent/issue-<n>` merge commits), its issue closed with a summary comment. `git log origin/main` is the night's ledger.
- **Continuations** — work that didn't converge was handed to a fresh session via `[continuation]` issues; any still open show what's mid-flight or awaiting the next run.
- **Failures** — issues the loop gave up on (including failed continuations) are relabeled `needs-triage` with a comment explaining the blocker; they'll surface next `/triage`.
- **Logs** — `.sandcastle/logs/issue-<n>*.log` per issue: implementation, each review round, each fix round.

## Guardrails

- **Sandbox always.** Never substitute `noSandbox()`. If Docker/Podman is unavailable, stop.
- **Branch per issue, never head.** Every pipeline runs on its own `agent/issue-<n>` branch; only the serialized host-side merge step touches main.
- **Merge on double green only.** A branch lands only when the implementer's full suite is green AND an independent fresh-context reviewer approved. Merges are serialized and never forced; a conflicted merge is aborted and routed to a continuation issue, not resolved blind.
- **Bounded loop.** The generated `main.ts` caps total issues per night and never retries a failed issue in the same run. Continuation issues count toward the cap and never chain — a failed continuation goes to `needs-triage`, not to a third session.
- **Closing is earned.** An issue is closed only after its branch is merged and pushed. Everything else stays open and labeled truthfully.
