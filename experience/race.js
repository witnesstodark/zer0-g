// The race: every machine's flight in the track's own coordinates (s along the road, x across it, h above
// it), the way the old 64-bit anti-gravity racers did it: the machine is held to the road, its heading and
// its slide are separate, banked turns carry it round, the barriers bounce it and cost energy. Energy is
// the shield, slowly coming back by itself; the heal strips along the edges (four round the lap) refill it. The nitro gauge (four cells) fills by itself and fast from drifts,
// hits, plates and jumps; SHIFT burns a cell. FLOW: flying clean (no hits, no barriers) raises the top speed
// step by step, up to a quarter more; a knock takes it away. Dash plates, jump plates, the gaps, mines, side and
// spin attacks, knock-outs. The AI drivers and the ranking are here too.

import { MACHINES, GRADE } from './machines.js'

export const DT = 1 / 120
import { U } from './scale.js'
export { U }
export const G_AIR = 11 * U
// V: round 9's pace, about 150 km/h more at the same engine: every speed and push goes up with it (and the
// steering a little, so the same turns can be taken)
export const V = 1.27
const BASE_VMAX = 7 * U * V
export const KMH = 3.6 * 21 / U     // shown speed: the machines (0.21 m) are about a thirtieth of a real racer
export const LEN = 0.3 * U          // a machine's length
export const SCALE = U / 3          // the machine models (0.9 m) are drawn at this size

export const CLASSES = [
  { name: 'NOVICE', pace: [0.78, 0.88] },
  { name: 'STANDARD', pace: [0.85, 0.95] },
  { name: 'EXPERT', pace: [0.92, 1.02] },
]

export const NITRO_CELL = 25, NITRO_MAX = 100

/** The turbo a drift has earned so far: 0 none, 1 blue, 2 orange, 3 pink. */
export const driftTier = r => r.driftT > 1.7 ? 3 : r.driftT > 0.9 ? 2 : r.driftT > 0.35 ? 1 : 0

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a))

export class Racer {
  constructor(i, def) {
    this.i = i
    this.name = def.name
    this.model = def.model
    this.accent = def.accent
    this.human = !!def.human
    this.remote = !!def.remote          // another player's machine (drawn from their messages)
    this.pid = def.pid ?? null
    this.face = def.face ?? -1           // the pilot's portrait (the HUD's standings and map)
    this.particle = def.particle ?? null // what flies out of its thrusters on a boost (players' own machines)
    this.engine = def.engine ?? 0.5
    const m = def.stats ?? MACHINES[def.model]
    this.halfWidth = def.halfWidth ?? 0.35
    this.body = GRADE[m.body]
    this.boostG = GRADE[m.boost]
    this.grip = GRADE[m.grip]
    this.weight = m.weight
    this.ai = def.ai ?? null
    this.hue = def.hue ?? 0
    this.sat = def.sat ?? 1
    this.reset(def.D ?? 0, def.x ?? 0)
  }

  reset(D, x) {
    this.D = D; this.x = x; this.h = 0; this.vh = 0
    this.sp = 0; this.psi = 0; this.phi = 0
    this.energy = 100
    this.boostT = 0; this.boostStack = 0; this.boostAt = -9; this.dashT = 0; this.spinT = 0; this.sideT = 0; this.sideDir = 0; this.cool = 0
    this.air = false; this.falling = false; this.fallT = 0
    this.fallPos = null; this.fallVel = null
    this.alive = true; this.finished = false; this.finishTime = 0; this.retired = false
    this.lapTimes = []; this.lapStart = 0; this.lap = 0
    this.kos = 0; this.lastHitBy = null; this.lastHitAt = -99
    this.flash = 0; this.scrape = 0; this.lean = 0; this.steerVis = 0
    this.drift = 0; this.driftT = 0; this.driftArm = 0; this.turbo = 0; this.hop = 0; this.driftVis = 0
    this.safeD = D; this.safeX = x; this.ghost = 0
    this.nitro = NITRO_CELL * 2
    this.flow = 0; this.flowFull = false
    this.input = { throttle: false, brake: false, steer: 0, leanL: false, leanR: false, drift: false, boost: false, spin: false, sideL: false, sideR: false, nose: 0 }
    this.rank = 0
    this.throttleVis = 0
  }

  get s() { return this.D }
  get vmax() { return BASE_VMAX + this.engine * 0.9 * U * V }
  get accel() { return (4.3 - this.engine * 1.7) * U * V }
  get turnRate() { return 1.9 * 1.12 * (0.82 + 0.36 * this.grip) }
  get gripRate() { return 3.5 + 4.5 * this.grip }
  get damageK() { return 1.45 - 0.8 * this.body }
}

