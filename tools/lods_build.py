"""HYPERLANE's street view for lot #383 (32 x 44 x 29 m): the arena as a diorama that passers-by see.

LOD0: the course (road, underside, energy barriers; neon markings in track.glsl), the arena (dark floor with a
grid, the blocks of the city under the course, the stands full of glow sticks, the ring of light, the pylons;
city.glsl), the LED jumbotrons and sponsor ribbons playing the game's show (screens.glsl, board.png) and sixteen machines racing on bones (machines.glsl): each does exactly four laps a
minute, so the clip loops on the world clock without a seam. LOD1: the course and the arena, still. LOD2:
one box-and-ribbon mesh with one 256 px picture.

blender -b --factory-startup --python tools/lods_build.py -- <card folder>
needs lods-src/far.png (tools/lod_textures.py); lods/board.png and screens.glsl come from tools/screens_atlas.py
and tools/screens_glsl.mjs
"""
import bpy, bmesh, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion

HERE = sys.argv[sys.argv.index('--') + 1]
OUT = os.path.join(HERE, 'lods')
SRC = os.path.join(HERE, 'lods-src')
os.makedirs(OUT, exist_ok=True)
LOT_W, LOT_D, LOT_H = 32.0, 44.0, 29.0
FPS, LOOP = 20, 60
N = FPS * LOOP
RACERS = 16
LAPS = 4
W = 3.2

sc = bpy.context.scene
sc.render.fps = FPS
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
rng = np.random.default_rng(383)

# lot (x, y up, z) -> Blender (x, -z, y)
def B(p):
    return Vector((float(p[0]), float(-p[2]), float(p[1])))


track = json.load(open(os.path.join(HERE, 'experience', 'assets', 'track1.json')))
PTS = np.array([p[:9] for p in track['points']], dtype=float)
GAP = np.array([p[9] for p in track['points']], dtype=int)
n = len(PTS)
STEP = track['step']
L = n * STEP
P = PTS[:, 0:3]; U = PTS[:, 3:6]
F = np.roll(P, -1, 0) - np.roll(P, 1, 0)
F /= np.linalg.norm(F, axis=1)[:, None]
U = U - F * np.sum(U * F, 1)[:, None]; U /= np.linalg.norm(U, axis=1)[:, None]
R = np.cross(F, U); R /= np.linalg.norm(R, axis=1)[:, None]


def frame(s):
    """Position, forward, up, right at s (lot coordinates), interpolated."""
    x = (s % L) / STEP
    i = int(math.floor(x)) % n; k = x - math.floor(x); j = (i + 1) % n
    lerp = lambda A: A[i] * (1 - k) + A[j] * k
    f = lerp(F); f /= np.linalg.norm(f)
    u = lerp(U); u -= f * np.dot(u, f); u /= np.linalg.norm(u)
    r = np.cross(f, u)
    return lerp(P), f, u, r


# curvature and a racing line (as in the game)
CURV = np.zeros(n)
for i in range(n):
    CURV[i] = np.dot(F[(i + 2) % n] - F[(i - 2) % n], R[i]) / (4 * STEP)
LINE = np.zeros(n)
for i in range(n):
    k = np.mean([CURV[(i + 24 + j) % n] for j in range(40)])
    LINE[i] = np.clip(k * 7, -1, 1) * (W / 2 - 0.6)
LINE = np.convolve(np.concatenate([LINE[-30:], LINE, LINE[:30]]), np.ones(61) / 61, 'same')[30:-30]


# ------------------------------------------------------------------ materials
_KEEP = None
def keep_uvs(m):
    """A tiny white base-colour texture: the server drops the UVs of untextured materials, and the shaders
    read their codes from the UVs. One image shared by all, so it counts once."""
    global _KEEP
    if _KEEP is None:
        _KEEP = bpy.data.images.new('keep_uvs', 4, 4)
        _KEEP.pixels = [1.0] * 64
        _KEEP.pack()
    nt = m.node_tree
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = _KEEP
    t.interpolation = 'Closest'
    nt.links.new(t.outputs['Color'], nt.nodes.get('Principled BSDF').inputs['Base Color'])


