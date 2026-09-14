---
name: charlie-motion
description: Compose responsive, expressive body movement for Charlie using Avatar Studio's continuous waypoint tools and actual pose feedback.
---

# Move Charlie

Use the current host pose, landmarks and action schema. They are more specific
than these examples. This guide provides starting points, not a fixed gesture
menu or a promise of optimal timing from every starting pose.

For a clear simple request, compose one `move_avatar` call promptly. Current
pose is already in host context; use `get_pose` only if it is stale or ambiguous.
Combine intended hand, finger and head changes in the same sequence. Avoid a
separate backend round trip for each joint or waypoint. Leave unrelated channels
omitted. Keep ordinary conversation concise and omit technical coordinates.

Visual feedback is available when the host reports a screenshot. `look_at_screen`
reads the attached avatar-only image; it does not take a fresh picture itself.
When asked to look, or to judge/improve an unfamiliar pose, first call
`capture_avatar`, then `look_at_screen` on the continuation. Movement continuations
also include a fresh image. Judge the silhouette and visible joint arrangement,
not just the numeric receipt. If capture failed, say so rather than inventing
what the image shows. The image is the current avatar camera, never the chat or
desktop; a frontal view can foreshorten a forward kick. In a voice conversation
this inspection happens in the delegated backend, not directly in the voice model.

Times are cumulative seconds from this call's start, not per-waypoint durations.
Each segment eases to zero velocity at its end. Too many tiny waypoints introduce
visible stops; choose a few meaningful targets. The frontend may extend timing
to enforce speed limits, so requesting 0.2 seconds cannot force a full arm raise
to finish that quickly. Use smaller excursions for a brisk gesture.

Requested timings below are one third of the original examples, per Elias’s
browser testing. They do not change the solver’s speed limits.

Starting points from standing (height = 1, X robot left, Y up, Z forward):

- Head glance: `{time:0.2, head:{yaw:0.2,nod:0,tilt:0}}`, then return head to
  zero at 0.4s. Request 0.2s per segment; actual timing may be extended.
- Raise left hand: at 0.6s, position `[0.29,0.83,0.09]`, direction `[0,1,0]`,
  curls `[0,0,0,0,0]`, roll `0`. Mirroring X gives a right-hand candidate.
  A full raise from rest requires about 1.7s under Cartesian speed limits,
  and the actual joints may need longer. Direction is wrist-to-fingers, not
  the palm normal; avoid large direction reversals or extreme roll.
- Wave after raising: move that hand's X to 0.32 at 0.7333s, 0.27 at 0.8667s, and
  0.30 at 1.0s, holding Y/Z. These small arcs are tunable examples. Return
  toward the supplied rest pose only if it fits the request; lowering the
  whole arm adds another reach and delays the receipt.
- Point: curls `[0.65,0,0.85,0.85,0.85]`, ordered thumb/index/middle/ring/pinky.
  Curl 0 opens, 1 closes. Request 0.3333s for the finger change; speed limits can extend it.
- Shallow crouch: request 0.5s, pelvis `{offset:[0,-0.07,-0.055],yaw:0}` and
  torso `{bend:0.2,twist:0,lean:0}` with feet held planted. For a leg lift,
  first shift hips toward the planted foot and inspect the resulting support.
- Kicking stance from reset: at 0.5s set pelvis offset `[0.1,-0.02,-0.03]`,
  pelvis yaw `-0.35`, torso `{bend:-0.12,twist:0.15,lean:0}`, left hand position
  `[0.42,0.69,0.07]` with direction `[1,0,0]`, right hand `[-0.23,0.64,0.16]`.
  Keep the left foot planted. At 1.0s set right ankle `[-0.05,0.26,0.15]`,
  yaw `-0.3`, pitch `-0.3`; at 1.5s extend it toward `[-0.28,0.42,0.28]`,
  yaw `-0.3`, pitch `-0.4`. This holds a supported diagonal forward kick with an
  outstretched arm. Some foot orientation/reach and wrist requests are limited;
  inspect the actual result and fresh image before describing its quality.

Reach limits, one-way elbow/knee hinges, wrist limits, collision checks and
static support remain active. A blocked frame can stop several channels
together. Change the path or reduce the reach instead of resending a blocked
target. This rig does not support dynamic walking, jumping or lip-sync.

Read the receipt's actual pose, `constrained`, `reasons` and `timing`.
`completed` means execution ended, not that every target was reached.
Distinguish speed extension from collision/support rejection and unsettled
targets. `timing.segments` names the channels imposing minimum durations. A
fingers-down to fingers-up direction change alone takes about 1.96s under the
planner, so a full raised-hand request of 0.6s or 0.2s can run identically. These
are requested durations, not overrides of speed limits. Up to three extra
seconds can be spent settling. Confirm what happened
only after the receipt; never repeat a physical action because an acknowledgement
was slow. Voice can continue during movement, but speech alone does not prove
that a motion ran.
