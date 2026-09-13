"""Bind the approved rigid shell parts to an imported Mixamo skeleton.

Run after downloading blender/mixamo/robot-rig.fbx from Mixamo with skin.
The auto-rigged proxy fits the skeleton; it is hidden in the review scene.
"""
import json
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from robot import parts
from rig.prepare import t_pose, remove_owned

ROOT = Path(parts.__file__).resolve().parents[2]
SOURCE = ROOT / 'blender' / 'mixamo'


def bone_for(name):
    if name.startswith('Head.'):
        return 'Head'
    if name.startswith('Torso.Neck'):
        return 'Neck'
    if name.startswith('Torso.Pelvis') or name.startswith('Torso.Waist lower'):
        return 'Hips'
    if name.startswith('Torso.Waist'):
        return 'Spine'
    if name.startswith(('Torso.', 'Detail.Chest')):
        return 'Spine2'
    if name.startswith('Arm.'):
        side = 'Left' if name.split('.')[1] == 'L' else 'Right'
        if 'Shoulder socket' in name:
            return side + 'Shoulder'
        if 'Shoulder' in name or 'Upper shell' in name:
            return side + 'Arm'
        if 'Elbow' in name or 'Forearm' in name:
            return side + 'ForeArm'
        if '.Finger.' in name:
            digit = ('Index', 'Middle', 'Ring', 'Pinky')[int(name.split('.')[3]) - 1]
            segment = 3 if 'fingertip' in name else 2 if ('Middle' in name or 'Hinge' in name) else 1
            return side + 'Hand' + digit + str(segment)
        if '.Thumb hinge.' in name:
            return side + 'HandThumb' + str(int(name.rsplit('.', 1)[1]) + 1)
        if '.Thumb.' in name:
            return side + 'HandThumb' + name.rsplit('.', 1)[1]
        return side + 'Hand'
    if name.startswith('Leg.'):
        side = 'Left' if name.split('.')[1] == 'L' else 'Right'
        if 'Hip' in name or 'Thigh' in name:
            return side + 'UpLeg'
        if 'Knee' in name or 'Shin' in name:
            return side + 'Leg'
        return side + 'Foot'
    raise ValueError('Unmapped robot part: ' + name)


def bounds(objects):
    points = [o.matrix_world @ Vector(corner) for o in objects for corner in o.bound_box]
    return Vector(tuple(min(p[i] for p in points) for i in range(3))), Vector(tuple(max(p[i] for p in points) for i in range(3)))


def import_fbx(path, collection):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True, automatic_bone_orientation=False)
    imported = set(bpy.data.objects) - before
    for obj in imported:
        for old_collection in list(obj.users_collection):
            old_collection.objects.unlink(obj)
        collection.objects.link(obj)
    bpy.context.view_layer.update()
    return imported


