// Headless check of how a drift answers the steering over time (round 22, Stefan: "a tap, a light slide round the
// corner; held, it turns hard"): on a long straight (NEON CITY's first point laid out 500 m on), a drift taken with a tap and then flown for a
// second with a steering pattern (a tap, a held turn, quick taps one way and the other, a held turn then out),
// against a plain held turn. Each runs both ways and the sides must match. node tools/drifttap.mjs
import { readFileSync } from 'node:fs'
import { Track } from '../experience/track.js'
import { Race, Racer, DT } from '../experience/race.js'
const data = JSON.parse(readFileSync(new URL('../experience/assets/track1.json', import.meta.url)))
const p0 = data.points[0], dz = data.points[1][2] - p0[2]
data.points = Array.from({ length: 2000 }, (_, i) => { const p = p0.slice(); p[2] = p0[2] + i * dz; return p })
data.length = 2000 * data.step; data.features = data.features.filter(f => f.kind === 'start')
const track = new Track(data).buildLine()
let fails = 0
const fly = (pattern, { drift = true, side = 1 } = {}) => {
  const me = new Racer(0, { name: 'ME', model: 0, accent: 0xffffff, halfWidth: 0.08, engine: 0.5 })
  me.human = true
  const race = new Race(track, [me], { laps: 2, random: Math.random, events: () => {} })
  race.grid([me]); race.started = true
  me.input.throttle = true
  for (let t = 0; t < 2.5; t += DT) race.step(DT)
  me.x = 0; me.psi = 0; me.phi = 0
  me.input.drift = drift
  const x0 = me.x, marks = {}
  let maxSide = 0
  let turned = 0                                              // the heading turned, summed (the heading itself is held
  for (let t = 0; t < 1.0; t += DT) {                         // within 0.9 of the road, so it is put back each step)
    me.input.steer = side * pattern(t)
    const psi = me.psi, phi = me.phi
    race.step(DT)
    turned += me.psi - psi; me.psi = psi * 0; me.phi = phi * 0
    me.x = Math.max(-1.0, Math.min(1.0, me.x))              // kept off the walls: they stay out of the sum
    maxSide = Math.max(maxSide, Math.abs(me.driftSide ?? 0))
    for (const m of [0.3, 0.6, 1.0]) if (marks[m] === undefined && t + DT >= m - 1e-9) marks[m] = { psi: turned * side, side: (me.driftSide ?? 0) * side }
  }
  return { marks, drift: me.drift * side, maxSide }
}
const run = (name, pattern, o) => {
  const r = fly(pattern, o), l = fly(pattern, { ...o, side: -1 })
  const same = [0.3, 0.6, 1.0].every(m => Math.abs(r.marks[m].psi - l.marks[m].psi) < 0.02)
  if (!same) fails++
  const f = m => `${r.marks[m].psi.toFixed(2).padStart(5)} (${r.marks[m].side.toFixed(2)})`
  console.log(name.padEnd(30), 'turned (angle) @0.3', f(0.3), ' @0.6', f(0.6), ' @1.0', f(1.0), ' drift', String(r.drift).padStart(2), same ? '' : ' LEFT DIFFERS')
  return r
}
const tap = r => t => t < r ? 1 : 0
const plain = run('plain turn, held', () => 1, { drift: false })
const t1 = run('drift: a tap (0.1 s)', tap(0.1))
const t2 = run('drift: a short press (0.25 s)', tap(0.25))
const held = run('drift: held', () => 1)
const taps = run('drift: taps, in and out', t => [1, 0, -1, 0][Math.floor(t / 0.1) % 4])
const out = run('drift: held 0.5 s, then out', t => t < 0.5 ? 1 : -1)
run('drift: tap, then let go', tap(0.1))
let ok = 0
const check = (cond, what) => { if (!cond) fails++; else ok++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${what}`) }
check(t1.marks[0.6].psi < 0.5 * held.marks[0.6].psi, 'a tap turns under half as far as a held drift (in 0.6 s)')
check(t1.maxSide < 0.35, 'a tap leaves a light angle')
check(held.marks[1.0].side > 0.9, 'held, the angle goes hard over')
check(held.marks[0.6].psi > 1.3 * plain.marks[0.6].psi, 'held, it turns well past a plain turn (in 0.6 s)')
check(taps.drift === 1 && taps.maxSide < 0.4, 'taps in and out keep a light slide going', )
check(out.marks[1.0].psi - out.marks[0.6].psi < 0, 'held then out, it turns back the other way')
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
