"""Static presentation transforms only: no armature, animation or export rig."""
import math
import bpy
from mathutils import Matrix, Vector


def rotate(obj, pivot, angle, axis):
    p = Vector(pivot)
    obj.matrix_world = Matrix.Translation(p) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-p) @ obj.matrix_world


def set_pose(name='neutral'):
    objects = list(bpy.data.collections['Robot'].all_objects)
    for obj in objects:
        if 'neutral_matrix' not in obj:
            obj['neutral_matrix'] = [value for row in obj.matrix_world for value in row]
        values = obj['neutral_matrix']
        obj.matrix_world = Matrix([values[i:i + 4] for i in range(0, 16, 4)])
    if name == 'hero':
        for obj in objects:
            if obj.name.startswith('Head.'):
                rotate(obj, (0, .025, 4.51), .12, 'Y')
            if obj.name.startswith('Arm.L.'):
                if any(word in obj.name for word in ('.Hand', '.Finger', '.Thumb')):
                    rotate(obj, (1.251, -.015, 2.46), math.pi, Vector((.17, 0, -.98)))
                if any(word in obj.name for word in ('.Forearm', '.Wrist', '.Hand', '.Finger', '.Thumb')):
                    rotate(obj, (1.083, -.010, 3.289), math.radians(-104), 'Y')
    elif name != 'neutral':
        raise ValueError('Unknown presentation pose: ' + name)
    bpy.context.view_layer.update()
