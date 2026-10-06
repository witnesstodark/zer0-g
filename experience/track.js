// The track: its centreline with frames every 0.25 m (from tools/track_design.py), the lookups the race
// needs (where s is, which way is forward, up and right, how sharply it turns, what lies on the road), and
// its meshes: the road slab with its neon markings, the energy barriers, the plates and the mines.
//
// The road's cross-section can curve: kappa (1/m) bends it up into a pipe (positive: you ride its inside,
// round the walls and the ceiling) or down round a drum (negative: you ride its outside); half is how far it
// reaches either side of the centreline, along the surface. Where it closes all the way round, x wraps.
// Open stretches have no barriers (fly off and you are put back on), and a seam is where the road goes on
// from another line round a drum: crossing it shifts x by the seam's shift.

import * as THREE from 'three'
import { fogChunk, shared } from './look.js'

export const KIND = { none: 0, dash: 1, pit: 2, jump: 3, start: 4, kick: 5 }

export class Track {
  /** data: the JSON from track_design.py; mirror: the mirror course (everything flipped across x). */
  constructor(data, mirror = false) {
    const pts = data.points
    this.name = data.name + (mirror ? ' MIRROR' : '')
    this.id = data.id ?? 0
    this.mirror = mirror
    this.blurb = data.blurb ?? null      // a line for the course's card
    this.env = data.env ?? 'city'
    this.step = data.step
    this.width = data.width
    this.n = pts.length
    this.length = this.n * this.step
    const m = mirror ? -1 : 1
    this.P = new Float32Array(this.n * 3)
    this.U = new Float32Array(this.n * 3)
    this.R = new Float32Array(this.n * 3)
    this.F = new Float32Array(this.n * 3)
    this.gap = new Uint8Array(this.n)
    this.kappa = new Float32Array(this.n)
    this.half = new Float32Array(this.n)
    this.open = new Uint8Array(this.n)
    this.seam = new Uint8Array(this.n)
    this.shift = new Float32Array(this.n)
    const R0 = new Float32Array(this.n * 3)
    for (let i = 0; i < this.n; i++) {
      const p = pts[i]
      this.P.set([p[0] * m, p[1], p[2]], i * 3)
      this.U.set([p[3] * m, p[4], p[5]], i * 3)
      R0.set([p[6] * m, p[7], p[8]], i * 3)
      this.gap[i] = p[9]
      this.kappa[i] = p[10] ?? 0
      this.half[i] = p[11] ?? data.width / 2
      this.open[i] = (p[12] ?? 0) & 1
      this.seam[i] = ((p[12] ?? 0) & 2) ? 1 : 0
      this.shift[i] = (p[13] ?? 0) * m
    }
    // forward from the neighbours, right = forward x up (the driver's right, also on the mirror course); at a
    // seam the neighbours lie on two different lines, so there forward comes from the frame itself
    const a = new THREE.Vector3(), b = new THREE.Vector3(), f = new THREE.Vector3(), u = new THREE.Vector3(), r = new THREE.Vector3()
    for (let i = 0; i < this.n; i++) {
      u.fromArray(this.U, i * 3)
      if (this.seam[i] || this.seam[this.wrap(i - 1)]) f.crossVectors(u, r.fromArray(R0, i * 3)).multiplyScalar(m).normalize()
      else { a.fromArray(this.P, this.wrap(i - 1) * 3); b.fromArray(this.P, this.wrap(i + 1) * 3); f.subVectors(b, a).normalize() }
      u.addScaledVector(f, -u.dot(f)).normalize()
      r.crossVectors(f, u).normalize()
      f.toArray(this.F, i * 3); u.toArray(this.U, i * 3); r.toArray(this.R, i * 3)
    }
    // how sharply the road turns to the driver's right (1/m) and how much its bank helps
    this.curv = new Float32Array(this.n)
    this.assist = new Float32Array(this.n)
    const f0 = new THREE.Vector3(), f1 = new THREE.Vector3()
    for (let i = 0; i < this.n; i++) {
      f0.fromArray(this.F, this.wrap(i - 2) * 3); f1.fromArray(this.F, this.wrap(i + 2) * 3)
      r.fromArray(this.R, i * 3)
      this.curv[i] = f1.sub(f0).dot(r) / (4 * this.step)
    }
    this.curv = smoothArray(this.curv, 3)
    for (let i = 0; i < this.n; i++) {
      // the road's right edge lower in a right turn (and the other way round): the bank holds you in
      const ry = this.R[i * 3 + 1]
      const k = this.curv[i]
      this.assist[i] = Math.abs(k) < 1e-3 ? 0 : THREE.MathUtils.clamp(-ry * Math.sign(k) * 1.1, 0, 0.45)
    }
    // the features: plates and the pit (as a strip per sample) and the mines
    this.kind = new Uint8Array(this.n)
    this.kindX = new Float32Array(this.n)
    this.kindT = new Float32Array(this.n)
    this.mines = []
    this.pits = []
    for (const ft of data.features) {
      const x = (ft.x ?? 0) * m
      if (ft.kind === 'mine') { this.mines.push({ s: ft.s0, x }); continue }
      if (ft.kind === 'pit') this.pits.push({ s0: ft.s0, s1: ft.s1, side: (ft.side ?? -1) * m })
      if (ft.kind === 'gap') continue
      const code = KIND[ft.kind] ?? 0
      const i0 = Math.round(ft.s0 / this.step), i1 = Math.max(i0 + 1, Math.round(ft.s1 / this.step))
      for (let i = i0; i < i1; i++) {
        const j = this.wrap(i)
        if (code === KIND.pit && this.kind[j]) continue
        this.kind[j] = code
        this.kindX[j] = code === KIND.pit ? (ft.side ?? -1) * m : x
        this.kindT[j] = (i - i0 + 0.5) / (i1 - i0)
      }
    }
    if (!this.kind[0]) { this.kind[0] = KIND.start; this.kindT[0] = 0.5 }
    // the curved runs: for each of their samples, how far the run still goes and the x it ends on (a drum's
    // exit line, or the middle where a pipe opens out)
    this.exitX = new Float32Array(this.n)
    this.exitD = new Float32Array(this.n).fill(-1)
    this.runLen = new Float32Array(this.n)
    for (let i = 0; i < this.n; i++) {
      if (!this.curved(i)) continue
      for (let k = 0; k < 600; k++) {
        const j = this.wrap(i + k)
        if (this.seam[j]) { this.exitX[i] = this.shift[j]; this.exitD[i] = (k + 1) * this.step; break }
        if (!this.curved(j)) { this.exitX[i] = 0; this.exitD[i] = k * this.step; break }
      }
    }
    for (let i = 0; i < this.n; i++) {
      if (!this.curved(i) || this.curved(this.wrap(i - 1))) continue
      const L = this.exitD[i]
      for (let k = 0; k * this.step < L + 0.01; k++) this.runLen[this.wrap(i + k)] = L
    }
    this.dashes = data.features.filter(f => f.kind === 'dash').map(f => ({ s: f.s0, s1: f.s1, x: (f.x ?? 0) * m }))
    this.jumps = data.features.filter(f => f.kind === 'jump').map(f => ({ s: f.s0, s1: f.s1 }))
    this.kicks = data.features.filter(f => f.kind === 'kick').map(f => ({ s: f.s0, s1: f.s1, x: (f.x ?? 0) * m }))
  }

