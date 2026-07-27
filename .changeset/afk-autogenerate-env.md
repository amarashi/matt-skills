---
"mattpocock-skills": patch
---

`/afk` preflight now generates `.sandcastle/.env` from the host's own environment — model access (Ollama > OpenRouter > `CLAUDE_CODE_OAUTH_TOKEN` subscription > `ANTHROPIC_API_KEY`) plus a tracker token via `gh auth token` — instead of stopping to make the user hand-populate it. A machine whose global env is set up once runs `/afk` on any project with zero per-project secrets. Documents the subscription path (`claude setup-token`) and the `ANTHROPIC_API_KEY`-shadows-`CLAUDE_CODE_OAUTH_TOKEN` precedence trap (write only one Anthropic credential). Still never prints, echoes, or commits token values; only stops when the host has no usable credential.
