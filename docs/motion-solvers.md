# Constrained body motion

Charlie now reuses **closed-chain-ik** for joint solving and **Rapier** for shape
queries. The model still invents timed spatial targets; it does not select clips
or call named gesture functions. Application code maps the shipped skeleton to
those libraries and rejects poses outside the configured presentation limits.

## Why these libraries

[closed-chain-ik-js](https://github.com/gkjohnson/closed-chain-ik-js) provides
damped least-squares solving, joint bounds, orientation goals and rest-pose bias.
These fit the need to choose a consistent elbow/knee configuration while solving
feet in position and orientation. It is Apache-2.0 licensed. The dependency is
pinned to commit `97f388c01da85fb4b3f6832ca2dc3afb5a543b38`; it is an early library,
so upgrades need the actual-rig tests. We import its core entry because its root
package declares only a bundler module entry. Its ambient const-enum declaration
also needs the small axis-ID compatibility shim in `lib/body/chain.ts`.

The adapter uses a separate warm-started chain for each limb. Torso and pelvis
set the chain roots; this is not a single global posture optimizer. The solver
uses damping and a preferred pose, with SVD disabled following the upstream
warning. We add per-DoF rate limiting after solving and verify the resulting
pose before displaying it. There is no copied or newly written IK algorithm.

[Rapier](https://github.com/dimforge/rapier), also Apache-2.0, supplies capsule
contact and convex-hull point queries through `@dimforge/rapier3d-compat` 0.20.0.
Its [JavaScript scene-query documentation](https://rapier.rs/docs/user_guides/javascript/scene_queries/)
describes the geometric query facilities. This integration uses shape queries
without stepping a rigid-body simulation. The compat package embeds its WASM,
so the app needs no separate WASM download host or worker configuration.

Other evaluated options:

- [Fullik](https://github.com/lo-th/fullik) (MIT) provides FABRIK with ball and
  hinge constraints. It is a useful limb solver; DLS rest-pose bias and full foot
  orientation goals fit this iteration better.
- [Three.js CCDIKSolver](https://threejs.org/docs/pages/CCDIKSolver.html) (MIT)
  works directly with SkinnedMesh and supports rotation bounds. It would still
  need the posture, support and collision handling around it. The selected
  solver offers explicit rest-pose objectives and general joint configuration.
- [THREE.IK](https://github.com/jsantell/THREE.IK) (MIT) describes itself as work
  in progress, with ball constraints and alignment limitations. Its documented
  constraint surface is less suited to one-way knee and elbow hinges.

No IK library alone can guarantee natural human motion. It solves geometric
constraints; movement timing, joint coupling, contact, balance and the target
sequence also determine how a gesture looks.

## What is enforced

- Elbows and knees are one-way hinges. Shoulders, hips and ankles have bounded
  rotation axes. Bone lengths are fixed by the exported skeleton.
- Every solved angular DoF advances at most 2.1 radians/second. A velocity ramp
  softens changes, but acceleration and jerk are not strictly bounded at stops.
- Wrists have a 35-degree swing cone and ±0.6-radian roll in the forearm frame,
  reprojected after interpolation. Fingers use bounded per-segment curl angles.
- Head, torso, shoulders and pelvis have validated workspaces and rate limits.
  Feet remain at their previous world targets unless the model changes them.
- Rapier checks torso/head versus arm capsules, opposite-side limb capsules,
  and an approximate weighted body center over grounded sole footprints.
  Boot sole corners cannot go below the floor tolerance of 0.004 avatar heights.
- A failed contact/support candidate restores the preceding pose and solver
  state. The execution receipt gives the actual pose and constraint reasons.
  A blocked path needs different targets; no automatic obstacle detour is built.

The tests load the **actual shipped GLB**, then check every sampled frame of a
crouch, standing recovery, both leg lifts, a hand raise and wrist reversal,
torso/shoulder/head changes, an unsupported lift, and a torso crossing. They
assert configured joint and wrist bounds, joint step limits, valid floor/support
conditions, and safe recovery after rejected poses.

## Practical limits and next improvements

The robot's shell proportions differ from human anatomy. Our capsule proxies
do not cover thighs, every same-side limb contact, individual fingers, or exact
mesh contact. The weighted center is a static heuristic, not a measured center
of mass, and the support hull does not model momentum or friction. Contacts
are checked at animation frames, not as continuous swept volumes. Some accepted
poses can still look awkward or intersect unmodelled parts; a rejected frame can
stop abruptly. Those are limits of this version, not guarantees of the solver.

The strongest next improvements are tuning the anatomical frames and preferred
postures against observed gestures, adding accurate collision proxies, and
coupling shoulder motion and forearm pronation. Walking would need a separate
contact-aware locomotion/balance controller. The existing rigid boots do not
support visible individual toe movement. Face and lip animation need the
planned blend shapes and are outside body IK.
