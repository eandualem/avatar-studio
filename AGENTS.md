# Avatar Studio — contributor notes (experiment branch)

Avatar Studio is a demonstration application for
[assistant-runtime](https://pypi.org/project/assistant-runtime/): a 3D robot
you talk to, whose body a model moves through host tools. The README
explains what it does and how to run it; this file is about working on the
code.

**This branch is an experiment.** `experiment/jev-body` replaces the rule
that Charlie only moves from numbers a model writes per utterance. Here a
decision model, TypeSafe's Jev, chooses continuously from a library of
movements that were authored once as `move_avatar` plans, and the
number-writing planner is the fallback that grows the library. If the
experiment succeeds, it is the justification for changing `main`; until
then `main` keeps its rules and this branch may break any of them that
stand in the way. See `docs/expression.md`.

It is still deliberately small. Before adding something, check it earns
its place in a demonstration of the runtime and of the decision loop.

## Architecture

Four layers, and nothing reaches past its neighbour:

```
components/   render props, no business logic, never import a machine
hooks/        the bridge: useStudio returns { state, data, actions }
machines/     XState v5: every transition, every side effect
lib/          pure functions and clients, no React, no machine awareness
```

Machines are `appMachine` (root, spawns the rest), `avatarMachine` (the GLB
and the motion controller), `conversationMachine` (a typed turn and its host
tool continuations), `speechMachine` (dictation) and `voiceMachine` (a live
call and the expression controller beside it). `docs/architecture.md` is the
map, `docs/voice.md` the two-model pattern, `docs/expression.md` the Jev
loop and the library, `docs/motion.md` the rig, solver and tool.

Conventions worth knowing before you edit:

- Machines document themselves through XState `description` fields on
  states and transitions, not code comments. Guards are named in
  `setup({ guards })`; no inline anonymous guards.
- Every wire shape has a Zod schema in `types/`; nothing from the network or
  from a model is trusted into the app untyped. A tool call with bad
  arguments is a *failed tool result*, never an exception. Jev's answers
  are validated the same way (`types/jev.ts`).
- Components hold only view state; anything that drives behaviour lives in
  a machine or in the expression controller. `Studio.tsx` is large because
  it is the whole page's markup, not because it decides anything.
- Movement is authoritative only in the engine. "Started" means the first
  frame was applied to the rig; a Jev answer, a plan, a provider
  acknowledgement or a transcript timestamp is never reported as movement.
- The expression controller (`lib/expression-controller.ts`) is the one
  place that admits, supersedes and cancels live movement, whether the
  movement came from the library or from the planner. Do not add a second
  route that can move Charlie during a call.
- Library entries are `move_avatar` plans and must pass
  `tests/gesture-library.test.ts` on the shipped skeleton. Tune them in the
  Dev panel ("Library · name"), not from a transcript.
- Jev's questions are policy. Every criterion carries examples; change the
  wording with `make probe-jev` open, and keep the thresholds in the
  controller, not in the prompts.

## The runtime boundary

This repository never modifies the runtime. It consumes its public
contracts: `POST /api/chat` with `host_context` and host-tool
continuations, `output_mode: "host_tools"` for tool-only decisions, the
voice routes under `/api/voice`, and the profile TOML in `profiles/`.
`assistant-runtime docs` lists the runtime's pages; its source is at
<https://github.com/eandualem/assistant-runtime>.

Jev is not a chat model and does not go through the runtime. The app calls
TypeSafe directly from `app/api/jev/route.ts` with a server-side key
(`TYPESAFE_API_KEY`), the one provider credential this app holds itself.
Text chat, the planner and Live stay on the runtime.

Everything app-specific is sent per request from the server routes in
`app/api/` (`lib/runtime-config.ts`): the registered profile, the text and
body models, thinking budget, working memory off, and for voice calls the
persona in `profiles/live-instructions.md`. Nothing app-specific belongs in
the runtime's startup configuration, and nothing here starts, replaces or
stops the runtime; `make dev` only checks it.

If the runtime behaves differently from its documentation, do not paper
over it in the app. Write down exactly what was sent and what came back
and report it to the runtime; a silent workaround here hides a bug that
every other host would hit too. The same goes for Jev: if its answers or
its wire shape differ from <https://docs.typesafe.ai>, record it in
`docs/expression.md` rather than bending the schema quietly.

## Working on it

```bash
bun install
make dev         # preflight the runtime you started, then the app on http://127.0.0.1:7140
bun run test     # Vitest: machines, the expression controller, the library on the shipped GLB, voice with fake transport
bun run lint
bun run typecheck
bun run build
make check       # all four
make probe-jev   # the live questions against Jev for sample lines
```

bun is the package manager and script runner; there is no npm lockfile.
Tests never contact a model, OpenAI or TypeSafe. The Dev panel (**Dev test**
in the app) drives the solver by hand; tune motion from what you see there,
not from a transcript. `node tests/fixtures/runtime.mjs` is a deterministic
runtime double on port 7111 for driving the production renderer's tool loop
in a browser.

The character itself is Python for Blender under `blender/`, run through the
bridge in `scripts/bl`; `blender/README.md` has the commands and the
`blender-build` skill under `.agents/skills/` has the recipes. Only
`rigged.blend`, the Mixamo skeleton and two renders are tracked; everything
else is regenerated.

Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`), with a
body saying why. Keep every commit building.

## Scope

In scope: the robot, the page, text and live conversation, the expression
loop, the library and the planner that grows it, and the runtime features
they exercise.

Out of scope: authentication, multi-user, server-side storage (learned
gestures stay in the browser), walking with root travel, physical
simulation, facial blend shapes and lip-sync (the mouth follows audio
amplitude only), and a redesign of the layout. Simplicity is a requirement
here, not a preference.
