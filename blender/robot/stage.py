"""Owned collections, broad studio lights, and reproducible reference views."""
import math
import bpy
from mathutils import Vector
from . import geometry as g


def clear():
    # Only remove content owned by this builder. An unrelated scene is preserved.
    for name in ('Robot', 'Studio'):
        root = bpy.data.collections.get(name)
        if root:
            for obj in list(root.all_objects):
                data = obj.data
                bpy.data.objects.remove(obj, do_unlink=True)
                if data and data.users == 0:
                    if isinstance(data, bpy.types.Mesh):
                        bpy.data.meshes.remove(data)
                    elif isinstance(data, bpy.types.Curve):
                        bpy.data.curves.remove(data)
                    elif isinstance(data, bpy.types.Camera):
                        bpy.data.cameras.remove(data)
                    elif isinstance(data, bpy.types.Light):
                        bpy.data.lights.remove(data)
            for child in list(root.children):
                bpy.data.collections.remove(child)
            bpy.data.collections.remove(root)


def collections():
    root = bpy.data.collections.new('Robot')
    bpy.context.scene.collection.children.link(root)
    result = {}
    for name in ('head', 'torso', 'arms', 'legs', 'details'):
        col = bpy.data.collections.new(name)
        root.children.link(col)
        result[name] = col
    studio = bpy.data.collections.new('Studio')
    bpy.context.scene.collection.children.link(studio)
    result['studio'] = studio
    return result


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def setup(c, m):
    scene, col = bpy.context.scene, c['studio']
    # Exclude the starter collection from rendering without deleting someone else's objects.
    for child in scene.collection.children:
        if child.name not in ('Robot', 'Studio'):
            child.hide_render = True
    floor = g.mesh('Studio.Cream floor', [(-200, -200, .018), (200, -200, .018), (200, 200, .018), (-200, 200, .018)], [(0, 1, 2, 3)], col, m['ground'])
    floor.visible_glossy = False
    world = bpy.data.worlds.get('Studio.World') or bpy.data.worlds.new('Studio.World')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.80, .76, .70, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .20
    for name, location, size, energy, color in [
        ('Key softbox', (-3.5, -4.5, 8), 4.5, 1300, (1, .955, .90)),
        ('Fill softbox', (4, -2, 5), 4, 450, (.92, .96, 1)),
        ('Top rim', (1, 3, 7.5), 3.8, 850, (1, .96, .91)),
        ('Front bounce', (0, -5, 3.5), 4, 35, (1, .98, .94)),
    ]:
        light = bpy.data.lights.new('Studio.' + name, 'AREA')
        light.energy, light.shape, light.size, light.color = energy, 'DISK', size, color
        light.specular_factor = .28
        obj = bpy.data.objects.new('Studio.' + name, light)
        col.objects.link(obj)
        obj.location = location
        aim(obj, (0, 0, 3))
    for name, location, target, scale in [
        ('Front', (0, -30, 4.0), (0, 0, 2.55), 6.65),
        ('Side', (30, 0, 4.0), (0, 0, 2.55), 6.65),
        ('Back', (0, 30, 4.0), (0, 0, 2.55), 6.65),
        ('ThreeQuarter', (-18, -30, 4.8), (0, 0, 2.55), 6.65),
        ('Hero', (-8, -18, 5.0), (0.12, 0, 2.8), 6.45),
    ]:
        data = bpy.data.cameras.new('Cam.' + name)
        data.type, data.ortho_scale, data.lens = 'ORTHO', scale, 70
        obj = bpy.data.objects.new('Cam.' + name, data)
        col.objects.link(obj)
        obj.location = location
        aim(obj, target)
    scene.camera = bpy.data.objects['Cam.Front']
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = .0
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    # Blender 5 uses a separate compositor node group on the scene.
    if hasattr(scene, 'compositing_node_group'):
        tree = scene.compositing_node_group
        if tree is None:
            tree = bpy.data.node_groups.new('Studio.Compositor', 'CompositorNodeTree')
            scene.compositing_node_group = tree
            tree.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        tree.nodes.clear()
        source = tree.nodes.new('CompositorNodeRLayers')
        glow = tree.nodes.new('CompositorNodeGlare')
        glow.inputs['Type'].default_value = 'Fog Glow'
        glow.inputs['Quality'].default_value = 'High'
        glow.inputs['Threshold'].default_value = 1.5
        glow.inputs['Strength'].default_value = .22
        output = tree.nodes.new('NodeGroupOutput')
        tree.links.new(source.outputs['Image'], glow.inputs['Image'])
        tree.links.new(glow.outputs['Image'], output.inputs['Image'])
    # Open the saved file on its camera, in an uncluttered material viewport.
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
                area.spaces.active.overlay.show_overlays = False
                area.spaces.active.shading.type = 'MATERIAL'
