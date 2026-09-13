"""Render the procedural proof at 512px; source scene contains no baked motion."""
import bpy
from rig.bind import ROOT
from rig.procedural import install


def render(animation=False):
    install()
    scene = bpy.context.scene
    scene.camera = bpy.data.objects['Cam.ThreeQuarter']
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    if animation:
        target = ROOT/'.tmp'/'procedural-frames'
        target.mkdir(parents=True, exist_ok=True)
        for index, frame in enumerate(range(1, 182, 2)):
            scene.frame_set(frame)
            scene.render.filepath = str(target/f'{index:04d}.png')
            bpy.ops.render.render(write_still=True)
        print('Rendered 91 frames at 15 fps:', target)
    scene.frame_set(76)
    scene.render.filepath = str(ROOT/'renders'/'rig'/'procedural-wave.png')
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender'/'rigged.blend'), compress=True)


if globals().get('__name__') in (None, '__main__'):
    render(animation=True)