  wrap(i) { return ((i % this.n) + this.n) % this.n }
  wrapS(s) { return ((s % this.length) + this.length) % this.length }

  /** Position, forward, up, right at distance s along the track (into the given vectors). */
  frame(s, p, f, u, r) {
    s = this.wrapS(s)
    const x = s / this.step, i = Math.floor(x)
    const k = this.seam[i] ? 0 : x - i              // across a seam: the line before it, up to the jump
    const a = i * 3, b = this.wrap(i + 1) * 3
    p.set(this.P[a] + (this.P[b] - this.P[a]) * k, this.P[a + 1] + (this.P[b + 1] - this.P[a + 1]) * k, this.P[a + 2] + (this.P[b + 2] - this.P[a + 2]) * k)
    if (f) f.set(this.F[a] + (this.F[b] - this.F[a]) * k, this.F[a + 1] + (this.F[b + 1] - this.F[a + 1]) * k, this.F[a + 2] + (this.F[b + 2] - this.F[a + 2]) * k).normalize()
    if (u) u.set(this.U[a] + (this.U[b] - this.U[a]) * k, this.U[a + 1] + (this.U[b + 1] - this.U[a + 1]) * k, this.U[a + 2] + (this.U[b + 2] - this.U[a + 2]) * k).normalize()
    if (r) r.set(this.R[a] + (this.R[b] - this.R[a]) * k, this.R[a + 1] + (this.R[b + 1] - this.R[a + 1]) * k, this.R[a + 2] + (this.R[b + 2] - this.R[a + 2]) * k).normalize()
    return p
  }

  /** A point on the road: s along, x to the right, h above the surface. */
  point(s, x, h, out) {
    const t = TMP
    this.frameAt(s, x, h, out, t.f, t.u, t.r)
    return out
  }

  /** The road's own frame at (s, x), h above it: on a curved cross-section the surface turns with x (up
   * points to the pipe's axis inside it, away from the drum's outside it). */
  frameAt(s, x, h, p, f, u, r) {
    const t = TMP2
    this.frame(s, p, f, t.u, t.r)
    const k = this.kappaAt(s)
    if (Math.abs(k) < 1e-4) {
      p.addScaledVector(t.r, x).addScaledVector(t.u, h)
      u.copy(t.u); r.copy(t.r)
      return p
    }
    const a = k * x, c = Math.cos(a), sn = Math.sin(a)
    p.addScaledVector(t.r, sn / k).addScaledVector(t.u, (1 - c) / k)
    u.copy(t.u).multiplyScalar(c).addScaledVector(t.r, -sn)
    r.copy(t.r).multiplyScalar(c).addScaledVector(t.u, sn)
    p.addScaledVector(u, h)
    return p
  }

  kappaAt(s) {
    s = this.wrapS(s)
    const x = s / this.step, i = Math.floor(x), k = x - i, j = this.wrap(i + 1)
    if (this.seam[i]) return this.kappa[i]
    return this.kappa[i] + (this.kappa[j] - this.kappa[i]) * k
  }

  halfAt(s) { return this.half[this.index(s)] }

  /** A gap (or a seam) within `ahead` metres from D. */
  gapAhead(D, ahead) {
    const i0 = this.index(D), n = Math.round(ahead / this.step)
    for (let k = 0; k <= n; k += 2) { const i = this.wrap(i0 + k); if (this.gap[i] || this.seam[i]) return true }
    return false
  }

  /** A curved stretch within `ahead` metres from D. */
  curvedAhead(D, ahead) {
    const i0 = this.index(D), n = Math.round(ahead / this.step)
    for (let k = 0; k <= n; k += 2) if (this.curved(this.wrap(i0 + k))) return true
    return false
  }

