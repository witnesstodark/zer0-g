// The eighteen machines and their pilots, and how the racers are drawn: one instanced mesh per model (30
// racers in eighteen draw calls) with a neon rim in each racer's colour, thruster flames out of each machine's
// own nozzles in its own colour (found in its mesh), the hover glow under each machine and light trails, all
// instanced or merged too.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { shared, fogChunk } from './look.js'
import { U } from './scale.js'
import { Airflow } from './airflow.js'

export const GRADE = { A: 1.0, B: 0.8, C: 0.6, D: 0.4, E: 0.2 }

// The eighteen pilots, each in a machine of their own (mesh: its file in assets/machines), with stats as in the
// old arcade racers: letters A (best) to E for the body (how much a hit costs, how hard it pushes others), the
// boost (how strong and long) and the grip (how sharply it turns, how little it slides). hue and sat repaint a
// machine (a turn of the colour wheel, how much colour is left): the pilots fly theirs as made, the rivals in
// the pilots' machines a little off.
const P = (id, pilot, name, mesh, accent, body, boost, grip, weight) => ({ id, pilot, name, mesh, hue: 0, sat: 1, accent, body, boost, grip, weight, portrait: `pilot_${id}` })
export const PILOTS = [
  P('kai', 'KAI ROOK', 'VOLT FALCON', 'volt', 0x29d3ff, 'B', 'B', 'B', 1150),
  P('orion', 'ORION KADE', 'SILVER COMET', 'comet', 0xdfe8ff, 'A', 'C', 'B', 1260),
  P('raijin', 'RAIJIN', 'THUNDER ONI', 'oni', 0xff3b30, 'C', 'A', 'C', 1100),
  P('mara', 'MARA VEX', 'RED NOVA', 'nova', 0xff4a2b, 'D', 'A', 'C', 960),
  P('kira', 'KIRA BLAZE', 'WILD SPARK', 'spark', 0xffd23a, 'C', 'B', 'B', 1010),
  P('nyx', 'NYX-7', 'GHOST NEEDLE', 'needle', 0xaef6ff, 'E', 'A', 'A', 880),
  P('zeke', 'DR. ZEKE HALLORAN', 'GOLD ORACLE', 'oracle', 0xffb21f, 'C', 'C', 'A', 1080),
  P('sora', 'MADAME SORA', 'RING EMPRESS', 'empress', 0xb76bff, 'B', 'C', 'A', 1120),
  P('hollow', 'DR. HOLLOW', 'STATIC KING', 'static', 0x7dff3a, 'C', 'B', 'B', 1090),
  P('brakk', 'BRAKK', 'IRON GECKO', 'gecko', 0x7dff3a, 'A', 'D', 'B', 1520),
  P('gorgo', 'GORGO', 'DEEP KRAKEN', 'kraken', 0x3bffd0, 'A', 'C', 'C', 1480),
  P('bolt', 'BIG BOLT', 'HAMMERHEAD', 'hammer', 0xff8a1f, 'A', 'B', 'D', 1600),
  P('lune', 'LUNE', 'PHANTOM LUNE', 'lune', 0xff6fd8, 'E', 'B', 'A', 820),
  P('pixel', 'PIXEL', 'TINY TERROR', 'terror', 0xb4ff3a, 'D', 'A', 'B', 790),
  P('medusa', 'MEDUSA PRIME', 'VIPER COIL', 'viper', 0x3bff8a, 'C', 'B', 'A', 900),
  P('shade', 'SHADE', 'NIGHT WOLF', 'wolf', 0x9a4dff, 'B', 'A', 'D', 1240),
  P('baron', 'BARON SKULLCROWN', 'DEATH PARADE', 'parade', 0x5a7dff, 'B', 'B', 'C', 1300),
  P('mak', 'SIR MAK', 'TOP HAT', 'tophat', 0xff2bd6, 'C', 'A', 'B', 1050),
]
PILOTS.forEach((p, k) => { p.model = k })
// each machine's thruster colour (its flames and the glow in its nozzles), no two alike
const FLAME = {
  volt: 0x29c8ff, comet: 0xdfe8ff, oni: 0xff3a1a, nova: 0xff8a00, spark: 0xffe23a, needle: 0x9ffcff,
  oracle: 0xffb000, empress: 0xb56bff, static: 0x8cff2a, gecko: 0x2aff9a, kraken: 0x2affe8, hammer: 0xff5a00,
  lune: 0xff6fe0, terror: 0xd4ff2a, viper: 0x00ff6a, wolf: 0x7a3dff, parade: 0x3a6bff, tophat: 0xff1fb4,
}
PILOTS.forEach(p => { p.flame = FLAME[p.mesh] ?? p.accent })
// a racer's model is a pilot's index: MACHINES[model] gives its stats
export const MACHINES = PILOTS

