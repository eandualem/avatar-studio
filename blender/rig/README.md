# Mixamo body-motion review

The approved neutral model is `blender/scene.blend`.
The starter cube is now excluded from both the viewport and rendering.

Prepare the upload from that scene:

```bash
scripts/bl run blender/rig/prepare.py
```

This saves `blender/mixamo-ready.blend` and
`exports/mixamo/robot-upload.fbx`. The FBX contains one connected, closed
fitting surface, with spread fingers and no stage, camera, lights, or helpers.
The original shell panels remain separate in the Blender source. The proxy
omits face details and thin seams; it is only for skeleton fitting.

Upload that FBX to Mixamo, keep the front facing forward, and place the chin,
wrist, elbow, knee, and groin markers. Choose **Standard Skeleton (65)**.
After the review step, download **FBX Binary / Original Pose** with skin to
`blender/mixamo/robot-rig.fbx`. Check the actual bone count before proceeding:
Mixamo can return fewer finger chains even with the standard option selected.

The first narrow-finger upload returned 41 bones. The revised proxy uses wider
finger gaps and finer voxel resolution, and its downloaded skeleton has all
65 bones. Elias downloaded the file after Chrome blocked the automated
download. The file and preparation settings are recorded in
`blender/mixamo/source.json`.

From the prepared Blender scene, bind the approved shell geometry:

```bash
scripts/bl run blender/rig/bind.py
```

This saves `blender/rigged.blend`, with 134 rigid panels/details driven by the
Mixamo skeleton. The original editable model and fitting proxy are hidden.
The visible robot keeps its original materials. `blender/mixamo/bindings.json`
records which bone drives each panel. Repeating the binding replaces the
previous imported rig and panels and restores the studio's original alignment
before applying the new alignment.

The review now uses procedural targets following Elias's direction. Downloaded
animation clips are unnecessary for this proof.

```bash
scripts/bl run blender/rig/procedural.py
scripts/bl run blender/rig/validate.py
```

Play or scrub frames 1–181 in Blender to see a six-second hand raise, movement,
and return. Run `procedural.py` again after reopening the file: the saved scene
contains the review pose, and the script installs the live frame callback.
It uses zero animation actions/keyframes. Repeating the script replaces its
callback. No embedded Python is automatically executed when opening the file.

For an arbitrary pose, disable the demo and call the controls directly:

```python
bpy.context.scene['procedural_review_enabled'] = False
from rig.procedural import apply
apply(left=(1.65, -.35, 4.65), left_direction=(0, 0, 1),
      left_curl=(0, .2, .4, .6, .8), head_yaw=-.15)
```

Targets are in model world units (Z up, −Y forward); the character is 5.56 units
tall. Side names refer to the robot's left/right. The arm solver clamps targets
to the reachable distance, computes the elbow position, and aims the two arm
bones. Finger values independently control thumb/index/middle/ring/pinky from
0 to 1. Hand orientation and head yaw/nod are parameters. The demo composes
these controls with smooth target interpolation and a small lateral oscillation.
Its choreography is an authored example; the solver accepts other targets.

`validation.json` records five target cases, including an unreachable target,
independent finger curls, deterministic resetting, and preserved panel sizes.
Binding was rerun with stable counts: 134 visible parts, 249 mesh datablocks,
and one 65-bone armature. Sampled reach and panel-distance errors are below
0.000001 model units. The preview was inspected at rest, during the lift,
at the raised hand, and on return.

To reproduce the 512px preview:

```bash
scripts/bl run blender/rig/previews.py
ffmpeg -y -framerate 15 -i .tmp/procedural-frames/%04d.png -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart renders/rig/procedural-wave.mp4
```

This proves upper-body controls, not natural whole-body motion. Tight arm
targets can intersect the torso; extreme bends can expose gaps between rigid
shell pieces. Finger joint pivots still need refinement for close-up grasping.
There is no collision avoidance, balance or walking controller. Browser
integration, speech timing, and facial shapes remain later work. See
`blender/CONTROL-DIRECTION.md` for the frontend connection.
