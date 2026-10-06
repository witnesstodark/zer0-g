// The air flowing round a machine at speed: thin streaks of light that come in at the nose, wrap the body
// close and peel off behind it. Each streak runs down one of ten lanes round the machine's box (its sides and
// top), a few points long so it bends with the body; a camera-facing ribbon, faded at both ends. Used on the
// race for your machine and the nearest rivals, and on the machine select's stand.

import * as THREE from 'three'

const LANES = 10, PTS = 6
const P = new THREE.Vector3(), Q = new THREE.Vector3(), T = new THREE.Vector3()
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s) }

export class Airflow {
  constructor(machines = 8, color = new THREE.Color(0.75, 0.92, 1.3)) {
    this.max = machines * LANES
    const verts = this.max * PTS * 2
    this.pos = new Float32Array(verts * 3)
    this.dir = new Float32Array(verts * 4)          // the streak's direction there, the side (-1 or 1)
    this.info = new Float32Array(verts * 2)         // brightness, half width
    const geo = new THREE.BufferGeometry()
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
    this.aDir = new THREE.BufferAttribute(this.dir, 4).setUsage(THREE.DynamicDrawUsage)
    this.aInfo = new THREE.BufferAttribute(this.info, 2).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', this.aPos)
    geo.setAttribute('aDir', this.aDir)
    geo.setAttribute('aInfo', this.aInfo)
    const index = []
    for (let s = 0; s < this.max; s++) {
      for (let k = 0; k < PTS - 1; k++) {
        const a = (s * PTS + k) * 2
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    geo.setIndex(index)
    for (let v = 0; v < verts; v++) this.dir[v * 4 + 3] = v % 2 ? 1 : -1
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color } },
      vertexShader: /* glsl */`
        attribute vec4 aDir; attribute vec2 aInfo;
        varying float vA; varying float vSide;
        void main() {
          vec3 toCam = normalize(cameraPosition - position);
          vec3 side = cross(aDir.xyz, toCam);
          side = length(side) > 0.01 ? normalize(side) : vec3(0.0);
          vA = aInfo.x; vSide = aDir.w;
          gl_Position = projectionMatrix * viewMatrix * vec4(position + side * aDir.w * aInfo.y, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying float vA; varying float vSide;
        void main() { gl_FragColor = vec4(uColor * vA * (1.0 - vSide * vSide), 1.0); }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }))
    this.mesh.frustumCulled = false
    this.mesh.name = 'airflow'
    this.count = 0
  }

  begin() { this.count = 0 }

  /**
   * The streaks round one machine. matrix: its world matrix (scale included); box: its bounding box in its own
   * units (nose along +z); scale: world units per unit of the model; k: how fast (0 none .. 1 full, more on a
   * boost); time: seconds; seed: the machine's own pattern.
   */
  add(matrix, box, scale, k, time, seed = 0) {
    if (k <= 0.01 || this.count + LANES > this.max) return
    const c = box.getCenter(Q), size = box.getSize(P), cx = c.x, cy = c.y, cz = c.z
    const L = size.z, rx = size.x / 2 * 1.06, ry = size.y / 2 * 1.14
    const width = L * scale * 0.009
    const rate = 0.5 + 0.8 * Math.min(1.4, k)
    for (let j = 0; j < LANES; j++) {
      const s = this.count++
      // round the sides and over the top (nothing underneath: the road is there)
      const th = -0.35 + (Math.PI + 0.7) * (j + 0.5) / LANES + 0.08 * Math.sin(time * 1.3 + j * 2.1 + seed)
      const u = (time * (2.0 + 1.2 * hash(j, seed)) * rate + hash(seed, j)) % 1
      const head = cz + 0.75 * L - u * 2.3 * L, len = L * (0.3 + 0.35 * Math.min(1.2, k))
      const fade = smooth(0, 0.12, u) * (1 - smooth(0.8, 1, u)) * Math.min(1.3, k) * 0.75
      const base = (s * PTS) * 2
      for (let p = 0; p < PTS; p++) {
        const t = p / (PTS - 1), z = head - t * len
        // narrow ahead of the nose, close round the body, wider again behind it
        const w = 0.72 + 0.28 * smooth(cz + 0.62 * L, cz + 0.3 * L, z) + 0.22 * smooth(cz - 0.35 * L, cz - L, z)
        const pt = T.set(cx + Math.cos(th) * rx * w, cy + Math.sin(th) * ry * w, z).applyMatrix4(matrix)
        const a = Math.sin(Math.PI * t) * fade
        for (let e = 0; e < 2; e++) {
          const v = base + p * 2 + e
          this.pos[v * 3] = pt.x; this.pos[v * 3 + 1] = pt.y; this.pos[v * 3 + 2] = pt.z
          this.info[v * 2] = a; this.info[v * 2 + 1] = width
        }
      }
      // each point's direction: towards the next one (the last one keeps the one before)
      for (let p = 0; p < PTS; p++) {
        const v = base + p * 2, n = base + Math.min(p + 1, PTS - 1) * 2, b = base + Math.max(p - 1, 0) * 2
        const i1 = p < PTS - 1 ? n : v, i0 = p < PTS - 1 ? v : b
        let dx = this.pos[i1 * 3] - this.pos[i0 * 3], dy = this.pos[i1 * 3 + 1] - this.pos[i0 * 3 + 1], dz = this.pos[i1 * 3 + 2] - this.pos[i0 * 3 + 2]
        const l = Math.hypot(dx, dy, dz) || 1
        dx /= l; dy /= l; dz /= l
        for (let e = 0; e < 2; e++) { const q = v + e; this.dir[q * 4] = dx; this.dir[q * 4 + 1] = dy; this.dir[q * 4 + 2] = dz }
      }
    }
  }

  commit() {
    // the lanes not used this frame go dark
    for (let v = this.count * PTS * 2; v < this.max * PTS * 2; v++) this.info[v * 2] = 0
    this.aPos.needsUpdate = true
    this.aDir.needsUpdate = true
    this.aInfo.needsUpdate = true
  }
}
