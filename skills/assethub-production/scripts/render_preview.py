"""Headless Blender preview for AssetHub mesh outputs (GLB or FBX).

blender -b --factory-startup -P render_preview.py -- <out_prefix> <mesh.glb|mesh.fbx> [more ...]

Imports every file into one scene, prints mesh stats as one JSON line prefixed STATS=
(objects, vertices, triangles, size in metres), and renders on a neutral grey studio
background: <out_prefix>_front.png, <out_prefix>_34.png and, for meshes up to 150K
triangles, <out_prefix>_wire.png. Relative paths resolve against the shell's current folder.
Tested with Blender 5.1.
"""
import os
import json
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
out_prefix, files = os.path.abspath(argv[0]), [os.path.abspath(f) for f in argv[1:]]

bpy.ops.wm.read_factory_settings(use_empty=True)
for f in files:
    if f.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=f)
    else:
        bpy.ops.import_scene.gltf(filepath=f)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
deps = bpy.context.evaluated_depsgraph_get()
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
stats = {"objects": [], "verts": 0, "tris": 0}
for o in meshes:
    ev = o.evaluated_get(deps)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    stats["objects"].append({"name": o.name, "verts": len(me.vertices), "tris": len(me.loop_triangles),
                             "materials": [m.name for m in o.data.materials if m]})
    stats["verts"] += len(me.vertices)
    stats["tris"] += len(me.loop_triangles)
    for v in me.vertices:
        w = o.matrix_world @ v.co
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
    ev.to_mesh_clear()
size = hi - lo
center = (hi + lo) / 2
stats["size_xyz"] = [round(x, 4) for x in size]
print("STATS=" + json.dumps(stats))

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in {
    e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items} else "BLENDER_EEVEE"
scene.render.resolution_x = 900
scene.render.resolution_y = 1200
scene.render.film_transparent = False
world = bpy.data.worlds.new("studio")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.42, 0.42, 0.44, 1)
bg.inputs[1].default_value = 0.9
scene.world = world
scene.view_settings.view_transform = "Standard"

for name, energy, rot in [("key", 3.5, (50, 0, 35)), ("fill", 1.6, (60, 0, -50)), ("rim", 2.5, (120, 0, 180))]:
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy = energy
    lo_ = bpy.data.objects.new(name, ld)
    lo_.rotation_euler = [math.radians(a) for a in rot]
    scene.collection.objects.link(lo_)

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
extent = max(size.x, size.y, size.z)
cam_data.ortho_scale = max(size.z * 1.12, max(size.x, size.y) * 1.12 * 1200 / 900)
dist = extent * 4 + 1

for tag, yaw in [("front", 0.0), ("34", 35.0)]:
    a = math.radians(yaw)
    # glTF imports Y-up content as Z-up with the front facing -Y.
    cam.location = center + Vector((math.sin(a) * dist, -math.cos(a) * dist, 0))
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{out_prefix}_{tag}.png"
    bpy.ops.render.render(write_still=True)

# Topology view for light meshes: dark wireframe copies over the shaded model, front camera.
if stats["tris"] <= 150000:
    wire_mat = bpy.data.materials.new("wire")
    wire_mat.use_nodes = True
    nt = wire_mat.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = (0.02, 0.02, 0.03, 1)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs[0])
    for o in meshes:
        w = o.copy()
        w.data = o.data.copy()
        scene.collection.objects.link(w)
        w.data.materials.clear()
        w.data.materials.append(wire_mat)
        mod = w.modifiers.new("wire", "WIREFRAME")
        mod.thickness = extent * 0.0012
        mod.use_relative_offset = False
        mod.use_replace = True
        mod.use_even_offset = False
    cam.location = center + Vector((0, -dist, 0))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{out_prefix}_wire.png"
    bpy.ops.render.render(write_still=True)
