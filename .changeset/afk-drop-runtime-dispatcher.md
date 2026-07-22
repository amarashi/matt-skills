---
"mattpocock-skills": patch
---

Simplify AFK effort routing. Sizing now comes solely from a ticket's `effort:*` label, applied wherever the ticket is born — at `/triage`, `/to-issues`, or by the implementer when it files a scope-discovery issue (the implementer prompt now sets the label). Unlabeled tickets (continuations, hand-filed issues) fall back to `standard`. This removes the runtime dispatcher — a raw `fetch` to the Messages API that could not authenticate on the default OAuth config and always fell through to `standard` there anyway — along with the `OLLAMA_MODEL_DEEP` knob and the blocker-state `Map` cache.
