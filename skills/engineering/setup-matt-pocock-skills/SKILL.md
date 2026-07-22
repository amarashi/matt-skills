---
name: setup-matt-pocock-skills
description: Configure this repo for the engineering skills — set up its issue tracker, triage label vocabulary, and domain doc layout. Run once before first use of the other engineering skills.
disable-model-invocation: true
---

# Setup Matt Pocock's Skills

Scaffold the per-repo configuration that the engineering skills assume:

- **Issue tracker** — where issues live (GitHub by default; local markdown is also supported out of the box)
- **Triage labels** — the strings used for the five canonical triage roles
- **Domain docs** — where `CONTEXT.md` and ADRs live, and the consumer rules for reading them

**Defaults-first**: detect everything you can, apply the defaults silently, write the config, and report what you chose. Do **not** walk the user through decisions — almost every repo takes the defaults. Ask a question only when a trigger in the "When to ask" list fires, and ask only that one question.

The user can invoke `/setup-matt-pocock-skills interactive` to get the full question-by-question walkthrough instead (see "Interactive mode" at the end).

## Process

### 1. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `git remote -v` and `.git/config` — is this a GitHub repo? Which one?
- `AGENTS.md` and `CLAUDE.md` at the repo root — does either exist? Is there already an `## Agent skills` section in either?
- `CONTEXT.md` and `CONTEXT-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/` — does this skill's prior output already exist?
- `.scratch/` — sign that a local-markdown issue tracker convention is already in use
- The tracker's existing labels (e.g. `gh label list`) — do any resemble triage-role labels?

### 2. Decide

Resolve each decision from the exploration, in this order of preference. No user input.

**Issue tracker:**

- Remote points at GitHub → **GitHub** (uses the `gh` CLI)
- Remote points at GitLab (`gitlab.com` or self-hosted) → **GitLab** (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI)
- No remote, or `.scratch/` already in use → **Local markdown** (issues as files under `.scratch/<feature>/`)
- **PRs as a request surface** — default **no**. (Only meaningful for GitHub/GitLab; the user can flip it later in `docs/agents/issue-tracker.md`, or `/triage` will still handle any PR named explicitly.)

**Triage labels:** the five canonical roles, each mapped to its own name:

- `needs-triage` — maintainer needs to evaluate
- `needs-info` — waiting on reporter
- `ready-for-agent` — fully specified, AFK-ready (an agent can pick it up with no human context)
- `ready-for-human` — needs human implementation
- `wontfix` — will not be actioned

If the tracker already has labels that are obvious equivalents (`triage`, `more-info-needed`, `wont-fix`…), map to the existing strings instead of creating near-duplicates, and say so in the report.

**Domain docs:**

- `CONTEXT-MAP.md` exists at the root → **multi-context**
- Otherwise → **single-context** (one `CONTEXT.md` + `docs/adr/` at the repo root)

**Autonomy:** default tier `interactive` — no detection, just write `docs/agents/autonomy.md` from the seed so the three tiers (`interactive` / `assisted` / `autonomous`), the critical-decision test, and the decision-log rules are on hand. Skills that interview or gate on approval (`grilling`, `to-prd`, `to-issues`) read this file; the user flips the default by editing one line. **If the file already exists, preserve it** — a hand-edited default tier is a deliberate choice; never reset it on re-run. Rewrite it only in interactive mode or when the user explicitly asks for a reset.

**File to carry the `## Agent skills` block:**

- `CLAUDE.md` exists → edit it
- Else `AGENTS.md` exists → edit it
- Neither exists → create `CLAUDE.md`

Never create `AGENTS.md` when `CLAUDE.md` already exists (or vice versa) — always edit the one that's already there.

### When to ask

Only these situations warrant a question — and each gets exactly one:

1. **Unrecognisable tracker** — a remote exists but points at neither GitHub nor GitLab (Bitbucket, a bare host), or the repo shows signs of an external tracker (Jira/Linear keys in commit messages or issue templates). Ask where issues actually live; for "other" trackers, ask the user to describe the workflow in one paragraph and record it as freeform prose.
2. **Conflicting prior config** — `docs/agents/` already exists and disagrees with what exploration found (e.g. it says GitLab but the remote is GitHub). Ask which is right; don't silently overwrite a deliberate choice.
3. **Ambiguous label mapping** — existing tracker labels *partially* overlap the canonical roles in a way that isn't an obvious equivalence (e.g. both `triage` and `needs-review` exist). Show the proposed mapping and ask for a yes/adjust.

Everything else proceeds on defaults.

### 3. Write

Write directly — no draft-and-confirm round-trip.

**The `## Agent skills` block** in the chosen file. If one already exists, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked, plus whether external PRs are a triage surface]. See `docs/agents/issue-tracker.md`.

### Triage labels

[one-line summary of the label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of layout — "single-context" or "multi-context"]. See `docs/agents/domain.md`.

### Autonomy

[one-line summary — default tier and that skills accept per-invocation overrides]. See `docs/agents/autonomy.md`.
```

Then write the three docs files using the seed templates in this skill folder as a starting point:

- [issue-tracker-github.md](./issue-tracker-github.md) — GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md) — GitLab issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md) — local-markdown issue tracker
- [triage-labels.md](./triage-labels.md) — label mapping
- [domain.md](./domain.md) — domain doc consumer rules + layout
- [autonomy.md](./autonomy.md) — autonomy tiers, critical-decision test, decision-log rules

For "other" issue trackers, write `docs/agents/issue-tracker.md` from scratch using the user's description.

### 4. Report

One compact summary — the user's chance to veto after the fact, not a gate before writing:

- The decisions taken (tracker, PRs-as-surface, label mapping, doc layout, autonomy tier) with a one-word reason each ("GitHub — remote", "single-context — no CONTEXT-MAP.md", "interactive — default").
- Which file got the `## Agent skills` block.
- How to override: edit `docs/agents/*.md` directly (they're plain markdown, safe to hand-edit), or re-run `/setup-matt-pocock-skills interactive` to redo the decisions with questions.

Mention which engineering skills now read from these files. Re-running this skill is only necessary to switch issue trackers or restart from scratch.

## Interactive mode

On `/setup-matt-pocock-skills interactive`, replace step 2's silent defaults with a walkthrough: present the three decision areas **one at a time** — issue tracker (plus the PRs-as-a-request-surface follow-up for GitHub/GitLab), triage label vocabulary, domain doc layout. Assume the user does not know what these terms mean: start each section with a short explainer (what it is, why these skills need it, what changes if they pick differently), then show the choices with the default marked. In this mode, also show a draft of the `## Agent skills` block and the three docs files before writing, and let the user edit.