def material(name, color, rough, image=None, double=False):
    # each material its own roughness, or the server's dedup merges look-alikes and loses their names
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = 0.0
    m.use_backface_culling = not double
    if image is None:
        keep_uvs(m)
    else:
        t = m.node_tree.nodes.new('ShaderNodeTexImage')
        t.image = image
        m.node_tree.links.new(t.outputs['Color'], bs.inputs['Base Color'])
    return m


def mesh_object(name, bm, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    return ob


def new_bm():
    bm = bmesh.new()
    return bm, bm.loops.layers.uv.new('UVMap')


def face(bm, uvl, verts, uvs, mat=0):
    f = bm.faces.new(verts)
    f.material_index = mat
    for loop, uv in zip(f.loops, uvs):
        loop[uvl].uv = uv
    return f


def box(bm, uvl, c, s, uv, mat=0):
    """An axis-aligned box (Blender coordinates, c its centre, s its size), every corner with the same uv."""
    r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ Matrix.Diagonal((*s, 1)), verts=r['verts'])
    for f in {f for v in r['verts'] for f in v.link_faces}:
        f.material_index = mat
        for loop in f.loops:
            loop[uvl].uv = uv


# glTF flips v: a shader reads uv.y = 1 - (Blender's v). The codes below are written for the shader.
def UV(u, v):
    return (u, 1.0 - v)


# ------------------------------------------------------------------ the course
def course(every, parts=('top', 'under', 'rails'), name='Track'):
    """The road slab and its barriers from the centreline, a row every `every` samples. uv.x codes:
    0..1 the road across, 2..3 the underside, 4..5 the barrier (height); uv.y metres along."""
    bm, uvl = new_bm()
    rows = list(range(0, n, every)) + [n]
    cross = []
    if 'top' in parts:
        cross.append(('top', [(-W / 2, 0, 0.0), (W / 2, 0, 1.0)]))
    if 'under' in parts:
        T = 0.22
        cross.append(('under', [(W / 2, 0, 2.0), (W / 2, -T, 2.2), (-W / 2, -T, 2.8), (-W / 2, 0, 3.0)]))
    if 'rails' in parts:
        cross.append(('railL', [(-W / 2, 0, 4.0), (-W / 2, 0.38, 5.0)]))
        cross.append(('railR', [(W / 2, 0, 4.0), (W / 2, 0.38, 5.0)]))
    for kind, sec in cross:
        grid = []
        for j in rows:
            i = j % n
            s = j * STEP
            p, u, r = P[i], U[i], R[i]
            grid.append([(bm.verts.new(B(p + r * x + u * y)), uu, s) for x, y, uu in sec])
        for a in range(len(rows) - 1):
            i0, i1 = rows[a] % n, rows[a + 1] % n
            if GAP[i0] or GAP[i1] or any(GAP[(rows[a] + q) % n] for q in range(rows[a + 1] - rows[a])):
                continue
            for c in range(len(sec) - 1):
                v00, u00, s0 = grid[a][c]; v01, u01, _ = grid[a][c + 1]
                v10, _, s1 = grid[a + 1][c]; v11, _, _ = grid[a + 1][c + 1]
                face(bm, uvl, [v00, v10, v11, v01], [UV(u00, s0), UV(u00, s1), UV(u01, s1), UV(u01, s0)])
    bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if not v.link_faces], dist=0)
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    return bm


# ------------------------------------------------------------------ the arena and the city
def room_under(x, z, half):
    """How tall a block at lot (x, z) may be without touching the course."""
    top = 60.0
    reach = W / 2 + 1.4 + half
    d = np.hypot(P[::2, 0] - x, P[::2, 2] - z)
    y = P[::2, 1]
    if np.any(d < reach):
        top = min(top, float(np.min(y[d < reach])) - 3.2)
    near = (d >= reach) & (d < reach + 1.5)
    if np.any(near):
        top = min(top, float(np.min(y[near])) + 6)
    return top