// the other pilots of the field (in the pilots' machines, a little off in colour)
export const RIVALS = [
  'JAX ORTEGA', 'NIKA SOL', 'BIG TOMMO', 'VEGA-9', 'RIKU TANE', 'DOC FENWICK', 'ZARA QUILL', 'OMAR KADE', 'PIXEL', 'LADY CHROME',
  'MAKO', 'IGOR STRAND', 'SKYE NOVAK', 'BRUNO VALE', 'KIT RUSH', 'THE BARON', 'NEON JOE', 'YUKI ARA', 'GHOST-77', 'RAMONA DIAZ',
  'TITAN KOVA', 'LEX CUTTER', 'DOT', 'FINN HARLOW', 'SABLE', 'COMET KID', 'ANYA VOLK', 'MR. MAK', 'HEX', 'ROXY BLAZE',
]
export const RIVAL_ACCENTS = [0x29d3ff, 0xff2bd6, 0xffb21f, 0x7dff3a, 0xff6fd8, 0x9a4dff, 0xff3b30, 0x3bffd0, 0xfff23b, 0xff8a1f, 0x5a7dff, 0xeaf6ff]

export async function loadMachines(p0) {
  const loader = new GLTFLoader()
  return Promise.all(MACHINES.map(async m => {
    const gltf = await loader.loadAsync(p0.asset(`assets/machines/${m.mesh}.glb`))
    let mesh = null
    gltf.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o })
    mesh.updateWorldMatrix(true, false)
    // the files carry quantized geometry (16-bit numbers, a smaller download): back to floats first
    const geo = floats(mesh.geometry.clone())
    geo.applyMatrix4(mesh.matrixWorld)
    geo.computeBoundingBox()
    return { ...m, id: m.mesh, geometry: geo, material: mesh.material, size: geo.boundingBox.getSize(new THREE.Vector3()), nozzles: findNozzles(geo) }
  }))
}

/** Quantized or interleaved attributes as plain floats (the shaders and the nozzle search read them as such). */
function floats(geo) {
  for (const [name, a] of Object.entries(geo.attributes)) {
    if (!a.isInterleavedBufferAttribute && a.array instanceof Float32Array && !a.normalized) continue
    const f = new Float32Array(a.count * a.itemSize), get = [i => a.getX(i), i => a.getY(i), i => a.getZ(i), i => a.getW(i)]
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = get[k](i)
    geo.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize))
  }
  return geo
}

/**
 * A player's own machine (a Project 0 entity, made by their agent) as a model like the game's own: its parts
 * merged into one geometry (a group per material), nose along +Z as the rules ask, centred, on y = 0 and scaled
 * to the length of every other machine (0.9 m), its nozzles found as for the others. def: its pilot entry.
 */
export async function loadEntityMachine(url, def) {
  const gltf = await new GLTFLoader().loadAsync(url)
  gltf.scene.updateMatrixWorld(true)
  const geos = [], mats = []
  gltf.scene.traverse(o => {
    if (!o.isMesh || geos.length >= 12) return
    let g = floats(o.geometry.clone())
    g.applyMatrix4(o.matrixWorld)
    if (!g.attributes.normal) g.computeVertexNormals()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n)
    g.morphAttributes = {}
    if (g.index) g = g.toNonIndexed()
    g.clearGroups()
    geos.push(g)
    mats.push(Array.isArray(o.material) ? o.material[0] : o.material)
  })
  if (!geos.length) throw new Error('the machine has no mesh')
  const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, true)
  geo.computeBoundingBox()
  const b = geo.boundingBox.clone(), len = Math.max(1e-3, b.max.z - b.min.z), k = 0.9 / len
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  geo.scale(k, k, k)
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  // its own nozzles when it names them (in the model's metres: moved and scaled as the geometry was), else found
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, y0 = b.min.y
  const nozzles = def.thrusters?.length ? def.thrusters.map(([x, y, z, r]) => ({ x: (x - cx) * k, y: (y - y0) * k, z: (z - cz) * k, r: r * k })) : findNozzles(geo)
  return { ...def, id: def.mesh, geometry: geo, material: mats.length === 1 ? mats[0] : mats, size: geo.boundingBox.getSize(new THREE.Vector3()), nozzles }
}

/**
 * Where a machine's thrusters are, from its mesh: the flat parts of its back half that face straight back and
 * that nothing hides from behind (a nozzle's end), sampled into a grid across its back and split into blobs;
 * roundish ones are taken (thin fins and spoilers are not), biggest first, mirrored to both sides (the
 * machines are symmetric). Up to four { x, y, z, r } in the model's units, nose along +z; the rearmost part of
 * the back if no such face is found.
 */
