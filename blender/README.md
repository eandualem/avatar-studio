# Robot character

Built and verified in Blender 5.2.1 LTS, facing −Y with Z up. One unit is an
arbitrary modeling unit; the character is about 5.56 units tall.

```bash
scripts/bl ping
scripts/bl run blender/robot/build.py
scripts/bl run blender/validate.py
scripts/bl run blender/robot/render.py
uv run blender/compose_turnaround.py
```

`robot.build.build()` replaces only the `Robot` and `Studio` collections.
Other top-level collections are preserved and excluded from rendering.
The builder saves `blender/scene.blend`; rendering saves it again with final
Cycles settings, the neutral pose, and `Cam.Front` active.

The five camera names are `Cam.Front`, `Cam.Side`, `Cam.Back`,
`Cam.ThreeQuarter`, and `Cam.Hero`. The four turnaround masters are 1024×1024;
the hero is 768×1024, with the portrait framing of the app reference. The
2048×1024 contact sheet crops the empty sides of the masters and adds labels.

To render only one view:

```bash
scripts/bl exec 'from robot.render import render_view; render_view("hero")'
```

`robot.pose.set_pose("hero")` applies static object transforms for the raised
hand and head tilt. `set_pose("neutral")` restores the original transforms.
That modeling scene has no armature or animation. Each finger segment, joint, shell panel,
face element and detail has a readable name and belongs to one collection.

Geometry uses mesh data and bmesh, with subdivision on lofted shells and thin
solid visor surfaces. Hairlines are curves projected onto evaluated surfaces.
The studio uses four area lights and a cream ground with a camera-only lift
at its far end; the lift brightens the backdrop without illuminating the model.

`validate.py` checks rebuild stability, collection structure, mesh validity,
finger counts, camera counts, and neutral/hero transform restoration. It
rebuilds the scene, so run it before the final render batch.

The approved model now also has a separate Mixamo rig and a target-driven
movement proof in `rigged.blend`. See [rig/README.md](rig/README.md) for the
live procedural controls, reproduction commands, preview, and limitations.
