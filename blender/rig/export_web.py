"""Export only the approved skinned robot in rest pose for the browser."""
import json
from pathlib import Path
import bpy
from mathutils import Matrix


def export():
    root = Path(bpy.data.filepath).parent.parent
    dest = root / 'public' / 'avatar'
    dest.mkdir(parents=True, exist_ok=True)
    rig = bpy.data.objects['Robot.Rig']
    scene = bpy.context.scene
    enabled = scene.get('procedural_review_enabled', False)
    selected = list(bpy.context.selected_objects)
    active = bpy.context.view_layer.objects.active
    matrices = {b.name: b.matrix_basis.copy() for b in rig.pose.bones}
    previous_position = rig.data.pose_position
    try:
        scene['procedural_review_enabled'] = False
        rig.data.pose_position = 'REST'
        for b in rig.pose.bones:
            b.matrix_basis = Matrix.Identity(4)
        for obj in bpy.context.selected_objects:
            obj.select_set(False)
        meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig and not o.hide_render]
        for obj in [rig] + meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = rig
        bpy.context.view_layer.update()
        bpy.ops.export_scene.gltf(filepath=str(dest / 'robot.glb'), export_format='GLB',
            use_selection=True, export_animations=False, export_skins=True,
            export_rest_position_armature=True, export_yup=True)
        info = {'bones': len(rig.data.bones), 'meshes': len(meshes), 'animation_clips': 0,
                'height_blender_units': 5.56, 'source': 'blender/rigged.blend'}
        (dest / 'robot.json').write_text(json.dumps(info, indent=2) + '\n')
        print(json.dumps(info))
    finally:
        rig.data.pose_position = previous_position
        for b in rig.pose.bones:
            b.matrix_basis = matrices[b.name]
        for obj in bpy.context.selected_objects:
            obj.select_set(False)
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = active
        scene['procedural_review_enabled'] = enabled
        bpy.context.view_layer.update()


export()
