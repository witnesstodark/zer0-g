// The course cards' pictures: each course's signature stretch (its loop, its pipe, its drum, its twister) seen from
// outside on its own, no city and no stands round it, lit as in the race and bloomed, against its world's colours.
// Rendered once at the start into small canvases that the menus paint onto the cards.

import * as THREE from 'three'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { shared } from './look.js'

// each world's backdrop (top, bottom) and its haze
const SKIES = {
  city: { top: '#1d0a33', bottom: '#05061a', fog: new THREE.Color(0.02, 0.012, 0.05) },
  space: { top: '#0a1233', bottom: '#010208', fog: new THREE.Color(0.004, 0.006, 0.02) },
  desert: { top: '#5a2312', bottom: '#140806', fog: new THREE.Color(0.09, 0.035, 0.02) },
}

// hand-picked views where the automatic one misses what a course is named for. Either a stretch (s, metres along
// it, and span, metres either side) or a part of the lot (at: [x, z] and r, metres: every level of the course over
// it, so a tower of turns comes whole); yaw (degrees round from +z) and pitch (degrees up) aim the camera, else it
// looks square-on to the stretch; dist scales the fit
export const VIEWS = {
  'SKY PIPE': { s: 103, span: 26 },                                         // its pipe
  'THE DRUM': { s: 48, span: 24 },                                          // the drum
  'PULSAR RUN': { at: [0, 0], r: 30, yaw: 120, pitch: 38, dist: 0.8 },      // the twin eights, whole
  'NEBULA KNOT': { at: [-7, 13], r: 8, yaw: 135, pitch: 22 },               // the spiral pipe
  'ORBIT GATE': { at: [0, 0], r: 30, yaw: 220, pitch: 35, dist: 0.82 },     // the ring, the twist and the drum
  'SCORCH STRIP': { at: [0, 0], r: 30, yaw: 60, pitch: 30, dist: 0.85 },    // four strips stacked
  'RUST MESA': { at: [0, 0], r: 30, yaw: 135, pitch: 38, dist: 0.8 },       // the eight inside the rim
  'SAND TWISTER': { at: [0, -8], r: 7, yaw: 150, pitch: 25 },               // the twister
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

/** The eigenvectors of a symmetric 3x3 matrix (Jacobi), as columns sorted by eigenvalue, largest first. */
function eigen(a) {
  const m = a.map(r => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let sweep = 0; sweep < 24; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(m[p][q]) < 1e-9) continue
      const th = 0.5 * Math.atan2(2 * m[p][q], m[q][q] - m[p][p]), c = Math.cos(th), s = Math.sin(th)
      for (let k = 0; k < 3; k++) { const mkp = m[k][p], mkq = m[k][q]; m[k][p] = c * mkp - s * mkq; m[k][q] = s * mkp + c * mkq }
      for (let k = 0; k < 3; k++) { const mpk = m[p][k], mqk = m[q][k]; m[p][k] = c * mpk - s * mqk; m[q][k] = s * mpk + c * mqk }
      for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq }
    }
  }
  return [0, 1, 2].map(i => ({ val: m[i][i], vec: V(v[0][i], v[1][i], v[2][i]).normalize() })).sort((x, y) => y.val - x.val)
}

/**
 * Where to look at a course from: its most tilted stretch (a loop, a pipe, a drum, a twister; on a flat course the
 * tightest), seen square-on to the plane it lies in, a little from above, from the side with less of the course in
 * the way, near enough to fill the picture. Returns { from, at, up, fov }.
 */