  /** On a curved stretch, or close before one that ends: the x to be on when it ends (a drum's exit line in
   * this stretch's x), else null. */
  exitAhead(s, ahead) {
    const i0 = this.index(s), n = Math.round(ahead / this.step)
    if (!this.curved(i0) && !this.curved(this.wrap(i0 + n))) return null
    // the end of this curved run: a seam (its shift is where the road goes on) or the cross-section flattening
    for (let k = 0; k < 240; k++) {
      const i = this.wrap(i0 + k)
      if (this.seam[i]) return this.shift[i]
      if (!this.curved(i)) return 0
    }
    return null
  }
  /** The cross-section closes all the way round here (x wraps). */
  isFull(i) { const k = Math.abs(this.kappa[i]); return k > 1e-4 && this.half[i] >= Math.PI / k - 0.02 }
  /** Barriers here: a flat stretch that is not open and not over the gap. */
  hasRails(i) { return !this.open[i] && !this.gap[i] && Math.abs(this.kappa[i]) < 1e-4 && !this.seam[i] }
  wrapX(i, x) { const c = 2 * Math.PI / Math.abs(this.kappa[i]); return x - c * Math.round(x / c) }

  /** The shift of x for moving from D0 on to D1: the seams crossed between them. */
  seamShift(D0, D1) {
    if (D1 <= D0) return 0
    let sum = 0
    const i0 = Math.floor(this.wrapS(D0) / this.step), steps = Math.min(this.n, Math.ceil((D1 - D0) / this.step) + 1)
    for (let k = 0; k <= steps; k++) {
      const i = this.wrap(i0 + k)
      if (!this.seam[i]) continue
      const sSeam = (i + 0.5) * this.step   // the jump lies between sample i and the next: crossed where index() turns to the next
      const L = this.length
      const a = ((D0 - sSeam) % L + L) % L
      if (a + (D1 - D0) >= L && a < L) sum += this.shift[i]
    }
    return sum
  }

  index(s) { return this.wrap(Math.round(s / this.step)) }
  curvature(s) { return this.curv[this.index(s)] }
  isGap(s) { return this.gap[this.index(s)] === 1 }

  /** The sharpest turn in the next `ahead` metres (signed, with the bank's help taken off). */
  hardestAhead(s, ahead) {
    let worst = 0
    for (let d = 0; d <= ahead; d += 1) {
      const i = this.index(s + d)
      const k = this.curv[i] * (1 - this.assist[i])
      if (Math.abs(k) > Math.abs(worst)) worst = k
    }
    return worst
  }

  /** A gentle racing line: towards the inside of the turns ahead (x to the right, metres). */
  buildLine() {
    const line = new Float32Array(this.n)
    const look = Math.round(6 / this.step), span = Math.round(10 / this.step)
    for (let i = 0; i < this.n; i++) {
      let k = 0
      for (let j = 0; j < span; j++) k += this.curv[this.wrap(i + look + j)]
      line[i] = THREE.MathUtils.clamp(k / span * 7, -1, 1) * (this.width / 2 - 0.55)
    }
    this.line = smoothArray(line, 24)
    return this
  }

  lineAt(s) { return this.line[this.index(s)] }

  // ---------------------------------------------------------------- meshes
  build() {
    const group = new THREE.Group()
    group.name = 'track'
    this.road = this.roadMesh()
    this.rails = this.railMesh()
    this.under = this.underMesh()
    this.mineMesh = this.minesMesh()
    group.add(this.road, this.under, this.rails, this.mineMesh)
    this.shaped = this.shapeMesh()
    if (this.shaped) group.add(this.shaped)
    this.group = group
    return group
  }

  /** Rows of vertices across the road at every sample; quads between rows except over the gap. */
  ribbon(cross, attrs) {
    const n = this.n, c = cross.length
    const pos = new Float32Array(n * c * 3), uv = new Float32Array(n * c * 2), nor = new Float32Array(n * c * 3)
    const p = new THREE.Vector3(), u = new THREE.Vector3(), r = new THREE.Vector3(), q = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      p.fromArray(this.P, i * 3); u.fromArray(this.U, i * 3); r.fromArray(this.R, i * 3)
      for (let j = 0; j < c; j++) {
        const [x, y, v, nx, ny] = cross[j]
        q.copy(p).addScaledVector(r, x).addScaledVector(u, y)
        q.toArray(pos, (i * c + j) * 3)
        uv[(i * c + j) * 2] = v
        uv[(i * c + j) * 2 + 1] = i * this.step
        const nn = new THREE.Vector3().addScaledVector(r, nx).addScaledVector(u, ny).normalize()
        nn.toArray(nor, (i * c + j) * 3)
      }
    }
    const index = []
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n
      if (this.gap[i] || this.gap[i2]) continue
      if (attrs.skip && attrs.skip(i, i2)) continue
      // the lap's last row joins the first: its s runs on past the length there (the shader wraps it)
      for (const [j0, j1] of attrs.strips) {
        const a = i * c + j0, b = i * c + j1, d = i2 * c + j0, e = i2 * c + j1
        index.push(a, d, b, b, d, e)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(index)
    // the seam: the first row repeated at s = length, so the markings do not jump there
    if (attrs.seam !== false) fixSeam(g, n, c, this.length)
    g.computeBoundingSphere()
    return g
  }

