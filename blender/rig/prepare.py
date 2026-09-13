"""Prepare a connected Mixamo proxy from the approved robot.

Run: scripts/bl run blender/rig/prepare.py
Only the single proxy mesh goes into the FBX; no studio or starter objects.
"""
import importlib
import json
import math
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector
from robot import pose, parts

ROOT = Path(parts.__file__).resolve().parents[2]
DEST = ROOT / 'exports' / 'mixamo'


def t_pose():
    bpy.data.collections['Robot'].hide_viewport = False
    bpy.data.collections['Robot'].hide_render = False
    importlib.reload(pose)
    pose.set_pose('neutral')
    shoulder_angle = math.atan2(-.755, .423)
    forearm_angle = math.atan2(-.829, .168) - shoulder_angle
    for obj in bpy.data.collections['Robot'].all_objects:
        for side, sign in [('L', 1), ('R', -1)]:
            if not obj.name.startswith(f'Arm.{side}.') or 'Shoulder' in obj.name:
                continue
            if '.Finger.' in obj.name:
                index = int(obj.name.split('.')[3]) - 1
                y = (-.112, -.038, .038, .112)[index]
                angle = math.radians((-28, -9, 9, 28)[index])
                pose.rotate(obj, (sign * 1.252, y, 2.163), angle, 'X')
            elif '.Thumb' in obj.name:
                pose.rotate(obj, (sign * (1.252 - .078), -.116, 2.34), math.radians(-25), 'X')
            if any(word in obj.name for word in ('.Forearm', '.Wrist', '.Hand', '.Finger', '.Thumb')):
                pose.rotate(obj, (sign * 1.083, -.010, 3.289), sign * forearm_angle, 'Y')
            pose.rotate(obj, (sign * .660, .020, 4.044), sign * shoulder_angle, 'Y')
    bpy.context.view_layer.update()


def remove_owned(name):
    collection = bpy.data.collections.get(name)
    if collection:
        for obj in list(collection.all_objects):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data and data.users == 0 and isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif data and data.users == 0 and isinstance(data, bpy.types.Armature):
                bpy.data.armatures.remove(data)
        bpy.data.collections.remove(collection)


def prepare():
    bpy.context.scene['procedural_review_enabled'] = False
    if 'Robot' not in bpy.data.collections:
        from robot.build import build
        build(save=False)
    t_pose()
    remove_owned('MixamoImport')
    remove_owned('RiggedRobot')
    remove_owned('MixamoUpload')
    col = bpy.data.collections.new('MixamoUpload')
    bpy.context.scene.collection.children.link(col)
    graph = bpy.context.evaluated_depsgraph_get()
    vertices, faces = [], []
    skip = ('Visor', 'visor', 'Eye.', 'Faint smile', 'Amber ring', 'Panel seam',
            'panel seam', 'seam', 'emblem', 'division', 'channel')
    for obj in bpy.data.collections['Robot'].all_objects:
        if obj.type != 'MESH' or any(word in obj.name for word in skip):
            continue
        evaluated = obj.evaluated_get(graph)
        data = evaluated.to_mesh()
        offset = len(vertices)
        vertices.extend(tuple(obj.matrix_world @ p.co) for p in data.vertices)
        faces.extend(tuple(offset + i for i in p.vertices) for p in data.polygons)
        evaluated.to_mesh_clear()
    mesh = bpy.data.meshes.new('Mixamo.Proxy.input')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    proxy = bpy.data.objects.new('AvatarStudio_Mixamo', mesh)
    col.objects.link(proxy)
    proxy.data.materials.append(bpy.data.materials['Robot.Porcelain'])
    remesh = proxy.modifiers.new('Connected auto-rig surface', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = .012
    remesh.use_smooth_shade = True
    bpy.context.view_layer.update()
    connected = bpy.data.meshes.new_from_object(proxy.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    proxy.modifiers.clear()
    proxy.data = connected
    bpy.data.meshes.remove(mesh)
    bm = bmesh.new()
    bm.from_mesh(connected)
    remaining = set(bm.verts)
    components = []
    while remaining:
        seed = remaining.pop()
        component, frontier = {seed}, [seed]
        while frontier:
            v = frontier.pop()
            for edge in v.link_edges:
                other = edge.other_vert(v)
                if other in remaining:
                    remaining.remove(other)
                    component.add(other)
                    frontier.append(other)
        components.append(component)
    components.sort(key=len, reverse=True)
    counts = [len(component) for component in components]
    print('Proxy connected components:', counts[:8])
    assert len(components[0]) / len(bm.verts) > .95, 'A major body section is detached; repair the proxy before upload'
    extras = [v for component in components[1:] for v in component]
    if extras:
        bmesh.ops.delete(bm, geom=extras, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), 'Proxy must be a closed manifold'
    bm.to_mesh(connected)
    bm.free()
    for polygon in connected.polygons:
        polygon.use_smooth = True
    smooth = proxy.modifiers.new('Proxy surface smoothing', 'SMOOTH')
    smooth.factor, smooth.iterations = .7, 3
    DEST.mkdir(parents=True, exist_ok=True)
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)
    proxy.select_set(True)
    bpy.context.view_layer.objects.active = proxy
    with bpy.context.temp_override(object=proxy, active_object=proxy, selected_objects=[proxy]):
        bpy.ops.export_scene.fbx(filepath=str(DEST / 'robot-upload.fbx'),
                                 use_selection=True, object_types={'MESH'},
                                 use_mesh_modifiers=True, add_leaf_bones=False,
                                 bake_anim=False, axis_forward='-Z', axis_up='Y')
    metadata = {'vertex_count': len(connected.vertices), 'faces': len(connected.polygons),
                'connected_components_before_cleanup': counts,
                'height': 5.56, 'shoulder': [.660, .020, 4.044],
                'elbow_tpose': [1.525, -.010, 4.044],
                'wrist_tpose': [2.371, -.015, 4.044],
                'knee': [.514, -.014, 1.635], 'groin': [0, 0, 2.540],
                'purpose': 'Connected fitting proxy; approved shell parts are rebound after Mixamo.'}
    (DEST / 'upload.json').write_text(json.dumps(metadata, indent=2) + '\n')
    proxy.hide_set(True)
    col.hide_render = True
    bpy.context.scene.camera = bpy.data.objects['Cam.Front']
    bpy.context.scene.camera.data.ortho_scale = 7.4
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'blender' / 'mixamo-ready.blend'), compress=True)
    print('Prepared', len(connected.vertices), 'vertices;', DEST / 'robot-upload.fbx')
    return proxy


if globals().get('__name__') in (None, '__main__'):
    prepare()
