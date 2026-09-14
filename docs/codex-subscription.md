# Codex subscription backend

Charlie has two model roles. GPT-Live handles audio; its delegated backend
handles text reasoning, avatar tools and image inspection. A working OpenAI
voice call does not select an OpenAI backend or authenticate a Codex subscription.

Elias selected subscription-only backend usage. The backend must reject a request
when subscription authentication is missing, expired or disallowed; it must not
fall back to an API key. GPT-Live audio remains separately API-backed. Image and
video generation are different provider features and are not enabled by this
backend subscription configuration.

## Sign-in and verification

Run `codex login` and complete the ChatGPT browser sign-in. Check the method with
`codex login status`. The runtime separately imports that local login through
`POST /api/oauth/openai/codex-cli/sync`; CLI login alone does not connect a runtime.
Never copy login tokens into `OPENAI_API_KEY` or an API-key endpoint.

The runtime needs a locally protected `OAUTH__ENCRYPTION_KEY` at startup. It is
an encryption key for stored credentials, not an OpenAI API key. An already
running server without it cannot be enabled through the settings overlay.
A successful import must return HTTP 200, `connected: true`, and
`source: codex_cli`. Verify routing and a real model response as well as status.
A model listed in a catalog is not proof that the account can execute it.

Before this change, disabled authentication produced an unhelpful HTTP 500.
The optional-Postgres path could also fail while saving imported credentials and
leave partial in-memory state. A runtime with those defects is not a reliable
subscription setup; use a runtime version with both defects resolved.

## Model choice and visual evidence

GPT-5.6 Sol with low reasoning effort is the initial candidate for Charlie’s
interactive tools and visual inspection. It supports image input and function
calling. This is a workload choice, not a claim that it is universally optimal
or faster than every alternative. Account access and actual response time must
be verified before selecting it as the active backend.

Sources: [Codex authentication](https://learn.chatgpt.com/docs/auth),
[GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

The backend receives the actual avatar image through `look_at_screen`; no
Claude-specific vision stage or image-to-description model is required. GPT-Live
receives the backend’s textual findings. Its voice instructions now require
inspection before describing a current pose, and an honest failure response if
inspection cannot complete. Prompt guidance reduces unsupported claims but does
not guarantee model behavior.

## Existing conversations

Changing runtime URLs does not migrate backend session history. Preserve the old
runtime processes and browser transcripts, and begin a new conversation for the
subscription trial. Old backend histories remain with their original runtime.
Do not switch URLs during a live call or an unfinished tool continuation.

For the selected trial, primary and subagent work use `openai:gpt-5.6-sol` with
low reasoning (`thinking_budget: 4000` in this runtime). Auxiliary summarization and working-memory defaults use
`openai:gpt-5.6-luna`; working memory is disabled. This avoids retaining an
Anthropic auxiliary route after changing only the main model. Auxiliary
reasoning uses the provider default; the primary budget does not configure it. Model-family
routing must be verified for these auxiliary requests as well.
