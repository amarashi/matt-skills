# AFK — Ship Reviewed Code While You Sleep

**One command turns "here's roughly what I want built" into merged, reviewed commits on `main` — overnight, unattended, in a sandbox.**

`/afk-start` chains a whole engineering pipeline behind a **single confirmation**: it configures the repo, grills your idea into a concrete plan, cuts that plan into agent-ready tickets, then launches a loop of sandboxed agents that **implement → review → merge** each ticket. You approve the plan once; everything after runs while you're away.

Built on [Matt Pocock's engineering skills](https://github.com/mattpocock/skills), the [Sandcastle](https://github.com/mattpocock/sandcastle) sandbox runner, and the **Ralph** loop technique (a dumb outer loop that starts a *fresh* agent per unit of work, with all state living in the issue tracker and git).

---

## What makes it safe to leave running

- **Sandboxed always** — a fresh Docker/Podman sandbox per ticket, on its own branch. Never runs your code unsandboxed.
- **Double-green merges** — a branch lands only when the implementer's full test suite passes **and** an independent reviewer with fresh context approves. **Triple-green** when the repo has CI (the neutral runner is the third gate), with an auto-revert if `main` goes red after a landing.
- **One human checkpoint** — you confirm the plan once, up front. No mid-night prompts.
- **Protected paths** — agents may not touch CI workflows, deploy config, secrets, or DB migrations unless a ticket explicitly authorizes it.
- **Bounded** — a per-night issue cap and an 8-hour wall-clock deadline. Work that can't converge is handed to a fresh session via a `[continuation]` issue, never retried blindly.

---

## Prerequisites (set once per machine)

1. **Claude Code** (or a compatible agent) with this workflow's skills installed — see step 1.
2. **A container runtime running** — `docker info` (or `podman info`) succeeds.
3. **Model access** — any *one* of: a Claude Pro/Max token (`claude setup-token`), an `ANTHROPIC_API_KEY`, an `OPENROUTER_API_KEY`, or local **Ollama**.
4. **For a GitHub tracker** — `gh auth login`.

Once your machine is set up, every project after this needs zero per-project secrets.

---

## Step by step

### 1. Install the skills

Add the workflow's skills to your agent (via [skills.sh](https://skills.sh) or by copying them into your agent's skills folder):

```
afk-start   setup-matt-pocock-skills   grilling
to-tickets  to-spec   triage   afk   retro
```

`afk-start` is the front door; it orchestrates the rest.

### 2. Check the prerequisites

```bash
docker info            # runtime up?
gh auth status         # tracker authenticated?
# and one model credential present (subscription token / API key / OpenRouter / Ollama)
```

### 3. Kick it off

```
/afk-start "Add password reset via email — token table, request + confirm endpoints, rate limiting"
```

Not sure yet? **Preview without launching:**

```
/afk-start dry-run "…"
```

`dry-run` does the entire plan — bootstrap, grill, tickets, launch settings — and shows you exactly what *would* run, but starts nothing.

Behind the scenes this triggers:

- **Bootstrap** — if the folder isn't a git repo it runs `git init`; if there's no remote it creates a **private** GitHub repo. (On an *existing* codebase with history but no remote, it **asks first** before publishing.)
- **Preflight** — verifies Docker, credentials, and finds your test command; on an existing project it also detects your toolchain so the sandbox can build and test it.
- **Grill + draft** — interrogates your idea the way a senior engineer would, then drafts every decision (repo config, the plan, the ticket breakdown, launch settings) each with a **recommended answer**.

### 4. Confirm the plan — once

This is the **only** checkpoint. You get one batch to review:

- **A. Repo config** — issue tracker, triage labels, doc layout
- **B. The plan** — every design decision, with the recommendation
- **C. Tickets** — the tracer-bullet slices, their blocking order, and effort sizing
- **D. Launch settings** — sequential vs parallel, models, test command

Edit anything, or approve as-is. **After you approve, it runs unattended.**

### 5. It runs while you're away

It writes the config, files the tickets (labeled `ready-for-agent` + `effort:*`), and launches the loop as a detached process. Then:

- **Watch:** `tail -f .sandcastle/logs/*.log`
- **Stop gracefully:** `touch .sandcastle/STOP` (finishes the in-flight issue, files the report)
- **Hard stop:** kill the `tsx` PID it prints