export class Race {
  /**
   * track: Track; racers: [Racer]; laps; events(kind, racer, data) for sounds, effects and messages.
   */
  constructor(track, racers, { laps = 3, events = () => {}, random = Math.random, mode = 'gp' } = {}) {
    this.track = track
    this.racers = racers
    this.laps = laps
    this.events = events
    this.random = random
    this.mode = mode
    this.time = 0                 // seconds since GO (negative before)
    this.started = false
    this.over = false
    this.mineT = track.mines.map(() => 0)
    this.ranked = racers.slice()
    this.humanD = null
  }

  /** Place the racers on the grid behind the start line: rows of three, 0.8 m apart. */
  grid(order) {
    order.forEach((r, k) => {
      const row = Math.floor(k / 3), col = k % 3
      const D = (-0.8 - row * 0.55 - (col === 1 ? 0.2 : 0)) * U
      r.reset(D, (col - 1) * 0.75 * U)
    })
    this.rankRacers()
  }

  // ------------------------------------------------------------ one fixed step
  step(dt) {
    this.time += dt
    if (!this.started) return
    const t = this.track
    for (const r of this.racers) {
      if (!r.alive || r.remote) continue
      if (r.ai || r.finished) this.drive(r, dt)
      this.fly(r, dt)
    }
    this.collide(dt)
    this.mines(dt)
    // how far the leading player is (for the AI's rubber band)
    let hd = null
    for (const r of this.racers) if (r.human && r.alive && !r.finished && (hd === null || r.D > hd)) hd = r.D
    this.humanD = hd
    // mines come back after a while
    for (let i = 0; i < this.mineT.length; i++) {
      if (this.mineT[i] > 0 && (this.mineT[i] -= dt) <= 0) t.setMine(i, true)
    }
    this.rankRacers()
  }