function findNozzles(geo) {
  const pos = geo.attributes.position, idx = geo.index, bb = geo.boundingBox
  const L = bb.max.z - bb.min.z, z0 = bb.min.z, xc = (bb.min.x + bb.max.x) / 2
  const W = bb.max.x - bb.min.x, H = bb.max.y - bb.min.y
  const cell = Math.max(W, H) / 48
  const nx = Math.ceil(W / cell) + 1, ny = Math.ceil(H / cell) + 1, N = nx * ny
  const depth = new Float32Array(N).fill(1e9), backZ = new Float32Array(N).fill(1e9)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3()
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3()
  const tris = idx ? idx.count / 3 : pos.count / 3
  const vi = k => idx ? idx.getX(k) : k
  const sample = (fn) => {
    const ext = Math.max(Math.abs(a.x - b.x), Math.abs(a.x - c.x), Math.abs(a.y - b.y), Math.abs(a.y - c.y))
    const n = Math.min(24, Math.max(2, Math.ceil(ext / cell) * 2))
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      q.copy(a).multiplyScalar(1 - (i + j) / n).addScaledVector(b, i / n).addScaledVector(c, j / n)
      fn(Math.round((q.y - bb.min.y) / cell) * nx + Math.round((q.x - bb.min.x) / cell), q.z)
    }
  }
  const back = []
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(pos, vi(t * 3)); b.fromBufferAttribute(pos, vi(t * 3 + 1)); c.fromBufferAttribute(pos, vi(t * 3 + 2))
    if (Math.min(a.z, b.z, c.z) > z0 + L * 0.45) continue
    sample((g, z) => { if (z < depth[g]) depth[g] = z })
    nrm.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a))
    if (nrm.lengthSq() > 0 && nrm.normalize().z < -0.6) back.push(t)
  }
  for (const t of back) {
    a.fromBufferAttribute(pos, vi(t * 3)); b.fromBufferAttribute(pos, vi(t * 3 + 1)); c.fromBufferAttribute(pos, vi(t * 3 + 2))
    sample((g, z) => { if (z < backZ[g]) backZ[g] = z })
  }
  // a cell is a nozzle's end when its rearmost surface faces back
  const open = g => backZ[g] < 1e8 && backZ[g] <= depth[g] + 0.015 * L
  const seen = new Uint8Array(N), blobs = []
  for (let g = 0; g < N; g++) {
    if (seen[g] || !open(g)) continue
    const stack = [g], cells = []
    seen[g] = 1
    while (stack.length) {
      const k = stack.pop(), x = k % nx, y = (k - x) / nx
      cells.push(k)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy, kk = Y * nx + X
        if (X < 0 || Y < 0 || X >= nx || Y >= ny || seen[kk] || !open(kk)) continue
        seen[kk] = 1; stack.push(kk)
      }
    }
    let sx = 0, sy = 0, sz = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
    for (const k of cells) { const x = k % nx, y = (k - x) / nx; sx += x; sy += y; sz += backZ[k]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1
    if (cells.length < 10 || Math.max(bw, bh) / Math.min(bw, bh) > 3) continue
    blobs.push({ x: bb.min.x + sx / cells.length * cell, y: bb.min.y + sy / cells.length * cell, z: sz / cells.length, r: Math.sqrt(cells.length / Math.PI) * cell, n: cells.length })
  }
  blobs.sort((p, p2) => p2.n - p.n)
  const out = []
  const clampR = r => Math.min(0.055 * L, Math.max(0.018 * L, r))
  for (const o of blobs) {
    if (out.length >= 4 || o.n < blobs[0].n * 0.25) break
    const off = o.x - xc
    if (Math.abs(off) < 0.06 * W) { if (!out.some(p => p.x === xc && Math.abs(p.y - o.y) < 0.08 * H)) out.push({ x: xc, y: o.y, z: o.z, r: clampR(o.r) }); continue }
    if (out.some(p => Math.abs(Math.abs(p.x - xc) - Math.abs(off)) < 0.06 * W && Math.abs(p.y - o.y) < 0.08 * H)) continue
    if (out.length > 2) continue
    const r = clampR(o.r)
    out.push({ x: xc + Math.abs(off), y: o.y, z: o.z, r }, { x: xc - Math.abs(off), y: o.y, z: o.z, r })
  }
  if (!out.length) {
    // no face looks back: the rearmost point of the back
    let best = 0
    for (let g = 1; g < N; g++) if (depth[g] < depth[best]) best = g
    const x = best % nx, y = (best - x) / nx
    out.push({ x: xc, y: bb.min.y + y * cell, z: depth[best], r: 0.03 * L })
  }
  return out
}

/** A small night room of neon panels for the machines' reflections. */
export function neonEnvironment(renderer) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0.01, 0.01, 0.03)
  const panel = (color, w, h, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))
    m.position.copy(pos)
    m.lookAt(look)
    scene.add(m)
  }
  const o = new THREE.Vector3()
  panel(new THREE.Color(0.2, 1.8, 2.6), 6, 1.2, new THREE.Vector3(-5, 3, 0), o)
  panel(new THREE.Color(2.6, 0.3, 2.0), 6, 1.2, new THREE.Vector3(5, 3, 0), o)
  panel(new THREE.Color(1.6, 1.5, 1.4), 8, 3, new THREE.Vector3(0, 7, 0), o)
  panel(new THREE.Color(0.1, 0.15, 0.4), 12, 12, new THREE.Vector3(0, -3, 0), o)
  panel(new THREE.Color(2.4, 1.2, 0.3), 3, 1, new THREE.Vector3(0, 2, -6), o)
  panel(new THREE.Color(0.4, 0.8, 2.4), 3, 1, new THREE.Vector3(0, 2, 6), o)
  const pm = new THREE.PMREMGenerator(renderer)
  const rt = pm.fromScene(scene, 0.03)
  pm.dispose()
  return rt.texture
}