def bind(path=None):
    bpy.context.scene['procedural_review_enabled'] = False
    path = Path(path) if path else SOURCE / 'robot-rig.fbx'
    assert path.is_file(), 'Download the Mixamo rig with skin to ' + str(path)
    t_pose()
    assert bpy.data.objects.get('AvatarStudio_Mixamo'), 'Run rig/prepare.py first so the fitting reference exists'
    remove_owned('MixamoImport')
    remove_owned('RiggedRobot')
    imported_collection = bpy.data.collections.new('MixamoImport')
    bpy.context.scene.collection.children.link(imported_collection)
    output = bpy.data.collections.new('RiggedRobot')
    bpy.context.scene.collection.children.link(output)
    imported = import_fbx(path, imported_collection)
    rigs = [o for o in imported if o.type == 'ARMATURE']
    assert len(rigs) == 1, 'Expected one Mixamo skeleton'
    rig = rigs[0]
    rig.name = 'Robot.Rig'
    rig.show_in_front = True
    rig.data.display_type = 'STICK'
    rig.data.pose_position = 'REST'
    imported_meshes = [o for o in imported if o.type == 'MESH']
    assert imported_meshes, 'The base Mixamo download must include skin'
    bpy.context.view_layer.update()
    original_min, original_max = bounds([bpy.data.objects['AvatarStudio_Mixamo']])
    imported_min, imported_max = bounds(imported_meshes)
    ratios = [(imported_max[i] - imported_min[i]) / (original_max[i] - original_min[i]) for i in range(3)]
    scale = sum(ratios) / 3
    assert max(abs(r / scale - 1) for r in ratios) < .05, 'Imported fitting mesh has unexpected axis or proportion changes: ' + str(ratios)
    offset = (imported_min + imported_max) / 2 - scale * (original_min + original_max) / 2
    alignment = Matrix.Translation(offset) @ Matrix.Scale(scale, 4)
    graph = bpy.context.evaluated_depsgraph_get()
    bindings = {}
    for original in bpy.data.collections['Robot'].all_objects:
        requested = bone_for(original.name)
        candidates = [b.name for b in rig.data.bones if b.name == requested or b.name.endswith(':' + requested) or b.name == 'mixamorig' + requested]
        assert len(candidates) == 1, 'Missing or ambiguous bone: ' + requested
        bone_name = candidates[0]
        data = bpy.data.meshes.new_from_object(original.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
        data.name = 'Rigged.' + original.name
        data.transform(rig.matrix_world.inverted() @ alignment @ original.matrix_world)
        obj = bpy.data.objects.new('Rigged.' + original.name, data)
        output.objects.link(obj)
        obj.matrix_world = rig.matrix_world.copy()
        obj.parent = rig
        obj.matrix_parent_inverse = rig.matrix_world.inverted()
        group = obj.vertex_groups.new(name=bone_name)
        group.add(list(range(len(data.vertices))), 1, 'REPLACE')
        modifier = obj.modifiers.new('Rigid shell binding', 'ARMATURE')
        modifier.object = rig
        obj['source_part'] = original.name
        obj['bound_bone'] = bone_name
        bindings[original.name] = bone_name
    for obj in imported_meshes:
        obj.hide_render = True
        obj.hide_set(True)
    for name in ('Robot', 'MixamoUpload'):
        bpy.data.collections[name].hide_render = True
        bpy.data.collections[name].hide_viewport = True
    rig.data.pose_position = 'POSE'
    rig.animation_data_clear()
    # Store the original studio transform so binding is safe to rerun.
    for obj in bpy.data.collections['Studio'].all_objects:
        if 'rig_source_matrix' not in obj:
            obj['rig_source_matrix'] = [value for row in obj.matrix_world for value in row]
            if obj.type == 'CAMERA':
                obj['rig_source_ortho'] = obj.data.ortho_scale
            elif obj.type == 'LIGHT':
                obj['rig_source_energy'] = obj.data.energy
        values = obj['rig_source_matrix']
        original_matrix = Matrix([values[i:i + 4] for i in range(0, 16, 4)])
        obj.matrix_world = alignment @ original_matrix
        if obj.type == 'CAMERA':
            obj.data.ortho_scale = obj['rig_source_ortho'] * scale
        elif obj.type == 'LIGHT':
            obj.data.energy = obj['rig_source_energy'] * scale * scale
    bpy.context.scene.camera = bpy.data.objects['Cam.ThreeQuarter']
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    SOURCE.mkdir(parents=True, exist_ok=True)
    (SOURCE / 'bindings.json').write_text(json.dumps({'scale':scale,'offset':list(offset),'bones':len(rig.data.bones),'bindings':bindings}, indent=2) + '\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'blender' / 'rigged.blend'), compress=True)
    print('Bound', len(bindings), 'rigid panels/details to', len(rig.data.bones), 'Mixamo bones; alignment scale', scale)
    return rig


if globals().get('__name__') in (None, '__main__'):
    bind()
