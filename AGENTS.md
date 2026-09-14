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

## Current status (Elias, 2026-09-14)

Live interaction was accepted in PR #13; issue #11 is closed. Elias resumed work
on animation responsiveness and naturalness in issue #14. Add an opt-in Dev test
panel near Talk live for direct validated tool calls, editable numeric/JSON
waypoints, actual pose and timing/constraint feedback. Supply movement guidance
to the assistant and clarify concurrent speech/actions with assistant-runtime.
Preserve Charlie and the approved layout. Keep motion flexible rather than
introducing an agent gesture menu; tune the solver only from measured evidence.

Current workflow and verification are in `docs/motion-testing.md`. Backend motion
guidance travels in host context; the revised Live prompt requires a coordinated
voice-runtime reload before it takes effect. Preserve existing runtime histories.

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