/** The neon rim and the hit flash on a machine material (per-instance colour in aAccent). lite: a Lambert
 * copy (no reflections) for software renderers, where thirty PBR machines cost most of a frame. */
/** neonMaterial for one material or a list of them (a player's machine made of several parts). */
const neon = (src, lite = false) => Array.isArray(src) ? src.map(m => neonMaterial(m, lite)) : neonMaterial(src, lite)
const each = (mat, fn) => { for (const m of [mat].flat()) fn(m) }

function neonMaterial(src, lite = false) {
  const mat = lite ? new THREE.MeshLambertMaterial({ map: src.map, emissive: src.emissive, emissiveMap: src.emissiveMap }) : src.clone()
  if (!lite) mat.envMapIntensity = 1.1
  mat.emissiveIntensity = 0.9
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aAccent;\nattribute vec2 aHue;\nattribute float aHeal;\nvarying vec4 vAccent;\nvarying vec2 vHue;\nvarying float vHeal;\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAccent = aAccent;\nvHue = aHue;\nvHeal = aHeal;\nvObj = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec4 vAccent;
        varying vec2 vHue;
        varying float vHeal;
        varying vec3 vObj;
        // the pilot's livery: the paint's hue turned round the grey axis, its colour scaled
        vec3 livery(vec3 c) {
          float a = vHue.x * 6.2831853;
          const vec3 k = vec3(0.57735);
          float ca = cos(a);
          c = c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          return max(mix(vec3(l), c, vHue.y), 0.0);
        }`)
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = livery(diffuseColor.rgb);')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        // a machine right at the camera (one passing close) dissolves instead of filling the view
        float camD = length(vViewPosition);
        if (camD < ${(0.34 * U).toFixed(3)}) {
          float dither = fract(dot(floor(gl_FragCoord.xy), vec2(0.5, 0.25)) + fract(gl_FragCoord.y * 0.125) * 0.5);
          if (dither > (camD - ${(0.15 * U).toFixed(3)}) / ${(0.19 * U).toFixed(3)}) discard;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimK = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.2);
        totalEmissiveRadiance = livery(totalEmissiveRadiance);
        // a thin rim in the racer's colour; a boost tints the body a little (it used to wash it out, paint and
        // panels gone), a hit flashes it white
        float hit = smoothstep(0.4, 1.0, vAccent.a);
        totalEmissiveRadiance += vAccent.rgb * (rimK * 0.7 + min(vAccent.a, 0.4) * 0.45 + hit * 1.4) + vec3(hit * 0.8);
        // the repair: bright streams of liquid light running over the body from the nose to the tail, as if it
        // were being washed down, and a green sheen round its edges
        if (vHeal > 0.01) {
          float w = sin(vObj.z * 26.0 + uTime * 15.0 + sin(vObj.x * 21.0 + uTime * 4.0) * 1.7 + sin(vObj.y * 34.0 - uTime * 3.0) * 0.9);
          float stream = smoothstep(0.62, 1.0, w);
          float drip = smoothstep(0.92, 1.0, sin(vObj.x * 60.0 + vObj.z * 9.0 + uTime * 9.0));
          totalEmissiveRadiance += vec3(0.15, 1.5, 0.95) * (stream * 1.1 + drip * 0.35 + rimK * 0.7) * vHeal;
        }`)
  }
  mat.customProgramCacheKey = () => (lite ? 'zerog-machine-lite' : 'zerog-machine')
  return mat
}

/**
 * The racers' drawing. racers: [{ model, accent }] (model: index into the loaded machines). Each frame,
 * set(i, matrix, flame, flash) for every racer, then commit().
 */
export class Fleet {
  constructor(models, racers, envMap) {
    this.models = models
    this.group = new THREE.Group()
    this.group.name = 'fleet'
    this.envMap = envMap
    this.meshes = models.map(m => this.makeMesh(m, Math.max(1, racers.filter(r => r.model === models.indexOf(m)).length)))
    this.slots = racers.map(() => null)
    this.setRacers(racers)
    this.fx = new ThrusterFx(racers.length)
    this.group.add(this.fx.flames, this.fx.cores, this.fx.glows, this.fx.trails)
  }

  /** Another machine (a player's own, joining an online race): its instanced mesh. */
  addModel(m) {
    this.models.push(m)
    this.meshes.push(this.makeMesh(m, 1))
  }