def arena(detail=1.0, floor=0.1):
    """uv.x codes: 0.05 floor, 0.15 blocks (uv.y their height), 0.35 stands, 0.55 light frame, 0.75 pylons.
    floor: the floor slab's height. The city's ground is one huge plane, and from further away its depth is too
    coarse for a floor a few centimetres above it (they flickered against each other), so the lighter levels,
    seen from further away, stand on a thicker slab."""
    bm, uvl = new_bm()
    box(bm, uvl, Vector((0, 0, floor / 2)), (LOT_W - 0.3, LOT_D - 0.3, floor), UV(0.05, 0.5))
    blocks = 0
    x = -LOT_W / 2 + 3
    while x < LOT_W / 2 - 3:
        z = -LOT_D / 2 + 3
        while z < LOT_D / 2 - 3:
            cx, cz = x + (rng.random() - 0.5) * 0.8, z + (rng.random() - 0.5) * 0.8
            w, dd = 1.0 + rng.random() * 1.1, 1.0 + rng.random() * 1.1
            hgt = 2 + rng.random() ** 1.6 * 16
            keep = rng.random() < detail
            if abs(cx) <= 10.8 and keep:
                room = room_under(cx, cz, max(w, dd) / 2)
                if room >= 1.2:
                    h = min(room, hgt)
                    box(bm, uvl, B((cx, h / 2, cz)), (w, dd, h), UV(0.15, h))
                    blocks += 1
            z += 2.6
        x += 2.6
    for side in (-1, 1):
        for k in range(6):
            h = 0.8 + k * 1.1
            box(bm, uvl, B((side * (11.6 + k * 0.7), h / 2, 0)), (0.75, 35, h), UV(0.35, h))
    top = LOT_H - 1.2
    hw, hd = LOT_W / 2 - 0.4, LOT_D / 2 - 0.4
    for y in (0.08, top):
        box(bm, uvl, B((0, y, -hd)), (LOT_W - 0.8, 0.12, 0.12), UV(0.55, 0.5))
        box(bm, uvl, B((0, y, hd)), (LOT_W - 0.8, 0.12, 0.12), UV(0.55, 0.5))
        box(bm, uvl, B((-hw, y, 0)), (0.12, LOT_D - 0.8, 0.12), UV(0.55, 0.5))
        box(bm, uvl, B((hw, y, 0)), (0.12, LOT_D - 0.8, 0.12), UV(0.55, 0.5))
    for x in (-hw, hw):
        for z in (-hd, hd):
            box(bm, uvl, B((x, top / 2, z)), (0.16, 0.16, top), UV(0.6, 0.5))
    # pylons under the raised parts of the course, where nothing of the course is below
    pylons = 0
    if detail >= 1:
        for i in range(0, n, 24):
            px, py, pz = P[i]
            if py < 2.5 or GAP[i] or U[i, 1] < 0.85:
                continue
            lower = [j for j in range(0, n, 2) if abs(j - i) >= 40 and P[j, 1] < py - 0.5 and math.hypot(P[j, 0] - px, P[j, 2] - pz) < W / 2 + 0.6]
            if lower:
                continue
            h = py - 0.22
            r = bmesh.ops.create_cone(bm, cap_ends=False, segments=6, radius1=0.16, radius2=0.11, depth=h,
                                      matrix=Matrix.Translation(B((px, h / 2, pz))))
            for f in {f for v in r['verts'] for f in v.link_faces}:
                for loop in f.loops:
                    loop[uvl].uv = UV(0.75, 0.5)
            pylons += 1
    print('arena: blocks', blocks, 'pylons', pylons)
    return bm


# ------------------------------------------------------------------ the screens
# All run by screens.glsl from board.png (the game's show). uv.x codes, kept inside 0..1 (the server quantizes
# texture coordinates): below 0.5 a jumbotron face, (k + u) / 16 for face k; 0.7 the ribbon read from inside,
# 0.9 from outside, 0.8 the boards along the stands. uv.y is 0 at the bottom (glTF turns it over).
def jumbo(bm, uvl, c, n_out, w, h, k):
    """A two-sided jumbotron at c (lot coordinates), faces k (towards n_out, the street) and k + 1 (inside)."""
    c = B(c); nb = B(n_out).normalized()
    up = Vector((0, 0, 1))
    for normal, kk in ((nb, k), (-nb, k + 1)):
        right = up.cross(normal)
        c2 = c + normal * 0.03
        bl = c2 - right * w / 2 - up * h / 2; br = c2 + right * w / 2 - up * h / 2
        tr = c2 + right * w / 2 + up * h / 2; tl = c2 - right * w / 2 + up * h / 2
        u0, u1 = (kk + 0.01) / 16, (kk + 0.99) / 16
        face(bm, uvl, [bm.verts.new(v) for v in (bl, br, tr, tl)], [(u0, 0), (u1, 0), (u1, 1), (u0, 1)])


