"""Reproducible stills: scripts/bl run blender/robot/render.py.

The four square 1024px masters share framing. The hero is a 768x1024 portrait.
The saved scene ends in the neutral pose with the front camera selected.
"""
from pathlib import Path
import importlib
import sys
import bpy
from robot import parts, pose

importlib.reload(pose)
set_pose = pose.set_pose

ROOT = Path(parts.__file__).resolve().parents[2]
VIEWS = {'front': 'Front', 'side': 'Side', 'back': 'Back',
         'three-quarter': 'ThreeQuarter', 'hero': 'Hero'}


def configure_device(scene):
    scene.cycles.device = 'CPU'
    if sys.platform == 'darwin':
        preferences = bpy.context.preferences.addons['cycles'].preferences
        try:
            preferences.compute_device_type = 'METAL'
            preferences.get_devices()
            if any(d.type == 'METAL' for d in preferences.devices):
                for device in preferences.devices:
                    device.use = device.type == 'METAL'
                scene.cycles.device = 'GPU'
        except (TypeError, RuntimeError):
            pass  # The same build remains renderable without a Metal device.


def render_view(view, engine='CYCLES', size=1024, samples=128, output=None):
    scene = bpy.context.scene
    set_pose('hero' if view == 'hero' else 'neutral')
    scene.camera = bpy.data.objects['Cam.' + VIEWS[view]]
    scene.render.engine = engine
    if engine == 'CYCLES':
        configure_device(scene)
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = round(size * .75) if view == 'hero' else size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    target = Path(output) if output else ROOT / 'renders' / (view + '.png')
    target.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(target)
    bpy.ops.render.render(write_still=True)
    print('Rendered', view, scene.render.resolution_x, 'x', size, engine)


def render_all():
    for view in VIEWS:
        render_view(view)
    save_scene()


def save_scene():
    set_pose('neutral')
    scene = bpy.context.scene
    scene.camera = bpy.data.objects['Cam.Front']
    scene.render.resolution_x = scene.render.resolution_y = 1024
    scene.render.filepath = str(ROOT / 'renders' / 'front.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'blender' / 'scene.blend'), compress=True)
    print('Saved neutral scene with final Cycles settings.')


if globals().get('__name__') in (None, '__main__'):
    render_all()