  roadMesh() {
    const W = this.width / 2
    // across: the left edge, the surface, the right edge (u from 0 to 1 over the surface)
    const g = this.ribbon([
      [-W, 0, 0, 0, 1], [W, 0, 1, 0, 1],
    ], { strips: [[1, 0]], skip: (i, i2) => this.curved(i) || this.curved(i2) || this.seam[i] })
    // the edges: where they are (along the surface) and whether a barrier stands there (negative: open)
    const rows = g.attributes.position.count / 2
    const half = new Float32Array(rows * 2)
    for (let i = 0; i < rows; i++) { const j = i % this.n; half.fill(this.open[j] ? -W : W, i * 2, i * 2 + 2) }
    g.setAttribute('aHalf', new THREE.BufferAttribute(half, 1))
    // what lies on the road, per sample: kind, x across, progress through it
    const data = new Uint8Array(this.n * 4)
    for (let i = 0; i < this.n; i++) {
      data[i * 4] = this.kind[i] * 40
      data[i * 4 + 1] = Math.round((this.kindX[i] / this.width + 0.5) * 255)
      data[i * 4 + 2] = Math.round(this.kindT[i] * 255)
      data[i * 4 + 3] = this.gap[this.wrap(i + 1)] || this.gap[this.wrap(i + 2)] || this.gap[this.wrap(i + 3)] ? 255 : 0
    }
    const tex = new THREE.DataTexture(data, this.n, 1, THREE.RGBAFormat)
    tex.magFilter = tex.minFilter = THREE.NearestFilter
    tex.needsUpdate = true
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uFeat: { value: tex }, uN: { value: this.n }, uStep: { value: this.step }, uLen: { value: this.length }, ...this.colors('glass', 'grid', 'sheen', 'edge', 'inner', 'chev', 'ring') },
      vertexShader: ROAD_V,
      fragmentShader: fogChunk + ROAD_F,
      extensions: { derivatives: true },
    })
    const mesh = new THREE.Mesh(g, mat)
    mesh.name = 'road'
    return mesh
  }

  curved(i) { return Math.abs(this.kappa[i]) > 1e-4 }
  /** On a curved run: { x, dist } to its end (the x to be on, metres to go), else null. */
  exitAt(i) { return this.curved(i) && this.exitD[i] >= 0 ? { x: this.exitX[i], dist: this.exitD[i] } : null }

  /** Sample i's frame at x across its cross-section (into p, u, r). */
  frameAtIndex(i, x, p, u, r) {
    const P = this.P, U = this.U, R = this.R, k = this.kappa[i], a = i * 3
    const ux = U[a], uy = U[a + 1], uz = U[a + 2], rx = R[a], ry = R[a + 1], rz = R[a + 2]
    if (Math.abs(k) < 1e-4) { p.set(P[a] + rx * x, P[a + 1] + ry * x, P[a + 2] + rz * x); u.set(ux, uy, uz); r.set(rx, ry, rz); return }
    const t = k * x, c = Math.cos(t), sn = Math.sin(t), A = sn / k, B = (1 - c) / k
    p.set(P[a] + rx * A + ux * B, P[a + 1] + ry * A + uy * B, P[a + 2] + rz * A + uz * B)
    u.set(ux * c - rx * sn, uy * c - ry * sn, uz * c - rz * sn)
    r.set(rx * c + ux * sn, ry * c + uy * sn, rz * c + uz * sn)
  }

  /** The curved stretches (pipes, drums): the road as rows of points round its cross-section, seen from both
   * sides (the pipe's outside, the drum's inside), with a flat row before and after each so they join. */
  shapeMesh() {
    const C = 49
    const want = new Set()
    for (let i = 0; i < this.n; i++) if (this.curved(i)) { want.add(this.wrap(i - 1)); want.add(i); want.add(this.wrap(i + 1)) }
    if (!want.size) return null
    const list = [...want].sort((a, b) => a - b)
    const pos = [], uv = [], nor = [], half = [], guide = [], index = [], start = new Map()
    const p = new THREE.Vector3(), u = new THREE.Vector3(), r = new THREE.Vector3()
    for (const i of list) {
      start.set(i, pos.length / 3)
      const h = this.half[i]
      for (let j = 0; j < C; j++) {
        const x = -h + 2 * h * j / (C - 1)
        this.frameAtIndex(i, x, p, u, r)
        pos.push(p.x, p.y, p.z); nor.push(u.x, u.y, u.z)
        uv.push(x / this.width + 0.5, i * this.step)
        half.push(this.isFull(i) ? 99 : this.curved(i) ? -h : this.open[i] ? -h : h)
        // the lane to the exit: brighter as the end comes (all along a drum, the last stretch of a pipe)
        const e = this.exitAt(i), L = this.runLen[i] || 1
        const gk = !e ? 0 : this.kappa[i] < 0 ? 0.45 + 0.55 * (1 - e.dist / L) : Math.max(0, 1 - e.dist / (L * 0.6))
        guide.push(e ? e.x : 0, gk)
      }
    }
    for (const i of list) {
      const i2 = this.wrap(i + 1)
      if (!start.has(i2) || this.gap[i] || this.gap[i2] || this.seam[i]) continue
      if (!this.curved(i) && !this.curved(i2)) continue
      const a0 = start.get(i), b0 = start.get(i2)
      for (let j = 0; j < C - 1; j++) {
        const a = a0 + j + 1, b = a0 + j, d = b0 + j + 1, e = b0 + j
        index.push(a, d, b, b, d, e)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setAttribute('aHalf', new THREE.Float32BufferAttribute(half, 1))
    g.setAttribute('aGuide', new THREE.Float32BufferAttribute(guide, 2))
    g.setIndex(index)
    g.computeBoundingSphere()
    const mat = this.road.material.clone()
    mat.uniforms = this.road.material.uniforms
    mat.side = THREE.DoubleSide
    const mesh = new THREE.Mesh(g, mat)
    mesh.name = 'pipes'
    return mesh
  }

  underMesh() {
    const W = this.width / 2
    const T = 0.22
    // the slab's sides and underside, with a glowing strip along each lower edge
    const g = this.ribbon([
      [-W, 0, 0, -1, 0], [-W, -T, 0.2, -1, 0], [-W + 0.15, -T, 0.25, 0, -1], [W - 0.15, -T, 0.75, 0, -1], [W, -T, 0.8, 1, 0], [W, 0, 1, 1, 0],
    ], { strips: [[1, 0], [2, 1], [3, 2], [4, 3], [5, 4]], skip: (i, i2) => this.curved(i) || this.curved(i2) || this.seam[i] })
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, ...this.colors('strip', 'dots') },
      vertexShader: SIMPLE_V,
      fragmentShader: fogChunk + UNDER_F,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(g, mat)
    mesh.name = 'underside'
    return mesh
  }

  railMesh() {
    const W = this.width / 2
    const H = 0.16
    const g = this.ribbon([
      [-W, 0, 0, 1, 0], [-W, H, 1, 1, 0], [W, 0, 0, -1, 0], [W, H, 1, -1, 0],
    ], { strips: [[0, 1], [2, 3]], skip: (i, i2) => !this.hasRails(i) || !this.hasRails(i2) })
    // which side each vertex is on (for the hit flashes): -1 left, 1 right
    const rows = g.attributes.position.count / 4
    const side = new Float32Array(rows * 4)
    for (let i = 0; i < rows; i++) side.set([-1, -1, 1, 1], i * 4)
    g.setAttribute('side', new THREE.BufferAttribute(side, 1))
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uHits: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0)) }, uLen: { value: this.length }, ...this.colors('rail', 'railTop') },
      vertexShader: RAIL_V,
      fragmentShader: fogChunk + RAIL_F,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    const mesh = new THREE.Mesh(g, mat)
    mesh.name = 'rails'
    mesh.renderOrder = 2
    this.hitSlot = 0
    return mesh
  }

  /** This course's colours as uniforms (uEdge from 'edge' and so on). */
  colors(...names) {
    const p = PALETTES[this.id % PALETTES.length]
    return Object.fromEntries(names.map(n => [`u${n[0].toUpperCase()}${n.slice(1)}`, { value: p[n] }]))
  }

  /** A spark flash on a barrier: where (s, side) and when. */
  flashRail(s, side, time) {
    const hits = this.rails.material.uniforms.uHits.value
    hits[this.hitSlot].set(this.wrapS(s), side, time, 1)
    this.hitSlot = (this.hitSlot + 1) % hits.length
  }

  minesMesh() {
    // a mine: a dark spiked core with a red glowing ring, floating just above the road
    const geo = new THREE.IcosahedronGeometry(0.07, 0)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: MINE_V,
      fragmentShader: fogChunk + MINE_F,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.mines.length))
    mesh.name = 'mines'
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1)
    const phase = new Float32Array(Math.max(1, this.mines.length))
    this.mines.forEach((mine, i) => {
      this.point(mine.s, mine.x, 0.09, p)
      q.setFromEuler(new THREE.Euler(i * 1.7, i * 2.3, 0))
      m.compose(p, q, one)
      mesh.setMatrixAt(i, m)
      phase[i] = i * 0.37
      mine.alive = true
      mine.pos = p.clone()
    })
    mesh.geometry.setAttribute('phase', new THREE.InstancedBufferAttribute(phase, 1))
    mesh.count = this.mines.length
    mesh.frustumCulled = false
    return mesh
  }

  /** A mine went off: hide it for a while (it comes back next lap). */
  setMine(i, alive) {
    const mine = this.mines[i]
    mine.alive = alive
    const m = new THREE.Matrix4()
    this.mineMesh.getMatrixAt(i, m)
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
    m.decompose(p, q, s)
    s.setScalar(alive ? 1 : 0)
    m.compose(p, q, s)
    this.mineMesh.setMatrixAt(i, m)
    this.mineMesh.instanceMatrix.needsUpdate = true
  }

  /** The track from above, for the map: a list of [x, z] and the bounds. */
  outline(every = 4) {
    const pts = []
    for (let i = 0; i < this.n; i += every) pts.push([this.P[i * 3], this.P[i * 3 + 2], this.P[i * 3 + 1]])
    return pts
  }
}