def band(bm, uvl, pts, y, h, code, closed=True):
    """A ribbon along pts ([(x, z)], lot), facing the left of the walk (inside for the walk round the arena
    west to east along the north wall)."""
    seq = list(pts) + ([pts[0]] if closed else [])
    for a, b in zip(seq, seq[1:]):
        vs = [B((a[0], y, a[1])), B((b[0], y, b[1])), B((b[0], y + h, b[1])), B((a[0], y + h, a[1]))]
        face(bm, uvl, [bm.verts.new(v) for v in vs], [(code, 0), (code, 0), (code, 1), (code, 1)])


def screens():
    bm, uvl = new_bm()
    hd, hw = LOT_D / 2 - 0.35, LOT_W / 2 - 0.35
    # four jumbotrons, both sides playing: the ends and the long sides
    jumbo(bm, uvl, (0, 18.5, -hd), (0, 0, -1), 16, 9, 0)
    jumbo(bm, uvl, (0, 18.5, hd), (0, 0, 1), 16, 9, 2)
    jumbo(bm, uvl, (hw, 14.5, -4), (1, 0, 0), 10, 5.625, 4)
    jumbo(bm, uvl, (-hw, 14.5, 4), (-1, 0, 0), 10, 5.625, 6)
    # the sponsor ribbons round the arena, above the stands and under the ring of light, read from both sides
    ring = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]
    for y in (7.0, 24.3):
        band(bm, uvl, ring, y, 1.2, 0.7)
        band(bm, uvl, ring[::-1], y, 1.2, 0.9)
    # the boards along the fronts of the stands
    band(bm, uvl, [(11.2, -17.4), (11.2, 17.4)], 0.1, 0.6, 0.8, closed=False)
    band(bm, uvl, [(-11.2, 17.4), (-11.2, -17.4)], 0.1, 0.6, 0.8, closed=False)
    return bm


# ------------------------------------------------------------------ the machines
# sixteen of the eighteen machines (the two thinnest stay out: from the street they are lines)
MODELS = ['volt', 'comet', 'oni', 'nova', 'spark', 'oracle', 'empress', 'static', 'gecko', 'kraken', 'hammer', 'lune', 'terror', 'wolf', 'parade', 'tophat']
STREET = 1.5        # the machines a size up for the street (0.9 m ones are specks from across the road)
CELL_W, CELL_H, COLS = 256, 240, 4


