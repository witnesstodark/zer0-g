// Headless check of a drum's exit: a machine a few metres before the end of THE DRUM's drum, on the road's line
// (it goes on), 1.5 m off it (drawn in, it goes on) and on the far side of the drum (off it flies: COURSE OUT).
// node tools/drumsim.mjs
import { readFileSync } from 'node:fs'
import { Track } from '../experience/track.js'
import { Race, Racer, DT } from '../experience/race.js'
const data = JSON.parse(readFileSync(new URL('../experience/assets/track3.json', import.meta.url)))
const track = new Track(data).buildLine()
// the first drum (the road curves the other way round: kappa < 0), 6 m before its end
let at = -1
for (let i = 0; i < track.n; i++) { const e = track.exitAt(i); if (e && track.kappa[i] < -1e-4 && track.isFull(i) && Math.abs(e.dist - 6) < 0.2) { at = i; break } }
if (at < 0) { console.log('no drum found'); process.exit(1) }
const e = track.exitAt(at), circ = 2 * Math.PI / Math.abs(track.kappa[at])
console.log('drum at s', (at * track.step).toFixed(1), 'exit x', e.x.toFixed(2), 'round', circ.toFixed(1), 'm')
let fails = 0
for (const [name, off, want] of [['on the line', 0, false], ['1.5 m off', 1.5, false], ['the far side', circ / 2, true]]) {
  const me = new Racer(0, { name: 'ME', model: 0, accent: 0xffffff, halfWidth: 0.08, engine: 0.5 })
  me.human = true
  const events = []
  const race = new Race(track, [me], { laps: 2, random: Math.random, events: k => events.push(k) })
  race.grid([me]); race.started = true
  me.D = at * track.step; me.x = track.wrapX(at, e.x + off); me.sp = me.vmax * 0.7; me.safeD = me.D - 20; me.safeX = 0
  me.input.throttle = true
  for (let t = 0; t < 1.5; t += DT) race.step(DT)
  const out = events.includes('courseout')
  if (out !== want) fails++
  console.log(`${out === want ? 'PASS' : 'FAIL'}  ${name.padEnd(14)} course out: ${out}`)
}
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