  makeMesh(m, count) {
    const mat = neon(m.material)
    each(mat, x => { x.envMap = this.envMap })
    const mesh = new THREE.InstancedMesh(m.geometry, mat, count)
    mesh.geometry = m.geometry.clone()
    mesh.geometry.setAttribute('aAccent', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4))
    mesh.geometry.setAttribute('aHue', new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2))
    mesh.geometry.setAttribute('aHeal', new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage))
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.count = 0
    mesh.name = m.id
    this.group.add(mesh)
    return mesh
  }

  setRacers(racers) {
    const counts = this.meshes.map(() => 0)
    this.slots = racers.map(r => {
      const mesh = this.meshes[r.model]
      const slot = counts[r.model]++
      return { mesh, slot, accent: new THREE.Color(r.accent), hue: r.hue ?? 0, sat: r.sat ?? 1 }
    })
    this.meshes.forEach((mesh, k) => {
      if (counts[k] > mesh.instanceMatrix.count) {
        // more racers on this model than it has room for: a bigger mesh
        const bigger = new THREE.InstancedMesh(mesh.geometry, mesh.material, counts[k])
        bigger.geometry.setAttribute('aAccent', new THREE.InstancedBufferAttribute(new Float32Array(counts[k] * 4), 4))
        bigger.geometry.setAttribute('aHue', new THREE.InstancedBufferAttribute(new Float32Array(counts[k] * 2), 2))
        bigger.geometry.setAttribute('aHeal', new THREE.InstancedBufferAttribute(new Float32Array(counts[k]), 1).setUsage(THREE.DynamicDrawUsage))
        bigger.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        bigger.frustumCulled = false
        bigger.name = mesh.name
        this.group.remove(mesh)
        this.group.add(bigger)
        this.meshes[k] = bigger
      }
      this.meshes[k].count = counts[k]
    })
    this.slots.forEach((s, i) => {
      s.mesh = this.meshes[racers[i].model]
      s.mesh.geometry.attributes.aHue.setXY(s.slot, s.hue, s.sat)
    })
    for (const mesh of this.meshes) mesh.geometry.attributes.aHue.needsUpdate = true
    this.racerCount = racers.length
  }

  /** Cheap materials for a software renderer. */
  setLite() {
    for (const mesh of this.meshes) {
      const lite = neon(this.models.find(m => m.id === mesh.name).material, true)
      each(mesh.material, x => x.dispose())
      mesh.material = lite
    }
  }

  set(i, matrix, visible, flash, heal = 0) {
    const { mesh, slot, accent } = this.slots[i]
    if (!visible) matrix = HIDDEN
    mesh.setMatrixAt(slot, matrix)
    const a = mesh.geometry.attributes.aAccent
    a.setXYZW(slot, accent.r, accent.g, accent.b, flash)
    mesh.geometry.attributes.aHeal.setX(slot, heal)
  }

  commit() {
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.geometry.attributes.aAccent.needsUpdate = true
      mesh.geometry.attributes.aHeal.needsUpdate = true
    }
  }
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

const NOZZLES = 4

/** Flames out of each machine's nozzles and the glow in them, the glow on the road under the machines, and
 * their light trails. */