def machine_meshes():
    """The machines decimated for the street, their base colours in one 1024 atlas (4 x 4 cells, a white
    strip at the bottom for the flames)."""
    atlas = np.zeros((1024, 1024, 4), dtype=np.float32)
    atlas[..., 3] = 1
    atlas[960:, :, :3] = 1.0
    meshes = []
    for k, name in enumerate(MODELS):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, 'experience', 'assets', 'machines', f'{name}.glb'))
        ob = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH')
        for o in bpy.data.objects:
            if o not in before and o is not ob:
                bpy.data.objects.remove(o)
        ob.parent = None
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        dec = ob.modifiers.new('dec', 'DECIMATE')
        dec.ratio = 620 / max(1, sum(len(p.vertices) - 2 for p in ob.data.polygons))
        bpy.ops.object.modifier_apply(modifier='dec')
        for vtx in ob.data.vertices:
            vtx.co *= STREET
        # its base colour into its cell
        mat = ob.data.materials[0]
        bsdf = next(nd for nd in mat.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED')
        img = bsdf.inputs['Base Color'].links[0].from_node.image
        img = img.copy()
        img.scale(CELL_W, CELL_H)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(CELL_H, CELL_W, 4)[::-1]   # top row first
        col, row = k % COLS, k // COLS
        x0, y0 = col * CELL_W, row * CELL_H
        atlas[y0:y0 + CELL_H, x0:x0 + CELL_W] = px
        uvl = ob.data.uv_layers.active.data
        for d in uvl:
            ub, vb = d.uv
            ub = min(max(ub, 0.0), 1.0); vb = min(max(vb, 0.0), 1.0)
            d.uv = ((x0 + ub * CELL_W) / 1024, 1 - (y0 + (1 - vb) * CELL_H) / 1024)
        ob.data.uv_layers.active.name = 'UVMap'
        ob.data.materials.clear()
        meshes.append(ob)
    img = bpy.data.images.new('machines_atlas', 1024, 1024)
    img.pixels = atlas[::-1].ravel().tolist()
    img.pack()
    return meshes, img


def flame(bm, uvl, length=0.45):
    """Two crossed quads behind a machine (model space, nose along Blender -y): the flame strip of the atlas,
    u from the nozzle (0) to the tail (1)."""
    y0, y1 = 0.42 * STREET, (0.42 + length) * STREET
    z = 0.11 * STREET
    w, h = 0.07 * STREET, 0.06 * STREET
    for a, b in (((w, 0), (-w, 0)), ((0, h), (0, -h))):
        vs = [Vector((a[0], y0, z + a[1])), Vector((b[0], y0, z + b[1])), Vector((b[0], y1, z + b[1])), Vector((a[0], y1, z + a[1]))]
        face(bm, uvl, [bm.verts.new(v) for v in vs], [(0.0, 0.055), (0.0, 0.005), (0.3, 0.005), (0.3, 0.055)])


def racer_basis(f, u):
    """The machine's rotation in Blender coordinates for a lot forward f and up u: model x -> up x forward,
    model y -> -forward (the nose is at Blender -y), model z -> up."""
    fb, ub = B(f).normalized(), B(u).normalized()
    xb = ub.cross(fb).normalized()
    return Matrix((xb, -fb, ub)).transposed()


# ------------------------------------------------------------------ build LOD0
TRACK = material('Track', (0.02, 0.025, 0.05), 0.31, double=True)
CITY = material('City', (0.03, 0.03, 0.06), 0.83)
SCREENS = material('Screens', (1, 1, 1), 0.52)
models, atlas_img = machine_meshes()
MACHINES = material('Machines', (1, 1, 1), 0.41, image=atlas_img)

track_ob = mesh_object('Course', course(1), [TRACK])
arena_ob = mesh_object('Arena', arena(1.0), [CITY])
screens_ob = mesh_object('Screens', screens(), [SCREENS])

# the racers: a copy of each machine (with flames), each on its own bone
HW = {name: 0.5 * (max(v.co.x for v in m.data.vertices) - min(v.co.x for v in m.data.vertices)) for name, m in zip(MODELS, models)}
rest = []
parts = []
for k in range(RACERS):
    name = MODELS[k % len(MODELS)]
    # the bind pose spreads them round the lap: the viewer's culling sphere comes from it, and it must hold
    # the whole course (with all sixteen on the start straight the racers vanished once they left it)
    s0 = (k + 0.5) * L / RACERS
    if GAP[int(s0 / STEP) % n]:
        s0 += 6.0
    x0 = [-0.8, 0.0, 0.8][k % 3]
    p, f, u, r = frame(s0)
    c = B(p + r * x0 + u * 0.1)
    R0 = racer_basis(f, u)
    me = models[k % len(MODELS)].data.copy()
    bm = bmesh.new(); bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    flame(bm, uvl)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ R0.to_4x4(), verts=bm.verts)
    ob = mesh_object(f'r{k:02d}', bm, [MACHINES])
    ob.vertex_groups.new(name=f'r{k:02d}').add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    parts.append(ob)
    rest.append((c, R0, name))
for m in models:
    bpy.data.objects.remove(m)