  fly(r, dt) {
    const t = this.track
    const inp = r.input
    if (r.falling) return this.fall(r, dt)
    const s = t.wrapS(r.D)
    const idx = t.index(s)
    const k = t.curv[idx]
    const assist = t.assist[idx]
    r.cool = Math.max(0, r.cool - dt)
    r.flash = Math.max(0, r.flash - dt * 3)
    r.boostT = Math.max(0, r.boostT - dt)
    if (r.boostT <= 0) r.boostStack = 0
    r.dashT = Math.max(0, r.dashT - dt)

    // ---- attacks
    if (r.spinT > 0) r.spinT -= dt
    if (r.sideT > 0) r.sideT -= dt
    if (inp.spin && r.cool <= 0 && !r.air) { r.spinT = 0.55; r.cool = 1.4; this.events('spin', r) }
    if ((inp.sideL || inp.sideR) && r.cool <= 0 && !r.air) {
      r.sideT = 0.28; r.sideDir = inp.sideR ? 1 : -1; r.cool = 0.9
      this.events('side', r)
    }
    inp.spin = inp.sideL = inp.sideR = false

    // ---- nitro: SHIFT burns a cell; pressed again while it burns, or held down (another cell every second),
    // it burns longer and harder: two cells a double, three or more a MEGA NITRO
    const held = inp.boostHeld && r.boostT > 0 && this.time - r.boostAt >= 1.0
    if ((inp.boost || held) && r.nitro >= NITRO_CELL && !r.finished) {
      r.nitro -= NITRO_CELL
      r.boostStack = r.boostT > 0 ? Math.min(3, r.boostStack + 1) : 1
      r.boostT = Math.min(5, r.boostT + 1.0 + r.boostG * 0.5)
      r.boostAt = this.time
      this.events('boost', r, r.boostStack)
    }
    inp.boost = false
    // the gauge fills by itself (a cell in about six seconds), and the shield mends a little
    if (!r.finished) { this.charge(r, 4 * dt); r.energy = Math.min(100, r.energy + 0.7 * dt) }
    // flow: clean flying at speed builds it (full in ten seconds)
    if (!r.finished && r.sp > r.vmax * 0.6) {
      r.flow = Math.min(r.ai && !r.human ? 0.6 : 1, r.flow + dt / 10)
      if (r.flow >= 1 && !r.flowFull) { r.flowFull = true; this.events('flow', r) }
    }

    // ---- steering: heading psi and the velocity's direction phi, both relative to the road
    const air = r.air
    const leanDir = (inp.leanR ? 1 : 0) - (inp.leanL ? 1 : 0)
    r.lean += (leanDir - r.lean) * Math.min(1, dt * 10)
    // a keyboard is all or nothing: the steering is a little softer at top speed, and a machine left alone
    // slowly lines itself up with the road (it still has to be steered round the turns)
    const steerK = 1 - 0.15 * Math.min(1, r.sp / r.vmax)
    let turn = inp.steer * steerK * r.turnRate * (air ? 0.5 : 1) + r.lean * 1.0 * (air ? 0.3 : 1)
    if (Math.abs(inp.steer) < 0.05 && !r.drift && !air) r.psi -= r.psi * Math.min(1, dt * 1.2)

    // ---- the drift: hold SPACE and touch the steering (or lean with Q/E) and the machine hops and slides at
    // once, even in a gentle bend: the body swings well round while its path bends only a little. Left alone
    // it arcs gently; steer into the turn to tighten it, the other way to straighten it (it holds until SPACE
    // is let go). It fills the nitro as it slides, and letting go gives a turbo that grows with how long it
    // was held (blue, orange, pink)
    r.hop = Math.max(0, r.hop - dt)
    turbo: {
      const dir = Math.abs(inp.steer) > 0.08 ? Math.sign(inp.steer) : Math.abs(r.lean) > 0.3 ? Math.sign(r.lean) : 0
      if (r.drift === 0) {
        if (inp.drift && dir && r.sp > r.vmax * 0.25 && !air) {
          r.drift = dir
          r.driftT = 0
          r.psi += r.drift * 0.02                       // the kick: the tail steps out (the body shows the rest)
          r.hop = 0.14
          this.events('drift', r)
        }
        break turbo
      }
      r.driftT += dt
      this.charge(r, (8 + 4 * driftTier(r)) * dt)
      if (!inp.drift || r.sp < r.vmax * 0.25 || air) {
        const tier = driftTier(r)
        if (tier && !air) {
          r.turbo = [0, 0.5, 0.8, 1.1][tier]
          r.sp += [0, 0.6, 1.0, 1.5][tier] * U * V
          this.charge(r, [0, 6, 12, 20][tier])
          this.events('turbo', r, tier)
        }
        r.drift = 0
        r.driftArm = 0
        this.events('driftEnd', r)
        break turbo
      }
      const into = clamp((inp.steer + r.lean * 0.5) * r.drift, -1, 1)
      // the drift's own turn comes in over a quarter of a second, so starting one never throws you aside
      turn = r.drift * r.turnRate * (0.12 + 0.6 * into) * Math.min(1, 0.3 + r.driftT / 0.25)
    }
    // the slide you see: the body swung round past its heading (more when steering into it)
    r.driftVis += ((r.drift ? r.drift * (0.42 + 0.12 * Math.max(0, inp.steer * r.drift)) : 0) - r.driftVis) * Math.min(1, dt * (r.drift ? 12 : 7))
    r.turbo = Math.max(0, r.turbo - dt)
    const vs = r.sp * Math.cos(r.phi)
    const stretch = t.curved(idx) ? 1 : 1 / clamp(1 - k * r.x, 0.35, 2.5)
    const ds = vs * stretch * dt
    // the road turns under the machine: the bank carries part of it round
    const roadTurn = k * ds * (1 - (air ? 0 : assist))
    r.psi += turn * dt - roadTurn
    r.phi -= roadTurn
    if (r.spinT > 0) r.spinVis = (r.spinVis ?? 0) + dt * 22
    else r.spinVis = 0
    // grip pulls the velocity round to the heading; a slide costs speed (a drift slides on purpose and
    // costs little)
    if (!air) {
      const grip = r.drift ? r.gripRate * 0.8 : r.gripRate * (r.lean !== 0 ? 1 - Math.abs(r.lean) * 0.45 : 1)
      const slip = wrapAngle(r.psi - r.phi)
      r.phi += slip * (1 - Math.exp(-grip * dt))
      r.sp *= 1 - Math.min(0.5, Math.abs(slip) * (r.drift ? 0.15 : 0.9) * dt)
    }
    // too far from the road's direction: the machine is turned back (it is still a race, not a stunt; a
    // drift's path stays within a gentle angle of the road, its body shows the slide)
    const psiMax = r.drift ? 0.65 : 1.2
    if (Math.abs(r.psi) > psiMax) r.psi = Math.sign(r.psi) * psiMax
    if (Math.abs(r.phi) > 1.2) r.phi = Math.sign(r.phi) * 1.2

    // ---- speed
    const onDash = r.dashT > 0
    let vmax = r.vmax * (r.ai ? r.ai.pace * (r.human ? 1 : r.band ?? 1) : 1)
    const stack = Math.max(1, r.boostStack)
    if (r.boostT > 0) vmax = vmax * (1.32 + 0.12 * (stack - 1)) + r.boostG * 0.9 * U * V
    if (onDash) vmax *= 1.3
    if (r.turbo > 0) vmax *= 1.15
    if (r.energy <= 0) vmax *= 0.97
    vmax *= 1 + 0.25 * r.flow
    if (!air && !r.finished) {
      if (inp.throttle) {
        const a = r.accel * (1 + 0.3 * r.flow) * Math.max(0.05, 1 - (r.sp / vmax) ** 2) + (r.boostT > 0 ? (7.5 + 3 * (stack - 1)) * U * V : 0)
        if (r.sp < vmax) r.sp = Math.min(vmax, r.sp + a * dt)
      } else r.sp = Math.max(0, r.sp - (0.27 * U * V + r.sp * 0.05) * dt)
      if (inp.brake) r.sp = Math.max(0, r.sp - 5 * U * V * dt)
    } else if (r.finished && !air) {
      // after the goal: a lap of honour at a steady pace
      r.sp += (r.vmax * 0.75 - r.sp) * Math.min(1, dt * 0.8)
    }
    if (r.sp > vmax) r.sp -= (r.sp - vmax) * Math.min(1, 1.6 * dt)
    // slopes: up slows, down speeds
    const fy = t.F[idx * 3 + 1]
    if (!air) r.sp = Math.max(0, r.sp - fy * 2 * U * dt)
    r.throttleVis += ((inp.throttle && !r.finished ? 1 : 0.2) + (r.boostT > 0 || r.turbo > 0 ? 1 : 0) - r.throttleVis) * Math.min(1, dt * 8)

    // ---- move
    let vx = r.sp * Math.sin(r.phi)
    if (r.sideT > 0) vx += r.sideDir * 1.7 * U
    if (!air) vx += r.lean * 0.6 * U
    r.x += vx * dt
    const before = r.D
    r.D += ds
    // past a seam (the end of a drum): the road goes on from another line round it
    const shift = t.seamShift(before, r.D)
    if (shift) r.x -= shift
    const i2 = t.index(r.D)
    const half = t.half[i2]
    if (t.isFull(i2)) r.x = t.wrapX(i2, r.x)
    // landing off a drum: a little room either side of the road it goes on to
    if (shift && Math.abs(r.x) > half && Math.abs(r.x) < half + 0.8) r.x = Math.sign(r.x) * (half - 0.15)
    // the last metres of a pipe or a drum draw you gently to where the road goes on (the short way round)
    const exit = !air && t.exitAt(i2)
    if (exit && exit.dist < 9) {
      let d = exit.x - r.x
      if (t.isFull(i2)) d = t.wrapX(i2, d)
      r.x += d * Math.min(1, dt * (0.6 + (9 - exit.dist) * 0.16))
    }
    r.ghost = Math.max(0, (r.ghost ?? 0) - dt)
    r.steerVis += (inp.steer + r.lean * 0.6 - r.steerVis) * Math.min(1, dt * 8)

    // ---- jump plates: launched at the plate's end (which is where its gap begins), before the gap can drop you
    if (!air) {
      for (const j of t.jumps) {
        if (crossed(t, before, r.D, j.s1)) {
          // a low, flat leap (round 15: it was 3.4U + sp/V*0.52, and a nitro flew 23 m and 3.5 m high, over the
          // landing and into the wall): about a second in the air, a 4 m gap cleared from 5 m/s, and a nitro at
          // 12 m/s flies 14 m and 1.2 m high
          r.air = true; r.vh = 4.2 * U + r.sp / V * 0.15; r.h = 0.01
          r.sp += 0.3 * U
          if (r.drift) { r.drift = 0; r.driftArm = 0; this.events('driftEnd', r) }
          this.charge(r, 6)
          this.events('jump', r)
        }
      }
    }

    // ---- the air
    if (air) {
      r.vh -= (G_AIR + (inp.nose > 0 ? 6 : 0)) * dt
      r.h += r.vh * dt
      if (r.h <= 0) {
        if (t.isGap(r.D) || (!t.isFull(i2) && Math.abs(r.x) > half)) {
          if (r.h < -0.3 * U) this.courseOut(r)
        } else {
          r.h = 0; r.air = false
          this.events('land', r, -r.vh)
          r.vh = 0
        }
      }
    } else if (t.isGap(r.D) && !r.air) {
      // rolled into the gap without a jump: fall
      r.air = true; r.vh = 0
    } else if (!t.hasRails(i2) && !t.isFull(i2) && Math.abs(r.x) > half + r.halfWidth * 0.3) {
      if (t.curved(i2) && Math.abs(r.x) < half + 0.6) r.x = Math.sign(r.x) * (half - 0.05)   // a pipe's lip holds you a little
      else {
        // over an open edge (or off the end of a drum on the wrong side): fall
        r.air = true; r.vh = Math.min(0, r.vh)
        this.events('edge', r)
      }
    }
    // the last good place to be put back after a fall: on the road, clear of the edges and of the gaps
    if (!r.air && !t.curved(i2) && Math.abs(r.x) < half - 0.25 && !t.gapAhead(r.D, 8) && !t.curvedAhead(r.D, 10)) { r.safeD = r.D; r.safeX = r.x }

    // ---- barriers (none over the gap, none on open stretches and curved ones)
    const edge = half - r.halfWidth * 0.85
    if (Math.abs(r.x) > edge && t.hasRails(i2)) {
      const side = Math.sign(r.x)
      const impact = Math.max(0, vx * side)
      r.x = side * edge
      if (r.h < 0.6) {
        if (impact > 0.2 * U) {
          this.damage(r, (0.25 + impact / U * 1.9) * r.damageK, null)
          r.sp *= 1 - Math.min(0.3, impact / U * 0.09)
          const bounce = -side * impact * 0.5
          r.phi = Math.asin(clamp(bounce / Math.max(r.sp, 1), -0.5, 0.5))
          r.psi -= side * Math.min(Math.abs(r.psi), 0.3) * Math.sign(r.psi * side)
          this.events('rail', r, { side, impact })
        } else {
          // scraping along it
          r.phi = Math.min(Math.abs(r.phi), 0.02) * -side
          r.scrape += dt
          if (r.scrape > 0.15) { r.scrape = 0; this.damage(r, 0.16 * r.damageK, null); this.events('scrape', r, { side }) }
        }
      }
    }

    // ---- what is on the road
    if (!r.air) {
      for (const d of t.dashes) {
        if (crossed(t, before, r.D, d.s) && Math.abs(r.x - d.x) < 0.3) {
          r.dashT = 0.9; r.sp = Math.max(r.sp, Math.min(r.vmax * 1.3, r.sp + 1.8 * U * V))
          this.charge(r, 10)
          this.events('dash', r)
        }
      }
      for (const kk of t.kicks) {
        if (crossed(t, before, r.D, kk.s1) && Math.abs(r.x - kk.x) < 0.42) {
          r.air = true; r.vh = 2.4 * U + r.sp * 0.1; r.h = 0.01
          r.sp = Math.min(r.vmax * 1.35, r.sp + 1.0 * U * V)
          r.dashT = Math.max(r.dashT, 0.6)
          if (r.drift) { r.drift = 0; r.driftArm = 0; this.events('driftEnd', r) }
          this.charge(r, 8)
          this.events('kick', r)
        }
      }
      // the heal strips: energy back, fast
      r.inPit = false
      if (r.energy < 100) for (const pit of t.pits) {
        if (within(t, r.D, pit.s0, pit.s1) && r.x * pit.side > t.width / 2 - 0.5 && r.x * pit.side < t.width / 2 + 0.2) {
          r.energy = Math.min(100, r.energy + 38 * dt)
          this.charge(r, 4 * dt)
          r.inPit = true
          break
        }
      }
    }

    // ---- laps
    const L = t.length
    const lapNow = r.D >= 0 ? Math.floor(r.D / L) + 1 : 0
    if (lapNow > r.lap) {
      if (r.lap >= 1) r.lapTimes.push(this.time - r.lapStart)
      r.lapStart = this.time
      r.lap = lapNow
      if (r.lap > this.laps && !r.finished) {
        r.finished = true
        // when exactly it crossed: back from this step by how far past the line it is
        r.finishTime = this.time - (r.D - this.laps * L) / Math.max(1, vs)
        r.lapTimes[r.lapTimes.length - 1] -= this.time - r.finishTime
        this.events('finish', r)
      } else if (r.lap >= 1) this.events('lap', r, r.lap)
    }
  }

