"""Continuous target-driven motion proof. No animation clips or keyframes.

Coordinates use the modeling frame: Z up, -Y forward. Targets are world units.
Run this file to install the review demo, then scrub/play frames 1..180.
"""
import math
import bpy
from mathutils import Matrix, Vector, Quaternion
from rig.bind import ROOT


def clamp(value, low, high):
    return max(low, min(high, value))


def bone(rig, name):
    return rig.pose.bones['mixamorig:' + name]


def reset(rig):
    for b in rig.pose.bones:
        b.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def aim(rig, name, direction):
    b = bone(rig, name)
    world = rig.matrix_world @ b.matrix
    current = world.to_3x3() @ Vector((0, 1, 0))
    delta = current.normalized().rotation_difference(Vector(direction).normalized())
    desired = delta.to_matrix().to_4x4() @ world
    desired.translation = world.translation
    b.matrix = rig.matrix_world.inverted() @ desired
    bpy.context.view_layer.update()


def reach(rig, side, target, pole):
    """Solve a two-link arm from its lengths and an arbitrary wrist target."""
    if side not in ('Left', 'Right'):
        raise ValueError('side must be Left or Right')
    upper, fore, hand = [bone(rig, side + suffix) for suffix in ('Arm', 'ForeArm', 'Hand')]
    shoulder, elbow, wrist = [rig.matrix_world @ b.head for b in (upper, fore, hand)]
    a, b = (elbow-shoulder).length, (wrist-elbow).length
    delta = Vector(target)-shoulder
    distance = clamp(delta.length, abs(a-b)+.001, a+b-.001)
    direction = delta.normalized() if delta.length > 1e-8 else Vector((1, 0, 0))
    offset = Vector(pole)-shoulder
    across = offset-direction*offset.dot(direction)
    if across.length < 1e-6:
        across = direction.cross(Vector((0, 0, 1)))
        if across.length < 1e-6:
            across = direction.cross(Vector((0, 1, 0)))
    along = (a*a - b*b + distance*distance)/(2*distance)
    elbow_target = shoulder + direction*along + across.normalized()*math.sqrt(max(0, a*a-along*along))
    wrist_target = shoulder + direction*distance
    aim(rig, side+'Arm', elbow_target-shoulder)
    aim(rig, side+'ForeArm', wrist_target-elbow_target)
    return wrist_target


def basis(direction, normal):
    y = Vector(direction).normalized()
    z = Vector(normal)-y*Vector(normal).dot(y)
    if z.length < 1e-6:
        raise ValueError('Palm direction and normal cannot be parallel')
    z.normalize()
    x = y.cross(z).normalized()
    return Matrix((x, y, z)).transposed()


def hand_pose(rig, side, direction, normal, curls):
    """Aim the palm within a conservative swing cone, then curl each digit.

    The 35-degree cone is a robot presentation limit, not a human joint model.
    It keeps independently requested hand directions from sharply folding the
    wrist during a reach. Forearm roll and full anatomical limits remain future
    controller work.
    """
    hand = bone(rig, side+'Hand')
    forearm = bone(rig, side+'ForeArm')
    forward = (rig.matrix_world.to_3x3() @ (hand.head-forearm.head)).normalized()
    requested = Vector(direction)
    if requested.length < 1e-8:
        raise ValueError('Hand direction must be nonzero')
    requested.normalize()
    angle = forward.angle(requested)
    max_swing = math.radians(35)
    if angle > max_swing:
        delta = forward.rotation_difference(requested)
        requested = Quaternion().slerp(delta, max_swing/angle) @ forward
    direction = requested
    rest = rig.matrix_world @ hand.bone.matrix_local
    rest_direction = rest.to_3x3() @ Vector((0, 1, 0))
    rotation = basis(direction, normal) @ basis(rest_direction, (0, 0, 1)).inverted()
    desired = rotation.to_4x4() @ rest
    desired.translation = rig.matrix_world @ hand.head
    hand.matrix = rig.matrix_world.inverted() @ desired
    for digit, curl in zip(('Thumb', 'Index', 'Middle', 'Ring', 'Pinky'), curls):
        for segment in (1, 2, 3):
            p = bone(rig, side+'Hand'+digit+str(segment))
            rest_rotation = (rig.matrix_world @ p.bone.matrix_local).to_quaternion()
            axis = rest_rotation.inverted() @ Vector((0, 1 if side == 'Left' else -1, 0))
            p.rotation_mode = 'QUATERNION'
            p.rotation_quaternion = Quaternion(axis, clamp(curl, 0, 1)*math.radians(55))
    bpy.context.view_layer.update()


