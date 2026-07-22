---
name: afk
description: Launch an AFK night shift — a Ralph loop of sandboxed Sandcastle agents that drains the ready-for-agent queue and lands double-green work straight on main.
disable-model-invocation: true
---

# AFK

Turn the `ready-for-agent` queue into merged commits on main while the user is away, with a single invocation. Each issue runs a fully unattended pipeline — **implement → independent review → merge → close** — and only lands when it is *double green*: the implementer's full test suite passes AND a reviewer agent with fresh context approves. Work that can't converge is handed to a fresh session via a `[continuation]` issue instead of waiting for a human. This skill combines two pieces:

- **The Ralph technique** — a dumb outer loop that starts a *fresh* agent for each unit of work, with all state living outside the agent (here: the issue tracker and git). No context carries over between iterations; the tracker is the memory.
- **[Sandcastle](https://github.com/mattpocock/sandcastle)** (`@ai-hero/sandcastle`) — runs each agent in an isolated Docker/Podman sandbox on its own branch and manages the worktrees and commits.

The user should never have to hand-configure Sandcastle. `/afk` does the preflight, scaffolds and configures everything it can — including building `.sandcastle/.env` from the host's own credentials — launches the loop as a detached process, and reports how to watch and stop it. The only thing it can never do is conjure credentials the host doesn't have.

## Reference docs

- [RALPH-LOOP.md](RALPH-LOOP.md) — templates for the orchestration script (`main.ts`, sequential and parallel), the implementer prompt (`prompt.md`), and the independent reviewer prompt (`review.md`)

## Preconditions

1. **`/setup-matt-pocock-skills` has been run** — `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` exist. If not, stop and tell the user to run it first.
2. **A container runtime is up** — `docker info` (or `podman info`) succeeds. If not, stop: the whole point is sandboxed agents; never fall back to running unsandboxed.
3. **Credentials are reachable** (checked in step 3 below) — model access and a tracker token, taken from the host environment. On a machine set up once (subscription token or API key + `gh auth`), this needs nothing per project.

## Invocation

The user invokes `/afk`, optionally with arguments:

- `/afk` — sequential Ralph loop (default): one sandboxed agent at a time, one issue per iteration.
- `/afk parallel` — fan out over the queue, one sandboxed agent *per issue* on its own branch, capped at 3 concurrent sandboxes (the user can name a different cap).
- `/afk dry-run` — do all the preflight and generation, show what would launch, but don't start the loop.
- `/afk doctor` — run the entire pipeline against a throwaway canary ticket on a scratch branch, so the first real night isn't the test (see Doctor below).

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

### 3. Ensure credentials — generated from your environment

`/afk` builds `.sandcastle/.env` from the host's own credentials, so a machine whose global environment is set up once needs **zero per-project secrets**. If `.sandcastle/.env` is missing (or has no model-access line), generate it now; if it already exists, leave it untouched.

- **Model access** — write exactly **one** line, taking the first that is present in the host environment (writing more than one lets a higher-precedence credential shadow the rest):
  1. `OLLAMA_MODEL` (plus `OLLAMA_URL` if set) — **local models** via [Ollama](https://ollama.com), no key.
  2. `OPENROUTER_API_KEY` — agents routed through [OpenRouter](https://openrouter.ai) (any model slug; see the routing block in [RALPH-LOOP.md](RALPH-LOOP.md)).
  3. `CLAUDE_CODE_OAUTH_TOKEN` — Anthropic via your **Pro/Max subscription**, no API billing (mint one with `claude setup-token`).
  4. `ANTHROPIC_API_KEY` — Anthropic pay-per-token API.

  Prefer 3 for subscription users. A present `ANTHROPIC_API_KEY` **shadows** `CLAUDE_CODE_OAUTH_TOKEN` and forces API billing, so when both are in the host env write only the one the user wants — never both.
- **Tracker token** — for a GitHub tracker, write `GH_TOKEN=$(gh auth token)` (host-side). For other trackers, write the token that CLI needs; omit it if the CLI authenticates from the host keychain without one.

Copy the real values from the host environment into the file — **never print, echo, or commit them** — and confirm `.env` is git-ignored (the scaffold's `.gitignore` covers it; verify it survived).

**Ollama preflight:** when `OLLAMA_MODEL` is set, verify before launching that the Ollama server responds and the model is pulled (`curl <url>/api/tags`, or `ollama list`). From inside the sandbox `localhost` is the container, so the default URL is `http://host.docker.internal:11434`; on Linux use `network: "host"` in the docker() config (then `http://localhost:11434`). If the server is down or the model missing, stop and say exactly what to run — don't launch a loop that will fail on its first call.

**Only stop** if the host has none of the model-access credentials above (and, for a GitHub tracker, no `gh auth`): tell the user exactly what to set on their machine — `claude setup-token` for a subscription token, `gh auth login` for the tracker — then have them re-invoke `/afk`. Once the host environment is set up, every project sails through this step with nothing to configure.

### 4. Generate the loop

Write three files from the templates in [RALPH-LOOP.md](RALPH-LOOP.md), substituting the repo's actual label strings and tracker CLI commands:

- `.sandcastle/main.ts` — the Ralph loop running the per-issue pipeline (implement → review → merge → close). Sequential template by default; parallel template for `/afk parallel`.
- `.sandcastle/prompt.md` — the implementer prompt. It must be **self-contained** (the sandbox agent does not have this skills repo): the issue's agent brief is the contract, TDD where possible, keep working until the full suite is green, file out-of-scope discoveries as new `ready-for-agent` issues, emit the completion signal only when earned.
- `.sandcastle/review.md` — the independent reviewer prompt: fresh context, re-runs the suite itself, checks the diff against the brief, approves or writes findings to `REVIEW.md` for a fix round.

The launch must start from a clean checkout of the default branch — merges land on whatever branch the host is on.

When generating, substitute `VERIFY_CMD` with the repo's real test command (found in `package.json`/CI config) so every merged tree is re-verified host-side before pushing; leave it empty only if the host genuinely can't run the suite, and say so in the launch summary.

**Model routing:** the generated `agent()` helper defaults to Anthropic directly, flips to OpenRouter when `OPENROUTER_API_KEY` is set, and to local Ollama when `OLLAMA_MODEL` is set. If the user names a model (`/afk model=qwen/qwen3-coder`, "implement locally, review with Opus"), set the model slug(s) accordingly — split implementer/reviewer providers are encouraged: a local implementer with a cloud reviewer keeps the merge gate strong while the token-heavy work runs free.

**Effort dispatch:** each ticket's implementer runs on the smallest model tier that can handle it (`light` / `standard` / `deep`, mapped per provider in the `MODELS` table). The tier comes from the ticket's `effort:*` label, set wherever the ticket was born — at `/triage` or `/to-issues`, or by the implementer when it files a scope-discovery issue — so sizing is done once, by whoever has the most context on the work. Unlabeled tickets (continuations, hand-filed issues) fall back to `standard`. The **reviewer always runs the deep tier** regardless of the implementer's — it is the last gate before main, and skimping there is where autonomous merging goes wrong.

Show the user a one-paragraph summary of what was generated (mode, cap, branch naming, review rounds, model routing) before launching — unless they invoked with arguments that already pin these down.

### 5. Launch

Run `npx tsx .sandcastle/main.ts` as a detached background process with output to `.sandcastle/logs/`. The loop must survive this Claude session ending — that is what makes it AFK. Then report:

- queue size and mode (sequential / parallel×N)
- branch naming scheme (`agent/issue-<n>`)
- the night budget: issue cap and the 8-hour wall-clock deadline
- how to watch: `tail -f .sandcastle/logs/*.log`
- how to stop: `touch .sandcastle/STOP` for a graceful stop (finishes the in-flight issue, files the report), or kill the `tsx` process (report its PID) for a hard stop

When routing through a paid provider (OpenRouter), also remind the user once to set a spend limit on the API key itself — provider-side caps are the only ones a crashed loop can't overrun.

For `/afk dry-run`, print this report without launching.

### 6. The morning after

When the user returns, point them at:

- **The night report** — the loop files one "AFK night report" issue summarizing every attempt (landed / did not land, with pointers). It's created unlabeled on purpose, so it surfaces in `/triage`'s unlabeled bucket. Start there.
- **Main** — every landed issue is already merged and pushed (`land agent/issue-<n>` merge commits), its issue closed with a summary comment. `git log origin/main` is the night's ledger.
- **Continuations** — work that didn't converge was handed to a fresh session via `[continuation]` issues; any still open show what's mid-flight or awaiting the next run.
- **Failures** — issues the loop gave up on (including failed continuations) are relabeled `needs-triage` with a comment explaining the blocker; they'll surface next `/triage`.
- **Logs** — `.sandcastle/logs/issue-<n>*.log` per issue: implementation, each review round, each fix round.

## Doctor (shakedown)

`/afk doctor` proves the whole machine end-to-end without risking main or real tickets. Run it after first setup, after changing providers/models, and after any Sandcastle upgrade.

1. **Preflight** — everything from steps 1–3 of the process, plus: the sandbox image builds, and the tracker CLI is authenticated *host-side with `.sandcastle/.env` loaded* (that exact combination is what the loop uses).
2. **Scratch base** — create `afk-doctor` from the default branch and run the whole exercise from it. The doctor must never merge into the real default branch.
3. **Canary ticket** — file a real issue: title `[doctor] canary`, labels `ready-for-agent` + `effort:light`, body instructing exactly one trivial change (e.g. "create `CANARY.md` containing the issue number") with an acceptance criterion.
4. **Run** — generate a doctor variant of `main.ts` (`MAX_ISSUES_PER_NIGHT = 1`, sequential) and run it in the foreground, narrating each stage as it happens: sandbox up, implementer signal, review verdict, merge, close.
5. **Verify** — the merge commit exists on `afk-doctor`, the canary issue is closed with the summary comment, and per-stage logs exist under `.sandcastle/logs/`.
6. **Clean up** — close any leftover canary/continuation issues, delete `afk-doctor` and the canary's `agent/issue-<n>` branch (local and remote), return to the original branch.
7. **Report** — pass/fail per stage; on failure, the relevant log excerpt and the most likely fix. A doctor failure means: do not launch a real night until it passes.

## Guardrails

- **Sandbox always.** Never substitute `noSandbox()`. If Docker/Podman is unavailable, stop.
- **Branch per issue, never head.** Every pipeline runs on its own `agent/issue-<n>` branch; only the serialized host-side merge step touches main.
- **Merge on double green only — triple when CI exists.** A branch lands only when the implementer's full suite is green AND an independent fresh-context reviewer approved AND (if the repo has CI) the neutral runner passes the pushed branch. Main's CI is watched after each landing; a red main auto-reverts the merge commit. Merges are serialized and never forced; a conflicted merge is aborted and routed to a continuation issue, not resolved blind.
- **Bounded loop.** The generated `main.ts` caps total issues per night and never retries a failed issue in the same run. Continuation issues count toward the cap and never chain — a failed continuation goes to `needs-triage`, not to a third session.
- **Closing is earned.** An issue is closed only after its branch is merged and pushed. Everything else stays open and labeled truthfully.
- **Protected paths.** Agents may not touch CI workflows, deploy config, secrets, or database migrations unless the agent brief explicitly authorizes that exact change — enforced twice: the implementer prompt forbids it, and the reviewer auto-rejects it. Unattended agents editing the machinery that verifies them is the one loop this system must never close.