  /** The AI (and the autopilot after the goal): fills r.input. */
  drive(r, dt) {
    const t = this.track
    const ai = r.ai ?? { pace: 0.8, offset: 0, aggr: 0, line: 0.6 }
    const inp = r.input
    const s = t.wrapS(r.D)
    const look = 0.8 * U + r.sp * 0.18
    // open edges ahead: keep well in from them
    const W = t.width / 2 - r.halfWidth - 0.07 - (t.hasRails(t.index(s + look)) ? 0 : 0.45)
    // where across the road it wants to be
    let xt = t.lineAt(s + look * 0.6) * ai.line + ai.offset
    // swerve round mines ahead
    t.mines.forEach((m, i) => {
      if (!m.alive) return
      const d = t.wrapS(m.s - s)
      if (d > 0.2 && d < 4.5 && Math.abs(m.x - xt) < 0.3) xt = m.x + (xt >= m.x ? 1 : -1) * 0.32
      void i
    })
    // and round the machines just ahead (or wait behind one when there is no room)
    let blocked = false
    const seeAhead = 0.4 * U + r.sp * 0.18
    for (const o of this.racers) {
      if (o === r || !o.alive) continue
      const d = t.wrapS(o.D - r.D)
      if (d < 0.3 || d > seeAhead) continue
      const closing = r.sp * Math.cos(r.phi) - o.sp * Math.cos(o.phi)
      if (closing <= 0) continue
      const room = r.halfWidth + o.halfWidth + 0.04 * U
      if (Math.abs(o.x - xt) < room) {
        const left = o.x - room, right = o.x + room, W2 = t.width / 2 - r.halfWidth - 0.15
        const canL = left > -W2, canR = right < W2
        if (canL && (!canR || xt < o.x)) xt = left
        else if (canR) xt = right
        else blocked = true
        if (Math.abs(o.x - r.x) < room && d < 0.35 * U + closing * 0.25) blocked = true
      }
    }
    // low on energy: onto the next heal strip
    if (r.energy < 45 && !r.finished) {
      for (const pit of t.pits) {
        const d = t.wrapS(pit.s0 - s)
        if (d < 25 || within(t, r.D, pit.s0, pit.s1 - 1.5)) { xt = pit.side * (t.width / 2 - 0.25); break }
      }
    }
    // the pack stays in reach of the players: rivals far ahead of the best of them ease off, those far behind
    // push a little
    r.band = 1
    if (this.humanD !== null && !r.human) {
      const d = r.D - this.humanD
      r.band = d > 0 ? 1 - Math.min(0.2, d * 0.005) : 1 + Math.min(0.04, -d * 0.0008)
    }
    xt = clamp(xt, -W, W)
    // a drum or a pipe ahead: be on the line the road goes on from when it ends (a drum's exit is round its side)
    const exit = t.exitAhead(s, 3 + r.sp * 1.5)
    if (exit !== null) {
      // round a closed drum or pipe the short way (as the pull in its last metres does), or the two fight
      const ic = t.index(s)
      xt = t.isFull(ic) ? r.x + t.wrapX(ic, exit - r.x) : exit
    }
    // a jump plate ahead: take off near the middle and straight (no grip in the air to undo a slide, and the
    // landings are open)
    for (const j of t.jumps) if (t.wrapS(j.s1 - s) < 2 + r.sp * 0.6) { xt = clamp(xt, -0.35, 0.35); break }
    // aim from where the slide is taking it, not from where it is
    if (r.air) xt = clamp(xt, -0.4, 0.4)            // in the air: line up with the middle of the landing
    const xNext = r.x + r.sp * Math.sin(r.phi) * 0.18
    const psiWant = Math.atan2(xt - xNext, look)
    const ahead = t.index(s + 1.2)
    const kAhead = t.curv[ahead] * (1 - t.assist[ahead])
    const need = kAhead * r.sp
    const raw = (psiWant - r.psi) * 3.0 + (psiWant - r.phi) * 1.2 + need / r.turnRate
    inp.steer = clamp(raw, -1, 1)
    inp.leanR = raw > 1.15
    inp.leanL = raw < -1.15
    // a drift only while the turn goes its way (a player widens a drift by steering out of it; the AI lets go)
    // (on gentle bends only: a drift turns less than the wheel; and not straight after the last one)
    // (kept on the racer: after the goal the autopilot drives a player, who has no r.ai)
    if (r.aiDrifting && !r.drift) r.aiDriftOff = this.time
    r.aiDrifting = !!r.drift
    inp.drift = r.drift ? raw * r.drift > 0.3 && raw * r.drift < 0.95 : this.time - (r.aiDriftOff ?? -9) > 0.9 && Math.abs(raw) > 0.5 && Math.abs(raw) < 0.95 && r.sp > r.vmax * 0.6 && !t.curved(t.index(s + 2))
    // speed for the turns ahead
    const kmax = Math.abs(t.hardestAhead(s, 1.8 + r.sp * 0.6))
    const vLimit = kmax > 0.01 ? (r.turnRate + 0.2) / kmax : 99
    inp.throttle = r.sp < vLimit * 1.02 && !blocked
    inp.brake = r.sp > vLimit * 1.06
    if (r.finished) return
    // nitro on the straights (at once when the gauge is full)
    if (this.time > 1.5 && r.nitro >= NITRO_CELL && r.boostT <= 0.3 && Math.abs(t.hardestAhead(s, 9)) < 0.08 && (r.nitro >= NITRO_MAX || this.random() < 1.2 * dt * (0.4 + ai.aggr))) inp.boost = true
    // a side attack on a machine alongside
    if (r.cool <= 0 && this.random() < 0.45 * dt * ai.aggr) {
      for (const o of this.racers) {
        if (o === r || !o.alive) continue
        if (Math.abs(t.wrapS(o.D - r.D + 0.5) - 0.5) < 0.25 && Math.abs(o.x - r.x) < 0.42) {
          if (o.x > r.x) inp.sideR = true; else inp.sideL = true
          break
        }
      }
    }
  }