const TMP = { f: new THREE.Vector3(), u: new THREE.Vector3(), r: new THREE.Vector3() }
const TMP2 = { u: new THREE.Vector3(), r: new THREE.Vector3() }

function smoothArray(a, r) {
  const n = a.length, out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = -r; j <= r; j++) s += a[((i + j) % n + n) % n]
    out[i] = s / (2 * r + 1)
  }
  return out
}

/** The quads from the last row to the first would run s from (length - step) back to 0: give that last
 * strip its own copy of the first row, with s = length. */
function fixSeam(g, n, c, length) {
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv
  const extra = c
  const P = new Float32Array((n + 1) * c * 3), N = new Float32Array((n + 1) * c * 3), UV = new Float32Array((n + 1) * c * 2)
  P.set(pos.array); N.set(nor.array); UV.set(uv.array)
  for (let j = 0; j < extra; j++) {
    for (let k = 0; k < 3; k++) { P[(n * c + j) * 3 + k] = pos.array[j * 3 + k]; N[(n * c + j) * 3 + k] = nor.array[j * 3 + k] }
    UV[(n * c + j) * 2] = uv.array[j * 2]
    UV[(n * c + j) * 2 + 1] = length
  }
  const idx = g.index.array.slice()
  // indices in the last strip that point at row 0 point at the new row instead
  const last = n - 1
  for (let q = 0; q < idx.length; q += 3) {
    const tri = [idx[q], idx[q + 1], idx[q + 2]]
    if (tri.some(v => Math.floor(v / c) === last) && tri.some(v => Math.floor(v / c) === 0)) {
      for (let k = 0; k < 3; k++) if (Math.floor(idx[q + k] / c) === 0) idx[q + k] += n * c
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(UV, 2))
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
  }
  g.setIndex(Array.from(idx))
}

