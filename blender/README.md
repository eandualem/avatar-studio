# Charlie in Blender

Everything here is Python that rebuilds the character; the only binary
inputs kept in the repository are `rigged.blend` (the bound, exported scene,
source of `public/avatar/robot.glb`) and `mixamo/robot-rig.fbx` (the
skeleton Mixamo fitted to the shell, which cannot be regenerated offline).
Built with Blender 5.2 LTS, facing −Y with Z up, about 5.56 units tall.

## The bridge

Blender runs with the [blender-mcp](https://github.com/ahujasid/blender-mcp)
addon listening on port 9876, and `scripts/bl` sends Python to it:

```bash
scripts/blender-up.sh                 # start Blender with the bridge (idempotent)
scripts/bl ping
scripts/bl run FILE.py                # run a file inside Blender; prints come back
scripts/bl exec 'code'                # a one-liner
scripts/bl shot .tmp/view.png --size 512
scripts/bl render renders/hero.png --engine CYCLES --samples 128
```

Code runs on Blender's main thread with no active 3D view, so prefer
`bpy.data` and `bmesh` to `bpy.ops`; ops that need a view need
`bpy.context.temp_override(...)`. The same addon also serves an MCP server
(`.mcp.json`) for runtimes that read one.

## The model

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
portrait framing). `robot.pose.set_pose("hero" | "neutral")` applies the
raised-hand pose used in `renders/hero.png`. `scene.blend` is not tracked;
`build.py` writes it.

## The rig

The shell is rigid panels, so the rig parents each panel to a bone rather
than skinning a mesh. The skeleton came from Mixamo once:

```bash
scripts/bl run blender/rig/prepare.py     # one closed fitting proxy in a T-pose → exports/mixamo/robot-upload.fbx (untracked)
# upload to Mixamo, Standard Skeleton (65 bones), download FBX with skin → blender/mixamo/robot-rig.fbx
scripts/bl run blender/rig/bind.py        # parent the 134 panels to bones, save rigged.blend
scripts/bl run blender/rig/validate.py    # bone count, reach cases, deterministic reset, panel sizes
scripts/bl run blender/rig/export_web.py  # GLB + metadata into public/avatar/
```

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