  // ------------------------------------------------------------ collisions between machines
  collide(dt) {
    const t = this.track
    const L = t.length
    const list = this.racers.filter(r => r.alive && !r.falling)
    for (let a = 0; a < list.length; a++) {
      const A = list[a]
      for (let b = a + 1; b < list.length; b++) {
        const B = list[b]
        let ds = (B.D - A.D) % L
        if (ds > L / 2) ds -= L
        if (ds < -L / 2) ds += L
        if (Math.abs(ds) > 0.4 * U) continue
        if (Math.abs(A.h - B.h) > 0.2 * U) continue
        if (A.ghost > 0 || B.ghost > 0) continue
        const dx = B.x - A.x
        const wx = A.halfWidth + B.halfWidth
        const e = (ds / (LEN * 0.92)) ** 2 + (dx / wx) ** 2
        if (e >= 1) continue
        if (A.remote && B.remote) continue
        const mA = A.weight, mB = B.weight
        const wA = mB / (mA + mB), wB = mA / (mA + mB)
        // closing speeds
        const vxA = A.sp * Math.sin(A.phi), vxB = B.sp * Math.sin(B.phi)
        const vsA = A.sp * Math.cos(A.phi), vsB = B.sp * Math.cos(B.phi)
        const depth = 1 - Math.sqrt(e)
        let hard = 0
        if (Math.abs(ds) / (LEN * 0.92) < Math.abs(dx) / wx) {
          // side by side: push apart across the road
          const n = Math.sign(dx) || 1
          const push = depth * wx * 0.6
          if (!A.remote) A.x -= n * push * wA * 2
          if (!B.remote) B.x += n * push * wB * 2
          const rel = Math.max(0, (vxA - vxB) * n)
          hard = rel
          const j = rel * 1.05 + 0.45 * U
          if (!A.remote) setLateral(A, vxA - n * j * wA * 2)
          if (!B.remote) setLateral(B, vxB + n * j * wB * 2)
        } else {
          // nose to tail: the one behind slows, the one ahead is shoved
          const n = Math.sign(ds) || 1
          const push = depth * LEN * 0.92 * 0.6
          if (!A.remote) pushAlong(t, A, -n * push * wA * 2)
          if (!B.remote) pushAlong(t, B, n * push * wB * 2)
          const rel = Math.max(0, (vsA - vsB) * n)
          hard = rel
          const back = n > 0 ? A : B, front = n > 0 ? B : A
          if (!back.remote) back.sp = Math.max(0, back.sp - rel * 0.55)
          if (!front.remote) front.sp += rel * 0.3
        }
        // attacks
        const attackA = A.spinT > 0 || A.sideT > 0, attackB = B.spinT > 0 || B.sideT > 0
        // a brush costs nothing, a real hit costs energy; an attack costs the one attacked more
        const knock = Math.max(0, hard / U - 1.5) * 1.3
        const dmgA = (attackB ? (B.spinT > 0 ? 9 : 5) : 0) + (attackA ? 0 : knock)
        const dmgB = (attackA ? (A.spinT > 0 ? 9 : 5) : 0) + (attackB ? 0 : knock)
        if (A.cd?.[B.i] > this.time || B.cd?.[A.i] > this.time) continue
        A.cd = A.cd ?? {}; A.cd[B.i] = this.time + 0.25
        if (!A.remote) this.damage(A, dmgA * A.damageK, B)
        if (!B.remote) this.damage(B, dmgB * B.damageK, A)
        // a fight fills the nitro: most for the one who hit, some for the one hit, a little for a shove
        const shove = Math.min(5, hard / U * 1.5)
        if (!A.remote) this.charge(A, (attackA ? 20 : 0) + (attackB ? 6 : 0) + shove)
        if (!B.remote) this.charge(B, (attackB ? 20 : 0) + (attackA ? 6 : 0) + shove)
        if (attackA && !B.remote) { setLateral(B, Math.sign(dx || 1) * 2.6 * U); B.flash = 1 }
        if (attackB && !A.remote) { setLateral(A, -Math.sign(dx || 1) * 2.6 * U); A.flash = 1 }
        this.events('bump', A, { other: B, hard: hard / U * 3 + (attackA || attackB ? 6 : 0) })
      }
    }
  }

