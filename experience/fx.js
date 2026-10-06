// Sparks and blasts: a pool of glowing particles (sparks off the barriers, hits, explosions, the mines,
// fireworks over the goal) and expanding rings of light (boosts, blasts). Two draw calls.

import * as THREE from 'three'

export class Fx {
  constructor(max = 1400) {
    this.max = max
    this.pos = new Float32Array(max * 3)
    this.vel = new Float32Array(max * 3)
    this.col = new Float32Array(max * 3)
    this.life = new Float32Array(max)
    this.age = new Float32Array(max)
    this.size = new Float32Array(max)
    this.drag = new Float32Array(max)
    this.grav = new Float32Array(max)
    this.next = 0
    const geo = new THREE.BufferGeometry()
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', this.aPos)
    geo.setAttribute('aCol', this.aCol)
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */`
        attribute vec4 aCol;
        uniform float uScale;
        varying vec3 vCol;
        void main() {
          vCol = aCol.rgb;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          gl_PointSize = min(24.0, aCol.a * uScale / max(0.1, d));
          vCol *= smoothstep(0.17, 0.7, d);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float k = pow(max(0.0, 1.0 - d), 2.0);
          gl_FragColor = vec4(vCol * k, 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }))
    this.points.frustumCulled = false
    this.points.name = 'sparks'

    // rings: flat glowing rings that grow and fade
    this.rings = []
    const rgeo = new THREE.RingGeometry(0.8, 1, 48)
    this.ringMesh = new THREE.InstancedMesh(rgeo, new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        attribute vec4 aCol;
        varying vec4 vCol;
        void main() { vCol = aCol; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec4 vCol;
        void main() { gl_FragColor = vec4(vCol.rgb * vCol.a, 1.0); }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }), 24)
    this.ringCol = new THREE.InstancedBufferAttribute(new Float32Array(24 * 4), 4)
    rgeo.setAttribute('aCol', this.ringCol)
    this.ringMesh.count = 0
    this.ringMesh.frustumCulled = false
    this.ringMesh.name = 'rings'
    this.group = new THREE.Group()
    this.group.add(this.points, this.ringMesh)
    this.m = new THREE.Matrix4()
  }

  spawn(p, v, color, life, size, drag = 1.5, grav = 0) {
    const i = this.next
    this.next = (this.next + 1) % this.max
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b
    this.life[i] = life; this.age[i] = 0; this.size[i] = size; this.drag[i] = drag; this.grav[i] = grav
  }

  /** A spray of sparks at p, mostly along dir (unit), spread by `spread`. */
  sparks(p, dir, color, n = 14, speed = 5, spread = 0.8) {
    const v = new THREE.Vector3(), c = new THREE.Color(color)
    for (let k = 0; k < n; k++) {
      v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(spread * 2).add(dir).normalize().multiplyScalar(speed * (0.4 + Math.random()))
      const hot = Math.random() < 0.4
      this.spawn(p, v, hot ? WHITE : c, 0.25 + Math.random() * 0.35, 0.02 + Math.random() * 0.02, 2.5, 4)
    }
  }

  blast(p, color, big = 1) {
    const v = new THREE.Vector3(), c = new THREE.Color(color).multiplyScalar(2)
    for (let k = 0; k < 90 * big; k++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((2 + Math.random() * 7) * big)
      this.spawn(p, v, Math.random() < 0.35 ? WHITE2 : c, 0.5 + Math.random() * 0.8, 0.12 + Math.random() * 0.16, 2.2, 4)
    }
    for (let k = 0; k < 20 * big; k++) {
      v.set(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).normalize().multiplyScalar(1 + Math.random() * 2)
      this.spawn(p, v, ORANGE, 0.9 + Math.random() * 0.6, 0.35 + Math.random() * 0.3, 3, -1)
    }
    this.ring(p, new THREE.Vector3(0, 1, 0), color, 2.6 * big, 0.5)
    this.ring(p, new THREE.Vector3(1, 0, 0), 0xffffff, 1.8 * big, 0.35)
  }

  fireworks(p, color) {
    const v = new THREE.Vector3(), c = new THREE.Color(color).multiplyScalar(2.2)
    for (let k = 0; k < 70; k++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 1.5)
      this.spawn(p, v, c, 1.0 + Math.random() * 0.6, 0.12, 1.2, 2.5)
    }
  }

  ring(p, normal, color, radius, life) {
    if (this.rings.length >= 24) this.rings.shift()
    this.rings.push({ p: p.clone(), n: normal.clone().normalize(), c: new THREE.Color(color).multiplyScalar(1.1), r: radius, life, age: 0 })
  }

  update(dt) {
    const P = this.aPos.array, C = this.aCol.array
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) { C[i * 4 + 3] = 0; continue }
      this.age[i] += dt
      const k = Math.exp(-this.drag[i] * dt)
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      const fade = 1 - this.age[i] / this.life[i]
      P[i * 3] = this.pos[i * 3]; P[i * 3 + 1] = this.pos[i * 3 + 1]; P[i * 3 + 2] = this.pos[i * 3 + 2]
      C[i * 4] = this.col[i * 3] * fade; C[i * 4 + 1] = this.col[i * 3 + 1] * fade; C[i * 4 + 2] = this.col[i * 3 + 2] * fade
      C[i * 4 + 3] = this.size[i] * (0.5 + fade * 0.5)
    }
    this.aPos.needsUpdate = true
    this.aCol.needsUpdate = true
    // rings
    this.rings = this.rings.filter(r => (r.age += dt) < r.life)
    const q = new THREE.Quaternion(), s = new THREE.Vector3()
    this.rings.forEach((r, i) => {
      const k = r.age / r.life
      q.setFromUnitVectors(Z, r.n)
      s.setScalar(r.r * (0.2 + 0.8 * Math.sqrt(k)))
      this.m.compose(r.p, q, s)
      this.ringMesh.setMatrixAt(i, this.m)
      this.ringCol.setXYZW(i, r.c.r, r.c.g, r.c.b, 1 - k)
    })
    this.ringMesh.count = this.rings.length
    this.ringMesh.instanceMatrix.needsUpdate = true
    this.ringCol.needsUpdate = true
  }

  setScale(height, fov) {
    this.points.material.uniforms.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2))
  }
}

/**
 * Slide marks: two glowing streaks laid on the road behind your machine's tail while it drifts, fading as
 * they go (in the colour of the turbo it has earned). add(k, point, side, colour, on) each frame per streak,
 * then update(time).
 */
export class SlideMarks {
  constructor(n = 120, life = 1.1) {
    this.n = n; this.life = life
    this.pts = [0, 1].map(() => Array.from({ length: n }, () => ({ p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color(), t: -99, on: false })))
    this.w = [0, 0]
    const verts = 2 * n * 2
    this.pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.col = new THREE.BufferAttribute(new Float32Array(verts * 4), 4).setUsage(THREE.DynamicDrawUsage)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', this.pos)
    geo.setAttribute('aCol', this.col)
    const index = []
    for (let m = 0; m < 2; m++) for (let k = 0; k < n - 1; k++) { const a = (m * n + k) * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    geo.setIndex(index)
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        attribute vec4 aCol;
        varying vec4 vCol;
        void main() { vCol = aCol; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec4 vCol;
        void main() { gl_FragColor = vec4(vCol.rgb * vCol.a, 1.0); }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }))
    this.mesh.frustumCulled = false
    this.mesh.name = 'slide marks'
  }

  add(k, p, side, color, on, time) {
    const e = this.pts[k][this.w[k]]
    this.w[k] = (this.w[k] + 1) % this.n
    e.p.copy(p); e.s.copy(side); e.c.set(color); e.t = time; e.on = on
  }

  update(time) {
    const P = this.pos.array, C = this.col.array
    for (let m = 0; m < 2; m++) {
      for (let k = 0; k < this.n; k++) {
        const e = this.pts[m][(this.w[m] + k) % this.n]
        const a = e.on ? Math.max(0, 1 - (time - e.t) / this.life) : 0
        const v = (m * this.n + k) * 2
        for (let j = 0; j < 2; j++) {
          const sg = j ? 1 : -1
          P[(v + j) * 3] = e.p.x + e.s.x * sg; P[(v + j) * 3 + 1] = e.p.y + e.s.y * sg; P[(v + j) * 3 + 2] = e.p.z + e.s.z * sg
          C[(v + j) * 4] = e.c.r; C[(v + j) * 4 + 1] = e.c.g; C[(v + j) * 4 + 2] = e.c.b; C[(v + j) * 4 + 3] = a * a
        }
      }
    }
    this.pos.needsUpdate = true
    this.col.needsUpdate = true
  }
}

/**
 * The repair bubble: a shimmering soap-film sphere round a machine on a heal strip (a fresnel rim in rainbow
 * colours, bright lines of repair rising through it, a wobble), that swells in and pops when it leaves.
 * set(k, position, radius, amount) for the bubbles to draw this frame, then commit(time).
 */
export class Bubbles {
  constructor(max = 8) {
    this.max = max
    const geo = new THREE.SphereGeometry(1, 28, 16)
    this.aK = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aK', this.aK)
    this.mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec2 aK;
        uniform float uTime;
        varying vec3 vN; varying vec3 vV; varying float vK; varying float vY; varying float vSeed;
        void main() {
          vec3 p = position * (1.0 + 0.045 * sin(uTime * 7.0 + position.y * 5.0 + aK.y * 9.0) + 0.03 * sin(uTime * 11.0 + position.x * 7.0));
          vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz);
          vK = aK.x; vY = position.y; vSeed = aK.y;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec3 vN; varying vec3 vV; varying float vK; varying float vY; varying float vSeed;
        void main() {
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float rim = pow(f, 3.0);
          vec3 film = 0.55 + 0.45 * cos(6.2832 * (f * 1.4 + uTime * 0.35 + vSeed + vec3(0.0, 0.33, 0.67)));
          vec3 heal = vec3(0.15, 0.9, 0.6);
          float scan = smoothstep(0.86, 1.0, fract(vY * 3.0 - uTime * 2.2));
          // a soap film: clear in the middle, a thin rainbow rim, faint lines of repair rising through it
          vec3 c = heal * (rim * 0.5 + 0.01 + scan * 0.1 * (0.3 + rim)) + film * rim * 0.45;
          gl_FragColor = vec4(c * vK, 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }), max)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.name = 'bubbles'
    this.m = new THREE.Matrix4()
    this.q = new THREE.Quaternion()
    this.s = new THREE.Vector3()
    this.n = 0
  }

  set(p, radius, k, seed) {
    if (this.n >= this.max || k <= 0.01) return
    this.s.setScalar(radius)
    this.m.compose(p, this.q, this.s)
    this.mesh.setMatrixAt(this.n, this.m)
    this.aK.setXY(this.n, k, seed)
    this.n++
  }

  commit(time) {
    this.mesh.count = this.n
    this.mesh.instanceMatrix.needsUpdate = true
    this.aK.needsUpdate = true
    this.mesh.material.uniforms.uTime.value = time
    this.n = 0
  }
}

const WHITE = new THREE.Color(1.5, 1.4, 1.2)
const WHITE2 = new THREE.Color(2, 2, 2)
const ORANGE = new THREE.Color(1.6, 0.5, 0.15)
const Z = new THREE.Vector3(0, 0, 1)
