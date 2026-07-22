# Ralph Loop Templates

Templates for the files `/afk` generates into `.sandcastle/`. Adapt before writing:

- Replace `ready-for-agent`, `needs-triage` with the actual label strings from `docs/agents/triage-labels.md`.
- Replace the `gh` commands with the tracker CLI from `docs/agents/issue-tracker.md` (e.g. `glab` for GitLab). For local-markdown trackers, replace the queue query with a directory scan.
- Keep the structure: fetch queue → fresh agent per issue → tracker is the only state carried between iterations.
- Both templates load `.sandcastle/.env` into the host process first: the tracker CLI calls (`gh issue list`/`edit`) run **host-side** via `execSync`, so a `GH_TOKEN` that lives only in `.sandcastle/.env` is invisible to them without this. (Sandcastle handles the sandbox's env itself.) `process.loadEnvFile` needs Node 20.12+; on older Node, inline a five-line parser instead.
- The orchestration script must be launched from a clean checkout of the default branch — merges land on whatever branch the host is on.
- If the user wants agents routed through OpenRouter (or named a non-Anthropic model), set `MODEL` to the OpenRouter slug they chose — different slugs per role are fine too (e.g. a cheaper model for the implementer, a stronger one for the reviewer, by splitting `agent()` into `implementer()`/`reviewer()`).
- For local models via Ollama: pick a coding model with **at least 32k context** (small-context models fall apart on agentic loops). Mixing providers per role is often the sweet spot — a local implementer with a cloud reviewer keeps the merge gate strong while the token-heavy implementation runs free.

## The per-issue pipeline (shared by both templates)

Each issue goes through **implement → independent review → merge → close**, fully unattended:

1. **Size, then implement** in a warm sandbox on `agent/issue-<n>`: the ticket's effort tier (label, or dispatcher judgment) picks the implementer's model, and it iterates until the full test suite is green (`<promise>COMPLETE</promise>`).
2. **Rebase, then review**: the branch is rebased onto the current main first (a conflict is a normal failure, routed onward), so the verdict is about the code that will actually land. Then an independent reviewer agent in the *same sandbox but a fresh context* diffs the branch against main, re-runs the suite, and either approves or writes findings to `REVIEW.md`. Change requests loop back to an implementer pass, up to `MAX_REVIEW_ROUNDS`.
3. **Merge on double green only — triple when the repo has CI.** Implementer `COMPLETE` *and* reviewer `<verdict>APPROVED</verdict>`; if CI exists, the branch is pushed and must go CI-green before merging, and main is watched after the merge — a red main auto-reverts the landing (clean, since each landing is one `--no-ff` merge commit). Merges are the only cross-issue mutation, so they are always serialized, even in the parallel template.
4. **Failure at any stage** (blocked, non-converging, crash, merge conflict): the issue is relabeled `needs-triage`, and — unless it is already a continuation — a fresh `[continuation]` issue is filed with `ready-for-agent`, pointing at the branch, so a **new session picks the work up** (tonight if budget remains, since the queue is re-queried each round). A continuation that fails again goes back to the human queue instead of spawning a chain.

Shared helpers (include in the generated `main.ts`):

```ts
import { claudeCode, createSandbox } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

// Host-side gh/tracker calls need the tokens from .sandcastle/.env too.
process.loadEnvFile(".sandcastle/.env");

const READY_LABEL = "ready-for-agent";
const MAX_ISSUES_PER_NIGHT = 10;
const MAX_IMPL_ITERATIONS = 10; // "keep working until green" budget per pass
const MAX_REVIEW_ROUNDS = 3;

// Model routing: direct Anthropic by default; through OpenRouter when
// OPENROUTER_API_KEY is set; local Ollama when OLLAMA_MODEL is set (Ollama
// wins if both are present). All three speak the Anthropic Messages
// protocol, so the sandboxed Claude Code runs unchanged — only the base
// URL, auth token, and model name differ. Blank ANTHROPIC_API_KEY is
// deliberate: it forces the auth-token path.
const OLLAMA = process.env.OLLAMA_MODEL; // e.g. "qwen3-coder:30b"
const OPENROUTER = !OLLAMA && !!process.env.OPENROUTER_API_KEY;
// Inside the sandbox, "localhost" is the container itself —
// host.docker.internal reaches the host's Ollama. On Linux, either pass
// network: "host" to docker() below (then use http://localhost:11434) or
// make the container's host-gateway resolvable.
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://host.docker.internal:11434";

// Effort tiers: each ticket runs on the smallest model that can handle it.
// The tier comes from an effort:* label (set at triage), else the dispatcher
// below judges it. Reviewer always runs the deep tier — it guards main.
type Tier = "light" | "standard" | "deep";
const MODELS: Record<Tier, string> = OLLAMA
  ? { light: OLLAMA, standard: OLLAMA, deep: process.env.OLLAMA_MODEL_DEEP ?? OLLAMA }
  : OPENROUTER
    ? { light: "anthropic/claude-haiku-4.5", standard: "anthropic/claude-sonnet-5", deep: "anthropic/claude-opus-4.8" }
    : { light: "claude-haiku-4-5", standard: "claude-sonnet-5", deep: "claude-opus-4-8" };

const routedEnv = OPENROUTER
  ? {
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        ANTHROPIC_AUTH_TOKEN: process.env.OPENROUTER_API_KEY!,
        ANTHROPIC_API_KEY: "",
      },
    }
  : OLLAMA
    ? {
        env: {
          ANTHROPIC_BASE_URL: OLLAMA_URL,
          ANTHROPIC_AUTH_TOKEN: "ollama", // required by the client, ignored by Ollama
          ANTHROPIC_API_KEY: "",
          // Claude Code's internal tier calls must map to local models too,
          // or it will request claude-* names the local server doesn't have.
          ANTHROPIC_DEFAULT_OPUS_MODEL: MODELS.deep,
          ANTHROPIC_DEFAULT_SONNET_MODEL: MODELS.standard,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: MODELS.light,
        },
      }
    : {};

const agent = (tier: Tier) =>
  claudeCode(MODELS[tier], { effort: tier === "deep" ? "high" : "medium", ...routedEnv });

const sh = (cmd: string) => execSync(cmd, { encoding: "utf8" });

const MAIN_BRANCH = sh(`git branch --show-current`).trim();

// Independent third gate: the repo's own CI on the pushed branch. The
// sandbox suite can lie (env drift, missing secrets); a neutral runner
// can't. Repos without CI skip this gate.
const HAS_CI = (() => {
  try { return JSON.parse(sh(`gh workflow list --json id`)).length > 0; } catch { return false; }
})();
const CI_TIMEOUT_MS = 30 * 60_000;

async function waitForCi(branch: string): Promise<boolean> {
  const deadline = Date.now() + CI_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 30_000));
    const runs = JSON.parse(sh(`gh run list --branch ${branch} --limit 1 --json status,conclusion`));
    if (!runs.length) continue; // CI hasn't registered the push yet
    if (runs[0].status === "completed") return runs[0].conclusion === "success";
  }
  return false; // never finished — fail safe
}

// Dispatcher: sizes an unlabeled ticket with one cheap light-tier call.
// All three providers speak the Messages API; both auth headers are sent
// and each server reads the one it wants. Fails safe to "standard".
// (Anthropic-direct with only an OAuth token has no API key for raw fetch —
// the catch handles that; label your tickets or use OpenRouter/Ollama.)
const API_URL = OLLAMA ? OLLAMA_URL : OPENROUTER ? "https://openrouter.ai/api" : "https://api.anthropic.com";
const API_KEY = OPENROUTER ? process.env.OPENROUTER_API_KEY! : process.env.ANTHROPIC_API_KEY ?? "ollama";

async function judgeEffort(issue: Issue): Promise<Tier> {
  const labeled = issue.labels.find((l) => l.startsWith("effort:"))?.slice(7);
  if (labeled === "light" || labeled === "standard" || labeled === "deep") return labeled;
  try {
    const ticket = sh(`gh issue view ${issue.number} --json title,body`);
    const res = await fetch(`${API_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": API_KEY,
        authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODELS.light,
        max_tokens: 10,
        system:
          "You size engineering tickets by the model capability they need. Reply with exactly one word: light (mechanical, few-file change), standard (typical feature slice), or deep (cross-cutting, tricky logic, architecture, or vague spec). When unsure, pick the higher tier.",
        messages: [{ role: "user", content: ticket }],
      }),
    });
    const word = (await res.json()).content?.[0]?.text?.trim().toLowerCase();
    if (word === "light" || word === "standard" || word === "deep") return word;
  } catch (err) {
    console.error(`[ralph] dispatcher failed for #${issue.number}:`, err);
  }
  return "standard";
}

