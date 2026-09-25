# Avatar Studio

Avatar Studio is a voice assistant with a body. Charlie, a 3D robot, stands
beside the conversation; you talk to him, type to him, or dictate, and he
answers in speech or text while moving. Ask for a wave, a thoughtful pose,
or a run in place. A model writes timed targets for his body parts, and the
browser calculates the joint rotations each frame; it plays no animation clips.

This is a demonstration for developers building an assistant into an app with
[assistant-runtime](https://pypi.org/project/assistant-runtime/). It shows how
an app executes model-requested actions and how separate models can handle
speech and movement at the same time. It runs locally, with one page and
no app accounts or database.

![The studio: Charlie, the conversation, and the Talk live and Body model controls](public/screenshot.jpg)

## Running it

You need Git, `make`, [bun](https://bun.sh) (the project uses 1.4.2), and
[uv](https://docs.astral.sh/uv/) to install the Python 3.12+ runtime. Use an
`OPENAI_API_KEY` with API credit and access to the configured models. Text
chat defaults to `openai:gpt-5.6-sol`, body planning to `openai:gpt-6-astra`,
and voice uses OpenAI GPT-Live. A microphone is needed only for voice or
dictation. Blender is not needed to run the app; the robot model is included.

### 1. Get the app

Run these commands before starting the runtime, so the profile file exists:

```bash
git clone https://github.com/eandualem/avatar-studio
cd avatar-studio
make install
```

### 2. Start the runtime

In the same terminal, from the repository root:

```bash
uv tool install 'assistant-runtime[voice]==0.3.0'

export OPENAI_API_KEY=sk-...  # replace with your API key
export VOICE__ENABLED=true
export ASSISTANT__PROFILES="[\"$PWD/profiles/avatar-studio.toml\"]"

assistant-runtime serve --port 7100
```

The profile gives the assistant Charlie's identity. `ASSISTANT__PROFILES`
contains its absolute path; keep this checkout available while the runtime
runs. The runtime also reads a `.env` file in its working directory. Provider
keys belong in the runtime environment, not the app's `.env.local`.

The app works with assistant-runtime 0.2.0 and 0.3.0; 0.3.0 only adds a
decisions route this app does not use. This recipe pins 0.3.0. If you already
run a shared runtime at either version, register this profile there instead of
starting another process on port 7100. `assistant-runtime docs` lists its configuration and
provider guides. Other body-model providers need their own keys in the runtime;
selecting one in the app does not configure that provider.

### 3. Start the app

Leave the runtime running. Open a second terminal and change to the same
`avatar-studio` checkout, then run:

```bash
make dev
```

Open <http://127.0.0.1:7140>. Type **Wave at me** and press **Send**. Expect
Charlie to move and a text reply to appear; model planning can take several
seconds. Then try **How does your pose look?** to request a fresh image of
Charlie for visual inspection.

`make dev` checks runtime health and profile registration before starting the
app; it never starts or stops the runtime. If it fails, follow the printed
connection or profile error. **Talk live** also needs voice enabled and a
runtime supporting conversation mode and per-call instructions. Text chat can
run with voice disabled.

To use a different runtime address, set `RUNTIME_URL` in `.env.local`;
[.env.example](.env.example) lists model and per-role overrides. The
**Runtime default** body-model option uses the app server's `BODY_MODEL`
setting, which defaults to Astra.

## Using it

- **Text or dictation:** type in the composer, or use **Dictate a message**
  if your browser supports speech recognition. Dictation fills the composer;
  press **Send** to submit it.
- **Talk live:** allow microphone access and speak. Charlie answers aloud
  while a separate model plans his movements. **Stop movement** freezes his
  body while the call continues; the microphone button mutes your input;
  **End call** disconnects. Voice bills connected time. See
  [voice setup and behavior](docs/voice.md).
- **Body model:** choose which model plans movements during a call. This
  selection stays in your browser and does not change the text-chat model.
- **Dev test:** try a movement without contacting a model. Choose an example
  such as **Small wave**, run it, and inspect the result. **Reset pose**
  returns Charlie to his initial pose. See the [motion reference](docs/motion.md).

**New conversation** starts a fresh chat. The browser stores up to 50
conversations with 400 messages each, when local storage is available. This
visible transcript is separate from the runtime's model context: without a
configured Postgres database, restarting the runtime loses that context.
Clearing browser storage removes the local transcript. Reloading resets
Charlie's pose and does not resume a live call.

## How it works

The app declares **host tools**: actions that the model can request but the
app executes. `move_avatar` supplies timed movement targets, `get_pose` reads
the actual pose, and `capture_avatar` captures the robot's canvas. The app
checks and executes a request, then returns a result so the model can continue
its answer. The runtime's `look_at_screen` tool inspects captured images.

During a live call, GPT-Live handles speech while a separate body controller
asks a chat model for movement targets. The app decides whether each result
is still current before moving Charlie, and reports actual movement back to
the voice model. Speech does not wait for planning. The browser uses inverse
kinematics (IK): calculating joint rotations from targets such as a hand position.

For implementation and contribution details:

- [Architecture](docs/architecture.md): app layers, runtime requests and storage.
- [Voice](docs/voice.md): call lifecycle, movement decisions and timing.
- [Motion](docs/motion.md): coordinates, tool fields and solver constraints.
- [Blender](blender/README.md): edit, rebuild or export the character.
- [Contributor notes](AGENTS.md): conventions and checks. `make check` runs
  tests, typecheck, lint and the production build.

## License

MIT, see [LICENSE](LICENSE). The IK solver
([closed-chain-ik-js](https://github.com/gkjohnson/closed-chain-ik-js)) and
[Rapier](https://rapier.rs) are Apache-2.0.
