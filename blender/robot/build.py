"""Run through `scripts/bl run blender/robot/build.py`, or import build()."""
import importlib
from pathlib import Path
import bpy
from robot import geometry, materials, parts, stage


def build(save=True):
    """Rebuild owned collections, cameras and lighting; preserve unrelated objects."""
    for module in (geometry, materials, parts, stage):
        importlib.reload(module)
    stage.clear()
    collections = stage.collections()
    palette = materials.build()
    parts.build(collections, palette)
    stage.setup(collections, palette)
    bpy.context.view_layer.update()
    if save:
        root = Path(parts.__file__).resolve().parents[2]
        bpy.ops.wm.save_as_mainfile(filepath=str(root / 'blender' / 'scene.blend'))
    print('Built', len(bpy.data.collections['Robot'].all_objects), 'named robot parts; five cameras.')
    return bpy.data.collections['Robot']


build()
