"""Meaningful scene QA, run inside Blender through scripts/bl run."""
import math
import bpy
from robot.build import build
from robot.pose import set_pose


def signature():
    return {
        'objects': len(bpy.data.objects),
        'meshes': len(bpy.data.meshes),
        'curves': len(bpy.data.curves),
        'materials': len(bpy.data.materials),
        'cameras': len(bpy.data.cameras),
        'lights': len(bpy.data.lights),
        'names': sorted(o.name for o in bpy.data.collections['Robot'].all_objects),
    }


build(save=False)
before = signature()
build(save=False)
assert signature() == before, 'Rebuild leaked datablocks or changed part names'
robot = bpy.data.collections['Robot']
assert {c.name for c in robot.children} == {'head', 'torso', 'arms', 'legs', 'details'}
assert len([o for o in bpy.data.collections['Studio'].objects if o.type == 'CAMERA']) == 5
assert not any(o.type == 'ARMATURE' for o in robot.all_objects)
assert not any(o.data.shape_keys for o in robot.all_objects if o.type == 'MESH')
for obj in robot.all_objects:
    assert len(obj.users_collection) == 1, obj.name
    if obj.type == 'MESH':
        assert obj.data.materials and obj.data.polygons, obj.name
        assert all(math.isfinite(v) for p in obj.data.vertices for v in p.co), obj.name
        assert not obj.data.validate(), 'Invalid geometry: ' + obj.name
for side in ('L', 'R'):
    caps = [o for o in robot.all_objects if o.name.startswith(f'Arm.{side}.Finger.') and 'Ivory fingertip' in o.name]
    assert len(caps) == 4
    assert bpy.data.objects.get(f'Arm.{side}.Thumb.3')
set_pose('neutral')
neutral = {o.name: o.matrix_world.copy() for o in robot.all_objects}
set_pose('hero')
assert any((o.matrix_world.translation - neutral[o.name].translation).length > .1 for o in robot.all_objects)
set_pose('neutral')
assert all(max(abs(o.matrix_world[i][j] - neutral[o.name][i][j]) for i in range(4) for j in range(4)) < 1e-6 for o in robot.all_objects)
print('PASS: two clean rebuilds;', len(robot.all_objects), 'named parts; five cameras; ten fingers; reversible hero pose; finite valid meshes; no rig or shapes.')
