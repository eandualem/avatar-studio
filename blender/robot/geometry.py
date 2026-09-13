"""Context-free mesh builders; the robot faces -Y and stands on Z=0."""
import math
import bpy
import bmesh
from mathutils import Vector

TAU = math.tau


def signed_power(v, exponent):
    return math.copysign(abs(v) ** exponent, v)


def mesh(name, vertices, faces, collection, material, subdiv=0):
    data = bpy.data.meshes.new(name + '.mesh')
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    data.materials.append(material)
    # Recalculate once so both reflection and future mesh consumers see outward normals.
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    for polygon in data.polygons:
        polygon.use_smooth = True
    if subdiv:
        modifier = obj.modifiers.new('Surface continuity', 'SUBSURF')
        modifier.levels = subdiv
        modifier.render_levels = subdiv
    return obj


def loft(name, profile, collection, material, segments=64, exponent=1, subdiv=2):
    """Closed Z loft: profile entries (z, x radius, y radius, y offset)."""
    vertices = []
    for z, rx, ry, cy in profile:
        for i in range(segments):
            a = TAU * i / segments
            vertices.append((rx * signed_power(math.cos(a), exponent),
                             cy + ry * signed_power(math.sin(a), exponent), z))
    faces = []
    for row in range(len(profile) - 1):
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((row * segments + i, row * segments + j,
                          (row + 1) * segments + j, (row + 1) * segments + i))
    faces.extend([tuple(reversed(range(segments))),
                  tuple((len(profile) - 1) * segments + i for i in range(segments))])
    return mesh(name, vertices, faces, collection, material, subdiv)


def ellipsoid(name, location, radii, collection, material, e1=1, e2=1):
    segments, rings = 80, 40
    vertices = [(0, 0, -radii[2])]
    for j in range(1, rings):
        v = -math.pi / 2 + math.pi * j / rings
        for i in range(segments):
            u = TAU * i / segments
            c = signed_power(math.cos(v), e1)
            vertices.append((radii[0] * c * signed_power(math.cos(u), e2),
                             radii[1] * c * signed_power(math.sin(u), e2),
                             radii[2] * signed_power(math.sin(v), e1)))
    top = len(vertices)
    vertices.append((0, 0, radii[2]))
    faces = [(0, 1 + (i + 1) % segments, 1 + i) for i in range(segments)]
    for row in range(rings - 2):
        for i in range(segments):
            a = 1 + row * segments + i
            b = 1 + row * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.extend((top, top - segments + i, top - segments + (i + 1) % segments) for i in range(segments))
    obj = mesh(name, vertices, faces, collection, material)
    obj.location = location
    return obj


def tube(name, points, radius, collection, material, cyclic=False):
    data = bpy.data.curves.new(name + '.curve', 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 2
    data.bevel_depth = radius
    data.bevel_resolution = 3
    spline = data.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, value in zip(spline.points, points):
        point.co = (*value, 1)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    data.materials.append(material)
    return obj


def cylinder(name, center, radius, depth, collection, material, axis=(0, 0, 1), bevel=.015):
    profile = [(-depth / 2, radius - bevel, radius - bevel, 0),
               (-depth / 2 + bevel, radius, radius, 0),
               (depth / 2 - bevel, radius, radius, 0),
               (depth / 2, radius - bevel, radius - bevel, 0)]
    obj = loft(name, profile, collection, material, subdiv=1)
    obj.location = center
    obj.rotation_euler = Vector(axis).to_track_quat('Z', 'Y').to_euler()
    return obj


def ring(name, center, radius, thickness, collection, material, axis='Z'):
    points = []
    for i in range(128):
        a = TAU * i / 128
        c, s = radius * math.cos(a), radius * math.sin(a)
        v = (0, c, s) if axis == 'X' else (c, 0, s) if axis == 'Y' else (c, s, 0)
        points.append(tuple(center[k] + v[k] for k in range(3)))
    return tube(name, points, thickness, collection, material, cyclic=True)


def segment(name, start, end, radius, collection, material, depth_ratio=1):
    a, b = Vector(start), Vector(end)
    obj = ellipsoid(name, (a + b) / 2, (radius, radius * depth_ratio, (b - a).length / 2 + radius * .35), collection, material, e1=.72)
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return obj


def limb(name, start, end, r0, rm, r1, collection, material, depth_ratio=1):
    a, b = Vector(start), Vector(end)
    length = (b - a).length
    profile = [(0, r0 * .88), (.018, r0), (.10, r0 * 1.03),
               (.4, rm), (.7, rm * .99), (.90, r1 * 1.04),
               (.982, r1), (1, r1 * .86)]
    obj = loft(name, [(z * length, r, r * depth_ratio, 0) for z, r in profile], collection, material)
    obj.location = a
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return obj
