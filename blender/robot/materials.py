"""The reference palette, converted from sRGB to scene-linear values."""
import bpy


def linear(hex_color):
    values = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)


def material(name, color, roughness, coat=0, metallic=0, emission=None, strength=0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*linear(color), 1)
    node.inputs['Roughness'].default_value = roughness
    node.inputs['Coat Weight'].default_value = coat
    node.inputs['Coat Roughness'].default_value = .22
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Emission Color'].default_value = (*linear(emission or color), 1)
    node.inputs['Emission Strength'].default_value = strength
    mat.diffuse_color = (*linear(color), 1)
    return mat


def build():
    palette = {
        'shell': material('Robot.Porcelain', 'EEECE7', .25, .38),
        'rubber': material('Robot.Joint rubber', '191A18', .70),
        'edge': material('Robot.Joint trim', '292A27', .48, .05),
        'visor': material('Robot.Smoked visor', '080A0A', .12, .35),
        'seam': material('Robot.Panel hairline', 'ACA9A1', .52),
        'eye': material('Robot.Amber phosphor', 'FFD997', .33, emission='FFD18B', strength=4),
        'ear_light': material('Robot.Ear ring amber', 'E7BC7B', .32, emission='FFD598', strength=1.1),
        'smile': material('Robot.Smile etching', '14140F', .6),
        'mark': material('Robot.Terracotta emblem', 'C0664B', .45, .15),
        'ground': material('Studio.Warm cream', 'F2E6D2', .78),
    }
    # A large product-photo sweep: lift its far end without brightening the robot.
    # Camera rays at the top of an orthographic frame hit the floor far behind it.
    tree = palette['ground'].node_tree
    node = tree.nodes.get('Principled BSDF')
    for old in list(tree.nodes):
        if old.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL'):
            tree.nodes.remove(old)
    geo = tree.nodes.new('ShaderNodeNewGeometry')
    distance = tree.nodes.new('ShaderNodeVectorMath')
    distance.operation = 'LENGTH'
    tree.links.new(geo.outputs['Position'], distance.inputs[0])
    ramp = tree.nodes.new('ShaderNodeMapRange')
    ramp.inputs['From Min'].default_value = 2.8
    ramp.inputs['From Max'].default_value = 8
    ramp.inputs['To Min'].default_value = .18
    ramp.inputs['To Max'].default_value = 2.8
    ramp.interpolation_type = 'SMOOTHERSTEP'
    tree.links.new(distance.outputs['Value'], ramp.inputs['Value'])
    light_path = tree.nodes.new('ShaderNodeLightPath')
    camera_lift = tree.nodes.new('ShaderNodeMath')
    camera_lift.operation = 'MULTIPLY'
    tree.links.new(ramp.outputs['Result'], camera_lift.inputs[0])
    tree.links.new(light_path.outputs['Is Camera Ray'], camera_lift.inputs[1])
    tree.links.new(camera_lift.outputs[0], node.inputs['Emission Strength'])
    return palette
