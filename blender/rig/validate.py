"""Verify target reach, clamping, independent fingers, and rigid posed shells."""
import json
import math
import bpy
from mathutils import Vector
from rig.bind import ROOT, SOURCE
from rig.procedural import apply, bone, demo


def validate():
    scene = bpy.context.scene
    enabled = scene.get('procedural_review_enabled', False)
    scene['procedural_review_enabled'] = False
    rig = bpy.data.objects['Robot.Rig']
    panels = list(bpy.data.collections['RiggedRobot'].objects)
    assert len(panels) == 134 and len(rig.data.bones) == 65
    assert not rig.animation_data or not rig.animation_data.action
    assert len(bpy.data.actions) == 0, 'This proof must not depend on baked actions'
    cases = [
        {'left':(1.65, -.35, 4.65), 'left_direction':(0, 0, 1)},
        {'left':(2.2, -.6, 3.9), 'right':(-1.55, -.5, 4.2)},
        {'left':(.85, -1.5, 4.0), 'left_curl':(.1, .3, .5, .7, .9)},
        {'left':(.9, -.15, 4.1), 'head_yaw':.4, 'head_nod':-.2},
        {'left':(8, -4, 9)},
    ]
    results = []
    try:
        for case in cases:
            apply(**case)
            shoulder, elbow, wrist = [rig.matrix_world @ bone(rig, 'Left'+n).head for n in ('Arm','ForeArm','Hand')]
            lengths = (elbow-shoulder).length, (wrist-elbow).length
            target = Vector(case['left'])
            desired = target-shoulder
            distance = min(sum(lengths)-.001, max(abs(lengths[0]-lengths[1])+.001, desired.length))
            reachable = shoulder + desired.normalized()*distance
            error = (wrist-reachable).length
            assert error < .0001, ('Wrist missed target', case, error)
            max_error = 0
            graph = bpy.context.evaluated_depsgraph_get()
            for panel in panels:
                posed = panel.evaluated_get(graph)
                mesh = posed.to_mesh()
                indices = (0, len(mesh.vertices)//3, 2*len(mesh.vertices)//3)
                before = [panel.matrix_world @ panel.data.vertices[i].co for i in indices]
                after = [posed.matrix_world @ mesh.vertices[i].co for i in indices]
                assert all(math.isfinite(c) for v in after for c in v)
                for i,j in ((0,1),(1,2),(0,2)):
                    max_error = max(max_error, abs((before[i]-before[j]).length-(after[i]-after[j]).length))
                posed.to_mesh_clear()
            assert max_error < .0001, ('Panel deformed', max_error)
            results.append({'requested_left_wrist':list(target), 'actual_left_wrist':list(wrist),
                            'clamped':desired.length > sum(lengths)-.001,
                            'target_error':error, 'max_rigid_panel_distance_error':max_error})
        apply(left_curl=(0, .2, .4, .6, .8))
        curls = [bone(rig,'LeftHand'+digit+'1').rotation_quaternion.angle for digit in ('Thumb','Index','Middle','Ring','Pinky')]
        assert all(a < b for a,b in zip(curls,curls[1:])), 'Finger controls must be independent'
        max_wrist_swing = 0
        max_elbow_rise = -math.inf
        for frame in range(181):
            demo(frame/30)
            for side in ('Left', 'Right'):
                shoulder, elbow, wrist = [rig.matrix_world @ bone(rig,side+n).head for n in ('Arm','ForeArm','Hand')]
                hand_direction = (rig.matrix_world @ bone(rig,side+'Hand').matrix).to_3x3() @ Vector((0,1,0))
                swing = math.degrees((wrist-elbow).angle(hand_direction))
                max_wrist_swing = max(max_wrist_swing, swing)
                max_elbow_rise = max(max_elbow_rise, elbow.z-shoulder.z)
        assert max_wrist_swing <= 35.001, 'Excessive wrist swing during demo'
        assert max_elbow_rise < 0, 'Demo elbow rises above shoulder'
        demo(0)
        start = [b.matrix.copy() for b in rig.pose.bones]
        demo(3)
        demo(0)
        assert max(abs(a-b) for m,p in zip(start, rig.pose.bones) for row1,row2 in zip(m,p.matrix) for a,b in zip(row1,row2)) < 1e-5
        assert bpy.data.collections['Collection'].hide_viewport
        report = {'bones':65,'rigid_parts':134,'baked_actions':0,'cases':results,
                  'independent_finger_curls':True,'history_independent_demo':True,
                  'demo_max_wrist_swing_degrees':max_wrist_swing,
                  'demo_max_elbow_above_shoulder':max_elbow_rise,
                  'limits':'Upper-body procedural proof. No collision avoidance, balance, locomotion, speech timing, or browser integration validated.'}
        (SOURCE/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report, indent=2))
    finally:
        scene['procedural_review_enabled'] = enabled
        demo((scene.frame_current-1)/scene.render.fps)


if globals().get('__name__') in (None, '__main__'):
    validate()
