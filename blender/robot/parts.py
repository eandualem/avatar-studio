"""Named shell assemblies, visible joints, face, and ten separate fingers."""
import math
import bpy
from mathutils import Vector
from . import geometry as g

HEAD = (0, .025, 5.025)
HEAD_RADII = (.685, .515, .535)


def head_y(x, z):
    """Front surface of the helmet's superellipsoid in world coordinates."""
    a, b, c = HEAD_RADII
    h = max(1e-8, 1 - abs((z - HEAD[2]) / c) ** (2 / .62)) ** (.62 / 2)
    return HEAD[1] - b * h * max(1e-8, 1 - abs(x / (a * h)) ** (2 / .62)) ** (.62 / 2)


def face_patch(name, ax, az, offset, col, mat):
    vertices = [(0, head_y(0, HEAD[2]) - offset, HEAD[2])]
    segments, rings = 128, 24
    for j in range(1, rings + 1):
        r = j / rings
        for i in range(segments):
            t = math.tau * i / segments
            x = ax * r * g.signed_power(math.cos(t), .54)
            z = HEAD[2] + az * r * g.signed_power(math.sin(t), .54)
            vertices.append((x, head_y(x, z) - offset, z))
    faces = [(0, i + 1, (i + 1) % segments + 1) for i in range(segments)]
    for j in range(rings - 1):
        for i in range(segments):
            a = 1 + j * segments + i
            b = 1 + j * segments + (i + 1) % segments
            faces.append((a, a + segments, b + segments, b))
    obj = g.mesh(name, vertices, faces, col, mat)
    thickness = obj.modifiers.new('Visor wall thickness', 'SOLIDIFY')
    thickness.thickness = .005
    thickness.offset = -1
    return obj


def head(c, m):
    col, details = c['head'], c['details']
    g.ellipsoid('Head.Helmet shell', HEAD, HEAD_RADII, col, m['shell'], e1=.62, e2=.62)
    face_patch('Head.Visor gasket', .581, .397, .012, col, m['edge'])
    face_patch('Head.Smoked glass visor', .563, .380, .020, col, m['visor'])
    for side, s in [('L', 1), ('R', -1)]:
        x, z = s * .279, 5.055
        eye = g.ellipsoid(f'Head.Eye.{side}', (x, head_y(x, z) - .035, z), (.066, .027, .137), col, m['eye'], e1=.72)
        eye.rotation_euler.z = s * -.12
        g.cylinder(f'Head.Ear.{side}.Gasket', (s * .688, .04, 5.015), .230, .086, col, m['rubber'], axis=(s, 0, 0))
        g.cylinder(f'Head.Ear.{side}.Ivory bezel', (s * .731, .04, 5.015), .217, .060, col, m['shell'], axis=(s, 0, 0))
        g.cylinder(f'Head.Ear.{side}.Dark center', (s * .770, .04, 5.015), .192, .036, col, m['edge'], axis=(s, 0, 0))
        g.ring(f'Head.Ear.{side}.Amber ring', (s * .794, .04, 5.015), .179, .010, col, m['ear_light'], axis='X')
    smile = []
    for i in range(49):
        x = -.16 + .32 * i / 48
        z = 4.825 + .035 * (x / .16) ** 2
        smile.append((x, head_y(x, z) - .025, z))
    g.tube('Head.Faint smile', smile, .004, col, m['smile'])
    # Helmet assembly seam follows the shell around its rear half.
    for s in (-1, 1):
        pts = []
        for i in range(97):
            t = math.pi * i / 96
            z = HEAD[2] + .508 * math.cos(t)
            h = max(.001, 1 - abs((z - HEAD[2]) / HEAD_RADII[2]) ** (2 / .62)) ** (.62 / 2)
            x = s * .54 * h
            y = HEAD[1] + HEAD_RADII[1] * h * (1 - (.54 / .685) ** (2 / .62)) ** (.62 / 2)
            pts.append((x, y + .001, z))
        g.tube(f'Head.Rear panel seam.{s}', pts, .002, details, m['seam'])


CHEST = [
    (3.285, .150, .160, .015), (3.300, .280, .247, .015),
    (3.345, .395, .310, .010), (3.50, .530, .393, .005),
    (3.75, .607, .423, .015), (4.02, .621, .401, .025),
    (4.21, .605, .337, .035), (4.265, .599, .305, .040),
    (4.308, .550, .260, .040), (4.345, .365, .190, .040),
    (4.355, .230, .150, .040),
]


