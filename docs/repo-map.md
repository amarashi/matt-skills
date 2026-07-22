# Repo Map

The complete inventory of this repository: every skill, reference doc, script, and config file, and what each one is for. The [top-level README](../README.md) sells the workflow; this file documents the machine.

A **skill** is a folder containing a `SKILL.md` — instructions Claude Code loads when the skill is invoked. Skills are either **user-invoked** (only a human typing `/name` can trigger them) or **model-invoked** (the model may also reach for them autonomously); see [invocation.md](./invocation.md) for the full rules. Extra `.md` files inside a skill folder are reference docs that skill reads; they are not skills themselves.

## Top-level layout

| Path | What it is |
| --- | --- |
| `README.md` | Public-facing intro, quickstart, and the catalog of shipped skills |
| `CLAUDE.md` | Rules agents must follow when editing this repo (bucket structure, sync requirements) |
| `CONTEXT.md` | Domain glossary for this repo's own vocabulary (Issue, Triage role, …) |
| `CHANGELOG.md` | Release history, generated from changesets |
| `docs/invocation.md` | User-invoked vs model-invoked: definitions and dependency rules |
| `docs/repo-map.md` | This file |
| `docs/adr/` | Architecture decision records for this repo (currently 0001: setup pointers only for hard dependencies) |
| `scripts/link-skills.sh` | Symlink skills into a project's `.claude/skills/` |
| `scripts/list-skills.sh` | Enumerate skills in this repo |
| `.claude-plugin/plugin.json` | Plugin manifest — every shipped skill must be registered here |
| `.changeset/` | Pending release notes (changesets); one file per unreleased change |
| `.out-of-scope/` | Knowledge base of rejected feature requests, written by `/triage` |
| `package.json` | npm package (`mattpocock-skills`), changeset tooling |

## Skill buckets

Six buckets under `skills/`. **Shipped** buckets (engineering, productivity, misc) appear in the README and plugin manifest; the other three are excluded by rule.

### `skills/engineering/` — daily code work (shipped)

User-invoked:

| Skill | Purpose | Extra files in folder |
| --- | --- | --- |
| [ask-matt](../skills/engineering/ask-matt/SKILL.md) | Router: which skill or flow fits your situation | — |
| [grill-with-docs](../skills/engineering/grill-with-docs/SKILL.md) | Grilling session that also builds the domain model (ADRs, `CONTEXT.md`). Autonomy tiers supported | — |
| [triage](../skills/engineering/triage/SKILL.md) | Move issues/external PRs through triage roles; write agent briefs; apply effort labels. `ready-for-agent` is a security boundary | `AGENT-BRIEF.md` (how to write briefs), `OUT-OF-SCOPE.md` (rejected-request KB rules) |
| [improve-codebase-architecture](../skills/engineering/improve-codebase-architecture/SKILL.md) | Scan for deepening opportunities, present as HTML report | `HTML-REPORT.md` (report format) |
| [setup-matt-pocock-skills](../skills/engineering/setup-matt-pocock-skills/SKILL.md) | One-time per-repo config: tracker, labels, domain docs, autonomy. Defaults-first; `interactive` mode for the walkthrough | Seed templates it copies into target repos: `issue-tracker-github.md`, `issue-tracker-gitlab.md`, `issue-tracker-local.md`, `triage-labels.md` (incl. effort labels), `domain.md`, `autonomy.md` |
| [to-issues](../skills/engineering/to-issues/SKILL.md) | Split a PRD/plan into vertical-slice issues with effort labels and blocked-by links | — |
| [to-prd](../skills/engineering/to-prd/SKILL.md) | Synthesize the current conversation into a PRD on the tracker | — |
| [prototype](../skills/engineering/prototype/SKILL.md) | Throwaway prototypes to answer one question | `LOGIC.md` (state/logic shape), `UI.md` (UI-variants shape) |

Model-invoked:

| Skill | Purpose | Extra files in folder |
| --- | --- | --- |
| [diagnosing-bugs](../skills/engineering/diagnosing-bugs/SKILL.md) | Diagnosis loop: reproduce → minimise → hypothesise → instrument → fix | `scripts/hitl-loop.template.sh` (human-in-the-loop repro template) |
| [tdd](../skills/engineering/tdd/SKILL.md) | Red-green-refactor, one vertical slice at a time | `tests.md`, `mocking.md`, `refactoring.md` |
| [domain-modeling](../skills/engineering/domain-modeling/SKILL.md) | Actively sharpen the domain model; write ADRs and `CONTEXT.md` inline | `ADR-FORMAT.md`, `CONTEXT-FORMAT.md` |
| [codebase-design](../skills/engineering/codebase-design/SKILL.md) | Deep-module design discipline shared by other skills | `DEEPENING.md`, `DESIGN-IT-TWICE.md` |

### `skills/productivity/` — non-code workflow tools (shipped)

User-invoked:

