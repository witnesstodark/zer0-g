// Headless check of a drift taken into a real bend (round 23, Stefan: "it should carry me forward, sideways;
// instead I hit the wall on the right in a split second"): NEON CITY's bend at 353 m and PULSAR RUN's at 48 m,
// the machine on the middle of the road at 95% of top speed, 1.5 m before the bend. Flown plain with no steering,
// plain steered in, a plain tap, a drift taken with a tap (then no steering), with a short press, held in, and held in then
// out. The across position / speed every 0.3 s and the first wall hit. node tools/driftcorner.mjs
import { readFileSync } from 'node:fs'
import { Track } from '../experience/track.js'
import { Race, Racer, DT } from '../experience/race.js'
let fails = 0
const check = (ok, what) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`) }
for (const [n, at] of [[1, 353], [4, 48]]) {
  const track = new Track(JSON.parse(readFileSync(new URL(`../experience/assets/track${n}.json`, import.meta.url)))).buildLine()
  const i0 = Math.round(at / track.step), dirIn = Math.sign(track.curv[i0 + 8])       // steering this way turns into the bend
  console.log(`${track.name}: the bend at ${at} m, curvature ${track.curv[i0 + 8].toFixed(2)}`)
  const run = (name, plan) => {
    const me = new Racer(0, { name: 'ME', model: 0, accent: 0xffffff, halfWidth: 0.08, engine: 0.5 })
    me.human = true
    const ev = []
    const race = new Race(track, [me], { laps: 3, random: Math.random, events: k => ev.push(k) })
    race.grid([me]); race.started = true
    me.input.throttle = true
    me.D = at - 1.5; me.x = 0; me.psi = 0; me.phi = 0; me.sp = me.vmax * 0.95
    const row = []
    let hit = -1
    for (let t = 0; t < 2.4; t += DT) {
      const p = plan(t); me.input.steer = (p.steer ?? 0) * dirIn; me.input.drift = !!p.drift
      const was = ev.length
      race.step(DT)
      if (hit < 0 && ev.slice(was).some(k => /rail|scrape/.test(k))) hit = t
      if (Math.round(t / DT) % 18 === 17) row.push(`${(me.x * dirIn).toFixed(2).padStart(5)}/${(me.sp / me.vmax).toFixed(2)}`)
    }
    console.log('  ' + name.padEnd(26), row.join(' '), hit < 0 ? ' no wall' : ` wall at ${hit.toFixed(2)} s`)
    return { hit, x: me.x * dirIn }
  }
  const plain = run('plain, no steering', () => ({}))
  run('plain, steered in', t => ({ steer: t > 0.25 ? 1 : 0 }))
  run('plain, a tap', t => ({ steer: t > 0.25 && t < 0.35 ? 1 : 0 }))
  const tap = run('drift, a tap', t => ({ drift: t > 0.25, steer: t > 0.25 && t < 0.35 ? 1 : 0 }))
  const press = run('drift, a press (0.25 s)', t => ({ drift: t > 0.25, steer: t > 0.25 && t < 0.5 ? 1 : 0 }))
  const held = run('drift, held in', t => ({ drift: t > 0.25, steer: t > 0.25 ? 1 : 0 }))
  run('drift, held in 0.3 s, out', t => ({ drift: t > 0.25, steer: t > 0.25 ? (t < 0.55 ? 1 : -1) : 0 }))
  check(tap.hit < 0 && Math.abs(tap.x) < 1.2, `${track.name}: a drift taken with a tap carries round the bend, no wall in 2.4 s`)
  check(press.hit < 0, `${track.name}: a drift taken with a short press (0.25 s) stays off the walls too`)
  check(plain.hit >= 0, `${track.name}: plain with no steering slides out to the wall (the bend needs turning)`)
  check(held.hit >= 0 && held.x > 1, `${track.name}: a drift held in turns hard (to the inside wall)`)
}
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
