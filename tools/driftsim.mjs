// Headless check of the drift's handling: on NEON CITY's start straight, how far a machine turns in 0.35 s
// (its heading and its sideways drift across the road) when it drifts with no steering, steering into the drift,
// steering out of it, and the same in a nitro; against a plain turn. Each is flown to the left too, and the two
// sides must match (a left drift once turned at most 0.7 of a plain turn). node tools/driftsim.mjs
import { readFileSync } from 'node:fs'
import { Track } from '../experience/track.js'
import { Race, Racer, DT } from '../experience/race.js'
const data = JSON.parse(readFileSync(new URL('../experience/assets/track1.json', import.meta.url)))
const track = new Track(data).buildLine()
let fails = 0
const fly = ({ drift = false, steer = 0, nitro = false, kick = 1 }) => {
  const me = new Racer(0, { name: 'ME', model: 0, accent: 0xffffff, halfWidth: 0.08, engine: 0.5 })
  me.human = true
  const race = new Race(track, [me], { laps: 2, random: Math.random, events: () => {} })
  race.grid([me]); race.started = true
  me.input.throttle = true
  for (let t = 0; t < 2.5; t += DT) race.step(DT)                     // up to speed, straight
  if (nitro) { me.nitro = 100; me.input.boost = true; race.step(DT) }
  me.x = steer * kick >= 0 ? -1.2 * Math.sign(kick) : 1.2 * Math.sign(kick); me.psi = 0; me.phi = 0  // room on the side it turns to
  me.input.drift = drift; me.input.steer = kick                     // a touch to the right starts the drift
  for (let t = 0; t < 0.12; t += DT) race.step(DT)
  me.input.steer = steer
  const x0 = me.x, psi0 = me.psi, sp0 = me.sp / me.vmax
  for (let t = 0; t < 0.35; t += DT) race.step(DT)
  return { drift: me.drift, psi: me.psi - psi0, x: me.x - x0, sp0, sp: me.sp / me.vmax }
}
const run = (name, o) => {
  const r = fly(o), l = fly({ ...o, steer: -(o.steer ?? 0), kick: -(o.kick ?? 1) })
  const same = Math.abs(r.psi + l.psi) < 0.02 && Math.abs(r.x + l.x) < 0.03
  if (!same) fails++
  console.log(name.padEnd(28), 'drift', String(r.drift).padStart(2), ' heading +', r.psi.toFixed(3), ' across +', r.x.toFixed(2), 'm  speed', r.sp0.toFixed(2), '->', r.sp.toFixed(2), same ? ' left: same' : ` left: FAIL (${l.psi.toFixed(3)}, ${l.x.toFixed(2)})`)
}
run('plain turn right', { steer: 1 })
run('nitro turn right', { steer: 1, nitro: true })
run('drift right, no steering', { drift: true, steer: 0 })
run('drift right, steering in', { drift: true, steer: 1 })
run('drift right, steering out', { drift: true, steer: -1 })
run('nitro drift, steering in', { drift: true, steer: 1, nitro: true })
run('nitro drift, steering out', { drift: true, steer: -1, nitro: true })
console.log(fails ? `${fails} FAILED (the left side differs)` : 'ALL PASSED')
