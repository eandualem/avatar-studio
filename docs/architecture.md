# Architecture

Avatar Studio is one Next.js page in front of one assistant-runtime process.
The browser renders Charlie and talks to the app's own server routes; those
routes forward to the runtime and hold every server-side setting. No
provider key ever reaches the browser.

```
browser ──HTTP──▶ app/api/runtime/*   ──▶  POST /api/chat, /cancel     (text, planner decisions)
        ──HTTP/SSE─▶ app/api/voice/*  ──▶  /api/voice/calls/*          (GPT-Live calls)
        ──HTTP──▶ app/api/jev         ──▶  TypeSafe POST /v1/systemone (expression decisions)
        ◀─WebRTC audio + data channel────  OpenAI GPT-Live (negotiated through the runtime)
```

## Layers

Four layers, none reaching past its neighbour, the same shape as
[design-studio](https://github.com/eandualem/design-studio):

```
components/   render props: Studio, MotionLab, BodyModelSelect, BodyTiming
hooks/        useStudio: the bridge, returns { state, data, actions }
machines/     XState v5: appMachine (root), avatarMachine, conversationMachine,
              speechMachine, voiceMachine
lib/          pure functions and clients: renderer, IK, interpolation, host
              tools, runtime, voice and Jev clients, the expression
              controller and gesture library, storage
types/        Zod schemas for every wire shape
profiles/     the assistant profile, the two prompts and the movement skill
```

`avatarMachine` loads and disposes the GLB and owns the motion controller.
`conversationMachine` runs a typed turn: send, stream the reply, pause on a
pending host action, execute it, resume with the receipt. `speechMachine`
holds the browser's SpeechRecognition dictation into the composer.
`voiceMachine` owns a live call and the expression controller beside it
([voice.md](voice.md), [expression.md](expression.md)).

## Three ways the model moves Charlie

All three end in the same validator and the same per-frame solver
([motion.md](motion.md)); only the caller differs.

1. **Text chat.** Every request carries `host_context`: the actual pose,
   landmarks, the coordinate system and the JSON schemas of `move_avatar`,
   `get_pose` and `capture_avatar`. The runtime hands back a pending host
   action; the app validates it, runs it to completion, and resumes the same
   assistant message with a receipt. Duplicate call IDs reuse their receipt;
   a turn allows 12 executions; invalid calls return a failed result.
2. **Live call.** GPT-Live only talks. On every transcript change Jev
   picks a library movement, or none, or a stop; a request the library
   cannot serve becomes one planner tool call on its own runtime session
   whose plan is learned. The app admits, runs, cancels and reports it.
3. **Dev panel.** Hand-edited `move_avatar` JSON through the same path, with
   no model.

**Stop** interrupts the motion and cancels the request; a late reply cannot
start a movement afterwards. A new message supersedes any pending action.
A reload does not replay unfinished movements; each motion starts from the
actual pose.

## What the runtime gets per request

Server routes add what used to be startup configuration, so one plainly
started runtime can serve this app next to others: `profile: "avatar_studio"`
(registered from `profiles/avatar-studio.toml`), `config.default_model`
(`TEXT_MODEL` for chat, `BODY_MODEL` for decisions, chosen per call by the
Body model control), `thinking_budget`, working memory off, and the
auxiliary model. Voice creation adds the Live persona. `lib/runtime-config.ts`
is the single place this happens.

## State and persistence

Conversation summaries and visible messages live in browser local storage
(50 conversations, 400 messages each). Model memory lives in the runtime:
without Postgres a runtime restart forgets it while the browser still shows
the transcript. Pose is transient and starts at rest on reload. One active
tab per conversation; tabs do not coordinate call ownership.

## Checks

`make check` runs the tests (Vitest: machines, the body controller, the
solver against the shipped GLB, voice lifecycle with synthetic transport, the
proxies), `tsc`, ESLint and the production build.
