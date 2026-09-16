# Avatar Studio

Charlie is an assistant with a live 3D robot body. Talk through an idea live,
write or dictate a message, or ask Charlie to move. The assistant composes hand, finger,
leg, torso and head motion through frontend tools; the browser solves each pose.
There are no baked animation clips or a fixed gesture menu.

Built with Next.js, Three.js and XState, backed by
[assistant-runtime](https://github.com/eandualem/assistant-runtime).
The approved Blender model and reference layout are preserved.

[Independent speech and body control](docs/parallel-body-control.md) replaces
Live-delegated movement. See [verification and activation](docs/parallel-body-verification.md).

## Run locally

Use Bun 1.4 or later and Node 22 or later. Start assistant-runtime yourself,
then start the app:

```bash
make install
make dev
```

`make dev` only runs the app. It first checks the configured runtime and
refuses to start when nothing answers there ("start assistant-runtime first");
it never starts, replaces or stops a runtime. Open **http://127.0.0.1:7140**.
The app talks to one assistant-runtime on port 7100 for text, voice and body;
`RUNTIME_URL` in `.env.local` changes the address and `.env.example` lists the
optional overrides. `make preflight` runs the same check on its own.

The app sends its registered profile (`avatar_studio`), model choices and the
Live persona on every request, so the runtime needs only operator startup
settings: this repository's `profiles/avatar-studio.toml` in
`ASSISTANT__PROFILES`, Codex-only models, the `screen` built-in tool and GPT-Live
enabled with `OPENAI_API_KEY` in the runtime's own `.env`. The list is in
[single runtime](docs/single-runtime.md). A runtime without the profile fails
the preflight; one with voice disabled starts the app but refuses Talk live.

`make check` runs tests, typecheck, lint and the production build.

`GET http://127.0.0.1:7100/health` should report `codex_only: true`, and
`/api/voice/status` should report voice enabled and configured. See
[single runtime](docs/single-runtime.md) for what the file sets and why there
is exactly one instance.

API credentials belong in assistant-runtime, never the frontend. This is a local
application; public deployment and authentication are outside this milestone.

For subscription-backed chat, body tools and avatar inspection, see
[Codex subscription setup](docs/codex-subscription.md). Codex login and the
runtime connection are separate; the subscription-only configuration rejects
backend requests rather than falling back to API billing.

Try: “Raise your left hand, point up with your index finger, and look toward it.”
Then: “Relax both hands slowly.” Stop interrupts movement and the current reply.
Also try: “Crouch slightly with both feet flat,” or “Shift your weight onto your
right foot, then slowly lift your left foot and hold it.”
The microphone fills the composer for editing before sending.

For direct audio, enable assistant-runtime's **GPT-Live 1** integration and select
**Talk live**. It connects microphone and speaker and displays user/Live speech. A separate
subscription-backed controller moves Charlie from each new user utterance.
Mute, stop movement, reset the pose, or end the call from the live controls.
See [voice setup and limits](docs/voice.md). OpenAI API access is required for audio;
credentials stay in the runtime. No microphone starts automatically.

## Current scope

**Dev test**, beside **Talk live**, opens direct movement controls. Choose an
editable example, tweak waypoint numbers or JSON, and run the same tool the
assistant uses. Read the pose, stop a movement, reset Charlie instantly for the
next test, and copy its input/result with
timing and constraint feedback. Close Dev test to return to conversation.
The timing preview names the channels imposing a minimum duration. **Kicking
stance** demonstrates a supported leg extension; **Capture avatar** previews the
fresh avatar-only images available to Charlie for visual inspection.
See [movement testing and guidance](docs/motion-testing.md).

- Approved 65-bone robot with all 134 rigid shell pieces, exported as GLB.
- Model-created hand and ankle targets, finger curls, palm roll, pelvis shifts,
  torso bends/twists, shoulder lift and head angles.
- Bounded IK from closed-chain-ik, one-way elbow/knee hinges, wrist limits,
  and Rapier checks for approximate self-collision and planted-foot support.
- Smooth transitions, cancellation, typed chat and local history.
- Browser microphone dictation, where SpeechRecognition is supported.
- GPT-Live audio, transcripts, independent body actions and explicit call controls.

Complete anatomical modelling, dynamic walking/balance, detailed mesh collision,
facial shapes and lip-sync remain future work. Text-chat replies arrive per model
turn; only user and Live speech appear during calls; body decisions stay internal.
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
