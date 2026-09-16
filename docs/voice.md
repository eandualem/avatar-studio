# Talk live: one voice, one body, two models

**Talk live** puts OpenAI GPT-Live on the conversation and a separate body
controller on the movement. Neither waits for the other. This page is the
pattern, the setup, and what it measures.

## Why two models

A voice model that also plans movement has to finish planning before it can
answer, and planning a gesture is slow next to a spoken reply. Charlie's
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
- **The app executes.** `lib/body-controller.ts` owns revisions, admission,
  exclusive execution, priority (an explicit request outranks an incidental
  gesture) and cancellation. A newer utterance invalidates a decision still in
  flight; the last check happens immediately before the engine starts.
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
bills connected time. Everything app-specific — the registered profile, the
Live persona, the body prompt, model choices — travels with the requests, so
one plainly started runtime serves this app and others. See the README for
the two-terminal recipe.

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
gathers ICE, posts its offer with `mode`, `profile`, `instructions` and a
bounded window of recent visible history, applies the answer and waits for
`session.started`. It sends no provider commands beyond the four the runtime
allows (`instructions.append`, `thinking.append`, mute, unmute).

Runtime events (SSE, resumable with `?after=<cursor>`) carry transcripts and
call status. Spoken fragments are labelled as such and are not authoritative
turns; full backend answers, if any, are separate messages. **Mute** disables
the microphone track; **Stop movement** stops the engine and cancels the body
decision while audio stays connected; **End call** mutes, asks the runtime to
close, then releases media and streams. Closure failures stay visible.

A live call reserves its runtime session: typed turns, dictation and
conversation switching are disabled until it ends. Reloading the page does
not resume a call or replay movements. The runtime keeps no audio; without
Postgres its session memory ends when it restarts, while the browser keeps
the visible transcript.

## The speaking mouth

A small opening under Charlie's smile follows the incoming audio amplitude
(35 ms attack, 75 ms release). Silence, blocked playback, mute and call
shutdown close it. It is amplitude, not visemes; lip-sync is future work.

## What it measures

The body actions of the current call are timed (requested, decided,
started, finished) and shown above the composer during and after a call.
The numbers that matter, from real calls in September 2026:

| Stage | Measured |
|---|---|
| Transcription + spoken reply | under 0.5 s each |
| Quiet period before a decision | 0.9 s, fixed |
| Body planning, `openai:gpt-6-astra` | 6.8–11 s for a ~200-token plan (≈50 tok/s, 2.7 s to first token) |
| Body planning, `cerebras:qwen-3.8-27b` | 2.1–3.9 s, valid `move_avatar` each time |
| Body planning, `cerebras:gpt-oss-120b` | 2.3–5.5 s, tends to `hold` on a plain wave |
| Last word to first moving frame | 3.2–6.4 s on the fast models; planning is 60–85 % of it |

Speech is never blocked by planning, which is the point; the remaining gap
is the planning itself. Two known gaps, tracked in
[issue #48](https://github.com/eandualem/avatar-studio/issues/48): a sentence
spoken with pauses arrives as several fragments and each cancels the decision
in flight, and the persona still narrates its own rules occasionally.

## Tests

`bun run test` covers call setup and cancellation races, late allocation,
media release, mute, unconfirmed closure, transcript ordering, the body
controller's admission and cancellation, receipts, quiet-fact correlation and
the proxy boundaries, all with synthetic transport and media. Nothing in the
suite contacts OpenAI.
