# Direct movement testing

Enable **Dev test** next to **Talk live** when chat is idle and no live call is
active. It replaces the conversation area while keeping Charlie visible. Choose
an example, edit numeric fields (applied when leaving the field), or edit the
full `move_avatar` argument JSON. Loading or editing an example never moves the
body. **Run movement** calls the same `executeTool` validator and motion
controller as text/live actions, with no model or runtime request.

**Stop** holds the current pose and keeps an interrupted receipt. **Read pose**
calls `get_pose`. **Return to rest** is an editable example through the solver,
not a reset that bypasses collision or support. Closing Dev test stops ongoing
movement and restores the conversation. Draft inputs and the last completed
receipt survive toggling within the page; reload clears them. Chat, live setup,
dictation and conversation navigation cannot take ownership during a test.

The public API exposes hand/ankle targets, fingers, pelvis, torso, shoulders and
head. It does not give the model unrestricted access to every skeleton joint.
The solver chooses bounded arm/leg joint rotations. The expandable tool schema
shows all supported fields and ranges. X is robot left, Y up, Z forward, height
is 1, and angles are radians. Waypoint times are cumulative. Omitted fields hold
their previous targets within a sequence; new calls begin at the actual pose.

## Reading results

The preview uses the last read pose; it updates after execution or **Read pose**.
The **last execution receipt** belongs to its recorded input, even if the editor
has since changed. **Copy report** includes that input, starting pose, full tool
receipt and local call elapsed time. Reports are local and are not uploaded.

- Requested duration is the last input waypoint time. Planned duration includes
  the existing Cartesian/channel speed extensions. Both are recomputed at actual
  execution, so the receipt is authoritative for that run.
- Actual execution includes settling. The controller can wait up to three extra
  seconds after the plan. Small frame-boundary overshoot also appears as extra
  settling; this is not an exact measure of time spent correcting the pose.
- First motion frame measures local request-to-first-RAF scheduling, not first
  visible displacement, speech-to-action time or model inference.
- Gaps over 50ms and the largest frame gap help identify scheduling stalls.
  Background tabs, browser load and rendering can all affect them.
- Solver mean/peak measures interpolation plus applying the pose, excluding
  rendering. It is a local diagnostic, not an end-to-end frame budget.
- `completed` means execution ended. Check `constrained`, `reasons` and actual
  pose before deciding the requested target was reached. Speed extension,
  wrist limits, collision/support rejection and incomplete settling are separate
  reasons. No constraint has been relaxed for Dev test.

For comparisons, first establish the same starting pose, then run identical
inputs and change one variable at a time. Compare a short head change with a
full arm raise. A small requested time cannot override the speed ceiling. The
current quintic interpolation eases to zero velocity at every waypoint, so
adding many tiny points can introduce visible pauses even with steady frames.
Collision rejection restores the last accepted pose and does not plan a route
around an obstacle. These are system behaviors; better model guidance alone
cannot remove them.

## Guidance reaching Charlie

`profiles/skills/charlie-motion/SKILL.md` is the maintained movement guide. It is
bundled as text into `host_context.view.data.movement_skill`, alongside the
current pose, schema and landmarks. Existing runtime instances receive it with
new text requests, new live calls and subsequent host-context PATCHes; it does
not modify a model turn already in progress. No filesystem skill discovery or
runtime restart is needed for this backend contextual guidance. It is not a
replacement for the runtime profile policy.

The guide recommends early composition of one coordinated sequence, avoiding
unnecessary `get_pose` calls, small expressive excursions, and adapting to actual
constraint results. Its examples are starting points, not an agent-side gesture
menu or globally optimal speed settings. They correspond to the editable test
examples. Skill frontmatter was validated and the real skeleton tests exercise
the examples; improved model behavior still requires a comparative live trial.

## Live latency and concurrency

Assistant-runtime's agent reviewed the current contract and source at develop
`dd729be` on September 14. Speech/listening and delegated backend work can overlap.
The bridge queues delegation immediately on receipt; our `VoiceClient.perform`
has no speech-ended gate. Multiple body channels can move together in one tool
call. Host calls themselves are handed off sequentially, and a newer delegation
supersedes unfinished older work after cancellation cleanup. Spoken interruption
alone does not cancel movement.

The critical path is Live deciding to delegate, backend composition, pending
host delivery, local movement, host-context PATCH, tool-result submission and
backend continuation. Audio remains live while the host executes. Completion
commentary comes after the result and continuation; the runtime does not send
automatic pending-host commentary or forward backend text deltas into Live.
An HTTP acknowledgement or accepted result is not proof of audible speech.

The revised `profiles/live-instructions.md` encourages prompt delegation and a
brief acknowledgement while work runs. **This Live prompt change is staged for
the next coordinated voice-runtime restart.** `VOICE__INSTRUCTIONS` is frozen at
service startup; editing the file or PATCHing host context does not activate it.
Neither runtime instance nor its model, thinking budget, or memory settings was
changed for this feature.

Direct-test receipts do not measure delegation/backend latency. In a subsequent
live investigation, correlate delegation/tool IDs and locally timestamp backend
`final_response` containing a pending call versus delegation `pending_host` to
isolate stream-drain work, then execution, context PATCH and result POST. The
runtime agent identified memory extraction during stream teardown as one
possible tail, but no run established it as the cause of Elias's observed delay.
Do not retry physical motion because a result acknowledgement is slow.

## Verification, September 14

The six examples ran against the exported GLB at their planned 60Hz timing,
checking collision/support each frame and final hand/pelvis/head targets. Actor
tests cover direct execution without network requests, duplicate clicks,
exclusive ownership, invalid inputs, pose reads, stop, close and late results.
Motion tests cover speed extension and frame timing. The 55 tests, TypeScript,
ESLint and production build passed before browser verification.

In the foreground desktop Chrome trial, a requested 1.20s head glance took 1.21s,
with a 28ms first frame, no gaps over 50ms and 1.1ms mean pose-application time.
A requested 3.00s wave planned 3.16s and took 3.18s, with a 39ms first frame,
no gaps over 50ms and 1.4ms mean pose-application time. The wave reported speed
extension and wrist swing limiting. These are single local samples, not a
benchmark or evidence that every trajectory is smooth. Browser checks also
covered negative/out-of-range numeric edits, stop receipts, return to rest,
desktop and 390×844 layouts. No new paid live audio session was started.
