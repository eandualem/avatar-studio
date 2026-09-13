# Mixamo body-motion review

Milestone 2 is in progress. The approved neutral model is `blender/scene.blend`.
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

The first narrow-finger upload returned 41 bones. A revised proxy has wider
finger gaps and finer voxel resolution. Its auto-rig finished, but Chrome
blocked that download; the revised skeleton has not yet been verified locally.

The remaining work is to bind the approved rigid parts to the complete
skeleton, import representative motions, and save a reviewed timeline and
previews. Facial shapes and app integration are outside this milestone.