type Issue = { number: number; title: string; labels: string[]; body: string };

const readyIssues = (): Issue[] =>
  JSON.parse(
    sh(`gh issue list --label "${READY_LABEL}" --state open --json number,title,labels,body --limit 100`),
  ).map((i: any) => ({
    number: i.number,
    title: i.title,
    labels: (i.labels ?? []).map((l: any) => l.name),
    body: i.body ?? "",
  }));

// Dependency-aware pick: /to-issues writes a "## Blocked by" section into
// every issue. Never hand an agent a ticket whose prerequisite hasn't
// landed — it would build against code that doesn't exist yet.
const blockersOf = (i: Issue): number[] => {
  const section = i.body.split(/##\s*Blocked by/i)[1]?.split(/\n##\s/)[0] ?? "";
  return [...section.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
};

const stateCache = new Map<number, string>();
const isClosed = (n: number) => {
  if (!stateCache.has(n)) {
    try { stateCache.set(n, JSON.parse(sh(`gh issue view ${n} --json state`)).state); }
    catch { stateCache.set(n, "OPEN"); } // unknown → assume it still blocks
  }
  return stateCache.get(n) === "CLOSED";
};
const unblocked = (i: Issue) => blockersOf(i).every(isClosed);

// Implement, then independently review, inside one warm sandbox.
// True only when a reviewer with fresh context approved a fully green branch.
async function implementAndReview(issue: Issue): Promise<boolean> {
  const tier = await judgeEffort(issue);
  console.log(`[ralph] #${issue.number} sized ${tier} → ${MODELS[tier]}`);
  await using sandbox = await createSandbox({
    branch: `agent/issue-${issue.number}`,
    sandbox: docker({ imageName: "sandcastle:local" }),
  });

  const impl = await sandbox.run({
    agent: agent(tier),
    promptFile: ".sandcastle/prompt.md",
    promptArgs: { ISSUE_NUMBER: String(issue.number) },
    maxIterations: MAX_IMPL_ITERATIONS,
    completionSignal: ["<promise>COMPLETE</promise>", "<promise>BLOCKED</promise>"],
    logging: { type: "file", path: `.sandcastle/logs/issue-${issue.number}.log` },
  });
  if (impl.completionSignal !== "<promise>COMPLETE</promise>") return false;

  // Judge the branch against the main it will actually land on — parallel
  // waves especially can start from a base that moved beneath them. A
  // rebase conflict is a normal failure (the continuation issue lands it
  // later); the reviewer re-runs the suite on the rebased code anyway.
  try {
    await sandbox.exec(`git rebase ${MAIN_BRANCH}`);
  } catch {
    try { await sandbox.exec(`git rebase --abort`); } catch {}
    console.error(`[ralph] #${issue.number} does not rebase onto ${MAIN_BRANCH}`);
    return false;
  }

  for (let round = 1; round <= MAX_REVIEW_ROUNDS; round++) {
    const review = await sandbox.run({
      agent: agent("deep"), // the merge gate always runs the strongest tier
      promptFile: ".sandcastle/review.md",
      promptArgs: { ISSUE_NUMBER: String(issue.number) },
      completionSignal: ["<verdict>APPROVED</verdict>", "<verdict>CHANGES</verdict>"],
      logging: { type: "file", path: `.sandcastle/logs/issue-${issue.number}-review-${round}.log` },
    });
    if (review.completionSignal === "<verdict>APPROVED</verdict>") return true;

    const fix = await sandbox.run({
      agent: agent(tier),
      prompt:
        "Address every finding in REVIEW.md. Keep the full test suite green. Commit, then reply <promise>COMPLETE</promise> — or <promise>BLOCKED</promise> if a finding cannot be resolved.",
      maxIterations: MAX_IMPL_ITERATIONS,
      completionSignal: ["<promise>COMPLETE</promise>", "<promise>BLOCKED</promise>"],
      logging: { type: "file", path: `.sandcastle/logs/issue-${issue.number}-fix-${round}.log` },
    });
    if (fix.completionSignal !== "<promise>COMPLETE</promise>") return false;
  }
  return false; // review never converged
}

// The only cross-issue mutation. Always serialized, never forced.
// Landing takes three greens when the repo has CI: agent suite,
// independent reviewer, and the neutral runner — checked on the branch
// before merging, and again on main after, with a clean revert if main
// goes red (every landing is a single --no-ff merge commit).
async function mergeAndClose(issue: Issue): Promise<boolean> {
  const branch = `agent/issue-${issue.number}`;
  try {
    if (HAS_CI) {
      sh(`git push -u origin ${branch}`);
      if (!(await waitForCi(branch))) {
        console.error(`[ralph] CI rejected ${branch}; not merging`);
        return false;
      }
    }
    sh(`git merge --no-ff ${branch} -m "land ${branch} (#${issue.number})"`);
    sh(`git push origin HEAD`);
    if (HAS_CI && !(await waitForCi(MAIN_BRANCH))) {
      sh(`git revert -m 1 --no-edit HEAD`);
      sh(`git push origin HEAD`);
      console.error(`[ralph] #${issue.number} reverted: main CI went red after landing`);
      return false;
    }
    sh(
      `gh issue close ${issue.number} --comment "> *This was done by an AI agent working AFK.* Implemented on \\`${branch}\\`, independently reviewed, full suite green${HAS_CI ? ", CI green" : ""}, merged to main."`,
    );
    console.log(`[ralph] #${issue.number} landed on main`);
    return true;
  } catch (err) {
    try { sh(`git merge --abort`); } catch {}
    console.error(`[ralph] merge failed for #${issue.number}:`, err);
    return false;
  }
}

// Morning ledger: one issue summarizing the night, filed unlabeled so it
// lands in the triage "unlabeled" bucket and gets seen.
const outcomes: string[] = [];
function fileNightReport(landed: number, attempted: number) {
  if (!outcomes.length) return;
  mkdirSync(".sandcastle/logs", { recursive: true });
  writeFileSync(
    ".sandcastle/logs/night-report.md",
    [
      "> *This was generated by an AI agent working AFK.*",
      "",
      `**${landed}/${attempted} landed on \`${MAIN_BRANCH}\`.**`,
      "",
      ...outcomes,
      "",
      "Per-stage logs: `.sandcastle/logs/`",
    ].join("\n"),
  );
  sh(
    `gh issue create --title "AFK night report: ${landed}/${attempted} landed" --body-file .sandcastle/logs/night-report.md`,
  );
}

// Never retry a failed issue tonight. First failure spawns a [continuation]
// issue so a FRESH session inherits the work; a failed continuation goes back
// to the human queue instead of chaining forever.
function handleFailure(issue: Issue) {
  const branch = `agent/issue-${issue.number}`;
  console.log(`[ralph] #${issue.number} did not land; handing off`);
  sh(`gh issue edit ${issue.number} --remove-label "${READY_LABEL}" --add-label "needs-triage"`);
  if (issue.title.startsWith("[continuation]")) return;
  sh(
    `gh issue create --title "[continuation] ${issue.title}" --label "${READY_LABEL}" --body "> *This was created by an AI agent working AFK.*\n\nContinuation of #${issue.number}. A prior AFK attempt left work on branch \\`${branch}\\` — read that issue, its comments, and the branch diff before starting. Finish the work until the full test suite is green, then emit the completion signal."`,
  );
}
```

## `.sandcastle/main.ts` — sequential (default)

One pipeline at a time. The queue is re-queried every round, so continuation issues filed tonight get picked up tonight (budget permitting), and each merge is visible to the next issue's sandbox.

```ts
const attempted = new Set<number>();
let landed = 0;

while (attempted.size < MAX_ISSUES_PER_NIGHT) {
  stateCache.clear(); // issues close as the night progresses
  const issue = readyIssues().find((i) => !attempted.has(i.number) && unblocked(i));
  if (!issue) break; // queue drained or fully blocked — the only happy exit
  attempted.add(issue.number);
  console.log(`[ralph] picking up #${issue.number}: ${issue.title}`);

  let green = false;
  try {
    green = await implementAndReview(issue);
  } catch (err) {
    // A crashed sandbox must not kill the night — treat it like any failed issue.
    console.error(`[ralph] #${issue.number} crashed:`, err);
  }

  if (green && (await mergeAndClose(issue))) {
    landed++;
    outcomes.push(`- #${issue.number} ${issue.title} — **landed**`);
  } else {
    handleFailure(issue);
    outcomes.push(`- #${issue.number} ${issue.title} — did not land (branch kept; see issue labels/comments)`);
  }
}

fileNightReport(landed, attempted.size);
console.log(`[ralph] night shift over: ${landed} landed on main, ${attempted.size} attempted`);
```

## `.sandcastle/main.ts` — parallel (`/afk parallel`)

Waves of concurrent pipelines, each on its own branch (mandatory — concurrent sandboxes sharing a branch corrupt each other). Implement-and-review runs concurrently; **merges happen after the wave, one at a time**. The queue is re-queried between waves, so continuations join later waves. Parallel branches merge against a main that moved beneath them, so conflicts are more likely — a conflicted merge falls through to `handleFailure`, and its continuation issue lands the rebase in a later session.

```ts
const CONCURRENCY = 3;
const attempted = new Set<number>();
let landed = 0;

while (attempted.size < MAX_ISSUES_PER_NIGHT) {
  stateCache.clear(); // blockers may have landed in the previous wave
  const wave = readyIssues()
    .filter((i) => !attempted.has(i.number) && unblocked(i))
    .slice(0, Math.min(CONCURRENCY, MAX_ISSUES_PER_NIGHT - attempted.size));
  if (!wave.length) break;
  wave.forEach((i) => attempted.add(i.number));

  const results = await Promise.allSettled(
    wave.map(async (issue) => {
      console.log(`[ralph] picking up #${issue.number}: ${issue.title}`);
      return implementAndReview(issue);
    }),
  );

  for (const [i, r] of results.entries()) {
    const issue = wave[i];
    if (r.status === "rejected") console.error(`[ralph] #${issue.number} crashed:`, r.reason);
    const green = r.status === "fulfilled" && r.value;
    if (green && (await mergeAndClose(issue))) {
      landed++;
      outcomes.push(`- #${issue.number} ${issue.title} — **landed**`);
    } else {
      handleFailure(issue);
      outcomes.push(`- #${issue.number} ${issue.title} — did not land (branch kept; see issue labels/comments)`);
    }
  }
}

fileNightReport(landed, attempted.size);
console.log(`[ralph] night shift over: ${landed} landed on main, ${attempted.size} attempted`);
```

## `.sandcastle/prompt.md` — the implementer prompt

Self-contained: the sandboxed agent has the repo but **not** this skills plugin, so the implementation discipline is spelled out inline rather than referenced as `/implement` or `/tdd`. The `!`-prefixed command expands inside the sandbox before the agent starts.

```markdown
You are an unattended implementation agent. Your sole task is issue #{{ISSUE_NUMBER}}. There is no human available — do not ask questions; make the most defensible call and record it.

# The issue and its discussion

!`gh issue view {{ISSUE_NUMBER}} --comments`

# Your contract

The most recent **Agent Brief** comment above is the authoritative specification. The issue body and earlier discussion are context only. If there is no agent brief, treat the issue body as the spec, and be conservative about scope. If this is a `[continuation]` issue, read the referenced original issue and existing branch diff first, and build on that work.

# Process

1. Read the brief. Read `CONTEXT.md` and `docs/adr/` if present, and respect them.
2. Work test-first where a seam allows it: failing test, implementation, green.
3. Run the typechecker and the relevant single test files regularly; run the full test suite once at the end. All must pass — if they don't, keep working until they do.
4. Commit to the current branch as you go, with clear messages referencing #{{ISSUE_NUMBER}}. Do not switch branches. Do not merge. Do not push.
5. If you discover necessary work that is beyond this issue's scope, do NOT expand scope. File it: `gh issue create --title "..." --label "ready-for-agent"` with a full brief in the body (what to build, acceptance criteria, `Blocked by: #{{ISSUE_NUMBER}}` if applicable). Another agent in another session will pick it up.
6. When the full suite is green and the brief is satisfied:
   - Comment on the issue: what you built and the key decisions. Start with: `> *This was generated by an AI agent working AFK.*`
   - End your reply with exactly: `<promise>COMPLETE</promise>`
7. If you are genuinely blocked (spec contradiction, missing access, failing suite you cannot fix within scope):
   - Comment on the issue describing the blocker precisely (same disclaimer line first). If the remaining work is well-defined, file it as a new `ready-for-agent` issue per step 5.
   - End your reply with exactly: `<promise>BLOCKED</promise>`

Never emit a completion signal you have not earned: `COMPLETE` means the full test suite passed on your final commit. After you emit `COMPLETE`, an independent reviewer will inspect your branch — and it merges to main only if they approve, so leave the branch in the state you would merge yourself.
```

## `.sandcastle/review.md` — the independent reviewer prompt

Runs in the same sandbox but with fresh context — it has none of the implementer's assumptions. Approval here is the last gate before main.

```markdown
You are an unattended code reviewer. Your verdict decides whether this branch merges to main tonight, with no human in the loop — hold the bar you would hold for your own merges.

# The issue this branch claims to resolve

!`gh issue view {{ISSUE_NUMBER}} --comments`

# The diff under review

!`git diff main...HEAD --stat`

# Process

1. Read the agent brief (the contract) and the full diff (`git diff main...HEAD`).
2. Re-run the full test suite and the typechecker yourself. Do not trust the implementer's claim.
3. Check, in order: does the diff do what the brief says (no more, no less)? Is anything broken or unsafe (bugs, security, data loss, missing error handling)? Do the tests actually test the new behavior, not implementation details?
4. Trivial mechanical fixes (typos, a missed lint) you may make and commit directly.
5. Verdict:
   - Everything holds → end your reply with exactly: `<verdict>APPROVED</verdict>`
   - Anything of substance fails → write every finding to a `REVIEW.md` file at the repo root (numbered, each with file/line and what "fixed" looks like), commit it, and end your reply with exactly: `<verdict>CHANGES</verdict>`

Never approve out of politeness or because the work is "close". An unfixable-in-place problem is a `CHANGES` verdict with a finding saying so — the loop will route it to a fresh session.
```