export function heroView(t, aspect, o = VIEWS[t.name] ?? {}) {
  const n = t.n, P = t.P, U = t.U, step = t.step
  let c = 0
  if (o.at) c = -1
  else if (o.s != null) c = t.index(o.s)
  else {
    const raw = new Float32Array(n)
    for (let i = 0; i < n; i++) raw[i] = (1 - U[i * 3 + 1]) + (t.curved(i) ? 0.6 : 0) + Math.min(1, Math.abs(t.curv[i]) * 1.5) * 0.25
    const r = Math.round(14 / step)
    let best = -1, sum = 0
    for (let j = -r; j <= r; j++) sum += raw[t.wrap(j)]
    for (let i = 0; i < n; i++) {
      if (sum > best) { best = sum; c = i }
      sum += raw[t.wrap(i + r + 1)] - raw[t.wrap(i - r)]
    }
  }
  const K = Math.round((o.span ?? 30) / step)
  const pts = []
  const take = i => {
    const j = i * 3
    pts.push(V(P[j], P[j + 1], P[j + 2]))
    for (const a of [-1, 1]) pts.push(V(P[j] + t.R[j] * a * t.width / 2, P[j + 1] + t.R[j + 1] * a * t.width / 2, P[j + 2] + t.R[j + 2] * a * t.width / 2))
  }
  if (o.at) { for (let i = 0; i < n; i += 2) if (Math.hypot(P[i * 3] - o.at[0], P[i * 3 + 2] - o.at[1]) < (o.r ?? 8)) take(i) }
  else for (let k = -K; k <= K; k += 2) take(t.wrap(c + k))
  const at = pts.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / pts.length)
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const p of pts) {
    const d = [p.x - at.x, p.y - at.y, p.z - at.z]
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a][b] += d[a] * d[b] / pts.length
  }
  const [major, , minor] = eigen(cov)
  const up = V(0, 1, 0)
  // square-on to the stretch's plane; a flat stretch is seen from above, across its length
  let dir
  if (o.yaw != null) {
    const yw = THREE.MathUtils.degToRad(o.yaw), pt = THREE.MathUtils.degToRad(o.pitch ?? 30)
    dir = V(Math.sin(yw) * Math.cos(pt), Math.sin(pt), Math.cos(yw) * Math.cos(pt))
  } else if (Math.abs(minor.vec.y) > 0.85) dir = V().crossVectors(up, major.vec).normalize().multiplyScalar(0.8).add(V(0, 1, 0)).normalize()
  else {
    const cands = [minor.vec.clone(), minor.vec.clone().negate()].map(d => d.add(V(0, 0.42, 0)).addScaledVector(major.vec, 0.22).normalize())
    // the side with less of the rest of the course between the camera and the stretch
    const blocked = d => {
      let k = 0
      for (let i = 0; i < n; i += 4) {
        if (c >= 0 && Math.abs(((i - c) % n + n + n / 2) % n - n / 2) <= K) continue
        const q = V(P[i * 3] - at.x, P[i * 3 + 1] - at.y, P[i * 3 + 2] - at.z), along = q.dot(d)
        if (along > 1 && q.addScaledVector(d, -along).length() < 5) k++
      }
      return k
    }
    dir = blocked(cands[0]) <= blocked(cands[1]) ? cands[0] : cands[1]
    if (dir.y < 0.15) dir.y = 0.15, dir.normalize()
  }
  // near enough that the stretch fills the frame
  const fov = 38, tv = Math.tan(THREE.MathUtils.degToRad(fov / 2)), th = tv * aspect
  const right = V().crossVectors(dir, up).normalize(), camUp = V().crossVectors(right, dir).normalize()
  let dist = 0
  for (const p of pts) {
    const q = p.clone().sub(at), x = Math.abs(q.dot(right)), y = Math.abs(q.dot(camUp)), z = q.dot(dir)
    dist = Math.max(dist, x / th + z, y / tv + z)
  }
  dist *= (o.dist ?? 0.92)
  return { from: at.clone().addScaledVector(dir, dist), at, up, fov }
}