// ---------------------------------------------------------------- shaders
const SIMPLE_V = /* glsl */`
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`

const ROAD_V = /* glsl */`
attribute float aHalf;
attribute vec2 aGuide;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHalf;
varying vec2 vGuide;
void main() {
  vUv = uv;
  vHalf = aHalf;
  vGuide = aGuide;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`

// u across the road (0 left edge, 1 right edge), v = metres along it
// each course's own colours for its road, its underside and its barriers, so you know at a glance which one you are
// on (the plates, the pit strips, the open-edge warnings and the exit lane keep the same colours everywhere)
const V3 = (r, g, b) => new THREE.Vector3(r, g, b)
export const PALETTES = [
  // NEON CITY: cyan glass, violet chevrons
  { glass: V3(0.018, 0.022, 0.045), grid: V3(0.05, 0.12, 0.25), sheen: V3(0.04, 0.02, 0.08), edge: V3(0.1, 0.9, 1.6), inner: V3(0.1, 0.5, 0.9),
    chev: V3(0.6, 0.2, 1.4), ring: V3(0.3, 0.8, 1.8), strip: V3(0.9, 0.1, 1.2), dots: V3(0.1, 0.8, 1.4), rail: V3(0.1, 0.55, 1.0), railTop: V3(0.3, 0.9, 1.6) },
  // SKY PIPE: hot pink, gold chevrons
  { glass: V3(0.038, 0.012, 0.034), grid: V3(0.24, 0.05, 0.16), sheen: V3(0.08, 0.02, 0.05), edge: V3(1.9, 0.28, 1.05), inner: V3(1.0, 0.18, 0.6),
    chev: V3(1.6, 0.95, 0.2), ring: V3(1.8, 0.35, 1.1), strip: V3(1.6, 0.8, 0.15), dots: V3(1.6, 0.3, 1.0), rail: V3(0.95, 0.12, 0.55), railTop: V3(1.8, 0.35, 1.1) },
  // THE DRUM: violet, pale blue-white chevrons
  { glass: V3(0.026, 0.016, 0.052), grid: V3(0.15, 0.08, 0.3), sheen: V3(0.05, 0.03, 0.1), edge: V3(0.85, 0.35, 1.9), inner: V3(0.5, 0.2, 1.1),
    chev: V3(1.1, 1.2, 1.7), ring: V3(0.85, 0.4, 1.9), strip: V3(0.35, 0.9, 1.8), dots: V3(0.9, 0.4, 1.8), rail: V3(0.5, 0.2, 1.1), railTop: V3(0.9, 0.45, 1.9) },
  // the NOVA CUP (space): starlit glass in ice white and blue, then aurora green, then solar gold on black
  { glass: V3(0.012, 0.018, 0.04), grid: V3(0.1, 0.16, 0.3), sheen: V3(0.03, 0.04, 0.09), edge: V3(1.3, 1.6, 2.0), inner: V3(0.5, 0.7, 1.2),
    chev: V3(0.4, 1.0, 2.0), ring: V3(1.2, 1.5, 2.0), strip: V3(0.5, 0.8, 2.0), dots: V3(1.4, 1.6, 2.0), rail: V3(0.45, 0.6, 1.0), railTop: V3(1.2, 1.5, 2.0) },
  { glass: V3(0.008, 0.03, 0.03), grid: V3(0.06, 0.25, 0.2), sheen: V3(0.02, 0.07, 0.06), edge: V3(0.25, 1.9, 1.0), inner: V3(0.15, 1.0, 0.7),
    chev: V3(1.4, 0.4, 1.8), ring: V3(0.3, 1.9, 1.2), strip: V3(0.3, 1.6, 1.0), dots: V3(1.2, 0.5, 1.8), rail: V3(0.1, 0.8, 0.5), railTop: V3(0.3, 1.9, 1.1) },
  { glass: V3(0.02, 0.016, 0.01), grid: V3(0.25, 0.18, 0.06), sheen: V3(0.07, 0.05, 0.02), edge: V3(2.0, 1.4, 0.3), inner: V3(1.1, 0.7, 0.15),
    chev: V3(1.6, 1.6, 1.8), ring: V3(2.0, 1.3, 0.3), strip: V3(1.8, 1.0, 0.2), dots: V3(1.9, 1.5, 0.6), rail: V3(0.9, 0.55, 0.1), railTop: V3(2.0, 1.4, 0.3) },
  // the DUST CUP (desert): sun-baked red, burnt orange and hot teal
  { glass: V3(0.05, 0.014, 0.01), grid: V3(0.3, 0.08, 0.04), sheen: V3(0.09, 0.03, 0.02), edge: V3(2.0, 0.45, 0.15), inner: V3(1.2, 0.3, 0.1),
    chev: V3(0.2, 1.6, 1.6), ring: V3(2.0, 0.6, 0.2), strip: V3(1.9, 0.9, 0.2), dots: V3(0.3, 1.5, 1.5), rail: V3(0.9, 0.2, 0.05), railTop: V3(2.0, 0.5, 0.15) },
  { glass: V3(0.05, 0.03, 0.01), grid: V3(0.3, 0.17, 0.05), sheen: V3(0.09, 0.05, 0.02), edge: V3(2.0, 0.9, 0.2), inner: V3(1.2, 0.55, 0.1),
    chev: V3(1.9, 0.3, 0.3), ring: V3(2.0, 0.9, 0.25), strip: V3(1.9, 0.5, 0.15), dots: V3(1.9, 0.9, 0.3), rail: V3(0.9, 0.4, 0.05), railTop: V3(2.0, 0.9, 0.2) },
  { glass: V3(0.01, 0.035, 0.035), grid: V3(0.05, 0.25, 0.25), sheen: V3(0.02, 0.08, 0.08), edge: V3(0.2, 1.9, 1.7), inner: V3(0.1, 1.0, 0.9),
    chev: V3(2.0, 0.6, 0.2), ring: V3(0.25, 1.9, 1.7), strip: V3(2.0, 0.7, 0.2), dots: V3(0.3, 1.8, 1.6), rail: V3(0.1, 0.8, 0.75), railTop: V3(0.2, 1.9, 1.7) },
]

