# Initial application

The frontend renders the approved Blender model directly in Three.js. Its GLB
contains 65 bones, 134 rigid shell meshes, and **zero animation clips**. This
iteration deliberately precedes TalkingHead and facial blend shapes.

## Conversation and body control

The Next.js server forwards the documented non-streaming HTTP chat and cancel
contracts to assistant-runtime. Provider keys stay in the runtime. Written
responses appear after each model turn; token streaming is not implemented yet.

Each request supplies `host_context`: the actual pose, useful landmarks,
the coordinate system, and JSON schemas for `move_avatar` and `get_pose`. The
model can produce up to 16 timed waypoints, combining either hand's position,
finger direction, five independent finger curls, and head yaw/nod. There are no
gesture names or motion clips in that API. Welcome suggestions are ordinary
messages sent to the model, not frontend gesture handlers.

The runtime hands over a pending host action. The frontend validates it, waits
for movement to finish, and resumes the same assistant message with an
execution receipt containing the actual pose and constrained/interrupted status.
Duplicate call IDs reuse their receipt within a turn. A turn is limited to 12
host executions. Invalid calls return a failed tool result.

Stop interrupts the current motion and cancels the assistant request. Late
responses cannot start another movement after cancellation. The next ordinary
message supersedes any pending action left in the runtime. Reloading does not
replay unfinished movements. Each new motion starts from the current actual pose.

## Motion space and limits

One unit equals the robot's approximate height. X is positive to the robot's
left (viewer right), Y is up from the floor, and Z points toward the viewer.
The renderer uses analytic two-link arm IK with a preferred elbow position
below and outside the shoulder. It preserves bone lengths and rigid panels.

Quintic waypoint interpolation extends durations to limit requested hand speed,
head rotation, finger curling, and hand-direction changes. The controller clamps
arm reach and limits hand swing to 35 degrees from the forearm. These are
presentation constraints, **not a complete anatomical model**. IK conditioning
near a straight arm can still create fast joint rotation when the hand moves
slowly. Full joint velocity/acceleration limits, forearm twist, self-collision,
coupled shoulder motion and balance remain improvements.

Only hands, fingers, and head are exposed. Walking, leg/torso control, independent
palm roll, face expressions, speech audio and lip-sync are not implemented.
The default elbow preference and palm orientation can look stiff for unusual
targets. The model is instructed to avoid torso crossings; geometry does not
yet enforce that preference.

## State and persistence

`components/` renders UI. `hooks/` connects React to typed XState actors.
`machines/` owns avatar loading/disposal, assistant turn/tool sequencing and
microphone lifetime. `lib/` contains renderer, IK, interpolation, HTTP and storage
services. `types/` defines domain and validation schemas.

Conversation summaries and visible messages are saved in browser local storage
(50 conversations, up to 400 messages each). Model memory belongs to
assistant-runtime: with its database disabled, restarting the runtime loses
that memory even though the browser still shows its transcript. Multiple tabs
do not synchronize live conversation ownership; use one active app tab per
conversation. Pose is transient and starts at rest after a page reload.

The microphone uses browser SpeechRecognition to fill the editable composer;
it sends only when the user presses Send. Recognition availability and privacy
behavior depend on the browser; some browsers use a remote speech service.
No microphone starts automatically. This is dictation, not OpenAI Realtime
voice. Speech playback and lip-sync are future work.

## Verification

`bun run test` checks IK lengths/reach, malformed targets, interpolation,
replacement-motion continuity, tool continuation and duplicate suppression,
cancellation races, microphone lifecycle, and the actual exported GLB contents.
`bun run typecheck`, `bun run lint`, and `bun run build` are required checks.

The local browser fixture (`node tests/fixtures/runtime.mjs`) runs on 7111.
It is a deterministic test double, never the model for the real app. To inspect
the production renderer and tool loop against it, build first and run a second
Next instance on 7141 with `RUNTIME_URL=http://127.0.0.1:7111`. Receipts go to
`.tmp/browser-tool-receipts.jsonl`. `/mobile` on the fixture server embeds that
test app at a 390 × 844 viewport. The normal app on 7140 uses the real runtime.