/** A faint floor under the course: the lot's grid, fading out round it. */
function floorMesh() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vP;
      void main() {
        vec2 q = vP / 1.4, w = fwidth(q);
        vec2 g = 1.0 - smoothstep(vec2(0.0), w * 1.5, abs(fract(q) - 0.5) * 2.0 - (1.0 - w * 1.2));
        float line = max(g.x, g.y) * clamp(1.0 - max(w.x, w.y) * 2.0, 0.0, 1.0);
        float fade = 1.0 - smoothstep(10.0, 26.0, length(vP * vec2(1.0, 0.8)));
        gl_FragColor = vec4(vec3(0.25, 0.6, 1.0) * line * fade * 0.35, line * fade * 0.6);
      }`,
    extensions: { derivatives: true },
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(70, 80), mat)
  mesh.rotation.x = -Math.PI / 2
  return mesh
}

/**
 * The pictures, one canvas per course (width x height). The courses' groups are lent to a scene of their own for
 * the render and given back; the shared haze is put back as it was.
 */
export function renderHeroes(renderer, mainScene, courses, { width = 764, height = 464, bloom = true, views = {} } = {}) {
  const hdr = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 })
  const ldr = new THREE.WebGLRenderTarget(width, height)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 500)
  const pass = new RenderPass(scene, camera)
  const glow = bloom ? new UnrealBloomPass(new THREE.Vector2(width / 2, height / 2), 0.55, 0.0, 0.9) : null
  glow?.setSize(width, height)
  // a tight glow: the widest blurs left out (they washed the whole picture in the course's colour)
  if (glow) glow.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.7, 0.3, 0.08, 0.0]
  const out = new OutputPass()
  const floor = floorMesh()
  scene.add(floor)
  const fogWas = [shared.uFogColor.value.clone(), shared.uFogDensity.value]
  const pixels = new Uint8Array(width * height * 4)
  const canvases = []
  for (const t of courses) {
    const sky = SKIES[t.env] ?? SKIES.city
    const bg = new OffscreenCanvas(360, 190), bc = bg.getContext('2d'), g = bc.createLinearGradient(0, 0, 0, 190)
    g.addColorStop(0, sky.top); g.addColorStop(1, sky.bottom)
    bc.fillStyle = g; bc.fillRect(0, 0, 360, 190)
    // space: a scatter of stars; the desert: the low sun's glow
    if (t.env === 'space') for (let k = 0; k < 140; k++) { bc.fillStyle = `rgba(255,255,255,${0.2 + 0.6 * ((k * 0.618) % 1)})`; bc.fillRect((k * 97.3) % 360, (k * 53.7) % 190, k % 9 ? 1 : 2, k % 9 ? 1 : 2) }
    if (t.env === 'desert') { const r = bc.createRadialGradient(290, 150, 4, 290, 150, 170); r.addColorStop(0, 'rgba(255,190,110,0.55)'); r.addColorStop(1, 'rgba(255,120,60,0)'); bc.fillStyle = r; bc.fillRect(0, 0, 360, 190) }
    const bgTex = new THREE.CanvasTexture(bg)
    bgTex.colorSpace = THREE.SRGBColorSpace
    scene.background = bgTex
    shared.uFogColor.value.copy(sky.fog)
    shared.uFogDensity.value = 0.004
    const parent = t.group.parent, visible = t.group.visible
    scene.add(t.group)
    t.group.visible = true
    const v = heroView(t, width / height, views[t.name] ?? VIEWS[t.name] ?? {})
    camera.position.copy(v.from)
    camera.up.copy(v.up)
    camera.lookAt(v.at)
    camera.fov = v.fov
    camera.updateProjectionMatrix()
    pass.render(renderer, null, hdr)
    glow?.render(renderer, null, hdr, 0, false)
    out.render(renderer, ldr, hdr)
    renderer.readRenderTargetPixels(ldr, 0, 0, width, height, pixels)
    renderer.setRenderTarget(null)
    t.group.visible = visible
    if (parent) parent.add(t.group)
    bgTex.dispose()
    // into a canvas, the right way up
    const cv = new OffscreenCanvas(width, height), ctx = cv.getContext('2d'), img = ctx.createImageData(width, height)
    for (let y = 0; y < height; y++) img.data.set(pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4)
    ctx.putImageData(img, 0, 0)
    canvases.push(cv)
  }
  shared.uFogColor.value.copy(fogWas[0])
  shared.uFogDensity.value = fogWas[1]
  hdr.dispose(); ldr.dispose(); glow?.dispose(); out.dispose?.()
  floor.geometry.dispose(); floor.material.dispose()
  return canvases
}
