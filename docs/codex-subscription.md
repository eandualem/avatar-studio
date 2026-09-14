# Codex subscription backend

Current routing update: text remains on 7112; new Live conversations use 7113
with proactive greeting instructions. See [expressive greetings](expressive-greetings.md)
for activation, preserved history and the fresh-conversation boundary.

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
subscription setup; use a runtime version with both defects resolved. The
subscription transport must also omit unsupported Responses parameters: the
first Sol trial reached Codex but rejected `max_output_tokens`. Do not interpret
that transport error as a reason to retry through API billing.

## Model choice and visual evidence

GPT-5.6 Sol with low reasoning effort is the selected starting model for Charlie’s
interactive tools and visual inspection. It supports image input and function
calling. This is a workload choice, not a claim that it is universally optimal
or faster than every alternative. Account access and actual responses were verified before activating the backend,
as recorded below.

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

## Subscription-only server settings

The fixed runtime uses `LLM__CODEX_ONLY=true` as a startup guard. It rejects
non-OpenAI models, absent or expired subscription sessions, and models excluded
by `LLM__CODEX_MODELS` before creating a provider request. The guard also applies
to auxiliary LLM paths. Keep backend API credentials empty as an additional
measure; a voice-only key can remain available under a separate environment
variable selected by `VOICE__API_KEY_ENV`.

When Postgres is unavailable, token storage is in memory. A successful login is
not evidence of durable storage: inspect the returned persistence status and
resync after a process restart. Disconnect reports whether the stored database
credential was actually deleted. Do not treat a database-outage disconnect as
confirmed deletion of a previously saved credential.

## Active local configuration and verification, September 14

The runtime fixes landed in [assistant-runtime PR #121](https://github.com/eandualem/assistant-runtime/pull/121),
merge commit `ad3507a7497102aa83197bb35619edfd35488fe9`. The isolated server at
`http://127.0.0.1:7112` runs that source, with Sol and Luna allowed by the guard.
The local app now uses these server-only values in its ignored `.env.local`:

```dotenv
RUNTIME_URL=http://127.0.0.1:7112
VOICE_RUNTIME_URL=http://127.0.0.1:7112
```

Both app proxies were verified against the new server using cancellation and
unknown-call requests that did not invoke a model. The original 7100 and 7110
processes were preserved, with no active voice calls during the switch.
New conversations use the subscription instance; old backend histories have not
been migrated. Browser transcripts remain visible.

The public OAuth import returned HTTP 200 with `connected: true`,
`source: codex_cli`, and `persisted: false`. Health reports `codex_only: true`,
provider `openai` only and primary `openai:gpt-5.6-sol`. Sol/4000 and Luna were
verified with small actual subscription responses (4.29s and 1.90s respectively
in single local probes; these are not comparative benchmarks). Main and subagent
settings are explicitly Sol/4000; summary and working-memory models are Luna,
with working memory disabled. The API key for audio is held only in
`AVATAR_LIVE_API_KEY`, selected by `VOICE__API_KEY_ENV`; backend API keys are blank.

A new browser conversation recorded `capture_avatar`, `look_at_screen`, and
`move_avatar` through Sol. It inspected the actual diagonal kicking stance,
identified the raised right leg and extended left arm, then made a small nod
while preserving the rest of the pose. The nod requested 0.50s, planned 0.65625s
and completed in 0.6668s with no frame gaps over 50ms. The receipt still reported
speed extension and the held stance’s wrist limit; completion does not mean all
constraints disappeared. The test session is
`4cd661b6-b7a9-4cdb-bdf2-661f72536fd8` on the subscription instance.

The app’s 62 tests, TypeScript, ESLint and production build passed. Runtime CI
passed both Python versions and Pydantic AI compatibility versions, with review
feedback addressed before merge. Avatar Studio’s GitHub job could not start due
to its existing account billing/spending-limit restriction; local checks passed.

GPT-Live is configured on 7112 with the revised visual-inspection prompt, a
one-call limit and 300-second duration limit. Its audio is still API-backed;
no paid live call was allocated for this change. The voice proxy and configured
backend routing are verified, but the new spoken pose-inspection behavior still
needs a live user trial. If subscription auth or allowance fails, reconnect or
wait for availability rather than changing to API billing.

## Restarting the isolated local trial

This is a local trial instance, not an installed system service. Its source is
`/tmp/assistant-runtime-avatar-7112`; launcher and protected state are in
`/tmp/avatar-codex-7112`. Preserve those directories and the mode-0600 encryption
key. The original watched runtime checkout remains at `dd729be` deliberately;
do not pull it or edit Python there while the original 7100 server runs.

A restart loses this instance’s in-memory backend history, OAuth connection and
settings overlay. Coordinate it when idle, stop only the verified 7112 process,
and confirm that its port is free before running:

```bash
cd /tmp/assistant-runtime-avatar-7112
.venv/bin/python /tmp/avatar-codex-7112/start.py
```

The launcher refuses an occupied port and reloads the current voice instructions.
It restores startup guard/model/voice settings but does not import OAuth or apply
the explicit settings overlay. Reconnect through the public endpoints:

```bash
curl -sS -X POST http://127.0.0.1:7112/api/oauth/openai/codex-cli/sync
curl -sS -X PATCH http://127.0.0.1:7112/api/settings \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/avatar-codex-7112/settings.json
```

Require successful HTTP responses and the connected/source/guard/model checks
above. `persisted: false` is expected without Postgres. The local runtime handoff
is `/tmp/avatar-codex-7112/README.md`, with `launch.json`, `settings.json` and
`readiness.json` recording non-secret setup and validation details. Starting the
server does not automatically allocate a paid voice call or run a model probe.