const ROAD_F = /* glsl */`
uniform sampler2D uFeat;
uniform float uN, uStep, uLen, uTime, uMirror;
uniform vec3 uGlass, uGrid, uSheen, uEdge, uInner, uChev, uRing;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHalf;
varying vec2 vGuide;

float band(float x, float a, float b, float aa) { return smoothstep(a - aa, a, x) - smoothstep(b, b + aa, x); }

void main() {
  float u = vUv.x, s = vUv.y;
  float W = ${(3.2).toFixed(2)};
  float x = (u - 0.5) * W;                  // metres from the centre, + right
  vec2 d = fwidth(vec2(x, s));
  float aa = max(d.x, d.y) * 1.2 + 0.002;
  float fade = clamp(1.0 - max(d.x, d.y) * 5.0, 0.0, 1.0);   // fine patterns fade out far away

  // the surface: dark glass with a hex-ish grid of faint lines
  vec3 col = uGlass;
  vec2 g = vec2(x, s) * 5.0;                      // a line every 20 cm, one down the middle and on each edge
  vec2 gw = fwidth(g);
  vec2 gd = abs(fract(g + 0.5) - 0.5);            // how far to the nearest line, in cells
  vec2 l = 1.0 - smoothstep(0.022 - gw * 0.5, 0.022 + gw * 0.7, gd);
  float grid = max(l.x, l.y) * fade * clamp(1.5 - max(gw.x, gw.y) * 2.0, 0.0, 1.0);
  col += uGrid * grid * 0.45;
  // a sheen that moves with you: the city lights in the glass
  col += uSheen * (0.5 + 0.5 * sin(s * 0.21 + x * 0.6));

  // the edge lines: cyan, bright enough to bloom; and a fine inner line. Where no barrier stands (an open
  // edge, a pipe's lip) they run in red and orange dashes; a closed pipe has none
  float H = abs(vHalf);
  float edge = band(abs(x), H - 0.035, H - 0.008, aa) * step(H, 50.0);
  float inner = band(abs(x), H - 0.08, H - 0.07, aa) * fade * step(H, 50.0);
  if (vHalf < 0.0) {
    float dash = step(0.5, fract(s * 2.0 - uTime * 1.5));
    col += mix(vec3(1.9, 0.25, 0.1), vec3(1.8, 0.9, 0.1), dash) * (edge * 1.8 + band(abs(x), H - 0.2, H - 0.035, aa) * 0.35);
  } else col += uEdge * edge * 1.6 + uInner * inner * 0.5;
  // inside a pipe: rings of light running round it
  if (H > 50.0) col += uRing * band(fract(s * 0.5 - uTime * 0.8), 0.0, 0.04, 0.01) * 0.8;
  // centre chevrons every 1.33 m, a light pulse running forward through them
  float cs = fract(s * 0.75);
  float chev = band(cs - abs(x) * 0.54, 0.0, 0.06, aa * 0.75) * step(abs(x), 0.19) * fade;
  float pulse = 0.35 + 0.65 * pow(0.5 + 0.5 * sin((s - uTime * 10.0) * 0.24), 6.0);
  col += uChev * chev * pulse * 0.7;

  // what lies here: the per-sample feature row
  vec4 f = texture2D(uFeat, vec2((floor(mod(s / uStep, uN)) + 0.5) / uN, 0.5));
  float kind = floor(f.r * 255.0 / 40.0 + 0.5);
  float fx = (f.g - 0.5) * W;
  float ft = f.b;
  if (kind == 1.0) {
    // a dash plate: 0.4 m wide, arrows racing forward, orange-gold
    float px = abs(x - fx);
    float inside = 1.0 - smoothstep(0.19, 0.2 + aa, px);
    float arrow = band(fract(s * 3.9 - uTime * 3.0 - px * 2.7), 0.0, 0.35, 0.05);
    col = mix(col, vec3(0.25, 0.08, 0.0), inside * 0.8);
    col += vec3(2.4, 1.2, 0.15) * arrow * inside;
    col += vec3(1.6, 0.9, 0.1) * band(px, 0.18, 0.2, aa) * 1.5;
  } else if (kind == 2.0) {
    // the pit: a magenta strip 0.8 m wide along one edge, or 1 m wide down the middle of a stretch with open
    // edges, with a ladder of crosses down it
    float mid = step(abs(fx), 0.3);
    float side = fx > 0.0 ? 1.0 : -1.0;
    float px = mix(x * side - (W * 0.5 - 0.4), x, mid);       // across the strip, from its middle
    float hw = mix(0.4, 0.5, mid);                             // its half width
    float inside = 1.0 - smoothstep(hw, hw + aa, abs(px));
    vec2 q = vec2(px, fract(s * 2.4) - 0.5);
    float plus = max(band(abs(q.x), 0.0, 0.017, aa) * step(abs(q.y), 0.2), band(abs(q.y), 0.0, 0.06, aa) * step(abs(q.x), 0.055));
    col = mix(col, vec3(0.18, 0.0, 0.12), inside * 0.7);
    col += vec3(1.8, 0.2, 1.4) * plus * inside * (0.6 + 0.4 * sin(uTime * 6.0 - s * 3.0));
    col += vec3(2.0, 0.3, 1.6) * band(abs(px), hw - 0.03, hw, aa);
  } else if (kind == 3.0) {
    // a jump plate: the whole width, red-orange, arrows pointing up the slope
    float arrow = band(fract(s * 6.0 - uTime * 2.0 - abs(x) * 1.8), 0.0, 0.4, 0.06);
    col = mix(col, vec3(0.3, 0.03, 0.0), 0.85);
    col += vec3(2.6, 0.5, 0.1) * arrow;
  } else if (kind == 5.0) {
    // a kicker: a lime ramp at the side, 0.7 m wide, chevrons climbing it
    float px = abs(x - fx);
    float inside = 1.0 - smoothstep(0.34, 0.35 + aa, px);
    float arrow = band(fract(s * 5.0 - uTime * 2.5 - px * 1.5), 0.0, 0.4, 0.06);
    col = mix(col, vec3(0.04, 0.2, 0.02), inside * 0.85);
    col += vec3(0.7, 2.2, 0.4) * arrow * inside + vec3(0.6, 2.0, 0.3) * band(px, 0.32, 0.35, aa) * 1.4;
  } else if (kind == 4.0) {
    // the start line: a checker band
    vec2 c = floor(vec2(x * 12.0, s * 12.0));
    float chk = mod(c.x + c.y, 2.0);
    col = mix(col, vec3(0.9 + chk * 0.6), 0.9) * (0.4 + 0.6 * chk);
  }
  // on a pipe or a drum: a green lane of chevrons to where the road goes on
  if (vGuide.y > 0.01) {
    float gx = abs(x - vGuide.x);
    float lane = 1.0 - smoothstep(0.3, 0.34, gx);
    float chev = band(fract(s * 2.2 - uTime * 4.0 - gx * 1.6), 0.0, 0.35, 0.05);
    col = mix(col, vec3(0.01, 0.12, 0.05), lane * 0.65 * vGuide.y);
    col += vec3(0.3, 2.0, 0.7) * (chev * lane * 1.2 + band(gx, 0.3, 0.34, aa) * 1.1) * vGuide.y;
  }
  // a warning before the gap: red stripes across
  if (f.a > 0.5) col += vec3(1.8, 0.1, 0.2) * band(fract(s * 6.0 - uTime), 0.0, 0.4, 0.05);

  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
}`