# the anchor: two specks (2 mm, drawn with the flame's discarded tail, so invisible) at opposite corners of
# the lot on a bone that never moves. A viewer works out the skinned mesh's culling sphere once, from the
# pose of that moment; with the anchor in it the sphere always holds the whole arena, wherever the racers
# are (without it they vanished as soon as they left the place they were in when the lot loaded)
bm = bmesh.new()
uvl = bm.loops.layers.uv.new('UVMap')
for c in (Vector((-LOT_W / 2 + 0.2, LOT_D / 2 - 0.2, 0.05)), Vector((LOT_W / 2 - 0.2, -LOT_D / 2 + 0.2, LOT_H - 0.5))):
    vs = [bm.verts.new(c), bm.verts.new(c + Vector((0.002, 0, 0))), bm.verts.new(c + Vector((0, 0, 0.002)))]
    face(bm, uvl, vs, [(0.3, 0.03)] * 3)
anchor = mesh_object('anchor', bm, [MACHINES])
anchor.vertex_groups.new(name='anchor').add(list(range(len(anchor.data.vertices))), 1.0, 'REPLACE')
parts.append(anchor)

arm_data = bpy.data.armatures.new('race_rig')
arm = bpy.data.objects.new('race_rig', arm_data)
sc.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for k, (c, R0, _) in enumerate(rest):
    b = arm_data.edit_bones.new(f'r{k:02d}')
    b.head = c
    b.tail = c + Vector((0, 0.4, 0))
    b.roll = 0
b = arm_data.edit_bones.new('anchor')
b.head = (0, 0, 0.05)
b.tail = (0, 0.4, 0.05)
b.roll = 0
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT')
for ob in parts:
    ob.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
fleet = parts[0]
fleet.name = 'Fleet'
print('fleet mesh fixed' if fleet.data.validate() else 'fleet mesh valid')
fleet.parent = arm
fleet.modifiers.new('rig', 'ARMATURE').object = arm

# ---- the race: four laps a minute each, overtaking (periodic speed changes), spread across the road
v = LAPS * L / LOOP
spec = []
for k in range(RACERS):
    spec.append(dict(D0=14.0 - k * 1.6, A=rng.uniform(3, 9), m=int(rng.integers(1, 4)), ph=rng.uniform(0, 6.283),
                     A2=rng.uniform(1, 3), m2=int(rng.integers(4, 8)), ph2=rng.uniform(0, 6.283),
                     o=[-0.8, 0.0, 0.8][k % 3] * 0.6 + rng.uniform(-0.2, 0.2), lx=rng.uniform(0.4, 0.9),
                     wx=rng.uniform(0.2, 0.45), nx=int(rng.integers(2, 7)), psx=rng.uniform(0, 6.283)))
T = np.arange(N + 1) / FPS
Dk = np.zeros((RACERS, N + 1)); Xk = np.zeros((RACERS, N + 1))
for k, sp in enumerate(spec):
    w = 2 * math.pi / LOOP
    Dk[k] = sp['D0'] + v * T + sp['A'] * np.sin(w * sp['m'] * T + sp['ph']) - sp['A'] * math.sin(sp['ph']) \
        + sp['A2'] * np.sin(w * sp['m2'] * T + sp['ph2']) - sp['A2'] * math.sin(sp['ph2'])
    for t_i in range(N + 1):
        s = Dk[k, t_i] % L
        Xk[k, t_i] = LINE[int(s / STEP) % n] * sp['lx'] + sp['o'] + sp['wx'] * math.sin(w * sp['nx'] * T[t_i] + sp['psx'])
# no two machines in the same place: push apart across the road, then smooth (periodically)
lim = W / 2 - 0.45
for it in range(6):
    for t_i in range(N + 1):
        s = Dk[:, t_i]
        for a in range(RACERS):
            for b in range(a + 1, RACERS):
                ds = (s[b] - s[a] + L / 2) % L - L / 2
                if abs(ds) < 1.0:
                    dx = Xk[b, t_i] - Xk[a, t_i]
                    need = HW[rest[a][2]] + HW[rest[b][2]] + 0.08
                    if abs(dx) < need:
                        push = (need - abs(dx)) / 2 * (1 if dx >= 0 else -1)
                        Xk[a, t_i] -= push; Xk[b, t_i] += push
    Xk = np.clip(Xk, -lim, lim)
    # a moving average round the loop (the clip's last frame is its first)
    ker = np.ones(9) / 9
    sm = []
    for x in Xk:
        base = x[:N]
        y = np.convolve(np.concatenate([base[-4:], base, base[:4]]), ker, 'valid')
        sm.append(np.append(y, y[0]))
    Xk = np.array(sm)

