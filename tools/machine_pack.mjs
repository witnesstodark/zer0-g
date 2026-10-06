// Quantizes the machines' geometry (KHR_mesh_quantization: positions in 16 bits, normals and texture
// coordinates in 16 bits too), about half the bytes of the float GLBs Blender writes; three.js reads it as it
// is, and loadMachines turns it back into floats. node tools/machine_pack.mjs [dir] (default
// experience/assets/machines)
import { createRequire } from 'node:module'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { NodeIO } = require('@gltf-transform/core')
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions')
const { quantize, prune, dedup } = require('@gltf-transform/functions')
const dir = process.argv[2] ?? fileURLToPath(new URL('../experience/assets/machines/', import.meta.url))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
for (const f of readdirSync(dir).filter(f => f.endsWith('.glb'))) {
  const path = join(dir, f), before = statSync(path).size
  const doc = await io.read(path)
  await doc.transform(dedup(), prune(), quantize({ quantizePosition: 16, quantizeNormal: 16, quantizeTexcoord: 16 }))
  await io.write(path, doc)
  console.log(f, before, '->', statSync(path).size)
}
