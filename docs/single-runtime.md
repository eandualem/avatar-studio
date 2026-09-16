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

## Current setup: one shared backend, app settings per request

Since September 16, 2026 (issue #53, runtime PR #143 / issue #142) the runtime
is started by the operator with plain startup settings and Avatar Studio sends
everything app-specific on each request; there is no launch file in this
repository any more.

**Sent by the app on every request** (server-side proxies, never the browser):

- `profile: "avatar_studio"` — the name registered in
  `profiles/avatar-studio.toml`, on text chat, Body decisions, receipts and
  voice call creation. Unknown profiles never fall back: chat answers 409,
  voice creation 422 before allocating a provider session.
- `config.default_model` / `config.thinking_budget` /
  `config.enable_working_memory: false` — text uses `TEXT_MODEL`
  (`openai:gpt-5.6-sol`) and Body `BODY_MODEL` (`openai:gpt-6-astra`), both
  4000 by default; the Body model control adds `config.codex_service_tier`.
- Voice creation carries `instructions` (the text of
  `profiles/live-instructions.md`) with `mode: "conversation"`. When the runtime
  reports `call_instructions_supported: false`, the app appends the same text
  over the data channel instead (`lib/live-policy.ts`).

**Operator startup settings the runtime must have** (its own `.env`, no
per-request field exists):

```bash
ASSISTANT__PROFILES='["/absolute/path/to/avatar-studio/profiles/avatar-studio.toml"]'
LLM__CODEX_ONLY=true            # Codex subscription; never an API key for models
OAUTH__CODEX_AUTO_SYNC=true
TOOLS__BUILTIN_TOOLS='["time","screen"]'   # screen: capture_avatar -> look_at_screen
VOICE__ENABLED=true             # GPT-Live audio; OPENAI_API_KEY funds it
VOICE__MODEL=gpt-live-1
VOICE__MAX_SESSIONS=1
VOICE__MAX_DURATION_SECONDS=300
```

Provider credentials, `OAUTH__ENCRYPTION_KEY`, auxiliary models and ceilings
stay with the operator. `make preflight` reports whether `avatar_studio` is in
`GET /api/artifacts/profile` → `available_profiles` and whether voice is enabled.

## Restart procedure

There is no supervisor; a reboot stops the runtime, and the operator starts it
again from the assistant-runtime checkout (`make dev` there) with the startup
settings above. The app's `make dev` only checks that the configured runtime
answers (`scripts/preflight.ts`); it never starts, replaces or stops one.
Starting the server allocates no paid Live call and makes no model request.
Keep checkouts, logs and keys outside `/tmp`. Check `GET /health` for
`components.llm_service.codex_only = true`, `/api/artifacts/profile` for
`avatar_studio`, and `/api/voice/status` for `enabled`, `configured` and
`call_instructions_supported` before starting a call.