act = bpy.data.actions.new('race')
arm.animation_data_create()
arm.animation_data.action = act
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'
frames = np.arange(N + 1)


def all_fcurves(a):
    if hasattr(a, 'fcurves') and len(a.fcurves):
        return list(a.fcurves)
    out = []
    for layer in a.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out += list(bag.fcurves)
    return out


def put(bone, loc, quat):
    pb = arm.pose.bones[bone]
    for path in ('location', 'rotation_quaternion'):
        pb.keyframe_insert(path, frame=0)
    curves = {(c.data_path, c.array_index): c for c in all_fcurves(act) if f'"{bone}"' in c.data_path}
    for path, vals in (('location', loc), ('rotation_quaternion', quat)):
        for i in range(vals.shape[1]):
            kp = curves[(f'pose.bones["{bone}"].{path}', i)].keyframe_points
            kp.clear()
            kp.add(len(frames))
            co = np.empty(len(frames) * 2)
            co[0::2] = frames
            co[1::2] = vals[:, i]
            kp.foreach_set('co', co)
            kp.foreach_set('interpolation', [1] * len(frames))
            curves[(f'pose.bones["{bone}"].{path}', i)].update()


for k in range(RACERS):
    c, R0, name = rest[k]
    loc = np.zeros((N + 1, 3)); quat = np.zeros((N + 1, 4))
    R0i = R0.inverted()
    for t_i in range(N + 1):
        D = Dk[k, t_i]
        p, f, u, r = frame(D)
        # heading: along the road, turned by how fast it moves across
        dD = Dk[k, min(t_i + 1, N)] - Dk[k, max(t_i - 1, 0)]
        dX = Xk[k, min(t_i + 1, N)] - Xk[k, max(t_i - 1, 0)]
        psi = math.atan2(dX, max(dD, 0.05))
        fh = f * math.cos(psi) + r * math.sin(psi)
        pos = B(p + r * Xk[k, t_i] + u * 0.1)
        Rt = racer_basis(fh, u)
        loc[t_i] = np.array(pos - c)
        quat[t_i] = np.array((Rt @ R0i).to_quaternion())
    for t_i in range(1, N + 1):
        if np.dot(quat[t_i], quat[t_i - 1]) < 0:
            quat[t_i] = -quat[t_i]
    put(f'r{k:02d}', loc, quat)
sc.frame_start, sc.frame_end = 0, N


# ---- check the bind pose fits, export
def bounds(objs):
    lo = np.full(3, 1e9); hi = -lo
    for o in objs:
        co = np.array([o.matrix_world @ v.co for v in o.data.vertices])
        lo = np.minimum(lo, co.min(0)); hi = np.maximum(hi, co.max(0))
    return lo, hi


tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
lo, hi = bounds([track_ob, arena_ob, screens_ob, fleet])
print('bind bounds', lo.round(2), hi.round(2))
assert hi[2] <= LOT_H and max(-lo[0], hi[0]) <= LOT_W / 2 + 0.05 and max(-lo[1], hi[1]) <= LOT_D / 2 + 0.05, 'outside the lot'
EXPORT = dict(export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_texcoords=True,
              export_normals=True, export_tangents=False, export_materials='EXPORT', export_image_format='WEBP',
              export_image_quality=88, export_extras=False, export_lights=False, export_cameras=False)
bpy.ops.object.select_all(action='DESELECT')
for o in (arm, fleet, track_ob, arena_ob, screens_ob):
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
sc.frame_set(0)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'lod0.glb'), export_skins=True, export_def_bones=False,
                          export_rest_position_armature=True, export_animations=True, export_animation_mode='ACTIONS',
                          export_frame_range=True, export_frame_step=1, export_force_sampling=True,
                          export_optimize_animation_size=False, export_morph=False, **EXPORT)
print('LOD0 tris: course', tris(track_ob), 'arena', tris(arena_ob), 'screens', tris(screens_ob), 'fleet', tris(fleet),
      'total', tris(track_ob) + tris(arena_ob) + tris(screens_ob) + tris(fleet), 'bones', len(arm.data.bones))

