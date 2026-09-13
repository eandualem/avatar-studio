# Initial application

The frontend renders the approved Blender model directly in Three.js. Its GLB
contains 65 bones, 134 rigid shell meshes, and **zero animation clips**. This
iteration deliberately precedes TalkingHead and facial blend shapes.

## Conversation and body control

The Next.js server forwards HTTP chat/cancel and streaming voice contracts
to assistant-runtime. Provider keys stay in the runtime. Written
responses appear after each model turn; token streaming is not implemented yet.

Each request supplies `host_context`: the actual pose, useful landmarks,
the coordinate system, and JSON schemas for `move_avatar` and `get_pose`. The
model can produce up to 16 timed waypoints, combining hand positions, finger
direction/curls and palm roll; ankle positions/yaw/pitch; pelvis offset/yaw;
torso bend/twist/lean; shoulder lift; and head yaw/nod/tilt. There are no
gesture names or motion clips in that API. Welcome suggestions are ordinary
messages sent to the model, not frontend gesture handlers.

The runtime hands over a pending host action. The frontend validates it, waits
for movement to finish, and resumes the same assistant message with an
execution receipt containing the actual pose, constrained/interrupted status,
and reasons when motion is limited. A target that fails to settle within three
extra seconds is stopped and explicitly reported as constrained.
Duplicate call IDs reuse their receipt within a turn. A turn is limited to 12
host executions. Invalid calls return a failed tool result.

Stop interrupts the current motion and cancels the assistant request. Late
responses cannot start another movement after cancellation. The next ordinary
message supersedes any pending action left in the runtime. Reloading does not
replay unfinished movements. Each new motion starts from the current actual pose.

## Motion space and limits

One unit equals the robot's approximate height. X is positive to the robot's
left (viewer right), Y is up from the floor, and Z points toward the viewer.
`lib/body/` adapts the open-source closed-chain-ik DLS solver to the actual GLB
skeleton. Arms and legs use bounded joints in rest-aligned anatomical frames.
Elbows and knees have one rotational degree of freedom and cannot reverse their
bend. Feet solve position and orientation together. Pelvis and torso changes
move the chain roots while omitted foot targets stay planted in world space.
Bone lengths and rigid panels are preserved.

The solver starts from its previous joint values and uses a comfortable rest-pose
bias. Each angular DoF moves at most 2.1 radians/second with a velocity ramp;
this is not a strict acceleration/jerk guarantee. Quintic waypoint interpolation
also extends durations to slow Cartesian targets and the other body channels.
Wrist swing stays within 35 degrees in the forearm frame; palm roll stays within
±0.6 radians. Swing/twist is reprojected after interpolation to keep those limits.
The palm follows the forearm instead of trying to maintain a fixed world normal.

Rapier shape queries test approximate torso/head/limb capsules, boot sole corners
against the floor, and an approximate weighted body center against the convex
hull of grounded soles. A rejected frame restores the last accepted pose and
solver state. This conservative rejection can stop several channels together;
it does not plan a path around an obstacle. Lift a foot only after shifting the
pelvis toward the foot that stays planted. A shallow crouch generally needs a
backward hip shift as well as a downward one.

These are **configured presentation constraints, not complete human anatomy or
dynamic physics**. Capsules do not cover every shell/finger contact; the support
test is a static approximation. Walking, running, jumping, falling, arbitrary
environment interaction, and guaranteed natural movement remain unsupported.
The boots are rigid, so individual toes do not articulate. Facial expressions
and lip-sync remain future work. GPT-Live supplies speech playback separately.
See [solver selection and
limits](motion-solvers.md) for the candidate comparison and follow-up directions.

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
No microphone starts automatically. **Talk live** starts a separate GPT-Live
WebRTC conversation through assistant-runtime, with its own lifecycle actor.
The browser plays incoming audio and observes server events for transcripts
and delegated movement. See [voice setup and lifecycle](voice.md).

## Verification

`bun run test` exercises the actual exported skeleton through crouches, both
leg lifts, wrist reversals and blocked torso crossings. Every sampled frame is
checked for joint bounds/rates, wrist bounds, floor contact, collisions and
support. It also checks malformed targets, interpolation,
replacement-motion continuity, tool continuation and duplicate suppression,
cancellation races, microphone lifecycle, and the actual exported GLB contents.
`bun run typecheck`, `bun run lint`, and `bun run build` are required checks.

The local browser fixture (`node tests/fixtures/runtime.mjs`) runs on 7111.
It is a deterministic test double, never the model for the real app. To inspect
the production renderer and tool loop against it, build first and run a second
Next instance on 7141 with `RUNTIME_URL=http://127.0.0.1:7111`. Receipts go to
`.tmp/browser-tool-receipts.jsonl`. `/mobile` on the fixture server embeds that
test app at a 390 × 844 viewport. The normal app on 7140 uses the real runtime.
