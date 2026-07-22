---
"mattpocock-skills": patch
---

Make **`setup-matt-pocock-skills`** defaults-first: it now detects the issue tracker, label vocabulary, and doc layout from the repo, applies the defaults silently, and reports what it chose — asking a question only when detection genuinely can't resolve something (unrecognisable tracker, conflicting prior config, ambiguous label mapping). The old question-by-question walkthrough is still available via `/setup-matt-pocock-skills interactive`.
