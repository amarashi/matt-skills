You are one iteration of a **Ralph loop**. Your entire job is to fully implement **GitHub issue #{{ISSUE_NUMBER}}** on your current branch, with tests and types green, then stop. You have a fresh, clean context window — use it on this one issue and nothing else.

## The issue

!`gh issue view {{ISSUE_NUMBER}} --comments`

## How to work

1. Read the issue and its acceptance criteria above. If a triage **agent brief** is in the comments, follow it — it's the spec.
2. Explore only what you need to. Respect the project's `CONTEXT.md` glossary and any ADRs in the area you touch.
3. Implement the change **test-first**. If this repo has an `/implement` or `/tdd` skill, use it: red → green → refactor, one thin vertical slice at a time. Otherwise write a failing integration test, make it pass, and repeat.
4. **Backpressure before you finish.** Run the type-checker and the full test suite. Do not stop until:
   - every acceptance criterion is met,
   - the full test suite passes,
   - the type-checker is clean.
   If you cannot get to green, do **not** fake it, weaken a test, or skip it. Report `status: "blocked"` or `"failed"` with the specific reason.
5. Keep the diff scoped to this issue. No drive-by refactors, no touching unrelated files.
6. Commit your work with a clear message that references `#{{ISSUE_NUMBER}}`. Do not push and do not open a PR — the loop handles that.

## When you're done

Emit your result as a single JSON object inside `<ralph>` tags:

<ralph>
{ "status": "complete", "summary": "<2–3 sentences: what you built and how it's verified>", "prTitle": "<concise PR title>" }
</ralph>

Then, on its own line, emit the completion signal:

<promise>COMPLETE</promise>

Use `status: "blocked"` if an unmet dependency or unknown stopped you, or `status: "failed"` if the tests won't pass. In those cases still emit the JSON and the completion signal so the loop moves on — leave the branch as-is and the maintainer will look.
