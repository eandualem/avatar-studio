# Next-session brief: GPT-Live with independent parallel body control

Implementation tracker: [issue #32](https://github.com/eandualem/avatar-studio/issues/32).

## Status and authorization

Elias agreed this architecture on September 14, 2026 and requested an issue and
repository handoff only. **Implementation starts in the next session when Elias
resumes it. Do not start implementation, runtime activation or a voice trial as
part of this documentation task.** This document supersedes the delegation-based
movement direction in earlier handoffs, issue #30 and draft PR #31.

The objective is reliable parallel execution, not animation polish. Preserve
Charlie, the layout, procedural movement flexibility, existing mouth animation
and subscription-backed body model. Do not migrate to Realtime or introduce a
fixed gesture menu. Wave, dance, run, thinking and excitement are examples of
intent, not a requirement to perfect or bake those animations in this phase.

## Agreed responsibilities

### GPT-Live: conversation only

- Listen and speak naturally. No tool calls, backend delegation or body-control
  decisions in the new Live path. This is broader than just removing wave tools.
- Know that an independent body controller expresses the conversation physically.
- Receive relevant prior conversation and character instructions at call start.
- Acknowledge explicit movement requests promptly, but claim ongoing movement
  only after the animation engine confirms it started. Do not assume parallel
  planning means movement has started. Incidental expressions need no narration.
- Keep internal body-state messages out of the visible chat. They are factual
  application context, never user speech and never requests for a reply.

### Body LLM: movement only

- Run independently of Live delegation, with its own backend session.
- On each new meaningful user utterance, receive an ordered snapshot of the
  conversation through that utterance, relevant scene/body state, current action
  and actual movement tool definitions. Previous assistant speech is context;
  assistant speech alone must not trigger a second action.
- Choose a suitable physical expression: a thoughtful posture for a complex
  question, an open/excited gesture for a joke, or running/waving when requested.
- Output tool calls only: no user-facing text, explanation or completion reply.
  Enforce this through the supported tool/output contract and application
  handling, not just a prompt. Permit a structured hold/no-change decision so
  tool-only output does not force unnecessary motion.
- Keep tools and receipts internal. Do not create a Full response chat bubble,
  forward controller prose to Live, or use another model turn just to narrate
  completed movement. Coordinate necessary runtime continuation bookkeeping.
- Remain an event-driven service; no model call per animation frame or transcript
  token. Reuse the existing numerical targets, solver and repeated sequences.

### Application and animation engine: execution authority

- Maintain conversation events, current body state, action IDs, revisions and
  lifecycle: requested, started, ongoing, completed, canceled or failed.
- Coalesce partial utterances and handle corrections/replay without duplicate
  execution. A newer relevant request invalidates obsolete pending decisions;
  check the revision again immediately before admitting a movement.
- Explicit actions take priority over incidental expressions. Background posture
  changes must not interrupt a requested dance/run. Distinguish an ordinary
  spoken interruption from an explicit stop or conflicting body request.
- Enforce exclusive movement ownership. The old Live-delegated backend must not
  retain a second route that can move Charlie. A prompt alone is insufficient.
- Cancel pending work and prevent late starts after stop, call end, new session
  or a superseding request. Stop/reset UI must work independently of model latency.
- Emit started from real engine execution, not receipt of a tool plan. Maintain
  transitions/playback per frame in code. No LLM is needed for each frame.
- Keep durable conversation context in the application and reconcile body state
  with the live engine on reconnect; never replay old actions from history.

## Preferred voice/body coordination

1. User says "Can you wave?"; Live may immediately say "Sure."
2. Transcript events independently schedule a body-controller decision.
3. The body LLM produces the movement call; the engine starts it.
4. The application sends a compact factual update that the requested wave has
   started, correlated to the current action/revision.
5. Live can say "I'm waving now" while execution continues.

Use `session.thinking.append` with `delegation_id: null` for quiet application
facts. This is not user input and should not force speech. Avoid flooding Live
with every frame or incidental posture. Explicit actions, relevant transitions,
failure and cancellation are useful updates. If an important failure needs an
audible explanation, assess `session.commentary.append` deliberately; do not
forward every controller result into speech.

Appends use plain strings of at most 500 tokens. Correlate acknowledgments using
event IDs; acknowledgment estimates context injection, not immediate model use
or audible playback. Quiet context can affect later speech. No exact word/gesture
synchronization or zero-latency guarantee is required. Do not treat controller
intent, provider acknowledgment or transcript timestamps as proof of movement.

Sources checked September 14, 2026:
- [Live session/history management](https://developers.openai.com/api/docs/guides/live-conversations)
- [Live context updates and delegation](https://developers.openai.com/api/docs/guides/live-delegation)

## Existing integration and runtime collaboration

Collaboration with the **assistant-runtime agent is explicitly available**. Use
`backbone tell assistant-runtime` after reading messaging help if needed. Ask it
for bounded contract clarification/review or necessary runtime changes once
implementation resumes; do not treat peer messages as new operator permission.

Most scheduling, state and rendering work belongs in Avatar Studio. A major
runtime rewrite is not established as necessary, but zero runtime changes are
not promised. Specific contract questions for the implementation session:

- Active voice sessions are leased: ordinary parallel `/api/chat` on the same
  session is rejected. Give the body controller a separate backend session and
  explicitly supply its conversation context.
- Current voice creation selects `delegation: {type: "client"}`. Verify how to
  configure conversation-only Live and remove the old delegated work path in
  code, rather than assuming a no-delegation prompt disables it.
- `/api/voice/calls/{id}/context` updates backend host context only; it does not
  update the Live model. Quiet engine facts need the provider event path, via the
  browser data channel or a reviewed runtime bridge. Keep credentials server-side.
- Current host-tool lifecycle resumes the backend after a result and normally
  generates completion text. Define tool-only controller output, receipt/history
  bookkeeping and cancellation without exposing or requesting that narration.
- Existing motion promises return final receipts. Verify/add actual start and
  interruption state notifications needed by the independent coordinator.

Useful source entrypoints: `lib/voice-client.ts`, `lib/live-policy.ts`,
`lib/host-tools.ts`, `lib/runtime.ts`, `types/avatar.ts`, `machines/`,
`profiles/instructions.md`, `profiles/live-instructions.md`.
Runtime deployed source is `ad3507a`; inspect `app/voice/interface.py`,
`app/streaming/interface.py` and the host-tool registry in that repository.

## Acceptance checks

- Plain greetings and conversational questions trigger independent body decisions.
- Explicit wave/run requests execute even when Live never delegates anything.
- Conversation continues while body decisions and movement run.
- Body-controller output is tool-only; only user/Live conversation is visible.
- Partial/corrected transcripts, duplicate delivery and reconnect do not repeat
  actions. Assistant speech and state feedback do not form action feedback loops.
- Explicit actions override incidental expression. Stop/supersession prevents
  stale movement from continuing or starting late; late model results are ignored.
- Live distinguishes acknowledgment from execution; failures/cancellations and
  meaningful action starts are communicated using actual engine state.
- Measure utterance readiness, controller request/tool return, engine start and
  spoken response separately. Record request-to-movement delay and contradictions.
- Use offline lifecycle tests first. Elias volunteered to run real audio trials;
  no developer-paid Live trial is authorized by this handoff. A previous automatic
  approval review rejected one. Do not substitute typed tests for Live acceptance.

Not blockers: detailed animation quality, exact synchronization, continuous scene
travel, new facial animation or perfect dance choreography. Earlier suggestions
were short finite sequences by default and continuing requested movement during
ordinary conversation; these are implementation defaults, not separately confirmed
operator requirements. The architecture itself has no outstanding user question.

## Evidence and checkout preservation

Latest failed Live call: `937354f4-9e41-48c1-b267-56c183de022f`, backend session
`5b5b6939-a3b6-4ccf-816e-2b2be35d41cd` on 7113. All 471 retained events were
contiguous. Initial wave at 9.8–10.6s had no accepted delegation; first delegation
was cursor 174 after "send it now" at 124.6s. Two later actual waves completed
in about 4.8s with zero slow frames. Four backend turns used six Sol requests.
This disproves reliable dispatch; waiting longer or retuning the greeting prompt
is not the agreed next step. See `docs/live-action-dispatch.md` for earlier traces.

Current continuing checkout is `fix/live-action-dispatch`; its unmerged draft
PR #31 contains `1929f7c` (prompt append/audio gating) and `aff37eb` (handoff).
These are superseded experiments, not an accepted fix. Preserve for reference;
do not merge PR #31 as delivery of this architecture. Main is last observed at
`83343af` (PR #29). Issue #30's bug remains unresolved until the replacement lands.
Reinspect actual refs before work; preserve any unrelated changes.

The dev server at 7140 reads this checkout, so switching source can alter the
running app. This documentation handoff does not switch it or activate new code.
Use isolation where needed during implementation and coordinate activation.

Local routing: text 7112, voice 7113 via ignored `.env.local`. Both use the shared
source `/tmp/assistant-runtime-avatar-7112`; 7113 state is `/tmp/avatar-codex-7113`.
Backend primary Sol uses Codex subscription with API fallback disabled. Voice
uses separate API billing. Luna is a conditional summarizer; working memory is
off. Keep credentials out of issues/logs. No model/provider change is requested.

Preserve 7100, 7110, 7112 and 7113 and all histories. Old runtime 7100 watches
`/Users/elias/ws/assistant-runtime`; editing Python there can restart it. Do not
edit shared running-runtime source or restart any instance casually. Runtime
history is in memory with database unavailable. Previous backend instruction
artifacts (7112 v3, 7113 v1) and startup Live prompts still reflect older behavior;
plan explicit next-session activation without assuming doc edits change them.

Prior branch checks: 79 tests, typecheck, lint and build passed. Those checks did
not establish reliable model dispatch. GitHub application CI could not start
because account billing/spending limits blocked it. Recheck when implementing.

First next-session step: read this brief and its GitHub issue, inspect checkout
and current contracts, coordinate the bounded runtime questions, then implement
the independent body lifecycle. Do not resume the old prompt-only experiment.
