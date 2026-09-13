# Assistant-directed movement

Elias's direction (2026-09-13): preserve the approved robot and app design;
let the assistant express itself through frontend actions. Prefer composed,
parameterized movement over a fixed collection of animation clips. Written
responses remain available. Use prebuilt motions as a fallback where useful.

The current Blender proof establishes that the skeleton can reach a hand
target, orient the palm, curl each finger independently, and turn/nod its head.
The trajectory in the preview is supplied by Python, with zero baked actions.
The next application milestone should connect these capabilities to the
assistant's existing frontend-action interface.

The host exposes a small structured control surface: hand target and palm
direction, finger curls, gaze target, duration, and cancellation. The assistant
chooses goals and timing; a local motion controller advances them each frame,
solves joint positions, enforces motion limits, and reports accepted/completed/
cancelled state. A single owner per body region prevents competing gestures.
Starting a new movement should blend from the current pose. Speech can carry
timing cues; ordinary text responses should use the same tools.

This matches existing project contracts: design-studio declares host actions
in `lib/host-context.ts`; assistant-runtime accepts frontend tools as host
actions in `src/assistant_runtime/app/routes/agui.py`, with a tested tool-result
round trip in `tests/compatibility/test_agui.py`. No runtime changes were made
as part of this check. Transport choice should follow the final app architecture.

The renderer has relevant building blocks. [TalkingHead](https://github.com/met4citizen/TalkingHead)
documents gaze controls, custom bone poses/gestures, and an update callback
before rendering. [Three.js CCDIKSolver](https://threejs.org/docs/pages/CCDIKSolver.html)
provides target-based skeleton solving with joint limits. Those support a
custom procedural control layer; they do not establish natural whole-body
motion for this robot without further implementation and testing.

[MotionEngine](https://github.com/lhupyn/motion-engine) is an optional reference:
it supports layered body language and parameterized bone overlays, with an
LLM-facing motion layer. Much of its default interface selects named motions,
so adopting its catalog alone would not meet the request for arbitrary hand
targets. Evaluate its composition ideas alongside a small custom solver.

Elias clarified that the important freedom is to compose new movements, not
just choose named gestures. A generated `wave()` can still be procedural while
offering only a fixed vocabulary. The desired tool should accept body-relative
targets or waypoints, palm orientation, finger values, duration, and concurrent
head/body goals. The current demo authors those goals in Python; there is no
LLM motion planner, trajectory queue, or generic leg controller yet.

The motion controller should distinguish hard feasibility limits (joint ranges,
twist, reach, self-collision, and support contacts) from preferences (comfortable
posture, elbow placement, minimal change from the current pose, and smooth
speed/acceleration). Joint-valid endpoints alone do not guarantee a natural or
collision-free path. If a goal is infeasible, relax a permitted goal or report
the achievable result to the assistant; do not force the joints through it.
Keep a current pose and velocity when a request is interrupted. The Blender
demo's lower elbow preference and 35° wrist swing cone address one visible
artifact, not this complete constraint system.

Start with reachable upper-body gestures and interruption. Then tune elbow
poles, hand pivots, joint limits, shell collision handling, and motion timing
against live interaction. Walking needs foot placement, balance, and body
coordination; it can remain a later procedural controller or a blended-clip
fallback. GLB export, renderer integration, facial shapes, and voice remain
separate work after the Blender review.