def torso(c, m):
    col = c['torso']
    g.cylinder('Torso.Neck swivel', (0, .035, 4.445), .207, .237, col, m['rubber'])
    g.ring('Torso.Neck middle channel', (0, .035, 4.435), .208, .008, col, m['edge'])
    g.cylinder('Torso.Neck collar', (0, .035, 4.354), .247, .054, col, m['edge'])
    g.loft('Torso.Egg chest shell', CHEST, col, m['shell'], exponent=.94)
    g.cylinder('Torso.Waist upper ring', (0, .025, 3.258), .336, .14, col, m['rubber'])
    g.cylinder('Torso.Waist lower ring', (0, .025, 3.155), .353, .137, col, m['rubber'])
    g.ring('Torso.Waist division', (0, .025, 3.207), .340, .009, col, m['edge'])
    pelvis = [(2.540, .130, .177, .03), (2.550, .192, .226, .03),
              (2.640, .260, .286, .025), (2.840, .395, .315, .025),
              (3.010, .503, .276, .025), (3.060, .482, .250, .025),
              (3.109, .382, .220, .025)]
    g.loft('Torso.Pelvis shell', pelvis, col, m['shell'], exponent=.9)
    # The image uses a compact four-dot mark, slightly left of chest centre.
    for i, (dx, dz) in enumerate([(-.049, .048), (.049, .048), (-.049, -.048), (.049, -.048)]):
        x, z = dx - .035, 3.985 + dz
        y = -.383 + .1 * x * x
        g.ellipsoid(f'Detail.Chest emblem dot.{i + 1}', (x, y - .015, z), (.044, .009, .044), c['details'], m['mark'])


def hands(side, s, c, m):
    col = c['arms']
    cx, cy, cz = s * 1.252, -.015, 2.290
    g.ellipsoid(f'Arm.{side}.Hand palm', (cx, cy, cz), (.104, .148, .185), col, m['rubber'], e1=.65, e2=.7)
    g.ellipsoid(f'Arm.{side}.Hand dorsal plate', (cx + s * .065, cy + .005, cz + .015), (.069, .151, .176), col, m['shell'], e1=.62, e2=.65)
    g.ellipsoid(f'Arm.{side}.Hand palm plate', (cx - s * .069, cy + .012, cz + .023), (.055, .122, .147), col, m['shell'], e1=.65, e2=.72)
    for i, (y, length) in enumerate([(-.112, .245), (-.038, .277), (.038, .255), (.112, .202)]):
        name = f'Arm.{side}.Finger.{i + 1}'
        p0 = (cx, y, 2.163)
        p1 = (cx - s * .009, y - .005, 2.163 - length * .44)
        p2 = (cx - s * .049, y - .019, 2.163 - length * .76)
        p3 = (cx - s * .098, y - .029, 2.163 - length)
        g.ellipsoid(name + '.Knuckle', p0, (.045, .034, .044), col, m['edge'])
        g.segment(name + '.Proximal', p0, p1, .034, col, m['rubber'])
        g.ellipsoid(name + '.Hinge', p1, (.035, .033, .037), col, m['edge'])
        g.segment(name + '.Middle', p1, p2, .032, col, m['rubber'])
        g.segment(name + '.Ivory fingertip', p2, p3, .033, col, m['shell'])
    thumb = [(cx - s * .078, -.116, 2.34), (cx - s * .153, -.165, 2.255),
             (cx - s * .179, -.190, 2.178), (cx - s * .169, -.214, 2.11)]
    for i in range(3):
        g.segment(f'Arm.{side}.Thumb.{i + 1}', thumb[i], thumb[i + 1], .047 - i * .006, col, m['shell'] if i == 2 else m['rubber'])
        if i < 2:
            g.ellipsoid(f'Arm.{side}.Thumb hinge.{i}', thumb[i], (.048, .044, .048), col, m['edge'])


def arms(c, m):
    col = c['arms']
    for side, s in [('L', 1), ('R', -1)]:
        prefix = f'Arm.{side}'
        g.ellipsoid(prefix + '.Shoulder ball', (s * .660, .020, 4.044), (.185, .234, .226), col, m['rubber'])
        g.cylinder(prefix + '.Shoulder socket', (s * .611, .02, 4.046), .252, .072, col, m['edge'], axis=(s, 0, 0))
        g.limb(prefix + '.Upper shell', (s * .795, .025, 4.235), (s * 1.052, -.005, 3.389), .189, .205, .164, col, m['shell'], 1.06, dome=True)
        elbow = (s * 1.083, -.010, 3.289)
        g.ellipsoid(prefix + '.Elbow rubber', elbow, (.145, .151, .159), col, m['rubber'])
        g.cylinder(prefix + '.Elbow axle', elbow, .110, .299, col, m['edge'], axis=(1, 0, 0))
        g.limb(prefix + '.Forearm shell', (s * 1.098, -.012, 3.194), (s * 1.236, -.012, 2.509), .168, .185, .150, col, m['shell'], 1.08)
        g.ellipsoid(prefix + '.Wrist rubber', (s * 1.251, -.015, 2.46), (.108, .115, .124), col, m['rubber'])
        hands(side, s, c, m)


