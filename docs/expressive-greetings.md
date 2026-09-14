# Conversational body expression

Follow-up: PR #29 did not establish reliable Live dispatch. See
[Live action dispatch](live-action-dispatch.md) for the observed failure, current
per-call policy activation and remaining greeting-only voice verification.

Issue #28 changes Charlie’s policy from moving only on request or occasionally
to actively expressing a greeting with a short wave. Other examples are modest
acknowledgment nods, curious head tilts and explanatory open-hand gestures. The
model still composes continuous targets; no keyword triggers or fixed clips were
added. It should use one brief action when useful, allow stillness, avoid duplicate
gestures and respect stop/stay-still/hold-pose requests.

`profiles/instructions.md` governs backend tool use. `profiles/live-instructions.md`
also tells Live to delegate the greeting gesture immediately while speaking the
greeting, rather than waiting for completion before speaking. Completed-motion
claims still require a tool result. Prompt guidance encourages behavior; it does
not guarantee a gesture or exact speech/movement synchronization on every turn.

## Activation on September 14

The existing 7112 backend accepted public instructions artifact version 2
(HTTP 200, effective on next request, durable false); reread matched the file.
Its existing Live instructions cannot change through public settings or artifact
updates. A separate instance on **7113** loads the revised Live prompt without
restarting 7100, 7110 or 7112 or discarding their in-memory conversations.

Local app configuration is now:

```dotenv
RUNTIME_URL=http://127.0.0.1:7112
VOICE_RUNTIME_URL=http://127.0.0.1:7113
```

All voice routes, including text follow-ups/cancel for voice conversations, use
7113. Before switching, 7112 had zero active calls and no pending host tools.
**Start a new conversation for the updated Live experience.** Existing display
history remains in the browser, and old backend history stays on 7112. Reusing an
old voice conversation ID on 7113 creates an empty backend tree; it does not
restore memory. Do not send old tool continuations or call IDs to 7113. To resume
an old voice conversation with its backend memory, restore the voice URL to 7112
only after all current calls and work have drained. That instance retains its
previous Live persona but has the updated backend artifact.

7113 uses unchanged reviewed runtime source `ad3507a` at
`/tmp/assistant-runtime-avatar-7112`. Its separate private launcher/state directory
is `/tmp/avatar-codex-7113`; `start.py`, `settings.json`, `launch.json` and
`readiness.json` record setup. Preserve both directories. The launcher binds only
to loopback, refuses an occupied port and uses no reload. It reads the checked-in
profile/Live prompt, creates a separate encryption key, clears backend API keys,
retains the dedicated Live API key, and enables Codex-only Sol/Luna routing.
OAuth sync and the saved settings overlay must be reapplied after any coordinated
future launch, using the same public procedure as `codex-subscription.md` with
port/state 7113. Do not restart a runtime holding needed in-memory history.

Readiness verified OAuth connected/source codex_cli, strict Codex-only routing,
Sol primary/subagent with budget 4000, Luna auxiliary models, working memory off,
time/screen tools, matching backend profile, and voice configured with no active
calls. Live prompt SHA-256:
`aff5f66c317196f54d4a5cda6740175de7a4506092dc1717765fcc4108cd6d91`.
No new paid Live call was allocated; actual voice gesture timing awaits Elias’s
next trial. Live audio continues to use API billing, backend work the subscription.

## Behavior check

A real subscription-backed browser conversation
`87b6fe4d-01eb-4367-b2b8-7689f4bfe95b` received only “Hello!” and generated one
`move_avatar`: raise the right hand, small lateral wave targets, then lower it.
The browser returned completed, with wrist/timing constraints noted, followed by
“Hello! Great to see you. How can I help today?” The 2.3-second requested movement
was extended to 4.93 seconds planned and 6.60 seconds actual in this browser run;
this is a policy acceptance check, not a smoothness/latency benchmark.

“Hello again! Please stay completely still while we chat.” produced no tool calls
and an ordinary greeting. This verifies the stillness override in that trial.
No new implementation-mirroring tests were added for the prose change.