  mines(dt) {
    const t = this.track
    t.mines.forEach((m, i) => {
      if (!m.alive) return
      for (const r of this.racers) {
        if (!r.alive || r.falling || r.remote || r.h > 0.2) continue
        const d = t.wrapS(r.D - m.s + 0.5) - 0.5
        if (Math.abs(d) < 0.17 && Math.abs(r.x - m.x) < 0.075 + r.halfWidth * 0.7) {
          t.setMine(i, false)
          this.mineT[i] = 6
          this.damage(r, 12 * r.damageK, null)
          r.sp *= 0.6
          r.air = true; r.vh = 2.4 * U; r.h = Math.max(r.h, 0.02)
          r.drift = 0
          r.psi += (this.random() - 0.5) * 1.2
          r.flash = 1
          this.events('mine', r, { mine: i })
          break
        }
      }
    })
  }

  /** Fill a racer's nitro; a cell that fills up is told (for the chime). */
  charge(r, n) {
    if (n <= 0 || r.finished) return
    const before = Math.floor(r.nitro / NITRO_CELL)
    r.nitro = Math.min(NITRO_MAX, r.nitro + n)
    const now = Math.floor(r.nitro / NITRO_CELL)
    if (now > before) this.events('nitro', r, now)
  }

  damage(r, amount, by) {
    if (amount <= 0 || !r.alive || r.finished) return
    if (by) { r.lastHitBy = by; r.lastHitAt = this.time }
    const was = r.energy
    r.energy = Math.max(0, r.energy - amount)
    // a real knock loses the flow; a scrape or a brush costs some of it
    const flowWas = r.flow
    r.flow = amount > 2 ? 0 : r.flow * 0.75
    r.flowFull = r.flow >= 1
    if (flowWas > 0.4 && r.flow < 0.1) this.events('flowLost', r)
    r.flash = Math.max(r.flash, Math.min(1, amount / 12))
    if (was <= 0 && amount > 0.5) this.destroy(r)
    else if (r.energy <= 0 && was > 0) this.events('empty', r)
  }