| Skill | Purpose | Extra files in folder |
| --- | --- | --- |
| [grill-me](../skills/productivity/grill-me/SKILL.md) | The interview, without a codebase. Autonomy tiers via argument | — |
| [handoff](../skills/productivity/handoff/SKILL.md) | Compact the conversation into a handoff file for a fresh session | — |
| [teach](../skills/productivity/teach/SKILL.md) | Multi-session tutoring with a stateful workspace | `MISSION-FORMAT.md`, `GLOSSARY-FORMAT.md`, `LEARNING-RECORD-FORMAT.md`, `RESOURCES-FORMAT.md` |
| [writing-great-skills](../skills/productivity/writing-great-skills/SKILL.md) | Reference for writing/editing skills | `GLOSSARY.md` |

Model-invoked:

| Skill | Purpose |
| --- | --- |
| [grilling](../skills/productivity/grilling/SKILL.md) | The reusable interview loop behind `grill-me`/`grill-with-docs`. Implements the three autonomy tiers (`interactive` / `assisted` / `autonomous`) |

### `skills/misc/` — kept but rarely used (shipped)

| Skill | Purpose |
| --- | --- |
| [git-guardrails-claude-code](../skills/misc/git-guardrails-claude-code/SKILL.md) | Hooks that block dangerous git commands (ships `scripts/block-dangerous-git.sh`) |
| [migrate-to-shoehorn](../skills/misc/migrate-to-shoehorn/SKILL.md) | Migrate `as` assertions to @total-typescript/shoehorn |
| [scaffold-exercises](../skills/misc/scaffold-exercises/SKILL.md) | Scaffold exercise/solution directory structures |
| [setup-pre-commit](../skills/misc/setup-pre-commit/SKILL.md) | Husky + lint-staged pre-commit setup |

### `skills/in-progress/` — drafts, not shipped

| Skill | Purpose | Extra files in folder |
| --- | --- | --- |
| [afk](../skills/in-progress/afk/SKILL.md) | One-command AFK night shift: Ralph loop over Sandcastle Docker sandboxes; implement → independent review → CI gate → merge to main; effort-tier model routing (Anthropic / OpenRouter / Ollama); doctor mode, night reports, kill switch | `RALPH-LOOP.md` (templates it generates into `.sandcastle/`: sequential & parallel `main.ts`, implementer `prompt.md`, reviewer `review.md`) |
| [retro](../skills/in-progress/retro/SKILL.md) | Mine night-shift logs for recurring failures; fold fixes back into prompts, docs, and effort calibration | — |
| [decision-mapping](../skills/in-progress/decision-mapping/SKILL.md) | Turn a loose idea into sequenced investigation tickets | — |
| [review](../skills/in-progress/review/SKILL.md) | Review changes along Standards and Spec axes | — |
| [writing-beats](../skills/in-progress/writing-beats/SKILL.md) | Shape an article as a journey of beats | — |
| [writing-fragments](../skills/in-progress/writing-fragments/SKILL.md) | Mine raw writing fragments via grilling | — |
| [writing-shape](../skills/in-progress/writing-shape/SKILL.md) | Shape raw material into an article paragraph by paragraph | — |

### `skills/personal/` — author-specific, not shipped

| Skill | Purpose |
| --- | --- |
| [edit-article](../skills/personal/edit-article/SKILL.md) | Article editing |
| [obsidian-vault](../skills/personal/obsidian-vault/SKILL.md) | Obsidian vault management |

### `skills/deprecated/` — no longer used, not shipped

[design-an-interface](../skills/deprecated/design-an-interface/SKILL.md), [qa](../skills/deprecated/qa/SKILL.md), [request-refactor-plan](../skills/deprecated/request-refactor-plan/SKILL.md), [ubiquitous-language](../skills/deprecated/ubiquitous-language/SKILL.md)

## Files these skills create in *target* repos

Running the skills against a project writes configuration there (never here):

| Path in target repo | Written by | Read by |
| --- | --- | --- |
| `CLAUDE.md` / `AGENTS.md` (`## Agent skills` block) | setup | everything |
| `docs/agents/issue-tracker.md` | setup | triage, to-prd, to-issues, afk |
| `docs/agents/triage-labels.md` (roles + effort labels) | setup | triage, to-issues, afk |
| `docs/agents/domain.md` | setup | domain-consuming skills |
| `docs/agents/autonomy.md` (autonomy tier default) | setup | grilling, to-prd, to-issues, retro |
| `CONTEXT.md`, `docs/adr/` | domain-modeling (via grill-with-docs) | most engineering skills |
| `.out-of-scope/*.md` | triage | triage |
| `.sandcastle/main.ts`, `prompt.md`, `review.md` | afk | the night-shift loop |
| `.sandcastle/logs/`, `.sandcastle/retros/` | the loop / retro | retro, humans |

## The flows

- **Idea → ship**: `/grill-with-docs` → (`/prototype` detour via `/handoff` if needed) → `/to-prd` → `/to-issues` → `/implement` per issue — or `/afk` to drain the queue unattended. `/ask-matt` navigates.
- **Inbound work**: `/triage` turns raw issues/PRs into `ready-for-agent` tickets with briefs and effort labels.
- **Feedback**: night reports → `/retro` → better prompts, docs, and sizing.

## Keeping this file honest

`CLAUDE.md` defines the sync rules (shipped skills ↔ README ↔ `plugin.json`). When adding, moving, or retiring a skill or reference doc, update this map in the same change. `scripts/list-skills.sh` enumerates reality when in doubt.
