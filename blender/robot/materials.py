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
    return {
        'shell': material('Robot.Porcelain', 'EEECE7', .25, .38),
        'rubber': material('Robot.Joint rubber', '242421', .59, .07),
        'edge': material('Robot.Joint trim', '353532', .38, .2),
        'visor': material('Robot.Smoked visor', '0A0C0C', .19, .5),
        'seam': material('Robot.Panel hairline', 'ACA9A1', .52),
        'eye': material('Robot.Amber phosphor', 'FFD997', .33, emission='FFD18B', strength=4),
        'ear_light': material('Robot.Ear ring amber', 'E7BC7B', .32, emission='FFD598', strength=1.1),
        'smile': material('Robot.Smile etching', '27251E', .6),
        'mark': material('Robot.Terracotta emblem', 'C0664B', .45, .15),
        'ground': material('Studio.Warm cream', 'F2EDE4', .78),
    }
