# Motion: the rig, the solver and the tool

Charlie has no hand-keyframed animation clips. Every movement is a plan a
model wrote, *where* body parts should be and *when*, kept in the library
or composed on request; the app solves the joints every frame and refuses
poses the character cannot hold. This page covers the exported rig, the
solver libraries and what they enforce, and the movement tool the plans
are written for.

## The rig

`public/avatar/robot.glb` is exported from `blender/rigged.blend`: 65 bones
(a Mixamo standard skeleton fitted to the modelled shell), 134 rigid shell
panels parented to those bones, zero animation clips, about 17 MB. The
character is 5.56 Blender units tall; the app works in a space where one
unit is the robot's height, X is positive to the robot's left (viewer's
right), Y is up from the floor and Z points at the viewer.
`blender/README.md` describes how the model and the rig are reproduced.

Three.js renders the GLB directly (`lib/robot.ts`). `lib/body/rig.ts` maps
the shipped bone names to limb chains and gives each joint a rest-aligned
anatomical frame with bounds.

## The solver

Two open-source libraries, both Apache-2.0, no algorithm of our own:

- [closed-chain-ik-js](https://github.com/gkjohnson/closed-chain-ik-js) solves
  each limb with damped least squares, joint bounds, orientation goals and a
  rest-pose bias, warm-started from the previous frame so the elbow and knee
  settle into a consistent configuration. It is pinned to commit `97f388c`
  and imported through its core entry; `lib/body/chain.ts` holds the small
  axis-ID shim its ambient enum needs.
- [Rapier](https://rapier.rs) (`@dimforge/rapier3d-compat`) answers shape
  queries only, no simulation: capsule contacts between torso, head and
  limbs, boot-sole corners against the floor, and the weighted body centre
  against the convex hull of grounded soles (`lib/body/collision.ts`).

Each limb is its own chain; torso and pelvis move the chain roots. After
solving, `lib/motion.ts` rate-limits every angular degree of freedom
(2.1 rad/s with a velocity ramp in the default grounded mode), reprojects the
wrist into a 35° swing cone and ±0.6 rad roll (`lib/body/wrist.ts`), and
checks the frame. A rejected frame restores the previous accepted pose and
solver state; the receipt says which constraint blocked it. Elbows and knees
are one-way hinges, bone lengths are fixed, omitted feet stay planted in
world space.

These are presentation constraints, not anatomy or physics: capsules do not
cover every panel or finger, the support test is static, contacts are
checked per frame rather than swept, and nothing plans a path around an
obstacle. Walking with root travel, balance under momentum and facial
animation are outside this solver.

Alternatives looked at: Fullik (FABRIK, no rest-pose bias), Three.js
CCDIKSolver (would still need posture, support and collision around it) and
THREE.IK (self-described work in progress).

## The tool

The model composes `move_avatar` from numbers, never from gesture names:

- `waypoints`: 1–16 timed points (cumulative seconds, up to 20 s). Each may
  set hand positions, finger direction and curls, palm roll, ankle position,
  yaw and pitch, pelvis offset and yaw, torso bend, twist and lean, shoulder
  lift, and head yaw, nod and tilt. Omitted fields hold their previous
  target within a sequence; a new call starts from the actual pose.
- `prepare` and `finish`: one-off sequences before and after `repeat` cycles
  (1–20) of the waypoints, for clapping or running in place. The whole plan,
  after speed extension, must fit in 40 s plus 3 s of settling.
- `mode`: `grounded` (default) keeps standing support; `animated` allows
  flight poses and faster bounded rates (joints 8 rad/s) for stylised runs.
- `interpolation`: `ease` (quintic) or `swing` (cosine half-waves for
  rhythmic reversals).

Requested times are minimums: the solver stretches a segment that would
exceed a rate limit. `get_pose` returns the actual pose; `capture_avatar`
returns a small image of the canvas for the text assistant's `look_at_screen`.
Every call returns a receipt with the actual pose, elapsed cycles, and
whether it completed, was constrained, interrupted or reset. Invalid
arguments are a failed tool result, not an exception.

The same schema is what the text assistant receives in `host_context`
(`lib/host-tools.ts`), what the planner receives during a live call
(`lib/body-tools.ts`), and what the Dev panel edits by hand. The movement
guidance the models read is `profiles/skills/charlie-motion/SKILL.md`.

## Dev panel

**Dev test**, next to **Talk live**, runs any `move_avatar` JSON through the
same validator and controller with no model involved: examples (wave, clap,
run in place, kicking stance, return to rest), editable numbers, **Stop**,
**Read pose**, **Reset pose** (restores the initial rig and solver state
without reloading), **Capture avatar**, and a mouth-opening preview. Use it
to tune the solver from what you see rather than from a transcript.

## Tests

`bun run test` loads the shipped GLB and drives it through crouches, both
leg lifts, wrist reversals, blocked torso crossings and an unsupported lift,
checking every sampled frame for joint bounds and rates, wrist limits, floor
contact, collisions and support, plus malformed targets, interpolation,
replacement-motion continuity and reset. A deterministic runtime double
(`node tests/fixtures/runtime.mjs`, port 7111) exists for driving the
production renderer's tool loop in a browser without a model.