  destroy(r) {
    if (!r.alive) return
    r.alive = false
    r.retired = true
    const by = this.time - r.lastHitAt < 2.5 ? r.lastHitBy : null
    if (by && by.alive) { by.kos++; this.charge(by, 50); this.events('ko', by, r) }
    this.events('destroyed', r)
  }

  courseOut(r) {
    if (r.falling) return
    r.falling = true
    r.fallT = 0
    this.events('courseout', r)
  }

  fall(r, dt) {
    // the world-space fall is worked out by whoever draws it; here only the clock
    r.fallT += dt
    r.h += r.vh * dt
    r.vh -= 12 * U * dt
    r.D += r.sp * dt * 0.8
    if (r.fallT > 0.85) this.respawn(r)
  }

  /** Back on the road where it last was safely, slow, passing through the others for a moment. */
  respawn(r) {
    r.falling = false; r.air = false
    r.D = r.safeD ?? r.D
    r.x = clamp(r.safeX ?? 0, -0.9, 0.9)
    r.h = 0; r.vh = 0
    r.sp = r.vmax * 0.3
    r.psi = 0; r.phi = 0; r.drift = 0; r.driftT = 0; r.turbo = 0; r.boostT = 0; r.dashT = 0; r.spinT = 0; r.sideT = 0
    r.flow = 0
    r.energy = Math.max(1, r.energy - 6)
    r.ghost = 1.6
    r.flash = 1
    this.events('respawn', r)
  }