def apply(left=(1.1, -.12, 2.53), right=(-1.1, -.12, 2.53),
          left_direction=(0, 0, -1), right_direction=(0, 0, -1),
          left_curl=(0, 0, 0, 0, 0), right_curl=(0, 0, 0, 0, 0),
          head_yaw=0, head_nod=0):
    """Apply a parameterized pose; the future frontend can expose these goals."""
    rig = bpy.data.objects['Robot.Rig']
    reset(rig)
    for side, target, direction, curls, sign in (
            ('Left', left, left_direction, left_curl, 1),
            ('Right', right, right_direction, right_curl, -1)):
        # Prefer an elbow below the shoulder during the lift. A high outward
        # pole made the elbow rise before the wrist and looked like a flap.
        reach(rig, side, target, (sign*1.8, -.35, 2.3))
        hand_pose(rig, side, direction, (0, 1, 0), curls)
    head = bone(rig, 'Head')
    rest = head.bone.matrix_local.to_quaternion()
    world_delta = Quaternion((0, 0, 1), clamp(head_yaw, -.55, .55)) @ Quaternion((1, 0, 0), clamp(head_nod, -.25, .25))
    head.rotation_mode = 'QUATERNION'
    head.rotation_quaternion = rest.inverted() @ world_delta @ rest
    bpy.context.view_layer.update()
    return rig


def ease(t):
    t = clamp(t, 0, 1)
    return t*t*t*(t*(t*6-15)+10)


def demo(time):
    """A reproducible example of composing targets; no recorded motion data."""
    amount = ease(time/1.5) * (1-ease((time-4.5)/1.5))
    wave = .13*math.sin((time-1.5)*math.tau*1.5)*ease((time-1.5)/.3)*(1-ease((time-4.2)/.3))
    start, end = Vector((1.1, -.12, 2.53)), Vector((1.65+wave, -.35, 4.65))
    target = start.lerp(end, amount)
    angle = math.pi*amount
    direction = (math.sin(angle), 0, -math.cos(angle))
    curl = .12 * (1-amount)
    return apply(left=target, left_direction=direction, left_curl=(0, curl, curl, curl, curl),
                 head_yaw=-.12*amount, head_nod=.055*math.sin(time*math.tau)*amount)


def update(scene, *_):
    if scene.get('procedural_review_enabled') and bpy.data.objects.get('Robot.Rig'):
        demo((scene.frame_current-1)/scene.render.fps)


def install():
    scene = bpy.context.scene
    rig = bpy.data.objects['Robot.Rig']
    rig.animation_data_clear()
    for handler in list(bpy.app.handlers.frame_change_pre):
        if getattr(handler, '__name__', '') == 'update' and getattr(handler, '__module__', '') == __name__:
            bpy.app.handlers.frame_change_pre.remove(handler)
    bpy.app.handlers.frame_change_pre.append(update)
    scene['procedural_review_enabled'] = True
    scene['procedural_review_help'] = 'Run blender/rig/procedural.py after opening, then play frames 1..181. No clips/keyframes. Disable procedural_review_enabled to use apply() directly.'
    scene.frame_start, scene.frame_end, scene.render.fps = 1, 181, 30
    scene.timeline_markers.clear()
    for frame, label in ((1, 'Rest'), (46, 'Raise hand'), (91, 'Move hand target'), (136, 'Return'), (181, 'Rest')):
        scene.timeline_markers.new(label, frame=frame)
    scene.frame_set(76)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender'/'rigged.blend'), compress=True)
    print('Installed procedural 6-second target demo; 65 bones; no action clips.')


if globals().get('__name__') in (None, '__main__'):
    # Import normally so the callback has a stable module name across reruns.
    import importlib
    from rig import procedural
    importlib.reload(procedural)
    procedural.install()
