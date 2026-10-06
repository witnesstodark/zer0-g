"""The racing machines for the game, from Tripo P2's GLBs (about 10k triangles and three 2K maps each:
base colour, occlusion-roughness-metallic, normals): turned nose-first along +z (glTF), scaled to 0.9 m long
and sat on y = 0, decimated lightly to about 7k triangles, their normals copied from Tripo's mesh (the normal
map was made against those, so the panels shade as they did), the base colour and normal maps at 1024 px and
the ORM map at 512, and a glow map made from the base colour's bright, saturated seams (the neon lines) at
full resolution before it is shrunk. Then tools/machine_pack.mjs quantizes the geometry.

Round 1 cut them to 3k triangles and 512 px: collapsing that far crumpled the panels and dragged texels across
the UV seams (smears and blotches), and the glow mask worked out at 512 px caught whole patches (about 10% of
the map glowed instead of 1.5%), which showed as glowing spots in the race.

Round 2 (2026-10-06): all 18 regenerated with P2 "detailed" textures (machines/p2d_<name>, from
machines/run_p2d.py); PREP_PREFIX=p2d_ reads those, with their own nose table (NOSE_P2D).

blender -b --factory-startup --python machine_prep.py -- <machines dir> <out dir> [names...]
(PREP_TRIS: triangles, default 7000; PREP_PREFIX: p2_ (round 1, default) or p2d_ (round 2))
"""
import bpy, sys, glob, os, math
import numpy as np
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
src_dir, out_dir = args[0], args[1]
names = args[2:] or ['volt', 'nova', 'oracle', 'gecko', 'lune', 'wolf']
os.makedirs(out_dir, exist_ok=True)

LENGTH = 0.9
# which way the nose points in Tripo's output (Blender axes) -> turn about Blender z to point it to -y
# (Blender -y is glTF +z)
NOSE = {'volt': 'x', 'nova': 'x', 'oracle': 'x', 'gecko': '-y', 'lune': 'x', 'wolf': 'x', 'viper': '-y'}   # the rest: x
# round 2 (p2d_*, detailed textures): where each new mesh's nose points (the rest: x)
NOSE_P2D = {'gecko': '-y', 'needle': '-y', 'viper': '-y'}
PREFIX = os.environ.get('PREP_PREFIX', 'p2_')
if PREFIX == 'p2d_':
    NOSE = NOSE_P2D
TRIS = int(os.environ.get('PREP_TRIS', 7000))
TEX = {'base': 1024, 'normal': 1024, 'orm': 512, 'glow': 1024}


def box_blur(a, r):
    """Mean over a (2r+1)^2 window (wrapping at the edges is fine for an atlas)."""
    for axis in (0, 1):
        c = np.cumsum(np.concatenate([a.take(range(-r - 1, 0), axis=axis), a, a.take(range(0, r), axis=axis)], axis=axis), axis=axis)
        hi = c.take(range(2 * r + 1, c.shape[axis]), axis=axis)
        lo = c.take(range(0, c.shape[axis] - 2 * r - 1), axis=axis)
        a = (hi - lo) / (2 * r + 1)
    return a


def glow_from(base):
    """The neon seams: thin lines much brighter than what is round them, and saturated; in their own colour."""
    w, h = base.size
    px = np.array(base.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3]
    mx, mn = px.max(-1), px.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    local = box_blur(mx, 6)
    k = np.clip((mx - local - 0.08) / 0.15, 0, 1) * np.clip((sat - 0.35) / 0.3, 0, 1) * np.clip((mx - 0.35) / 0.25, 0, 1)
    kb = k.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        kb = np.maximum(kb, np.roll(np.roll(k, dy, 0), dx, 1) * 0.6)
    glow = px * kb[..., None] * 1.4
    img = bpy.data.images.new(base.name + '_glow', w, h)
    out = np.concatenate([np.clip(glow, 0, 1), np.ones((h, w, 1), np.float32)], -1)
    img.pixels = out.ravel().tolist()
    return img, float(kb.mean())


for name in names:
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    f = sorted(glob.glob(f'{src_dir}/{PREFIX}{name}/*.glb'))[0]
    bpy.ops.import_scene.gltf(filepath=f)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.parent = None
    # nose to Blender -y
    yaw = {'x': -math.pi / 2, '-x': math.pi / 2, 'y': math.pi, '-y': 0.0}[NOSE.get(name, 'x')]
    ob.matrix_world = Matrix.Rotation(yaw, 4, 'Z') @ ob.matrix_world
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    co = np.array([v.co for v in ob.data.vertices])
    lo, hi = co.min(0), co.max(0)
    s = LENGTH / (hi[1] - lo[1])
    centre = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]))
    for v in ob.data.vertices:
        v.co = (v.co - centre) * s
    tris0 = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    # Tripo's mesh as it came (for its normals)
    src = ob.copy(); src.data = ob.data.copy(); bpy.context.collection.objects.link(src)
    if tris0 > TRIS:
        m = ob.modifiers.new('dec', 'DECIMATE')
        m.ratio = TRIS / tris0
        m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='dec')
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    # the normals: copied from Tripo's mesh, face by face, so the normal map still matches them
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth()
    dt = ob.modifiers.new('normals', 'DATA_TRANSFER')
    dt.object = src
    dt.use_loop_data = True
    dt.data_types_loops = {'CUSTOM_NORMAL'}
    dt.loop_mapping = 'POLYINTERP_NEAREST'
    bpy.ops.object.modifier_apply(modifier='normals')
    bpy.data.objects.remove(src)
    # maps: shrink, and a glow map from the base colour
    mat = ob.data.materials[0]
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    base_node = bsdf.inputs['Base Color'].links[0].from_node if bsdf.inputs['Base Color'].links else None
    glow_share = 0.0
    # the glow from the full-size base colour (thin lines stay thin), then every map to its size
    gimg = None
    if base_node and base_node.type == 'TEX_IMAGE':
        gimg, glow_share = glow_from(base_node.image)
    for n in nt.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            kind = 'base' if base_node and n.name == base_node.name else 'normal' if 'normal' in n.image.name.lower() else 'orm'
            n.image.scale(TEX[kind], TEX[kind])
    if gimg:
        gimg.scale(TEX['glow'], TEX['glow'])
        gn = nt.nodes.new('ShaderNodeTexImage'); gn.image = gimg
        nt.links.new(gn.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    mat.name = 'Machine'
    co = np.array([v.co for v in ob.data.vertices])
    print(f'{name}: {tris0} -> {tris} triangles, size {np.round(co.max(0) - co.min(0), 3)}, glow share {glow_share:.3f}')
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, f'{name}.glb'), use_selection=True, export_format='GLB',
                              export_image_format='WEBP', export_image_quality=85, export_yup=True, export_tangents=False,
                              export_animations=False, export_extras=False)
print('MACHINES DONE')