# ---- LOD1: the course and the arena, lighter, still
track1 = mesh_object('Course1', course(3, parts=('top', 'rails')), [TRACK])
arena1 = mesh_object('Arena1', arena(0.6, floor=0.35), [CITY])
bpy.ops.object.select_all(action='DESELECT')
track1.select_set(True); arena1.select_set(True)
bpy.context.view_layer.objects.active = track1
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'lod1.glb'), export_skins=False, export_animations=False, **EXPORT)
print('LOD1 tris', tris(track1) + tris(arena1))

# ---- LOD2: the floor with the course drawn on it, the road as a ribbon, the stands; one 256 px picture
# (the floor on a 1 m slab: seen from 240 m and more, a thinner one flickered against the city's ground)
FL2 = 1.0
bm, uvl = new_bm()
fl = [B((-LOT_W / 2 + 0.2, FL2, -LOT_D / 2 + 0.2)), B((LOT_W / 2 - 0.2, FL2, -LOT_D / 2 + 0.2)), B((LOT_W / 2 - 0.2, FL2, LOT_D / 2 - 0.2)), B((-LOT_W / 2 + 0.2, FL2, LOT_D / 2 - 0.2))]
# the picture's floor square: x 3..189 px (lot x -16..16), y 0..256 px (lot z -22..22)
fuv = [(3 / 256, 1 - 1 / 256), (189 / 256, 1 - 1 / 256), (189 / 256, 1 / 256), (3 / 256, 1 / 256)]
face(bm, uvl, [bm.verts.new(v) for v in fl], [(u, 1 - (1 - vv)) for u, vv in fuv])
CY = ((196 + 30) / 256, 1 - 30 / 256)        # the road's colour swatch
ST = ((196 + 30) / 256, 1 - 96 / 256)        # the stands
# the slab's sides, in the stands' dark colour, its top just under the floor picture
r = bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.transform(bm, matrix=Matrix.Translation(B((0, (FL2 - 0.1) / 2, 0))) @ Matrix.Diagonal((LOT_W - 0.4, LOT_D - 0.4, FL2 - 0.1, 1)), verts=r['verts'])
for f in {f for v in r['verts'] for f in v.link_faces}:
    for loop in f.loops:
        loop[uvl].uv = ST
rows = list(range(0, n, 8)) + [n]
grid = []
for j in rows:
    i = j % n
    p, u, r = P[i], U[i], R[i]
    grid.append((bm.verts.new(B(p - r * W / 2)), bm.verts.new(B(p + r * W / 2))))
for a in range(len(rows) - 1):
    i0, i1 = rows[a] % n, rows[a + 1] % n
    if any(GAP[(rows[a] + q) % n] for q in range(rows[a + 1] - rows[a] + 1)):
        continue
    face(bm, uvl, [grid[a][0], grid[a + 1][0], grid[a + 1][1], grid[a][1]], [CY] * 4)
for side in (-1, 1):
    r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(B((side * 13.4, 3.4, 0))) @ Matrix.Diagonal((4.2, 35, 6.8, 1)), verts=r['verts'])
    for f in {f for v in r['verts'] for f in v.link_faces}:
        for loop in f.loops:
            loop[uvl].uv = ST
far = mesh_object('Far', bm, [])
mf = bpy.data.materials.new('Far')
mf.use_nodes = True
mf.use_backface_culling = False
tex = mf.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = bpy.data.images.load(os.path.join(SRC, 'far.png'))
bsf = mf.node_tree.nodes.get('Principled BSDF')
mf.node_tree.links.new(tex.outputs['Color'], bsf.inputs['Base Color'])
mf.node_tree.links.new(tex.outputs['Color'], bsf.inputs['Emission Color'])
bsf.inputs['Emission Strength'].default_value = 0.6
far.data.materials.append(mf)
bpy.ops.object.select_all(action='DESELECT')
far.select_set(True)
bpy.context.view_layer.objects.active = far
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'lod2.glb'), export_skins=False, export_animations=False, **EXPORT)
print('LOD2 tris', tris(far))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'street.blend'))
print('LODS DONE')
