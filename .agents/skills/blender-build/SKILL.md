---
name: blender-build
description: Build hard-surface characters in Blender from Python through the avatar-studio bridge; recipes for bpy.data-first modelling, materials, studio lighting, cameras and renders that work without an active 3D view.
---

# Building in Blender through the bridge

Code is executed by the addon on Blender's main thread from a timer. There
is no active 3D viewport in that context, so treat `bpy.ops` as suspect and
`bpy.data` / `bmesh` as the default. Everything below is known to work that way.

## Module layout and reload

```python
# blender/robot/build.py — entry point run with: scripts/bl run blender/robot/build.py
import importlib, sys
import robot.parts, robot.materials, robot.stage   # blender/ is on sys.path
for m in (robot.parts, robot.materials, robot.stage):
    importlib.reload(m)
robot.stage.clear("Robot")        # remove what a previous run made
robot.parts.build()
robot.materials.apply()
robot.stage.setup()
print("built", len(bpy.data.collections["Robot"].all_objects), "objects")
```

`clear()` deletes every object in the collection and the collection, then
orphans (`bpy.data.orphans_purge(do_recursive=True)`). Never
`bpy.ops.wm.read_homefile` from the bridge.

## Geometry without ops

```python
import bpy, bmesh
from mathutils import Vector

def mesh_object(name, bm, collection):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    return ob

def sphere(name, radius, location, col, segments=48, rings=24):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    ob = mesh_object(name, bm, col); ob.location = location
    return ob

def capsule(name, radius, length, location, col):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=radius)
    top = [v for v in bm.verts if v.co.z > 1e-6]; bot = [v for v in bm.verts if v.co.z < -1e-6]
    for v in top: v.co.z += length / 2
    for v in bot: v.co.z -= length / 2
    ob = mesh_object(name, bm, col); ob.location = location
    return ob

def cylinder(name, radius, depth, location, col, segments=48):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=depth)
    ob = mesh_object(name, bm, col); ob.location = location
    return ob
```

Rounded shells (head, chest, hips): start from a cube or sphere, scale
non-uniformly, then `Subdivision` (levels 2, render 3) + `Bevel`
(width 0.01–0.02, segments 3, `harden_normals=True`) + smooth shading:

```python
def smooth(ob):
    for p in ob.data.polygons: p.use_smooth = True
def shell_modifiers(ob, bevel=0.015):
    b = ob.modifiers.new("Bevel", 'BEVEL'); b.width = bevel; b.segments = 3; b.harden_normals = True
    s = ob.modifiers.new("Subdiv", 'SUBSURF'); s.levels = 2; s.render_levels = 3
```

Mirror the limbs: build the left side, add `Mirror` modifier on X with a
shared empty at the origin as `mirror_object`, or duplicate the data
(`ob.copy()`; `ob.data = ob.data.copy()`; scale x = -1).

Seam lines on shells: a thin black inset object (a scaled copy with
solidify) or a `Boolean` difference with thin cylinders; simplest that
reads at 1024 px wins.

Parenting: `child.parent = parent; child.matrix_parent_inverse = parent.matrix_world.inverted()`.

## Materials

```python
def principled(name, base, rough, coat=0.0, metallic=0.0, emission=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = m.node_tree.nodes["Principled BSDF"]
    n.inputs["Base Color"].default_value = (*base, 1)
    n.inputs["Roughness"].default_value = rough
    n.inputs["Metallic"].default_value = metallic
    n.inputs["Coat Weight"].default_value = coat
    if emission:
        n.inputs["Emission Color"].default_value = (*emission, 1)
        n.inputs["Emission Strength"].default_value = strength
    n.inputs["Alpha"].default_value = alpha
    return m

SHELL  = principled("Shell",  (0.93, 0.91, 0.87), 0.25, coat=0.6)
JOINT  = principled("Joint",  (0.03, 0.03, 0.03), 0.7)
VISOR  = principled("Visor",  (0.01, 0.01, 0.012), 0.08, coat=1.0)
EYE    = principled("Eye",    (1.0, 0.8, 0.45), 0.4, emission=(1.0, 0.72, 0.35), strength=6.0)
MARK   = principled("Mark",   (0.75, 0.40, 0.29), 0.5)
ob.data.materials.append(SHELL)
```

Colours are linear; sRGB hex must be converted (`((c/255)**2.2)` is close enough).

## Stage: backdrop, lights, cameras

```python
def stage_setup(col):
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world; world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.82, 0.75, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    # cyclorama: a plane with a curved back wall; simplest is a big plane + a large soft area light
    def area(name, loc, rot, size, energy, color=(1, 0.97, 0.92)):
        l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
        ob = bpy.data.objects.new(name, l); ob.location = loc; ob.rotation_euler = rot
        col.objects.link(ob); return ob
    area("Key",  (2.5, -2.5, 3.0), (0.9, 0.0, 0.8), 3.0, 600)
    area("Fill", (-3.0, -2.0, 2.0), (1.1, 0.0, -0.9), 4.0, 250)
    area("Rim",  (0.0, 3.0, 2.5), (-1.0, 0.0, 0.0), 2.0, 300)

def camera(name, loc, rot, col, lens=85):
    c = bpy.data.cameras.new(name); c.lens = lens
    ob = bpy.data.objects.new(name, c); ob.location = loc; ob.rotation_euler = rot
    col.objects.link(ob); return ob
# Turnaround: character ~1.8 units tall centred at origin; cameras at z≈0.9, distance ≈ 4.5, lens 85.
# front (0,-4.5,0.9) rot (90°,0,0); side (4.5,0,0.9) rot (90°,0,90°); back (0,4.5,0.9) rot (90°,0,180°)
# three-quarter (3.2,-3.2,0.9) rot (90°,0,45°). Set bpy.context.scene.camera before render.
```

Shadow softness comes from light size, not energy. Contact shadow: a
ground plane with the shell material at roughness 0.6, or Cycles + a
shadow catcher (`ob.is_shadow_catcher = True`) if the backdrop is composited.

## Rendering and looking

- Iterate: `scripts/bl shot .tmp/v.png --size 512` for the viewport, or
  `scripts/bl render .tmp/r.png --engine EEVEE --size 512` for lit checks.
- Final: `scripts/bl render renders/front.png --engine CYCLES --size 1024 --samples 128`
  with `scene.cycles.use_denoising = True`, `scene.view_settings.view_transform = 'AgX'`.
- Switch camera before each view: `bpy.context.scene.camera = bpy.data.objects["Cam.Front"]`.
- Viewport shading for screenshots: set `space.shading.type = 'MATERIAL'` on
  the VIEW_3D area once (`for a in bpy.context.screen.areas: ...`).

## Saving

`bpy.ops.wm.save_as_mainfile(filepath="/abs/path/blender/scene.blend")` works
from the bridge. Use absolute paths everywhere; Blender's cwd is not the repo.

## Known pitfalls

- `bpy.ops.object.*` needs selection and an active object; set
  `bpy.context.view_layer.objects.active = ob; ob.select_set(True)` and wrap
  with `bpy.context.temp_override(object=ob, selected_objects=[ob])` if you must.
- `bpy.ops.mesh.*` needs edit mode and a view; use bmesh instead.
- Long renders block Blender; `BL_TIMEOUT` governs the client side.
- The bridge returns printed stdout only. Exceptions come back as the
  error message; print intermediate facts sparingly.
