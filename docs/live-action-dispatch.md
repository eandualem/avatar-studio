# Live action dispatch and policy activation

**Superseded September 14, 2026:** a subsequent real Live trial again omitted
initial delegation. Do not resume the acceptance plan below or merge draft
PR #31 as a fix. Elias agreed [independent parallel body control](parallel-body-control.md)
in [issue #32](https://github.com/eandualem/avatar-studio/issues/32), for the next
session. This file preserves the earlier experiment's evidence.

Issue #30 follows the real Live failure after PR #29: Charlie said “Sure, waving”
without dispatching any movement. The text greeting test from PR #29 did not
establish Live behavior. These are separate model paths.

## Confirmed failure

7113 call `f867419b-ceca-4f02-9fff-c7232f29585b`, session
`a8102c9d-510b-424b-b7bc-dbe4242f2fe8`, has contiguous events 1–202. The initial
Hi and explicit wave request had no accepted delegation. The complaint triggered
first delegation at cursor 18, then `move_avatar` at 30. Its saved receipt
completed in 4.9443 seconds with 297 frames and zero slow frames. Confirmation
speech followed the result. This was missing initial delegation, not a slow or
failed initial animation.

A second call repeated ungrounded action claims before eventually dispatching.
Both calls used the PR #29 startup prompt, which already required delegation and
honest completion reporting. Prompt restructuring is a targeted improvement,
not proof that formatting alone caused or eliminates the model failure.

## Current policy on every new call

The Live prompt now uses the recommended delegation-policy structure, with
concrete physical-action and greeting triggers. It states that speaking cannot
move the avatar and forbids claiming ongoing movement before verified results.
Backend guidance makes a delegated greeting a physical task, including in a new
call with old greeting history. Stillness, held poses and cancellation take
priority; gestures remain model-composed continuous targets.

`lib/live-policy.ts` sends the checked-in Live prompt using the documented
`session.instructions.append` provider event after `session.started` and an open
WebRTC data channel. It uses a fresh event ID, `delegation_id: null`, and accepts
only the matching `session.instructions.appended.client_event_id`. The file is
392 o200k / 396 cl100k tokens, below the 500-token append limit. Keep it concise
and recheck token count when expanding it.

The microphone track remains active but disabled (silence), and local output is
muted until acknowledgment. This keeps frame progress available for injection.
Pending host actions are held until policy setup succeeds. Errors, a 10-second
acknowledgment timeout, channel close or cancellation leave audio gated and use
the existing call-close lifecycle. No automatic reallocation/retry occurs. Only
app-owned text becomes policy; transcript or host data is never interpolated.

This **appends** current guidance to the provider conversation; it does not
replace the runtime's frozen startup prompt. Future starts use the same file.
No runtime restart, new runtime instance, history migration or URL change is
needed for this update. Text stays on 7112 and voice on 7113. Backend artifacts
were activated as 7112 version 3 and 7113 version 1, effective on next request.
Existing calls keep their prior policy; end the call and start Talk live again
after refreshing the app to receive the latest instructions.

References: [OpenAI Live prompting](https://developers.openai.com/api/docs/guides/live-prompting),
[Live instruction events and acknowledgments](https://developers.openai.com/api/docs/guides/live-delegation).
An acknowledgment estimates injection; it does not guarantee behavioral compliance.
The runtime does not retain instruction append acknowledgments in its SSE replay.

## Verification and remaining voice check

79 local tests pass, including matching/unrelated acknowledgment handling, audio
gating, rejection/timeout/close, cancellation with late acknowledgment, and holding
pending host movement until policy confirmation. Typecheck, lint and build pass.

Elias's subsequent call `e907edf5-b8ca-4a35-8887-11a28ecbb95f` provides real Live
evidence: Hello at 10.8s triggered delegation before Hi at 11.8s. “Can you wave?”
at 15.6s superseded the initial planning before it produced a tool. The new action
completed a left-hand wave in 5.2962 seconds (318 frames, zero slow frames), and
completion speech followed the result. This verifies greeting dispatch and
explicit-action completion in that call, but not a greeting-only completed wave
or isolated attribution to the new policy.

Elias also confirms typed greetings wave automatically and volunteers to run audio
checks. A developer-run prerecorded Live trial was blocked by automatic approval
review because it would allocate paid usage; no such trial was allocated. Its
isolated preview was removed. Required next user check: New conversation, Talk
live, speak “Hello” once, and wait about 15 seconds without another request. Check
whether a wave starts and its delay. Keep the issue open until this remaining
voice behavior is verified; do not substitute text acceptance.
