# One runtime on 7100 (issue #41)

Avatar Studio is a Next.js frontend for one assistant-runtime process. The app
reaches it through server-only Next routes: text and body decisions use
`POST /api/chat` and `POST /api/chat/{session_id}/cancel`; voice uses
`/api/voice/calls/*`. `RUNTIME_URL` (default `http://127.0.0.1:7100`) is the
only required setting. `VOICE_RUNTIME_URL` and `BODY_RUNTIME_URL` remain as
deliberate overrides and are no longer part of the normal setup.

## What happened before

From September 13 to 14, 2026, every runtime change (Codex-only routing, a new
Live prompt, the parallel body controller, the Live setup fix, the Fast trial,
Astra) was activated by cloning assistant-runtime under `/tmp`, starting another
process on a new port and repointing the app. The stated reasons were to keep
old in-memory conversations and to avoid the watched 7100 checkout, whose
`make dev` reloader restarted on file saves. The instances differed only in
startup settings:

| Role | Port | Source | Startup differences |
| --- | --- | --- | --- |
| Text | 7112 | `ad3507a` | Codex-only Sol/4000, Luna auxiliaries, instructions artifact from `profiles/instructions.md` |
| Voice | 7115 | `fcd87b4` | GPT-Live enabled, delegation off, `profiles/live-instructions.md`, one call, 300 s, API key |
| Body | 7117 | `5f2161b` | Codex-only Astra/4000, `LLM__CODEX_SERVICE_TIER=fast` |

macOS clears `/private/tmp` on reboot. The reboot on September 15, 2026 removed
all six clones (7112–7117) with their launchers, settings overlays and
encryption keys, and the app reported "The live voice runtime is unavailable".
In-memory histories on those instances are gone. The evidence recorded in the
earlier documents (response IDs, timings, session IDs) remains valid history;
the ports and `/tmp` paths in them no longer exist.

## Current setup

`runtime/avatar-runtime.env` is the single launch file: Codex-only Sol as the
primary model, Luna for summaries and working memory (off), this repository's
profile, the `time` and `screen` built-ins, and GPT-Live in conversation-only
mode with the Live prompt. It holds no credentials. The launch script points the runtime at
`profiles/live-instructions.md` through `VOICE__CONVERSATION_INSTRUCTIONS_FILE`
(runtime PR #138), so the prompt is never copied.

Body decisions choose their model per request: the app's body proxy adds
`config.default_model` and `config.thinking_budget` (env `BODY_MODEL`, default
`openai:gpt-6-astra`; `BODY_THINKING_BUDGET`, default 4000) so text keeps Sol on
the same process. The Body model control can also request Codex Fast per decision
(`config.codex_service_tier`); the launch env keeps the fallback tier at
`default`. Runtime PR #138 (issue #131) provides these per-request fields, the
Cerebras provider, prompt files and the deployment recipe.

## Restart procedure

There is no supervisor; a reboot stops the runtime. Restart it with
`scripts/runtime-up.sh`, which sets the absolute profile path and an ephemeral
encryption key in the shell (shell variables override the env file in uv) and
runs `assistant-runtime serve` from the runtime checkout. Starting the server allocates no
paid Live call and makes no model request. Keep launch files and logs outside
`/tmp`. Check `GET /health` for `components.llm_service.codex_only = true`,
`primary_model = openai:gpt-5.6-sol` and voice configured before starting a call.
