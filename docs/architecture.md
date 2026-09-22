# Architecture

Avatar Studio is one Next.js page in front of one assistant-runtime process.
The browser renders Charlie and talks to the app's own server routes; those
routes forward to the runtime and attach the app’s server-side settings. No
provider key ever reaches the browser.

```
browser ──HTTP──▶ app/api/runtime/*   ──▶  POST /api/chat, /api/chat/{id}/cancel (text, body decisions)
        ──HTTP/SSE─▶ app/api/voice/*  ──▶  /api/voice/calls/*          (GPT-Live calls)
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
              tools, runtime and voice clients, body controller, storage
types/        Zod schemas for every wire shape
profiles/     the assistant profile, text/body/voice prompts and movement guidance
```

`avatarMachine` loads and disposes the GLB (the binary 3D model) and owns the
motion controller. `conversationMachine` runs a typed turn: send, receive the reply, pause on a
pending host action, execute it, resume with the result. A host action is a
model-requested operation performed by the app; that resumption is a
continuation. `speechMachine` holds the browser’s SpeechRecognition
dictation into the composer.
`voiceMachine` owns a live call and the body controller beside it
([voice.md](voice.md)).

## Three routes to movement

All three end in the same validator and the same per-frame solver
([motion.md](motion.md)); only the caller differs.

1. **Text chat.** Every request carries `host_context`: the actual pose,
   landmarks, the coordinate system and the JSON schemas of `move_avatar`,
   `get_pose` and `capture_avatar`. The runtime hands back a pending host
   action; the app validates it, runs it to completion, and resumes the same
   assistant message with a receipt. Duplicate call IDs reuse their receipt;
   a turn allows 12 executions; invalid calls return a failed result.
2. **Live call.** GPT-Live only talks. A separate body controller decides
   one tool call per utterance on its own runtime session, and the app
   checks whether the decision is still current, then runs, cancels and
   reports it. This acceptance check is called admission.
3. **Dev panel.** Hand-edited `move_avatar` JSON through the same path, with
   no model.

**Stop** interrupts the motion and cancels the request; a late reply cannot
start a movement afterwards. A new message supersedes any pending action.
A reload does not replay unfinished movements; each motion starts from the
actual pose.

## What the runtime gets per request

The app attaches its configuration to each request, so one shared runtime
can serve this app next to others: `profile: "avatar_studio"`
(registered from `profiles/avatar-studio.toml`), `config.default_model`
(`TEXT_MODEL` for chat, `BODY_MODEL` for decisions, chosen per call by the
Body model control), `thinking_budget`, working memory off, and the
auxiliary model. Voice creation adds the Live persona through
`lib/voice-client.ts`.
`lib/runtime-config.ts` supplies the shared profile and chat/body defaults.
Provider keys and voice enablement stay in the runtime environment.

## State and persistence

Conversation titles and visible messages live in browser local storage
(50 conversations, 400 messages each), when storage is available. The app
continues without saving if storage is blocked or full. Model context lives
in the runtime: without Postgres a runtime restart forgets it while the
browser still shows the transcript. Ordinary text turns send the latest message, not a replay of
that saved transcript. Live calls send a bounded window of visible history
on creation. Clearing browser storage removes the local copy. Pose is
transient and starts at rest on reload. Use one active tab per conversation;
tabs do not coordinate call ownership.

## Checks

`make check` runs the tests (Vitest: machines, the body controller, the
solver against the shipped GLB, voice lifecycle with synthetic transport, the
proxies), `tsc`, ESLint and the production build.
