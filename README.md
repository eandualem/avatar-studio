# Avatar Studio

Charlie is an assistant with a live 3D robot body. Talk through an idea live,
write or dictate a message, or ask Charlie to move. The assistant composes hand, finger,
leg, torso and head motion through frontend tools; the browser solves each pose.
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
Also try: “Crouch slightly with both feet flat,” or “Shift your weight onto your
right foot, then slowly lift your left foot and hold it.”
The microphone fills the composer for editing before sending.

For direct audio, enable assistant-runtime's **GPT-Live 1** integration and select
**Talk live**. It connects microphone and speaker, displays spoken fragments and
backend answers, and lets the assistant use Charlie's existing movement tools.
Mute, stop delegated movement, or end the call from the live controls.
See [voice setup and limits](docs/voice.md). OpenAI API access is required;
credentials stay in the runtime. No microphone starts automatically.

## Current scope

**Dev test**, beside **Talk live**, opens direct movement controls. Choose an
editable example, tweak waypoint numbers or JSON, and run the same tool the
assistant uses. Read the pose, stop a movement, and copy its input/result with
timing and constraint feedback. Close Dev test to return to conversation.
See [movement testing and guidance](docs/motion-testing.md).

- Approved 65-bone robot with all 134 rigid shell pieces, exported as GLB.
- Model-created hand and ankle targets, finger curls, palm roll, pelvis shifts,
  torso bends/twists, shoulder lift and head angles.
- Bounded IK from closed-chain-ik, one-way elbow/knee hinges, wrist limits,
  and Rapier checks for approximate self-collision and planted-foot support.
- Smooth transitions, cancellation, typed chat and local history.
- Browser microphone dictation, where SpeechRecognition is supported.
- GPT-Live audio, transcripts, delegated body actions and explicit call controls.

Complete anatomical modelling, dynamic walking/balance, detailed mesh collision,
facial shapes and lip-sync remain future work. Text-chat replies arrive per model
turn; live speech fragments and delegated backend text stream during calls.
See [architecture and limits](docs/architecture.md)
and [solver selection](docs/motion-solvers.md).

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