def legs(c, m):
    col = c['legs']
    for side, s in [('L', 1), ('R', -1)]:
        prefix = f'Leg.{side}'
        hip = g.ellipsoid(prefix + '.Hip ball', (s * .370, .025, 2.773), (.255, .276, .308), col, m['rubber'])
        hip.rotation_euler.y = s * .52
        thigh = g.limb(prefix + '.Thigh shell', (s * .437, .024, 2.75), (s * .506, .010, 1.736), .236, .276, .191, col, m['shell'], 1.01)
        # The upper rim slopes toward the crotch, exposing the diagonal hip joint.
        rotation = thigh.rotation_euler.to_matrix()
        for vertex in thigh.data.vertices:
            weight = max(0, 1 - vertex.co.z / .40) ** 2
            world_x = (rotation @ vertex.co).x
            delta = Vector((0, 0, s * world_x * .72 * weight))
            vertex.co += rotation.inverted() @ delta
        knee = (s * .514, -.014, 1.635)
        g.ellipsoid(prefix + '.Knee rubber', knee, (.173, .193, .190), col, m['rubber'], e1=.85)
        g.cylinder(prefix + '.Knee axle', knee, .129, .382, col, m['edge'], axis=(1, 0, 0))
        g.ellipsoid(prefix + '.Knee face', (s * .514, -.139, 1.635), (.145, .083, .166), col, m['rubber'], e1=.75, e2=.85)
        g.limb(prefix + '.Shin shell', (s * .525, .023, 1.483), (s * .576, .015, .535), .182, .280, .240, col, m['shell'], 1.07)
        g.ellipsoid(prefix + '.Ankle rubber', (s * .580, .02, .448), (.204, .208, .159), col, m['rubber'])
        g.cylinder(prefix + '.Ankle axle', (s * .580, .075, .383), .108, .415, col, m['edge'], axis=(1, 0, 0))
        # A flattened, elongated toe dome sits on a separate thin rubber outsole.
        sole = [(0.025, .331, .422, -.122), (.033, .353, .445, -.122),
                (.080, .353, .445, -.122), (.092, .344, .435, -.122)]
        foot = [(0.090, .341, .431, -.122), (.108, .345, .434, -.122),
                (.211, .331, .411, -.118), (.329, .288, .352, -.095),
                (.425, .215, .257, -.048), (.483, .112, .149, .012),
                (.493, .045, .076, .025)]
        for suffix, profile, mat in [('Outsole', sole, m['rubber']), ('Boot shell', foot, m['shell'])]:
            obj = g.loft(prefix + '.' + suffix, profile, col, mat, exponent=.84)
            obj.location.x = s * .593


def build(collections, materials):
    head(collections, materials)
    torso(collections, materials)
    arms(collections, materials)
    legs(collections, materials)
    seams(collections, materials)


def seams(c, m):
    """Project hairlines onto evaluated shells so they follow the real curvature."""
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()

    def project(name, obj_name, samples, axis, direction):
        obj = bpy.data.objects[obj_name]
        evaluated = obj.evaluated_get(depsgraph)
        points = []
        ray = Vector((0, direction, 0) if axis == 'Y' else (0, 0, direction))
        for a, b in samples:
            start = Vector((a, -direction * 3, b) if axis == 'Y' else (a, b, -direction * 7))
            hit, location, normal, _ = evaluated.ray_cast(start, ray)
            if hit:
                points.append(obj.matrix_world @ (location + normal * .0004))
        if len(points) > 2:
            g.tube(name, points, .0017, c['details'], m['seam'])

    # An almost invisible front service-panel outline, repeated on the back.
    shape = []
    for i in range(161):
        t = math.tau * i / 160
        z = 3.817 + .472 * g.signed_power(math.sin(t), .65)
        x = .508 * g.signed_power(math.cos(t), .65) * (.83 + .17 * (z - 3.345) / .944)
        shape.append((x, z))
    for label, direction in [('Front', 1), ('Back', -1)]:
        project('Detail.Chest panel seam.' + label, 'Torso.Egg chest shell', shape, 'Y', direction)
    for side in ('L', 'R'):
        for part in ('Upper shell', 'Forearm shell'):
            name = f'Arm.{side}.{part}'
            obj = bpy.data.objects[name]
            height = max(v.co.z for v in obj.data.vertices)
            samples = [(0, height * (.13 + .84 * i / 79)) for i in range(80)]
            project(name + '.Panel seam', name, samples, 'Y', 1)
        for part in ('Thigh shell', 'Shin shell'):
            name = f'Leg.{side}.{part}'
            obj = bpy.data.objects[name]
            height = max(v.co.z for v in obj.data.vertices)
            samples = [(0, height * (.05 + .91 * i / 79)) for i in range(80)]
            project(name + '.Front seam', name, samples, 'Y', 1)
            project(name + '.Back seam', name, samples, 'Y', -1)
        name = f'Leg.{side}.Boot shell'
        project(name + '.Toe seam', name, [(0, -.548 + .77 * i / 79) for i in range(80)], 'Z', -1)
