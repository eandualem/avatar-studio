# Character review — 2026-09-13

The complete procedural character, five cameras, studio, and stills are ready
for visual review. This is a close design interpretation, not an indistinguishable
reproduction of the reference.

**Matched:** approximately 5.2 head-heights overall; broad ivory helmet and
rounded black visor; warm pill eyes and a faint smile; circular ear trims;
egg chest, small black waist, diagonal hip joints, segmented limbs, and boot
soles. The four terracotta dots follow the compact arrangement visible in the
image. Both hands have four segmented fingers plus a thumb, with ivory tips.
Fine seams follow the actual curved shell surfaces. The hero uses a raised
hand and gentle head tilt in a portrait frame.

**Still different:** the helmet/visor transition is shallower and squarer;
the chest and shin profiles are more regular; the finger links and boot heels
are simpler. The strict side camera overlaps the two legs more than the
reference. The hero hand gesture is approximate. Gloss reflections and the
cream backdrop are not a pixel match; the backdrop uses a camera-only lift
to keep its distant floor bright. Panel seams are surface hairlines rather
than separate removable panel boundaries.

**With more budget:** refine the helmet inset and chest silhouette against
overlaid views, sculpt more asymmetric finger/heel contours, and replace the
main hairlines with shallow recessed panel gaps. Tune the highlights after
Elias chooses the preferred silhouette.

**Verification:** two successive builds preserve part names and datablock
counts; 134 named parts in five collections; five cameras; ten fingers;
finite valid meshes; reversible static hero pose. Final images use Cycles,
128 samples, and denoising. No armature, blend shapes, animation, or export.

See [README.md](README.md) for rebuild, rendering, and verification commands.

## Body rig and procedural proof — milestone 2

Elias approved the visual design. The cube seen near the feet was the hidden-
from-render starter cube; it is now hidden in the viewport too.

The connected, spread-finger Mixamo proxy produced a verified 65-bone rig.
All 134 approved panels/details are rigidly bound with their original materials.
The editable neutral source remains separate. After the motion download failed,
Elias chose to explore assistant-controlled expression generated from targets.
The six-second preview raises and moves a hand through live arm solving, with
parameterized palm direction, independent finger curls, and head yaw/nod.
The rig has no baked animation actions or keyframes.

The motion is still deliberately simple: the body and feet remain planted,
and the demonstration supplies the trajectory. This is not yet live LLM control.
It demonstrates the controls that a frontend tool could operate. No collision
avoidance or whole-body balancing has been implemented. Extreme targets can
produce shell overlap or joint gaps, and finger pivots need a close-up pass
before gripping objects. Natural walking and speech-synchronized gestures
remain future work. The approved app design stays the same.

After Elias's movement review, lowered the elbow preference and limited wrist
swing relative to the forearm. The first lift requested about 96° of wrist
swing at its midpoint; the revised one stays within 35°. This improves the
specific raise while remaining a simple procedural demonstration, not a full
human joint or motion-planning model.
