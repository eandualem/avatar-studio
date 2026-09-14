# GPT-Live voice

Current Live uses [independent body control](parallel-body-control.md) and
[the 7114 activation contract](parallel-body-verification.md). The delegated
workflow below describes earlier releases and is retained as historical setup
context; it is not the active movement path.

**Talk live** connects Charlie to OpenAI GPT-Live 1 through assistant-runtime.
The voice model listens and speaks directly. When it delegates a movement,
the runtime's configured backend model composes the same continuous avatar
tool calls used by text chat. WebRTC audio goes between browser and OpenAI;
the runtime owns provider credentials, delegation, transcripts and closure.

The backend may use a [Codex subscription](codex-subscription.md) for text,
vision and tool decisions while GPT-Live audio remains API-backed. Changing the
voice provider does not change the delegated backend model. In subscription-only
mode, a backend auth failure must stop delegation without trying API credentials.
The voice prompt requires fresh backend visual findings before describing a pose.

## Setup

Use assistant-runtime containing [PR #119](https://github.com/eandualem/assistant-runtime/pull/119)
(develop commit `dd729be7ef3a554b26c3fb08f9795869ee08b8ff` or later). The older
installed 0.1.0 release does not contain this integration. From its source checkout:

```bash
uv sync --locked --extra voice --extra dev
```

Add `OPENAI_API_KEY` to the **runtime's** `.env` or server environment. Keep its
backend model provider configured as well; GPT-Live delegates work to that model.
Restart the runtime after changing its key; the running process does not reload
the `.env` automatically.
Set the following on a runtime started from that configured directory:

```bash
AVATAR_STUDIO_PATH=/absolute/path/to/avatar-studio
ASSISTANT__PROFILE="$AVATAR_STUDIO_PATH/profiles/avatar-studio.toml" \
VOICE__ENABLED=true \
VOICE__MODEL=gpt-live-1 \
VOICE__MAX_SESSIONS=1 \
VOICE__MAX_DURATION_SECONDS=300 \
VOICE__INSTRUCTIONS="$(cat "$AVATAR_STUDIO_PATH/profiles/live-instructions.md")" \
TOOLS__BUILTIN_TOOLS='["time","screen"]' \
TOOLS__PROVIDER_CAPABILITIES='[]' \
ASSISTANT__ENABLE_WORKING_MEMORY=false \
uv run assistant-runtime serve --host 127.0.0.1 --port 7110 --no-replace
```

These initial limits bound a trial to one call and five minutes. Confirm the
setting names against the [runtime contract](https://github.com/eandualem/assistant-runtime/blob/develop/docs/voice.md)
when upgrading. Apply runtime migrations first if using Postgres. The local
trusted mode belongs on loopback; public deployment/authentication is separate work.

In Avatar Studio's `.env.local`, set `VOICE_RUNTIME_URL=http://127.0.0.1:7110`
and restart Next.js. Leave `RUNTIME_URL=http://127.0.0.1:7100` for existing text
conversations. A single upgraded runtime can serve both by omitting
`VOICE_RUNTIME_URL`; do not restart an in-memory runtime if its history must survive.

`GET /api/voice/status` through the app reports enabled/configured state.
Configured means a key is present, not verified model access. The app checks it
before requesting microphone access. Use localhost or HTTPS and explicitly allow
the microphone. No provider key or temporary provider credential reaches the app.

GPT-Live bills connected session time, including silence; backend model usage is
separate. Check [OpenAI's model page](https://developers.openai.com/api/docs/models/gpt-live-1)
for current access and pricing. End the call when finished. A ChatGPT/Codex login
does not supply the API credentials used by this integration.

## Interaction and ownership

- **Talk live** creates a dedicated voice conversation when starting from text.
  Starting again from a voice conversation reuses its runtime session. Existing
  text history remains in the sidebar.
- **Mute** disables the real microphone track. **Enable sound** appears if the
  browser blocks playback. The speaking indicator comes from incoming audio,
  rather than assuming that a server status means sound was heard.
- **Stop movement** stops local motion and cancels delegated backend work while
  audio remains connected. Interrupting Charlie's speech alone does not cancel
  backend work; this is the runtime contract.
- **End call** mutes local input/output immediately, asks the runtime to close,
  then releases tracks, peer connection, event stream and audio analysis. Closure
  failures remain visible; stopping local audio is not confirmation of provider
  finalization.

The active voice call reserves its runtime session. Typed turns, conversation
switching and browser dictation are disabled until it ends. Later typed messages
in that conversation route to the voice runtime so backend history stays together.
Use one active app tab per conversation; tabs do not coordinate call ownership.

## Execution and recovery

`voiceMachine` owns connection, active controls, cancellation and cleanup.
`VoiceClient` owns browser media and runtime transport. The Next.js voice proxy
accepts only the documented paths and same-origin requests, and streams SSE
without buffering. Provider allocation is never retried automatically.

The browser creates the `oai-events` channel and installs handlers before its
offer, waits for ICE gathering, applies the runtime's answer and observes
`session.started`. It sends no provider commands: the runtime already starts
and controls the session.

Runtime events drive transcripts and delegated actions. Only a `pending_host`
delegation invokes `executeTool`; a backend `final_response` never executes a
tool a second time. Each action is deduplicated by delegation and tool-call ID.
The browser refreshes host context with the actual pose before returning the
receipt to the voice delegation endpoint. Invalid tools return a failed receipt.
Superseded/cancelled work cannot submit a late result.

SSE reconnects use the last processed integer cursor in `?after=`. The client
rejects stale REST snapshots and older action/transcript events after a newer
snapshot, while retaining backend text absent from snapshots. Cancellation
reconciles the current pending action after the runtime finishes draining, so
newly delegated work is neither dropped nor confused with the cancelled action.
Replay gaps
replace speech fragments and reconcile only the current pending action from a
snapshot. A lost tool-result acknowledgement triggers snapshot reconciliation;
physical movement and result submission are never retried blindly. Repeated
event failures end the call. A gap can omit a full backend answer from the
visible transcript; its authoritative record remains in runtime session history.

Cancelling setup still closes a call whose allocation returns late. Unmounting
the owning actor closes its call; leaving the page also sends a best-effort
keepalive close. Browser crashes or a lost allocation response cannot guarantee
provider closure. Runtime duration limits and usage inspection bound that case.

## Transcript and visual limits

The host supplies a fresh, at-most-512px image of the rendered avatar on call
creation and context updates before tool results. The backend can request
`capture_avatar`, then use its built-in `look_at_screen` to inspect the image.
The capture includes only the WebGL canvas, never chat, microphone video or the
desktop. GPT-Live delegates visual inspection to the backend; this is not a live
video feed to the voice model. Enable the `screen` built-in as shown above.
Context updates replace the full host context and do not alter an already
running backend turn, so an explicit capture provides a fresh view on demand.

Spoken fragments and full backend answers are labelled separately. Backend text
deltas accumulate under the assistant message identity across host-tool
continuations; empty/null final events retain the streamed text. Fragments can
overlap, are not authoritative complete turns and do not prove playback. Full
backend answers are displayed after the speech fragments for the current call.
The app stores up to 400 visible messages and 100 call IDs per conversation.
Recent visible context is supplied to backend turns within a small size bound.
Speech-only history is not automatically restored into a future Live session;
the runtime seeds Live from its separate backend history.

The runtime does not store raw audio. Without Postgres its session memory is
lost on restart, while browser transcript history remains. Charlie's approved
body, movement solver and rig are unchanged. Facial expressions, visemes and
lip-sync are not included yet.

## Verification

`bun run test` covers WebRTC setup/cancellation, late allocation, media release,
actor shutdown, microphone mute, unconfirmed closure, delegation supersession,
lost acknowledgements, replay/snapshots, proxy boundaries and typed continuation
routing. These tests use synthetic transport/media events, not OpenAI.

Browser inspection verified the original desktop/mobile layout, live setup
controls, production origin handling and missing-key feedback. The 45 automated
tests, TypeScript, ESLint and production build passed before the integration
merged in PR #12; the runtime agent cleared its independent contract review.

On September 13, 2026, Elias completed a real GPT-Live browser trial after the
dedicated runtime on 7110 was restarted to load his newly added key. Existing
text sessions on 7100 were preserved. Speech input, spoken replies and live
transcripts worked, and Elias explicitly accepted the live interaction.
Head movement, a wave and further composed motions produced five saved
`move_avatar` receipts with `status: completed`. Stop movement cancelled a
delegation while the voice call stayed active; an already submitted motion
receipt remained recorded. The microphone mute control was also exercised.

The call ended through the frontend with `status: closed`,
`reason: close_requested`, `finalized: true`, 284 seconds of recorded provider
usage and zero remaining active calls. The browser returned to ordinary chat.
Animation naturalness and action latency remain improvement areas; Elias
deferred animation work to the next session. This trial does not change the
documented body, transcript or lip-sync limits.
