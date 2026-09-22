# Charlie in Blender

Use this guide to edit the character, rebuild its shell or export it for the
web app. Running Avatar Studio itself needs only the shipped GLB.

The Python scripts rebuild the character; the only binary
inputs kept in the repository are `rigged.blend` (the bound, exported scene,
source of `public/avatar/robot.glb`) and `mixamo/robot-rig.fbx` (the
skeleton Mixamo fitted to the shell, which cannot be regenerated offline).
Built with Blender 5.2 LTS, facing −Y with Z up, about 5.56 units tall.

## The bridge

Run commands from the repository root. Install Blender 5.2 LTS, Python 3.10+
and [uv](https://docs.astral.sh/uv/). The launcher uses Bash and `lsof`, and
defaults to `/Applications/Blender.app/Contents/MacOS/Blender` on macOS; set
`BLENDER_BIN` to your Blender executable on another installation.

The `blender-mcp` addon listens on port 9876, and `scripts/bl` sends Python
to it. Install the addon before launching the bridge:

```bash
uvx blender-mcp install-addon
scripts/blender-up.sh blender/rigged.blend
scripts/bl ping
scripts/bl scene
scripts/bl shot .tmp/view.png --size 512
```

If a bridge is already listening, the launcher leaves its current scene
open; open `blender/rigged.blend` in that Blender instance before exporting
the shipped rig. Inspect the ping/scene output before running scripts.
`scripts/bl --help` lists file execution, inline Python and render commands.

Code runs on Blender's main thread with no active 3D view, so prefer
`bpy.data` and `bmesh` to `bpy.ops`; ops that need a view need
`bpy.context.temp_override(...)`. The MCP client configuration in
`.mcp.json` connects to the same bridge through the `blender-mcp` command.

## Rebuild the shell and still renders

The following sequence rebuilds the model collections and writes
`blender/scene.blend` and the rendered images. Save any edits you need before
running it. The render script preserves each camera’s intended dimensions.

```bash
scripts/bl run blender/robot/build.py     # rebuilds the Robot and Studio collections, saves scene.blend
scripts/bl run blender/validate.py        # rebuild stability, collections, mesh validity, finger and camera counts
scripts/bl run blender/robot/render.py    # Cycles stills from the five cameras into renders/
uv run blender/compose_turnaround.py      # the 2048×1024 contact sheet
```

`robot.build.build()` is re-runnable: it replaces only its own collections.
Every panel, joint, finger segment and face element has a readable name and
belongs to one of head, torso, arms, legs or details. Materials: a glossy
off-white shell with a coat layer, near-matte rubber joints, smoked-glass
visor, emissive amber eyes, four terracotta chest dots. The studio is four
area lights over a cream backdrop. Cameras are `Cam.Front`, `Cam.Side`,
`Cam.Back`, `Cam.ThreeQuarter` (1024²) and `Cam.Hero` (768×1024, the app's
portrait framing). `robot.pose.set_pose("hero")` applies the raised-hand pose used
in `renders/hero.png`; `set_pose("neutral")` restores the neutral pose.
`scene.blend` is not tracked; `build.py` writes it.

## Export or rebuild the rig

To export the existing rig, open the shipped `blender/rigged.blend` with the
bridge as above, then run:

```bash
scripts/bl run blender/rig/validate.py
scripts/bl run blender/rig/export_web.py
```

The export overwrites `public/avatar/robot.glb` and `robot.json`. It uses the
open scene’s saved path to locate the repository, so export from
`blender/rigged.blend`, not an unsaved or relocated scene.

The shell consists of rigid panels attached to bones rather than a deforming
skin. To rebuild the binding with the included Mixamo skeleton:

```bash
scripts/bl run blender/robot/build.py
scripts/bl run blender/rig/prepare.py     # create the fitting proxy and exports/mixamo/robot-upload.fbx
scripts/bl run blender/rig/bind.py        # use the included robot-rig.fbx, save rigged.blend
scripts/bl run blender/rig/validate.py
scripts/bl run blender/rig/export_web.py
```

The included skeleton fits the shipped shell. If you change its proportions,
upload the generated fitting proxy to Mixamo, select Standard Skeleton
(65 bones), and download FBX Binary with skin in Original Pose to
`blender/mixamo/robot-rig.fbx` before binding. That step requires Mixamo access;
rebuilding the unchanged rig does not.

`mixamo/bindings.json` records which bone drives each panel; `source.json`
and `validation.json` record the upload settings and the checked cases.
`rig/procedural.py` is the original in-Blender proof that Python targets
(hand position, palm direction, finger curls, head yaw and nod) can drive
the skeleton without keyframes; the browser solver in `lib/body/` supersedes
it and is documented in [docs/motion.md](../docs/motion.md).

## Limits

The character is a close interpretation of its reference, not a
reproduction: the helmet-to-visor transition is squarer, the finger links
and boot heels simpler. The rigid panels can show gaps at extreme bends,
finger pivots are coarse for close-ups, and there are no facial blend
shapes yet.
