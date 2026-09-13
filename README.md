# Avatar Studio

Charlie is an assistant with a live 3D robot body. Talk through an idea in text,
dictate a message, or ask Charlie to move. The assistant composes hand, finger
and head motion through frontend tools; the browser solves the pose each frame.
There are no baked animation clips or a fixed gesture menu.

Built with Next.js, Three.js and XState, backed by
[assistant-runtime](https://github.com/eandualem/assistant-runtime).
The approved Blender model and reference layout are preserved.

## Run locally

Use Bun 1.4 or later and Node 22 or later:

```bash
bun install
bun run dev
```

Open **http://127.0.0.1:7140**. The app expects assistant-runtime on port 7100;
set the server-only `RUNTIME_URL` in `.env.local` to use another instance.

Start the installed runtime from a directory containing its configured `.env`
and a funded model provider. Point it to this repository's profile:

```bash
ASSISTANT__PROFILE=/absolute/path/to/avatar-studio/profiles/avatar-studio.toml \
TOOLS__BUILTIN_TOOLS='["time"]' \
TOOLS__PROVIDER_CAPABILITIES='[]' \
ASSISTANT__ENABLE_WORKING_MEMORY=false \
assistant-runtime serve --host 127.0.0.1 --port 7100 --no-replace
```

API credentials belong in assistant-runtime, never the frontend. This is a local
application; public deployment and authentication are outside this milestone.

Try: “Raise your left hand, point up with your index finger, and look toward it.”
Then: “Relax both hands slowly.” Stop interrupts movement and the current reply.
The microphone fills the composer for editing before sending.

## Current scope

- Approved 65-bone robot with all 134 rigid shell pieces, exported as GLB.
- Model-created continuous hand targets, five finger curls per hand, and head angles.
- Reach and wrist constraints, smooth transitions, cancellation, typed chat and local history.
- Browser microphone dictation, where SpeechRecognition is supported.

Full anatomical limits, collision avoidance, walking, facial shapes, realtime
speech and lip-sync remain future work. Responses arrive per model turn rather
than streaming token by token. See [architecture and limits](docs/architecture.md).

## Checks and asset rebuild

```bash
bun run test
bun run typecheck
bun run lint
bun run build
bun run start
```

With `blender/rigged.blend` open through the Blender bridge:

```bash
scripts/bl run blender/rig/export_web.py
```

This exports only the rigged character in rest pose to `public/avatar/robot.glb`;
it restores the Blender pose after exporting. The build and rig workflows are
in [blender/README.md](blender/README.md) and [blender/rig/README.md](blender/rig/README.md).
Source references live in `references/`; approved stills live in `renders/`.

MIT.
