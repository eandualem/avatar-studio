# Talk live: one voice, one body, two models

**Talk live** uses OpenAI GPT-Live for speech and a separate chat model for
movement planning. Neither waits for the other. Start with the
[README setup](../README.md#running-it); this page explains the call behavior
and implementation.

## Why two models

If one model plans a gesture before answering, its movement planning delays
the spoken reply. Charlie's
speech should not stall behind his arms, and his arms should not depend on
a model that is busy talking. So:

- **GPT-Live converses.** It listens and speaks over WebRTC. Its persona is
  `profiles/live-instructions.md`, sent with each call. It calls no tools and
  delegates nothing; the runtime creates the call in `mode: "conversation"`,
  which refuses delegation on its side too.
- **The body controller moves.** Each user utterance goes, after 0.9 s of
  quiet, to an ordinary chat request on a fresh runtime session with
  `output_mode: "host_tools"`, the prompt `profiles/body-instructions.md`, the
  conversation so far and the actual pose. The model answers with exactly one
  tool call: `move_avatar` (timed waypoints), `hold_avatar` (no change) or
  `stop_avatar`. It never writes prose; prose is treated as a failure.
- **The app executes.** `lib/body-controller.ts` tracks which utterance a
  decision belongs to, checks whether to accept it (admission), runs one
  movement at a time, and handles priority (an explicit request outranks an
  incidental gesture) and cancellation. A newer utterance invalidates a
  decision still in flight; the last check happens immediately before the engine starts.
- **Facts flow back quietly.** When the engine actually starts, completes,
  cancels or fails an explicit action, the app appends one short factual line
  to Live over the data channel (`session.thinking.append`, not user speech),
  so Live can say "I'm waving now" only once it is true. The persona forbids
  claiming movement without such a fact.

The model that plans movement is chosen in the header (**Body model**). The
choice travels as `config.default_model` on each decision, so text chat keeps
its own model on the same runtime.

## Setup

The runtime needs `VOICE__ENABLED=true` and an `OPENAI_API_KEY`; GPT-Live
bills connected time. The runtime registers `profiles/avatar-studio.toml`
at startup. Requests select that profile and carry the Live persona, body
prompt and model choices, so the same runtime can serve several apps.

Before asking for the microphone the app reads `GET /api/voice/status` and
requires `enabled`, `configured`, `conversation_mode_supported` and
`call_instructions_supported`; a runtime without per-call instructions is
refused rather than letting Charlie speak with a neutral persona. Use
localhost or HTTPS and allow the microphone; nothing starts recording on its
own. `.env.example` lists the server-side settings (`RUNTIME_URL`,
`TEXT_MODEL`, `BODY_MODEL`, budgets).

## Lifecycle

`machines/voiceMachine.ts` owns the call; `lib/voice-client.ts` owns browser
media and transport. The browser creates the `oai-events` data channel,
gathers WebRTC connection candidates (ICE), posts its offer with `mode`,
`profile`, `instructions` and a bounded window of recent visible history,
applies the answer and waits for `session.started`. It sends no provider commands beyond the four the runtime
allows (`instructions.append`, `thinking.append`, mute, unmute).

Runtime events (server-sent events, or SSE) carry transcripts and call status
and resume with `?after=<cursor>`. Spoken fragments are labelled as such
and are not authoritative turns; full backend answers, if any, are separate messages. **Mute** disables
the microphone track; **Stop movement** stops the engine and cancels the body
decision while audio stays connected; **End call** mutes, asks the runtime to
close, then releases media and streams. Closure failures stay visible.

A live call reserves its runtime session: typed turns, dictation and
conversation switching are disabled until it ends. Reloading the page does
not resume a call or replay movements. The runtime keeps no audio; without
Postgres its session memory ends when it restarts, while the browser keeps
the visible transcript.

## The speaking mouth

A small opening under Charlie’s smile follows the loudness of his received
speech audio (35 ms opening response, 75 ms closing response). Silence,
blocked or paused playback and call shutdown close it. Muting your microphone
does not mute Charlie’s audio or stop his mouth. The mouth does not form
speech sounds; phoneme lip-sync is not supported.

## Timing and limitations

The body actions of the current call are shown above the composer with
requested, decided, started and finished timestamps. “Started” means the
engine applied the first frame, not that the model returned a plan.

The controller waits for 0.9 s of quiet before requesting a decision. Model
planning adds variable delay depending on the provider, model, request and
rate limits; the timing panel shows the result for the current call. Speech
continues during that wait. Movement duration is separate from the delay
before its first frame.

A sentence spoken with pauses can produce several transcript fragments;
a new fragment cancels a decision still in flight. The voice can also
occasionally narrate its internal movement-confirmation rules. These limitations
are tracked in [issue #48](https://github.com/eandualem/avatar-studio/issues/48).

## Tests

`bun run test` covers call setup and cancellation races, late allocation,
media release, mute, unconfirmed closure, transcript ordering, the body
controller's admission and cancellation, receipts, quiet-fact correlation and
the proxy boundaries, all with synthetic transport and media. Nothing in the
suite contacts OpenAI.
