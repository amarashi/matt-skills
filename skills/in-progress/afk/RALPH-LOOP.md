# Ralph Loop Templates

Templates for the files `/afk` generates into `.sandcastle/`. Adapt before writing:

- Replace `ready-for-agent`, `ready-for-human`, `needs-triage` with the actual label strings from `docs/agents/triage-labels.md`.
- Replace the `gh` commands with the tracker CLI from `docs/agents/issue-tracker.md` (e.g. `glab` for GitLab). For local-markdown trackers, replace the queue query with a directory scan.
- Keep the structure: fetch queue → fresh agent per issue → tracker is the only state carried between iterations.

## `.sandcastle/main.ts` — sequential (default)

One sandboxed agent at a time. State lives in the tracker; each iteration re-queries it, so work done by one iteration (or by humans overnight) is visible to the next.

```ts
import { run, claudeCode } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "node:child_process";

const READY_LABEL = "ready-for-agent";
const MAX_ISSUES_PER_NIGHT = 10;
const MAX_ITERATIONS_PER_ISSUE = 5;

type Issue = { number: number; title: string };

function readyIssues(): Issue[] {
  return JSON.parse(
    execSync(
      `gh issue list --label "${READY_LABEL}" --state open --json number,title --limit 100`,
      { encoding: "utf8" },
    ),
  );
}

const attempted = new Set<number>();
let shipped = 0;

while (shipped + attempted.size < MAX_ISSUES_PER_NIGHT) {
  const issue = readyIssues().find((i) => !attempted.has(i.number));
  if (!issue) break; // queue drained — the only happy exit

  attempted.add(issue.number);
  console.log(`[ralph] picking up #${issue.number}: ${issue.title}`);

  const result = await run({
    agent: claudeCode("claude-opus-4-8", { effort: "high" }),
    sandbox: docker({ imageName: "sandcastle:local" }),
    promptFile: ".sandcastle/prompt.md",
    promptArgs: { ISSUE_NUMBER: String(issue.number) },
    maxIterations: MAX_ITERATIONS_PER_ISSUE,
    branchStrategy: { type: "branch", branch: `agent/issue-${issue.number}` },
    completionSignal: ["<promise>COMPLETE</promise>", "<promise>BLOCKED</promise>"],
    logging: { type: "file", path: `.sandcastle/logs/issue-${issue.number}.log` },
  });

  if (result.completionSignal === "<promise>COMPLETE</promise>") {
    shipped++;
    console.log(`[ralph] #${issue.number} shipped on ${result.branch}`);
  } else {
    // Ralph-style: never retry a poisoned issue in the same run. The prompt
    // already relabeled it needs-triage (or it died without a signal — flag it).
    console.log(`[ralph] #${issue.number} did not complete; skipping for tonight`);
    execSync(
      `gh issue edit ${issue.number} --remove-label "${READY_LABEL}" --add-label "needs-triage"`,
    );
  }
}

console.log(`[ralph] night shift over: ${shipped} shipped, ${attempted.size} attempted`);
```

## `.sandcastle/main.ts` — parallel (`/afk parallel`)

Fan out over the queue in waves. One branch per issue is mandatory — concurrent sandboxes sharing a branch corrupt each other. The queue is snapshotted once at the start (a re-query mid-wave could hand two agents the same issue).

```ts
import { run, claudeCode } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "node:child_process";

const READY_LABEL = "ready-for-agent";
const CONCURRENCY = 3;
const MAX_ISSUES_PER_NIGHT = 10;
const MAX_ITERATIONS_PER_ISSUE = 5;

type Issue = { number: number; title: string };

const queue: Issue[] = JSON.parse(
  execSync(
    `gh issue list --label "${READY_LABEL}" --state open --json number,title --limit 100`,
    { encoding: "utf8" },
  ),
).slice(0, MAX_ISSUES_PER_NIGHT);

async function work(issue: Issue) {
  console.log(`[ralph] picking up #${issue.number}: ${issue.title}`);
  const result = await run({
    agent: claudeCode("claude-opus-4-8", { effort: "high" }),
    sandbox: docker({ imageName: "sandcastle:local" }),
    promptFile: ".sandcastle/prompt.md",
    promptArgs: { ISSUE_NUMBER: String(issue.number) },
    maxIterations: MAX_ITERATIONS_PER_ISSUE,
    branchStrategy: { type: "branch", branch: `agent/issue-${issue.number}` },
    completionSignal: ["<promise>COMPLETE</promise>", "<promise>BLOCKED</promise>"],
    logging: { type: "file", path: `.sandcastle/logs/issue-${issue.number}.log` },
  });
  const ok = result.completionSignal === "<promise>COMPLETE</promise>";
  if (!ok) {
    execSync(
      `gh issue edit ${issue.number} --remove-label "${READY_LABEL}" --add-label "needs-triage"`,
    );
  }
  return { issue, ok };
}

let shipped = 0;
for (let i = 0; i < queue.length; i += CONCURRENCY) {
  const wave = queue.slice(i, i + CONCURRENCY);
  const results = await Promise.allSettled(wave.map(work));
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) shipped++;
  }
}

console.log(`[ralph] night shift over: ${shipped}/${queue.length} shipped`);
```

## `.sandcastle/prompt.md` — the per-issue agent prompt

Self-contained: the sandboxed agent has the repo but **not** this skills plugin, so the implementation discipline is spelled out inline rather than referenced as `/implement` or `/tdd`. The `!`-prefixed command expands inside the sandbox before the agent starts.

```markdown
You are an unattended implementation agent. Your sole task is issue #{{ISSUE_NUMBER}}. There is no human available — do not ask questions; make the most defensible call and record it.

# The issue and its discussion

!`gh issue view {{ISSUE_NUMBER}} --comments`

# Your contract

The most recent **Agent Brief** comment above is the authoritative specification. The issue body and earlier discussion are context only. If there is no agent brief, treat the issue body as the spec, and be conservative about scope.

# Process

1. Read the brief. Read `CONTEXT.md` and `docs/adr/` if present, and respect them.
2. Work test-first where a seam allows it: failing test, implementation, green.
3. Run the typechecker and the relevant single test files regularly; run the full test suite once at the end. All must pass.
4. Commit to the current branch as you go, with clear messages referencing #{{ISSUE_NUMBER}}. Do not switch branches. Do not merge. Do not push to the default branch.
5. When the full suite is green and the brief is satisfied:
   - Comment on the issue: what you built, key decisions, and the branch name `{{SOURCE_BRANCH}}`. Start the comment with: `> *This was generated by an AI agent working AFK.*`
   - Swap the label: `gh issue edit {{ISSUE_NUMBER}} --remove-label "ready-for-agent" --add-label "ready-for-human"`
   - End your reply with exactly: `<promise>COMPLETE</promise>`
6. If you are genuinely blocked (spec contradiction, missing access, failing suite you cannot fix within scope):
   - Comment on the issue describing the blocker precisely (same disclaimer line first).
   - Swap the label: `gh issue edit {{ISSUE_NUMBER}} --remove-label "ready-for-agent" --add-label "needs-triage"`
   - End your reply with exactly: `<promise>BLOCKED</promise>`

Never emit a completion signal you have not earned: `COMPLETE` means the full test suite passed on your final commit.
```
