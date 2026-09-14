# Avatar Studio — the agent's brief

Avatar Studio is a full-screen voice assistant with a body: a 3D robot
character you talk to. It is the second demonstration application for
[assistant-runtime](https://github.com/eandualem/assistant-runtime), a
sibling of [design-studio](https://github.com/eandualem/design-studio),
and it is built entirely by agents on
[agent-backbone](https://github.com/eandualem/agent-backbone).

The end state, so you know where each milestone leads: the character is
rigged and carries ARKit and Oculus viseme blend shapes, exported as GLB,
rendered in the browser by [TalkingHead](https://github.com/met4citizen/talkinghead)
with live speech from OpenAI GPT-Live and eventual lip-sync, inside a Next.js and
XState app that follows design-studio's architecture. The backend already
exists: the runtime. The approved body model and procedural rig are complete.

## Independent parallel body control (issue #32 / PR #33)

Elias resumed implementation on September 14, 2026. Start with
[issue #32](https://github.com/eandualem/avatar-studio/issues/32),
[the architecture and operating contract](docs/parallel-body-control.md), and
[verification and activation notes](docs/parallel-body-verification.md).

Live only converses. An independent body controller receives each coalesced user
utterance and emits a movement tool or structured hold. The app owns revisions,
exclusive execution, priority, cancellation and actual engine lifecycle facts.
Implementation PR #33 passes 87 tests and all local checks. A real subscription
body decision completed an eight-cycle run on the renderer; Live audio remains
Elias-run acceptance. Runtime PR #123 is merged and isolated 7114 is active.
GitHub Actions is blocked by account billing; see the verification note.
Body decisions use fresh
backend sessions to isolate session-scoped cancellation; text remains separate.

Preserve Charlie, the layout, procedural solver and subscription setup. No
agent-paid Live trial is authorized. Real audio acceptance belongs to Elias.
Keep 7100/7110/7112/7113 and their histories intact. Issue #30 and draft PR #31
are superseded experiments; do not merge #31. Preserve its branch for reference.
The detailed verification note records current implementation/deployment status;
inspect the actual checkout and runtime health before further changes.

## Delivered history (earlier milestones; next-session direction above wins)

Live interaction was accepted in PR #13; issue #11 is closed. Elias resumed work
on animation responsiveness and naturalness in issue #14. Its opt-in Dev test
panel near Talk live provides direct validated tool calls, editable numeric/JSON
waypoints, actual pose and timing/constraint feedback. Movement guidance is
supplied to the assistant; assistant-runtime confirmed concurrent speech/actions.
Preserve Charlie and the approved layout. Keep motion flexible rather than
introducing an agent gesture menu; tune the solver only from measured evidence.

Current workflow and verification are in `docs/motion-testing.md`. Backend motion
guidance travels in host context. The revised Live prompt is loaded on voice
runtime 7110. Preserve existing runtime histories; a launcher edit unexpectedly
triggered 7100's broad Python reloader on September 14 (incident in that document).
Issue #16 added a direct Reset pose control and divided existing example times
by three following Elias’s trial. Reset restores the initial rig and solver
state without reloading. Solver speed limits remain active. Elias can test
motions and share receipts to guide further animation changes.

Issue #18 adds named timing floors, avatar-only snapshots and a diagonal kicking
stance. Charlie can call `capture_avatar`, then runtime `look_at_screen`; enable
the `screen` built-in on both runtimes. Text vision is verified against standing
and kicking poses; voice context/result ordering is tested with synthetic
transport. Vision can misread foreshortened joints: compare image and actual pose.

Issue #20 switches the backend to Elias’s Codex subscription, with no API fallback.
Both local app runtime URLs now point to isolated 7112, running assistant-runtime
PR #121 (`ad3507a`). Sol/low handles visual/tools, Luna auxiliary defaults,
working memory off. Real subscription-backed capture, image inspection and a nod
are verified. Preserve 7100/7110 and their original backend histories; begin new
conversations on the subscription instance. Setup, restart steps and evidence
are in `docs/codex-subscription.md`. GPT-Live audio remains API-backed; no new
paid live trial was started. Never substitute an API key for the Codex login.

## Demo animation pass (issue #22 / PR #23)

Elias resumed running/animation and authorized repeatable procedural sequences
plus a simple speaking mouth. This supersedes the earlier walking/facial deferral
for running **in place** and amplitude mouth animation only. Preserve the body,
layout and subscription setup. New tool fields prepare/waypoints/repeat/finish
compose bounded cycles; animated mode permits flight with retained floor,
collision and joint limits. Grounded mode remains the default. Details and
runtime prompt activation notes are in `docs/motion-testing.md`. The 70 tests, type/lint/build and browser checks pass; a subscription-backed
four-cycle run completed and returned to standing. Backend instructions artifact
version 1 is active on 7112 without restarting. Live mouth audio behavior has
synthetic-media and rendered-preview coverage; Elias’s next real voice trial is
the remaining subjective acceptance. No new paid Live call was allocated.

## Live transcript ordering (issue #24)

Elias's demo exposed older full responses appearing below newer user utterances.
The app now interleaves full responses at their first visible transcript position,
keeps IDs stable during finalization, and separates continuations after new user
speech. Snapshot/replay regression tests pass. New calls use the fix after app
refresh; old saved order is preserved because it cannot be reliably reconstructed.
See `docs/live-message-order.md` for the contract, evidence and recovery limits.
No runtime restart, provider change or new paid voice call was needed.

## Avatar stage layout (issue #26)

Elias requested the reference’s larger avatar framing. The stage now contains
Charlie and functional status/error feedback only; decorative captions, top
slogan and bottom signature are removed. The canvas fills its panel on desktop
and mobile; camera width padding is tighter so the robot uses the reclaimed
height. Desktop/laptop and 390 × 844 mobile browser checks show the full standing
body; all 73 tests and type/lint/build checks pass. Extreme sideways poses can
extend outside the tighter frame, as with any fixed portrait camera.

Elias also reported resolving the September 14 Live creation error by adding
API funds. The runtime diagnostics investigation is closed at his request;
no runtime changes, restart or paid retry were made for that investigation.

## Conversational expression (issue #28)

Elias requested spontaneous body language, especially waving while greeting.
Backend and Live prompts now encourage short contextual gestures, concurrent
speech/action and respect for stillness/held poses. A subscription-backed plain
“Hello!” produced one completed wave; a greeting with “stay completely still”
produced no tools. Backend artifact v2 is active on 7112. New Live conversations
use separate 7113 with the updated startup prompt; text stays on 7112. All old
runtime processes and their histories are preserved. Use **New conversation**
for the new Live policy; session IDs do not migrate backend memory. Setup and
verification are in `docs/expressive-greetings.md`. No new paid Live test was run.

## Superseded Live dispatch experiment (issue #30 / draft PR #31)

Elias's real voice trial exposed speech claiming movement with no initial
backend delegation. Updated code appends the current concise Live policy over
WebRTC on every new call and waits for its correlated acknowledgment before
unmuting audio or executing pending tools. No runtime restart or new instance.
Backend artifact v3 on 7112 and v1 on 7113 reinforces physical greeting work.
79 tests and type/lint/build passed, but the later real Live trial still omitted
initial greeting/wave delegation. This experiment did not establish reliability.
See `docs/parallel-body-control.md` and issue #32 for the replacement architecture;
`docs/live-action-dispatch.md` retains earlier evidence only. Do not resume its
old greeting-only acceptance plan. Preserve runtimes/history and this unmerged
branch; no agent-paid voice trial is authorized. GitHub's application job could
not start because of account billing.

## Delivered milestone 5: GPT-Live voice

Elias accepted the body-control direction and requested direct audio interaction
through assistant-runtime's completed GPT-Live integration. Issue #11 tracks it.
This authorizes speech playback and supersedes the earlier body-only scope.

- Coordinate with the assistant-runtime agent and use its public voice contract.
- Preserve Charlie and the approved layout; add explicit live start/end,
  WebRTC microphone/speaker, transcripts, playback and connection feedback.
- Delegate avatar actions through the existing validated tools. Handle replay,
  cancellation and lost acknowledgements without repeating physical movement.
- Keep provider credentials in the runtime. Preserve existing text sessions when
  deploying a separate voice runtime. No microphone starts automatically.
- Test lifecycle failures, inspect the browser and trial real audio if configured
  access is available. Record external blockers and follow delivery through merge.
- Facial blend shapes and lip-sync remain later work. Movement guidance/skills
  are a future improvement, not a new fixed gesture menu.

## Delivered milestone 4: constrained body motion

Elias tested milestone 3 (PR #8) and requested leg and whole-body movement,
more natural hands, and reuse of open-source IK libraries. Issue #9 tracks it.

- Preserve the approved robot and application design.
- Use an upstream solver for arms and legs, with configured joint limits,
  persistent solver state, and bounded joint rotation rates.
- Expose feet, pelvis, torso, shoulders and head alongside hands and fingers
  through the existing continuous waypoint tool.
- Enforce practical self-collision, floor and static support checks. Return the
  actual pose and explain blocked targets; do not promise complete anatomy,
  dynamic balance, or that every allowed movement will look natural.
- Test the shipped skeleton across ordinary and adversarial targets, inspect
  live assistant-directed movement, document the library choice and limits,
  and follow issue/PR delivery through merge. Walking and facial work stay later.

## Delivered milestone 3: functional avatar app

Elias explicitly authorized the initial functional application after reviewing
procedural motion. Issue #7 tracks this work. This supersedes the earlier stops
before rigging, export, and the web app.

- Preserve the approved robot and `references/app-mock.png` layout.
- Export the rigid body rig as GLB and render it in the browser.
- Build Next.js with the same XState layering as design-studio: presentational
  components, hooks, domain machines, and independent library modules.
- Connect the existing assistant-runtime through its public host-tool contract.
  Let the assistant compose hand targets, finger curls, head angles and timing;
  solve motion each frame with reach limits and conservative wrist constraints.
- Deliver working typed conversations and browser microphone dictation first.
  Realtime voice, facial shapes, lip-sync, walking and full-body collision/balance
  remain later work. Use Three.js directly for this body-control iteration.
- Verify actual model-directed movement, interruption, input validation, and the
  production build. Follow the shared issue/PR delivery lifecycle through merge.

### Movement direction

Preserve the approved robot and app design. Expose frontend actions through
assistant-runtime so the assistant can express itself by setting movement
targets, hand/finger poses, gaze, and timing. Prefer runtime-generated motion
over selecting baked clips. The frontend should solve and smooth motion each
frame; the LLM chooses intent and parameters. Written responses remain part
of the existing design. Prebuilt motions are an acceptable fallback where
procedural motion becomes impractical. Facial shapes, speech playback and
lip-sync remain outside the current body-control milestone.

## Approved milestone 1: the character in Blender

Build the robot in `references/robot-turnaround.png` (front, side, back,
three-quarter) as a clean hard-surface model in Blender, lit and rendered
so that a still is hard to tell from the reference. `references/app-mock.png`
shows the framing and mood it will be presented in.

Done means:

1. `blender/robot/` — Python that builds the whole character from nothing,
   re-runnable, one entry point (`build()`), every part named, parts in
   collections (head, torso, arms, legs, details).
2. `blender/scene.blend` saved with the built character, studio lighting
   and a camera per reference view.
3. `renders/` — front, side, back, three-quarter at 1024 px matching the
   turnaround layout, plus one hero render framed like the app mock.
4. A short `NOTES.md` in `blender/`: what matched, what did not, what you
   would change with more budget.

This milestone was delivered in PR #2 and approved by Elias. Its geometry and
reference images remain the visual specification for rigging.

### What the reference shows

- Proportions: roughly 5.5 heads tall, large rounded helmet head, short
  neck, egg-shaped chest, narrow waist ring, wide rounded hips, thick
  segmented limbs, big rounded boot feet with a dark sole.
- Head: off-white shell, black glossy visor with rounded-rectangle outline,
  two vertical pill-shaped warm amber eyes (emissive, soft glow), a faint
  smile line under them, a small ring "ear" on each side with a dark
  centre.
- Body: off-white glossy shell panels with visible seam lines and subtle
  bevels; matte black joints and inner segments at neck, shoulders,
  elbows, wrists, waist, hips, knees, ankles; five-fingered black
  articulated hands with white fingertip caps.
- Chest mark: four terracotta dots in a diamond, centred, slightly left of
  the seam in the front view. Colour close to #C0664B.
- Materials: shell is glossy but not mirror (roughness ~0.25 with a coat
  layer), joints are near-matte rubber black, visor is dark smoked glass.
- Lighting and backdrop: soft studio light, warm cream backdrop
  (#F2EDE4-ish), soft contact shadow, no harsh highlights.

## How to work in Blender

Two paths exist; use them for what each is good at.

**Code in files, run through the bridge.** The character is code in
`blender/`, executed inside Blender with `scripts/bl run blender/robot/build.py`
(or whatever entry you make). The bridge is a plain CLI, so it works from
any runtime and costs no tool-definition tokens:

```bash
scripts/blender-up.sh          # start Blender with the bridge, idempotent
scripts/bl ping
scripts/bl run FILE…           # execute files in Blender; prints come back
scripts/bl exec 'code'         # small inline checks
scripts/bl scene | bl object NAME
scripts/bl shot .tmp/v.png --size 512      # viewport screenshot, then view the file
scripts/bl render renders/front.png --engine CYCLES --samples 128
```

**MCP, optional.** The same addon also serves the `blender-mcp` MCP server
(`uvx blender-mcp`). Adapters are checked in for runtimes that read one:
`.mcp.json` (Claude Code) and `.codex/config.toml` (Codex, needs the project
trusted). Use it if your runtime picks it up; do not depend on it. Codex has
not been observed reading the project-level file yet, so on Codex the CLI is
the path.

Rules that keep cost and quality in check:

- Code goes in files and gets committed. Never paste a large program
  through `exec`; write it, run it, fix it, rerun. `build()` must be safe
  to rerun: clear what it made (by collection), rebuild.
- Prefer `bpy.data` and `bmesh` over `bpy.ops`. Code runs from a timer on
  Blender's main thread with no active 3D view; ops that need a view need
  `bpy.context.temp_override(...)`, and many simply fail. The skill in
  `.agents/skills/blender-build/` has the recipes.
- Look before you tweak: screenshot at 512 px or less, compare with the
  reference, change one thing, look again. Do not screenshot after every
  line.
- Three passes without visible progress on a detail: write it in NOTES.md
  and move on. The whole is the deliverable.
- Renders: EEVEE while iterating, Cycles for the final four plus the hero.
- Never kill a Blender you did not start. If port 9876 is not listening
  and a Blender is already open, say so in a report instead of forcing it.
- Hyper3D Rodin (image-to-3D) is available through the addon only if a key
  is configured. None is. Build procedurally; do not go looking for keys.

## Repository

```
references/   the two source images; read them first, they are the spec
blender/      build code, scene.blend, NOTES.md
renders/      committed stills, 1024 px
exports/      later: GLB
scripts/      bl (bridge CLI), blender-up.sh, blender_boot.py
```

Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`), one per
meaningful step. Commit renders with the code that produced them.

## Reporting and budget

Report through the backbone at three points: first full-body blockout in
place, materials and lighting pass done, final renders committed. Include
one render link each time. Blockers go in the report, not in a loop.

This agent shares one weekly Codex allowance with the whole fleet. Keep
screenshots small, keep prints short, and stop at the milestone.
