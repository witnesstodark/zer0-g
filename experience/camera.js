// The cameras: the chase camera behind your machine (it rolls with the road through the loop and the
// twist), and the director's shots for the title, the start and the finish: low beside the road as the
// pack screams past, riding behind the leader, a crane over the arena, the sweep down the grid.

import * as THREE from 'three'
import { U } from './scale.js'

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

export class Cameras {
  constructor(camera, track, lot) {
    this.camera = camera
    this.track = track
    this.lot = lot
    this.pos = V(); this.look = V(); this.up = new THREE.Vector3(0, 1, 0)
    this.shake = 0
    this.far = false
    this.fov = 72
    this.kick = 0                 // a punch of the field of view (a plate, the nitro), dying away fast
    this.surge = 0                // the nitro throws the machine forward, away from the camera
    this.pull = 0                 // the camera drops back as you speed up (a boost, a plate, a drift) and comes back in
    this.accel = 0; this.lastSp = null
    this.p = V(); this.f = V(); this.u = V(); this.r = V()
    this.tmp = V(); this.tmp2 = V()
    this.first = true
  }

  /** Keep a point inside the lot (the experience is drawn inside its box). */
  inside(v, margin = 0.4) {
    const L = this.lot
    v.x = THREE.MathUtils.clamp(v.x, -L.width / 2 + margin, L.width / 2 - margin)
    v.z = THREE.MathUtils.clamp(v.z, -L.depth / 2 + margin, L.depth / 2 - margin)
    v.y = THREE.MathUtils.clamp(v.y, 0.3, L.height - margin)
    return v
  }

  /** Where a racer is: its point, its heading (forward), up, right. */
  racerFrame(r, out = { p: V(), f: V(), u: V(), r: V() }) {
    const t = this.track
    t.frameAt(r.D, r.x, r.h, out.p, out.f, out.u, out.r)
    // the machine's heading turned by psi about the road's up
    const c = Math.cos(r.psi), s = Math.sin(r.psi)
    const f = this.tmp.copy(out.f).multiplyScalar(c).addScaledVector(out.r, s)
    out.r.copy(out.r).multiplyScalar(c).addScaledVector(out.f, -s)
    out.f.copy(f)
    return out
  }

  chase(r, dt, boost) {
    const fr = this.racerFrame(r, this.frameA ?? (this.frameA = { p: V(), f: V(), u: V(), r: V() }))
    // follow the road's direction more than the machine's (it slides and spins)
    const t = this.track
    const road = this.frameB ?? (this.frameB = { p: V(), f: V(), u: V(), r: V() })
    t.frame(r.D, road.p, road.f, road.u, road.r)
    const dir = this.tmp2.copy(road.f).multiplyScalar(0.75).addScaledVector(fr.f, 0.25).normalize()
    // only the directions are smoothed (the camera swings round in turns); the machine itself stays where
    // the camera puts it, so at speed it does not slide out of the picture
    const kd = this.first ? 1 : 1 - Math.exp(-9 * dt)
    this.dir = (this.dir ?? dir.clone()).lerp(dir, kd).normalize()
    this.up.lerp(t.curved(t.index(r.D)) ? fr.u : road.u, this.first ? 1 : 1 - Math.exp(-8 * dt)).normalize()
    this.surge *= Math.exp(-dt * 2.5)
    // the pull: speeding up throws the machine forward, away from the camera; slowing down lets the camera
    // catch up (and a little closer). Out fast, back in slowly
    const acc = this.lastSp == null || this.first ? 0 : (r.sp - this.lastSp) / Math.max(dt, 1e-3)
    this.lastSp = r.sp
    this.accel += (acc - this.accel) * Math.min(1, dt * 5)
    const want = THREE.MathUtils.clamp(this.accel / (2.2 * U), -0.35, 0.6) + (boost ? 0.5 : 0) + (r.turbo > 0 ? 0.3 : 0) + (r.drift ? 0.35 : 0)
    this.pull += (want - this.pull) * Math.min(1, dt * (want > this.pull ? 3.5 : 1.2))
    if (this.first) this.pull = 0
    const back = ((this.far ? 1.0 : 0.5) + this.surge * 0.22 + this.pull * 0.3) * U, high = ((this.far ? 0.37 : 0.17) + Math.max(0, this.pull) * 0.035) * U
    this.pos.copy(fr.p).addScaledVector(this.dir, -back).addScaledVector(this.up, high)
    // a drift: the camera swings out a little, so the slide shows side-on
    if (r.driftVis) this.pos.addScaledVector(road.r, -r.driftVis * 0.12 * U)
    this.look.copy(fr.p).addScaledVector(this.dir, 0.95 * U).addScaledVector(this.up, 0.08 * U)
    if (r.falling && r.fallPos) this.look.copy(r.fallPos)
    this.first = false
    const fov = 66 + Math.min(12, r.sp / U * 0.66) + (boost ? 8 : 0)
    this.apply(dt, fov)
  }

  /** A fixed spot looking at a moving point (the low trackside shot). */
  watch(from, at, dt, fov = 55, smooth = 10) {
    const k = 1 - Math.exp(-smooth * dt)
    this.pos.lerp(from, this.first ? 1 : k)
    this.look.lerp(at, this.first ? 1 : k)
    this.up.lerp(new THREE.Vector3(0, 1, 0), k).normalize()
    this.first = false
    this.apply(dt, fov)
  }

