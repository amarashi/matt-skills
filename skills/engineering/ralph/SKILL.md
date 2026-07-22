---
name: ralph
description: "Drain the ready-for-agent GitHub queue autonomously — a Ralph loop that runs each issue through a sandboxed TDD agent (sandcastle) and opens one PR per issue."
disable-model-invocation: true
---

# Ralph

Run a **Ralph loop** over your GitHub issues: repeatedly pick the next `ready-for-agent` issue, hand it to a sandboxed AFK agent that implements it test-first, and open one PR per issue. You **sit on the loop, not in it** — supervise the run, and stop with Ctrl-C whenever you want.

This automates the wiring that used to be manual. Previously you'd hand-write a [sandcastle](https://github.com/mattpocock/sandcastle) harness, copy in issue numbers, and babysit each run. This skill scaffolds the harness once, then every invocation drains whatever is currently ready — resolving blockers, sandboxing each issue, and raising PRs for you to review.

## Prerequisites

- The repo's issue tracker is **GitHub** and triage labels are configured — see `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`. If those are missing, run `/setup-matt-pocock-skills` first. If the tracker isn't GitHub, stop and tell the user this skill is GitHub-only.
- `gh` is authenticated, a container runtime (Docker or Podman) is running, and the repo has working test + type-check commands.
- Issues in the queue are genuinely AFK-ready — ideally with a `/triage` agent brief. Ralph amplifies whatever specification quality you feed it; a vague issue produces a vague PR.

## Process

### 1. Check the setup

Read `docs/agents/issue-tracker.md` (confirm it's GitHub) and `docs/agents/triage-labels.md` (find the real label string for the `ready-for-agent` role — the user may have remapped it). If the repo isn't set up, run `/setup-matt-pocock-skills` and stop. If the tracker is anything other than GitHub, stop and say so.

### 2. Show the queue and confirm

Compute the ready queue and show it **before** running anything:

```bash
gh issue list --state open --label "<ready-for-agent label>" \
  --json number,title,body,labels --limit 200
```

An issue is runnable only if every issue it is **"Blocked by"** is closed (parse the `## Blocked by` section / `#NN` references from each body). Present the runnable issues (number + title), and separately note any that are ready-labelled but still blocked. Confirm the user wants to drain them — this is where they "sit on the loop": let them scope the run (e.g. "just the first three") before anything spins up.

### 3. Scaffold the harness (once per repo)

If `.ralph/run.ts` does not exist, install it:

- Copy [run.ts](./run.ts) → `.ralph/run.ts` and [prompt.md](./prompt.md) → `.ralph/prompt.md`.
- Install deps with the repo's package manager: `npm i -D @ai-hero/sandcastle zod tsx` (or `pnpm`/`yarn`/`bun` equivalent).
- If the `ready-for-agent` label was remapped in the triage config, set `RALPH_READY_LABEL` (the harness reads it from env; default is `ready-for-agent`).
- Add `/.ralph/logs/` to `.gitignore`.

If `.ralph/run.ts` already exists, **reuse it** — the user may have edited it. Don't clobber.

### 4. Run the loop

```bash
npx tsx .ralph/run.ts
```

Scope it with env vars if the user asked (`RALPH_MAX_ISSUES=3`, `RALPH_MODEL=claude-opus-4-8`). Per issue, the harness:

- creates a `ralph/issue-<N>` branch inside a sandbox,
- runs the agent against `.ralph/prompt.md` (test-first, with the type-checker and full suite as **backpressure** — it won't finish red),
- on green: pushes the branch, opens one PR (`Closes #N`), removes the ready label, and comments the PR link on the issue,
- on blocked/failed: leaves the issue in the queue untouched and moves on.

Stream progress to the user. A single failed issue is **not** a failed loop — keep going.

### 5. Report

Summarise the run: which issues shipped a PR, which are still queued and why. Point the user at the PRs to **review in a fresh context** — that's the Ralph "implement, then review in a clean window" split. Remind them that re-running `/ralph` picks up any newly-unblocked or newly-`ready-for-agent` issues.

## Notes

- **One PR per issue, always human-reviewed.** Nothing merges automatically. The review is a deliberate second pass in a clean context, not a rubber stamp.
- **Backpressure is the whole game.** The harness trusts tests + types, not the agent's self-report. Weak tests → weak loop: strengthen the suite, not the prompt.
- `.ralph/run.ts` and `.ralph/prompt.md` are **yours** once installed — edit the model, iteration cap, branch naming, or agent instructions to taste. This skill won't overwrite them.
- For a fully-unattended setup (fire on the `ready-for-agent` label in CI instead of a local command), wrap `.ralph/run.ts` in a GitHub Action with an `ANTHROPIC_API_KEY` secret and a container-capable runner. Offer to scaffold that if the user wants hands-off operation.