const UNDER_F = /* glsl */`
uniform float uTime;
uniform vec3 uStrip, uDots;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  float u = vUv.x;
  vec3 col = vec3(0.03, 0.035, 0.07);
  // lights along the lower edges and a dotted line under the middle
  float strip = smoothstep(0.03, 0.0, abs(u - 0.21)) + smoothstep(0.03, 0.0, abs(u - 0.79));
  col += uStrip * strip * 1.2;
  float dots = step(0.5, fract(vUv.y * 3.0 - uTime * 2.0)) * smoothstep(0.02, 0.0, abs(u - 0.5));
  col += uDots * dots;
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
}`

const RAIL_V = /* glsl */`
attribute float side;
varying vec2 vUv;
varying vec3 vWorld;
varying float vSide;
void main() {
  vUv = uv;
  vSide = side;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`

// a barrier of light: brightest at its foot and its top edge, scanlines running along it, flashes where
// someone scraped it
const RAIL_F = /* glsl */`
uniform float uTime, uLen;
uniform vec3 uRail, uRailTop;
uniform vec4 uHits[8];
varying vec2 vUv;
varying vec3 vWorld;
varying float vSide;
void main() {
  float h = vUv.x, s = vUv.y;
  float foot = smoothstep(0.35, 0.0, h);
  float top = smoothstep(0.08, 0.0, abs(h - 0.94));
  float scan = 0.5 + 0.5 * sin(s * 18.0 + uTime * 9.0 * (vSide > 0.0 ? 1.0 : -1.0));
  float posts = smoothstep(0.06, 0.0, abs(fract(s * 1.5) - 0.5) - 0.44);
  vec3 c = uRail * (0.12 + foot * 0.5 + scan * 0.08) + uRailTop * top + uRail * 1.2 * posts * 0.3;
  // hits: a hot white-orange flash spreading along the barrier
  for (int i = 0; i < 8; i++) {
    vec4 hit = uHits[i];
    float age = uTime - hit.z;
    if (age < 0.0 || age > 0.6 || hit.y * vSide < 0.0) continue;
    float ds = abs(s - hit.x); ds = min(ds, uLen - ds);
    float k = exp(-ds * ds / (0.05 + age * 0.6)) * (1.0 - age / 0.6);
    c += vec3(0.9, 0.5, 0.2) * k;
  }
  // close to the camera the barrier is a wall across half the view: keep it faint there
  c *= smoothstep(0.15, 1.0, length(vWorld - cameraPosition)) * 0.75 + 0.25;
  float a = clamp(max(max(c.r, c.g), c.b), 0.0, 1.0);
  gl_FragColor = vec4(applyFog(c, vWorld) * a, a);
}`

const MINE_V = /* glsl */`
attribute float phase;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vPhase;
void main() {
  vPhase = phase;
  vec3 p = position * (1.0 + 0.08 * sin(uTime * 8.0 + phase * 6.0));
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  w.y += 0.04 * sin(uTime * 3.0 + phase * 4.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`

const MINE_F = /* glsl */`
uniform float uTime;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vPhase;
void main() {
  vec3 v = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - abs(dot(normalize(vNormal), v)), 2.0);
  float blink = 0.5 + 0.5 * step(0.5, fract(uTime * 2.0 + vPhase));
  vec3 c = vec3(0.05, 0.0, 0.02) + vec3(2.5, 0.1, 0.35) * (rim * 1.4 + 0.25) * (0.6 + 0.6 * blink);
  gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
}`