### 6. The morning after

- **Night report** — one issue summarizes every attempt (landed / did not land). Start here.
- **`git log origin/main`** — the night's ledger; every landed issue is merged, pushed, and closed with a summary.
- **`[continuation]` issues** — work that didn't converge, ready for the next run.
- **`/retro`** — after a rough night, mines the logs and folds the lessons back into the agents' prompts.

---

## Choosing models

Every model choice lives in **one file** — `.sandcastle/models.json` — generated for you with sensible defaults. Per provider, per effort tier, plus which tier the reviewer runs:

```json
{
  "provider": "auto",
  "reviewerTier": "deep",
  "providers": {
    "anthropic":  { "light": "claude-haiku-4-5",          "standard": "claude-sonnet-5",  "deep": "claude-opus-4-8" },
    "openrouter": { "light": "deepseek/deepseek-v4-flash", "standard": "qwen/qwen3-coder", "deep": "z-ai/glm-4.7" },
    "ollama":     { "light": "qwen2.5-coder:7b",           "standard": "gpt-oss:20b",      "deep": "qwen3-coder:30b" }
  }
}
```

- **`provider: "auto"`** picks by environment: OpenRouter if `OPENROUTER_API_KEY` is set, else Ollama if `OLLAMA_URL` is set, else Anthropic direct. Pin it to force one.
- **Effort tiers** — each ticket runs on the smallest model that can handle it (`light`/`standard`/`deep`, from its `effort:*` label). The **reviewer always runs `reviewerTier`** — keep it your strongest.
- **Cheap cloud** — the OpenRouter defaults are picked for cost/quality (verify live prices at [openrouter.ai/models](https://openrouter.ai/models); the market moves weekly). Upgrade `deep` to `z-ai/glm-5.2` or `moonshotai/kimi-k2.7-code` for maximum quality.
- **Local** — the Ollama defaults suit a ~16 GB single-GPU box. `ollama pull` them first, and make sure each has ≥32k context. A local implementer with a cloud reviewer is the sweet spot.

---

## Command reference

| Command | What it does |
|---|---|
| `/afk-start "…"` | The whole pipeline behind one confirmation, ending in a launched loop |
| `/afk-start dry-run "…"` | Plan everything, show what would launch, start nothing |
| `/afk-start parallel` | Fan out — one sandbox per issue (capped at 3 by default) |
| `/afk-start model=<slug>` | Override the model(s) for this run |
| `/afk` | Launch the loop directly against an already-populated `ready-for-agent` queue |
| `/afk doctor` | Prove the whole machine end-to-end against a throwaway canary ticket on a scratch branch — **run this first on any existing project** |
| `/afk parallel` | The loop in parallel mode |
| `/retro` | Turn a night's failures and reviewer findings into prompt/doc fixes |
| `/setup-matt-pocock-skills` | Configure a repo's tracker/labels/docs by hand (afk-start does this for you) |

---

## Using it on an existing project

It's repo-agnostic — arguably *better* on an existing project, because there's real code to grill against and a real test suite to gate on:

- **Bootstrap is a no-op** when you already have a repo + remote; it asks before publishing an existing codebase that has no remote.
- **Setup edits, never overwrites** your `CLAUDE.md` (adds an `## Agent skills` block); skips entirely if already configured.
- **Only `ready-for-agent` issues are ever touched** — your existing backlog is invisible until you label it.
- **The sandbox is provisioned for your toolchain** (reusing a `.devcontainer`/`Dockerfile`/`compose` if present, else detecting your stack).

⚠️ **Run `/afk doctor` before your first real night.** It exercises the full pipeline on a canary ticket and immediately reveals whether the sandbox can build and test *your* project — the #1 reason a first night flops. The merge gate is only as strong as your test suite, so a well-tested repo with CI is the safest case.

---

## Credit

The engineering skills at the core of this workflow — grilling, tickets/specs, triage, TDD, domain modeling, and more — are [Matt Pocock's skills](https://github.com/mattpocock/skills), used under their license. `afk`, `afk-start`, and `retro` add the autonomous night-shift layer on top. Hack around with them and make them your own.