  cut() { this.first = true; this.dir = null }

  apply(dt, fov) {
    const cam = this.camera
    this.fov += (fov - this.fov) * Math.min(1, dt * 4)
    this.kick *= Math.exp(-dt * 4)
    cam.fov = this.fov + this.kick
    cam.updateProjectionMatrix()
    cam.position.copy(this.pos)
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5)
      const a = this.shake * 0.05 * U
      cam.position.x += (Math.random() - 0.5) * a
      cam.position.y += (Math.random() - 0.5) * a
      cam.position.z += (Math.random() - 0.5) * a
    }
    this.inside(cam.position)
    cam.up.copy(this.up)
    cam.lookAt(this.look)
  }
}

/**
 * The director: a list of shots, each { dur, kind, ... }, played in turn. kind: 'side' (a fixed point beside
 * the road at s, watching the nearest racer pass), 'ride' (behind a racer), 'crane' (from a corner, high,
 * drifting), 'orbit' (round the arena), 'grid' (down the grid to a racer).
 */
export class Director {
  constructor(cams, race) {
    this.cams = cams
    this.race = race
    this.shots = []
    this.k = -1
    this.t = 0
  }

  play(shots, loop = true) { this.shots = shots; this.loop = loop; this.k = -1; this.next() }

  next() {
    this.k++
    if (this.k >= this.shots.length) { if (!this.loop) { this.k = this.shots.length - 1; this.done = true; return } this.k = 0 }
    this.t = 0
    this.shot = this.shots[this.k]
    this.cams.cut()
  }

  update(dt) {
    if (!this.shot) return
    this.t += dt
    if (this.t > this.shot.dur && !(this.done)) this.next()
    const s = this.shot
    const cams = this.cams, t = cams.track, race = this.race
    const leader = race.ranked.find(r => r.alive) ?? race.racers[0]
    const tt = this.t
    if (s.kind === 'side') {
      const p = V(), f = V(), u = V(), rr = V()
      t.frame(s.s, p, f, u, rr)
      const from = V().copy(p).addScaledVector(rr, s.x ?? 2.4).addScaledVector(u, s.h ?? 0.35).addScaledVector(f, s.ahead ?? 0)
      // watch the racer nearest the spot, ahead of it or just past it
      let target = null, best = 1e9
      for (const r of race.racers) {
        if (!r.alive) continue
        const d = t.wrapS(s.s - r.D + 3) - 3
        if (d > -6 && Math.abs(d) < best) { best = Math.abs(d); target = r }
      }
      const at = target ? cams.racerFrame(target).p : V().copy(p).addScaledVector(f, -6)
      cams.watch(from, at, dt, s.fov ?? 50, 6)
    } else if (s.kind === 'ride') {
      const r = s.racer === 'leader' ? leader : race.racers[s.racer] ?? leader
      cams.far = !!s.far
      cams.chase(r, dt, r.boostT > 0)
    } else if (s.kind === 'crane') {
      const L = cams.lot
      const a = s.a + tt * (s.spin ?? 0.05)
      const from = V(Math.cos(a) * L.width * 0.48, s.h + tt * (s.rise ?? 0), Math.sin(a) * L.depth * 0.48)
      const at = s.follow ? cams.racerFrame(leader).p : V(0, s.lookY ?? 8, 0)
      cams.watch(from, at, dt, s.fov ?? 62, s.follow ? 3 : 8)
    } else if (s.kind === 'orbit') {
      const L = cams.lot
      const a = s.a + tt * (s.spin ?? 0.12)
      const from = V(Math.cos(a) * L.width * 0.46, s.h, Math.sin(a) * L.depth * 0.46)
      cams.watch(from, V(0, s.lookY ?? 10, 0), dt, s.fov ?? 60, 30)
    } else if (s.kind === 'grid') {
      // from high over the start line, down the grid, to behind the given racer
      const r = race.racers[s.racer]
      const k = THREE.MathUtils.smootherstep(Math.min(1, tt / s.dur), 0, 1)
      const p = V(), f = V(), u = V(), rr = V()
      t.frame(4, p, f, u, rr)
      const start = V().copy(p).addScaledVector(f, 6).addScaledVector(u, 7).addScaledVector(rr, -2.5)
      const fr = cams.racerFrame(r)
      const end = V().copy(fr.p).addScaledVector(fr.f, -0.5 * U).addScaledVector(fr.u, 0.17 * U)
      const mid = V().copy(start).lerp(end, 0.5).addScaledVector(rr, 3).addScaledVector(u, 2)
      // a curve through the middle point
      const from = V().copy(start).multiplyScalar((1 - k) * (1 - k)).addScaledVector(mid, 2 * k * (1 - k)).addScaledVector(end, k * k)
      const lookA = V().copy(p).addScaledVector(f, -10)
      const lookB = V().copy(fr.p).addScaledVector(fr.f, 0.95 * U).addScaledVector(fr.u, 0.08 * U)
      cams.watch(from, lookA.lerp(lookB, k), dt, 60 + k * 12, 40)
    }
  }
}