export class ThrusterFx {
  constructor(n) {
    this.n = n
    // flames: a camera-facing quad per nozzle, stretched backwards; the cores: a bright disc in each nozzle
    const m = n * NOZZLES
    this.flamePos = new Float32Array(m * 4)        // position xyz, power
    this.flameDir = new Float32Array(m * 4)        // backwards xyz, a seed for the flicker
    this.flameCol = new Float32Array(m * 4)        // colour, the nozzle's radius
    this.aFlamePos = new THREE.InstancedBufferAttribute(this.flamePos, 4).setUsage(THREE.DynamicDrawUsage)
    this.aFlameDir = new THREE.InstancedBufferAttribute(this.flameDir, 4).setUsage(THREE.DynamicDrawUsage)
    this.aFlameCol = new THREE.InstancedBufferAttribute(this.flameCol, 4).setUsage(THREE.DynamicDrawUsage)
    for (let k = 0; k < m; k++) this.flamePos[k * 4 + 1] = -1000
    const fgeo = new THREE.PlaneGeometry(1, 1)
    fgeo.translate(0, 0.5, 0)
    const cgeo = new THREE.PlaneGeometry(1, 1)
    for (const g of [fgeo, cgeo]) { g.setAttribute('aPos', this.aFlamePos); g.setAttribute('aDir', this.aFlameDir); g.setAttribute('aCol', this.aFlameCol) }
    const additive = { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }
    this.flames = new THREE.InstancedMesh(fgeo, new THREE.ShaderMaterial({ uniforms: { ...shared }, vertexShader: `
        attribute vec4 aPos; attribute vec4 aDir; attribute vec4 aCol;
        uniform float uTime;
        varying vec2 vUv; varying vec3 vColor; varying float vPower; varying float vSeed;
        void main() {
          vec3 back = aDir.xyz;
          vec3 toCam = cameraPosition - aPos.xyz;
          float dist = length(toCam);
          toCam /= dist;
          // seen end-on (from right behind) the flame would point at the camera: shorter then
          float endOn = abs(dot(back, toCam));
          vec3 side = cross(back, toCam);
          side = length(side) > 0.05 ? normalize(side) : normalize(cross(back, vec3(0.0, 1.0, 0.0)));
          float p = aPos.w, boost = max(0.0, p - 1.2);
          float flick = 0.88 + 0.08 * sin(uTime * 55.0 + aDir.w * 40.0) + 0.05 * sin(uTime * 23.0 + aDir.w * 13.0);
          float r = aCol.w;
          float len = r * (2.6 + 3.4 * p + 9.0 * boost) * flick * (1.0 - endOn * 0.6);
          float wid = r * (1.2 + 0.2 * p + 0.7 * boost);
          vec3 q = aPos.xyz + back * position.y * len + side * position.x * wid;
          vUv = uv; vColor = aCol.rgb; vSeed = aDir.w;
          vPower = p * smoothstep(${(0.1 * U).toFixed(3)}, ${(0.35 * U).toFixed(3)}, dist);
          gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
        }`, fragmentShader: `
        uniform float uTime;
        varying vec2 vUv; varying vec3 vColor; varying float vPower; varying float vSeed;
        void main() {
          float x = abs(vUv.x - 0.5) * 2.0, y = vUv.y;          // y: 0 at the nozzle, 1 at the tip
          float body = 1.0 - smoothstep(0.0, 1.0 - y * 0.75, x);
          float core = pow(body, 3.0) * (1.0 - y);
          float pulse = 0.8 + 0.2 * sin(y * 26.0 - uTime * 50.0 + vSeed * 9.0);
          float a = body * (1.0 - y) * pulse;
          vec3 c = (vColor * 1.5 + vec3(1.7) * core) * a * min(1.25, 0.3 + vPower * 0.6);
          gl_FragColor = vec4(c, 1.0);
        }`, ...additive }), m)
    this.flames.frustumCulled = false
    this.flames.name = 'flames'
    this.cores = new THREE.InstancedMesh(cgeo, new THREE.ShaderMaterial({ vertexShader: `
        attribute vec4 aPos; attribute vec4 aDir; attribute vec4 aCol;
        varying vec2 vUv; varying vec3 vColor; varying float vPower;
        void main() {
          vec3 toCam = cameraPosition - aPos.xyz;
          float dist = length(toCam);
          toCam /= dist;
          vec3 right = cross(vec3(0.0, 1.0, 0.0), toCam);
          right = length(right) > 0.05 ? normalize(right) : vec3(1.0, 0.0, 0.0);
          vec3 up = cross(toCam, right);
          float p = aPos.w, boost = max(0.0, p - 1.2);
          float s = aCol.w * (2.2 + 0.5 * p + 1.0 * boost);
          // a little towards the camera, so the nozzle's own rim does not cut it
          vec3 q = aPos.xyz + toCam * aCol.w * 0.6 + (right * position.x + up * position.y) * s * 2.0;
          vUv = uv; vColor = aCol.rgb;
          // brightest seen from behind
          float behind = max(0.0, dot(normalize(-aDir.xyz), -toCam));
          vPower = p * (0.35 + 0.65 * behind) * smoothstep(${(0.1 * U).toFixed(3)}, ${(0.35 * U).toFixed(3)}, dist);
          gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
        }`, fragmentShader: `
        varying vec2 vUv; varying vec3 vColor; varying float vPower;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float k = pow(max(0.0, 1.0 - d), 2.2);
          vec3 c = (vColor * 1.3 + vec3(1.6) * pow(k, 3.0)) * k * min(1.3, 0.25 + vPower * 0.45);
          gl_FragColor = vec4(c, 1.0);
        }`, ...additive }), m)
    this.cores.frustumCulled = false
    this.cores.name = 'nozzle glow'
    // the hover glow: a soft disc on the road under each machine
    const ggeo = new THREE.PlaneGeometry(1, 1)
    this.glows = new THREE.InstancedMesh(ggeo, new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */`
        attribute vec3 aColor;
        varying vec2 vUv; varying vec3 vColor;
        void main() { vUv = uv; vColor = aColor; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; varying vec3 vColor;
        void main() { float d = length(vUv - 0.5) * 2.0; float k = pow(max(0.0, 1.0 - d), 2.0); gl_FragColor = vec4(vColor * k * 0.9, 1.0); }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }), n)
    this.glowColor = new Float32Array(n * 3)
    ggeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.glowColor, 3))
    this.glows.frustumCulled = false
    this.glows.name = 'hover glow'

    // trails: a ribbon of K points per racer, facing the camera
    this.K = 12
    const verts = n * this.K * 2
    this.trailPos = new Float32Array(verts * 3)
    this.trailDir = new Float32Array(verts * 4)      // direction xyz, side
    this.trailCol = new Float32Array(verts * 4)      // colour, alpha
    const tgeo = new THREE.BufferGeometry()
    tgeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage))
    tgeo.setAttribute('aDir', new THREE.BufferAttribute(this.trailDir, 4).setUsage(THREE.DynamicDrawUsage))
    tgeo.setAttribute('aCol', new THREE.BufferAttribute(this.trailCol, 4).setUsage(THREE.DynamicDrawUsage))
    const index = []
    for (let r = 0; r < n; r++) {
      for (let k = 0; k < this.K - 1; k++) {
        const a = (r * this.K + k) * 2
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    tgeo.setIndex(index)
    this.trails = new THREE.Mesh(tgeo, new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        attribute vec4 aDir; attribute vec4 aCol;
        varying vec4 vCol; varying float vSide;
        void main() {
          vec3 toCam = cameraPosition - position;
          float dist = length(toCam);
          vec3 side = cross(aDir.xyz, toCam / dist);
          side = length(side) > 0.05 ? normalize(side) : vec3(0.0);
          vec3 p = position + side * aDir.w * ${(0.017 * U).toFixed(4)} * (0.4 + aCol.a);
          // fade near the camera: your own trail runs back under it
          vCol = vec4(aCol.rgb, aCol.a * smoothstep(${(0.45 * U).toFixed(3)}, ${(1.5 * U).toFixed(3)}, dist)); vSide = aDir.w;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec4 vCol; varying float vSide;
        void main() { float k = (1.0 - abs(vSide)) * 0.0 + (1.0 - vSide * vSide * 0.6); gl_FragColor = vec4(vCol.rgb * vCol.a * k, 1.0); }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }))
    this.trails.frustumCulled = false
    this.trails.name = 'trails'
    this.history = Array.from({ length: n }, () => [])
  }

  /** One racer's flame, glow and trail point this frame. rear: world point; back: world direction (unit,
   * pointing backwards along the machine); up: the road's up; power: 0 idle, 1 full throttle, 2 boost. */
  set(i, rear, forward, up, roadPoint, power, color, visible) {
    const m = TMPM
    if (visible) {
      // the glow lies flat on the road
      Z.copy(up); X.crossVectors(forward, up).normalize(); Y.crossVectors(Z, X)
      m.makeBasis(X, Y, Z).scale(S.set(0.37 * U, 0.47 * U, 1)).setPosition(roadPoint.x + up.x * 0.007, roadPoint.y + up.y * 0.007, roadPoint.z + up.z * 0.007)
      // a plane's normal is +z: turn so it lies along the road
    } else m.makeScale(0, 0, 0)
    this.glows.setMatrixAt(i, m)
    const g = this.glowColor
    g[i * 3] = color.r * 0.6; g[i * 3 + 1] = color.g * 0.6; g[i * 3 + 2] = color.b * 0.6
    const h = this.history[i]
    if (!visible) { h.length = 0 } else {
      h.unshift({ p: rear.clone(), f: forward.clone(), power })
      if (h.length > this.K) h.pop()
    }
    this.writeTrail(i, color)
  }

  /** Racer i's flames, out of its nozzles (model units, from findNozzles) placed by its world matrix (scale
   * included). power: 0 off, about 1 cruising, 2.3 on a boost; color: the machine's flame colour. */
  setFlames(i, matrix, nozzles, power, color, visible) {
    const d = this.flamePos, e = this.flameDir, c = this.flameCol
    const scale = FS.setFromMatrixColumn(matrix, 0).length()
    FB.set(0, 0, -1).transformDirection(matrix)
    for (let k = 0; k < NOZZLES; k++) {
      const s = i * NOZZLES + k, nz = nozzles?.[k]
      if (!visible || !nz) { d[s * 4 + 1] = -1000; d[s * 4 + 3] = 0; continue }
      FP.set(nz.x, nz.y, nz.z).applyMatrix4(matrix)
      d[s * 4] = FP.x; d[s * 4 + 1] = FP.y; d[s * 4 + 2] = FP.z; d[s * 4 + 3] = Math.max(0, power)
      e[s * 4] = FB.x; e[s * 4 + 1] = FB.y; e[s * 4 + 2] = FB.z; e[s * 4 + 3] = s * 0.37
      c[s * 4] = color.r; c[s * 4 + 1] = color.g; c[s * 4 + 2] = color.b; c[s * 4 + 3] = nz.r * scale
    }
  }

  writeTrail(i, color) {
    const h = this.history[i], K = this.K
    for (let k = 0; k < K; k++) {
      const e = h[Math.min(k, h.length - 1)]
      const a = (i * K + k) * 2
      const age = k / (K - 1)
      const alpha = e ? (1 - age) * (0.25 + Math.min(1.5, e.power) * 0.5) : 0
      for (let s = 0; s < 2; s++) {
        const v = a + s
        if (e) { this.trailPos[v * 3] = e.p.x; this.trailPos[v * 3 + 1] = e.p.y; this.trailPos[v * 3 + 2] = e.p.z }
        if (e) { this.trailDir[v * 4] = e.f.x; this.trailDir[v * 4 + 1] = e.f.y; this.trailDir[v * 4 + 2] = e.f.z }
        this.trailDir[v * 4 + 3] = s ? 1 : -1
        this.trailCol[v * 4] = color.r * 1.6; this.trailCol[v * 4 + 1] = color.g * 1.6; this.trailCol[v * 4 + 2] = color.b * 1.6
        this.trailCol[v * 4 + 3] = alpha
      }
    }
  }

  commit() {
    this.aFlamePos.needsUpdate = true
    this.aFlameDir.needsUpdate = true
    this.aFlameCol.needsUpdate = true
    this.glows.instanceMatrix.needsUpdate = true
    this.glows.geometry.attributes.aColor.needsUpdate = true
    const g = this.trails.geometry.attributes
    g.position.needsUpdate = true; g.aDir.needsUpdate = true; g.aCol.needsUpdate = true
  }
}

const TMPM = new THREE.Matrix4()
const FS = new THREE.Vector3(), FB = new THREE.Vector3(), FP = new THREE.Vector3()
const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), S = new THREE.Vector3()

/** A machine on a turntable for the select screen (its own little scene, drawn over the menu). */
export class Showroom {
  constructor(models, envMap) {
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20)
    this.camera.position.set(0, 0.55, 2.1)
    this.camera.lookAt(0, 0.08, 0)
    this.scene.environment = envMap
    this.scene.add(new THREE.HemisphereLight(0x99ccff, 0x220033, 0.6))
    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(2, 3, 2)
    this.scene.add(key)
    this.envMap = envMap
    this.items = models.map(m => {
      const mat = neon(m.material)
      each(mat, x => { x.envMap = envMap })
      const geo = m.geometry.clone()
      geo.setAttribute('aAccent', new THREE.InstancedBufferAttribute(new Float32Array([...new THREE.Color(m.accent).toArray(), 0]), 4))
      geo.setAttribute('aHue', new THREE.InstancedBufferAttribute(new Float32Array([0, 1]), 2))
      geo.setAttribute('aHeal', new THREE.InstancedBufferAttribute(new Float32Array([0]), 1))
      const mesh = new THREE.InstancedMesh(geo, mat, 1)
      mesh.setMatrixAt(0, new THREE.Matrix4())
      mesh.visible = false
      mesh.frustumCulled = false
      this.scene.add(mesh)
      return mesh
    })
    // the turntable: a ring of light
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 2.4), side: THREE.DoubleSide }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -0.05
    this.ring = ring
    this.scene.add(ring)
    this.models = models
    this.fx = new ThrusterFx(1)
    this.air = new Airflow(1)
    this.scene.add(this.fx.flames, this.fx.cores, this.air.mesh)
    this.flame = new THREE.Color()
    this.current = 0
    this.angle = 0
    this.time = 0
  }

  /** Show pilot i's machine (its model in their livery). */
  show(i) {
    const p = PILOTS[i]
    this.items.forEach((m, k) => { m.visible = k === p.model })
    this.current = p.model
    const geo = this.items[p.model].geometry
    geo.attributes.aHue.setXY(0, p.hue, p.sat); geo.attributes.aHue.needsUpdate = true
    geo.attributes.aAccent.setXYZW(0, ...new THREE.Color(p.accent).toArray(), 0); geo.attributes.aAccent.needsUpdate = true
    this.ring.material.color.set(p.accent).multiplyScalar(2)
    this.flame.set(p.flame)
  }

  /** Every pilot's machine drawn once, three-quarter front, into small pictures for the select tiles: one at a
   * time with a pause after each (a software renderer takes a while per picture, and a worker that stops
   * answering for 3 s is stopped). */
  async thumbnails(renderer, w = 192, h = 120) {
    const out = []
    const cam = this.camera.clone()
    cam.aspect = w / h
    cam.position.set(0.95, 0.55, 1.35)
    cam.lookAt(0, 0.06, 0)
    cam.updateProjectionMatrix()
    const before = renderer.getRenderTarget()
    this.ring.visible = false
    this.fx.flames.visible = this.fx.cores.visible = this.air.mesh.visible = false
    for (let i = 0; i < PILOTS.length; i++) {
      this.show(i)
      const item = this.items[this.current]
      item.setMatrixAt(0, new THREE.Matrix4().makeRotationY(-0.35))
      item.instanceMatrix.needsUpdate = true
      const rt = new THREE.WebGLRenderTarget(w, h)
      rt.texture.colorSpace = THREE.SRGBColorSpace
      renderer.setRenderTarget(rt)
      renderer.setClearColor(0x000000, 0)
      renderer.clear()
      renderer.render(this.scene, cam)
      renderer.setRenderTarget(before)
      out.push(rt.texture)
      await new Promise(r => setTimeout(r, 30))
    }
    renderer.setRenderTarget(before)
    this.ring.visible = true
    return out
  }

  update(dt) {
    this.angle += dt * 0.7
    this.time += dt
    const m = new THREE.Matrix4().makeRotationY(this.angle).setPosition(0, 0.03 * Math.sin(this.angle * 3), 0)
    const mesh = this.items[this.current]
    mesh.setMatrixAt(0, m)
    mesh.instanceMatrix.needsUpdate = true
    // as if flying: the flames burning (a breath of boost now and then) and the air streaming past
    const model = this.models[this.current]
    const surge = Math.max(0, Math.sin(this.time * 0.9)) ** 8
    this.fx.flames.visible = this.fx.cores.visible = this.air.mesh.visible = true
    this.fx.setFlames(0, m, model.nozzles, 1.1 + 0.1 * Math.sin(this.time * 7) + surge * 1.1, this.flame, true)
    this.fx.commit()
    this.air.begin()
    this.air.add(m, model.geometry.boundingBox, 1, 0.9 + surge * 0.4, this.time, model.model ?? 0)
    this.air.commit()
  }
}