  rankRacers() {
    this.ranked = this.racers.slice().sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1
      if (a.finished) return a.finishTime - b.finishTime
      if (a.retired !== b.retired) return a.retired ? 1 : -1
      return b.D - a.D
    })
    this.ranked.forEach((r, k) => { r.rank = k + 1 })
  }
}

// a shove along the track: x follows the road the machine ends up on, so one pushed back over a drum's seam
// (where its x was shifted) gets its old x back and is not shifted twice when it crosses again
function pushAlong(t, r, dD) {
  const D0 = r.D
  r.D += dD
  r.x -= dD > 0 ? t.seamShift(D0, r.D) : -t.seamShift(r.D, D0)
}

function setLateral(r, vx) {
  const vs = r.sp * Math.cos(r.phi)
  r.sp = Math.hypot(vs, vx)
  r.phi = Math.atan2(vx, Math.max(0.5, vs))
}

/** Did a machine pass the point s (somewhere in a lap) between D0 and D1? */
function crossed(t, D0, D1, s) {
  if (D1 <= D0) return false
  const L = t.length
  const a = ((D0 - s) % L + L) % L, span = D1 - D0
  return a + span >= L && a < L
}

function within(t, D, s0, s1) {
  const s = t.wrapS(D)
  return s >= s0 && s <= s1
}

export function makeAI(random, cls, k, n) {
  // the field spreads from the fast ones at the front to the slow ones at the back
  const [lo, hi] = CLASSES[cls].pace
  const rank = k / Math.max(1, n - 1)
  return {
    pace: hi - (hi - lo) * rank * (0.7 + random() * 0.3),
    offset: (random() - 0.5) * 2.0,
    line: 0.4 + random() * 0.6,
    aggr: 0.2 + random() * 0.8,
  }
}
