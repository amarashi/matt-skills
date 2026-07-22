/**
 * Ralph loop — drains the `ready-for-agent` GitHub issue queue through sandcastle.
 *
 * Installed by the `/ralph` skill. This file is YOURS now — edit the model,
 * iteration cap, branch naming, or PR handling to taste. Re-running `/ralph`
 * will reuse this file, not overwrite it.
 *
 * Run:   npx tsx .ralph/run.ts
 * Scope: RALPH_MAX_ISSUES=3 RALPH_MODEL=claude-opus-4-8 npx tsx .ralph/run.ts
 */
import { execSync } from "node:child_process";
import { run, claudeCode, Output } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { z } from "zod";

// ---- Config (env-overridable; the /ralph skill fills the label default) ----
const READY_LABEL = process.env.RALPH_READY_LABEL ?? "ready-for-agent";
const MODEL = process.env.RALPH_MODEL ?? "claude-opus-4-8";
const MAX_ITERATIONS = Number(process.env.RALPH_MAX_ITERATIONS ?? 12);
const MAX_ISSUES = Number(process.env.RALPH_MAX_ISSUES ?? 0); // 0 = drain all ready

const sh = (cmd: string) => execSync(cmd, { encoding: "utf8" }).trim();

const DEFAULT_BRANCH =
  sh(`git remote show origin | sed -n '/HEAD branch/s/.*: //p'`) || "main";

interface Issue {
  number: number;
  title: string;
  body: string;
}

/** Ready-labelled issues whose every "Blocked by" issue is already closed. */
function readyQueue(): Issue[] {
  const raw = JSON.parse(
    sh(
      `gh issue list --state open --label "${READY_LABEL}" --limit 200 ` +
        `--json number,title,body`,
    ),
  ) as Issue[];

  const isClosed = (n: number) => {
    try {
      return sh(`gh issue view ${n} --json state --jq .state`) === "CLOSED";
    } catch {
      return true; // referenced issue is gone → treat as not blocking
    }
  };
  const blockers = (body: string) =>
    [...body.matchAll(/blocked by[^#]*#(\d+)/gi)].map((m) => Number(m[1]));

  return raw.filter((i) => blockers(i.body).every(isClosed));
}

const outcome = Output.object({
  tag: "ralph",
  schema: z.object({
    status: z.enum(["complete", "blocked", "failed"]),
    summary: z.string(),
    prTitle: z.string(),
  }),
});

async function drainIssue(issue: Issue) {
  const branch = `ralph/issue-${issue.number}`;
  console.log(`\n▶ #${issue.number} ${issue.title} → ${branch}`);

  const result = await run({
    agent: claudeCode(MODEL, { effort: "high" }),
    sandbox: docker(),
    promptFile: ".ralph/prompt.md",
    promptArgs: { ISSUE_NUMBER: String(issue.number), DEFAULT_BRANCH },
    branchStrategy: { type: "branch", branch },
    maxIterations: MAX_ITERATIONS,
    completionSignal: "<promise>COMPLETE</promise>",
    output: outcome,
    logging: "file",
  });

  const out = result.output;
  if (!out || out.status !== "complete" || result.commits.length === 0) {
    console.log(
      `  ⏭  left in queue — ${out?.status ?? "no result"}: ` +
        `${out?.summary ?? "no commits produced"}`,
    );
    return { issue, ok: false as const, out };
  }

  // One PR per issue, for a human to review in a fresh context.
  sh(`git push -u origin ${branch}`);
  const body = `Closes #${issue.number}\n\n${out.summary}\n\n---\nDrained by the Ralph loop (sandcastle).`;
  const pr = sh(
    `gh pr create --base ${DEFAULT_BRANCH} --head ${branch} ` +
      `--title ${JSON.stringify(out.prTitle || issue.title)} ` +
      `--body ${JSON.stringify(body)}`,
  );

  // Move it out of the ready queue so the next run doesn't re-pick it.
  sh(`gh issue edit ${issue.number} --remove-label "${READY_LABEL}"`);
  sh(
    `gh issue comment ${issue.number} --body ${JSON.stringify(
      `Picked up by the Ralph loop → ${pr}`,
    )}`,
  );
  console.log(`  ✅ ${pr}`);
  return { issue, ok: true as const, pr, out };
}

async function main() {
  let queue = readyQueue();
  if (MAX_ISSUES > 0) queue = queue.slice(0, MAX_ISSUES);

  if (queue.length === 0) {
    console.log(`Nothing labelled "${READY_LABEL}" is unblocked. Queue is empty.`);
    return;
  }

  console.log(
    `Ralph loop: ${queue.length} issue(s) ready → ` +
      queue.map((i) => `#${i.number}`).join(", "),
  );

  const results: Array<{ issue: Issue; ok: boolean; pr?: string }> = [];
  for (const issue of queue) {
    try {
      results.push(await drainIssue(issue));
    } catch (err) {
      console.error(`  ✗ #${issue.number} errored:`, err);
      results.push({ issue, ok: false });
    }
  }

  console.log("\n── Ralph run summary ──");
  for (const r of results) {
    console.log(`${r.ok ? "✅" : "⏭ "} #${r.issue.number}  ${r.ok ? r.pr : "still queued"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
