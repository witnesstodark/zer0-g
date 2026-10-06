// Headless race: 30 AI drivers round the track with the game's own physics, to tune it. node tools/sim.mjs [class] [laps]
import { readFileSync } from 'node:fs'
import { Track } from '../experience/track.js'
import { Race, Racer, DT, makeAI, KMH } from '../experience/race.js'
import { MACHINES } from '../experience/machines.js'

const cls = Number(process.argv[2] ?? 1), laps = Number(process.argv[3] ?? 3)
const data = JSON.parse(readFileSync(new URL(`../experience/assets/track${process.env.TRACK ?? 1}.json`, import.meta.url)))
const track = new Track(data).buildLine()
let seed = 7
const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const HW = [0.133, 0.067, 0.163, 0.113, 0.093, 0.103].map(v => v * 0.7)
const racers = []
for (let i = 0; i < 30; i++) racers.push(new Racer(i, { name: 'R' + i, model: i % 18, accent: 0xffffff, halfWidth: HW[i % 6], ai: makeAI(random, cls, i, 30), engine: 0.5 }))
// HUMAN=pace: the last on the grid is a stand-in player (the AI driving at that pace, no rubber band for it)
if (process.env.HUMAN) { const h = racers[29]; h.human = true; h.name = 'PLAYER'; h.ai = { pace: Number(process.env.HUMAN), offset: 0, line: 0.7, aggr: 0.3 } }
const counts = {}
const race = new Race(track, racers, { laps, random, events: (k, r, d) => { counts[k] = (counts[k] ?? 0) + 1; if (k === 'courseout' || k === 'destroyed') console.log(k, r.name, 'at s', track.wrapS(r.D).toFixed(1), 'lap', r.lap, 'sp', r.sp.toFixed(1), 'x', r.x.toFixed(2), 'half', track.half[track.index(r.D)].toFixed(2), 'h', r.h.toFixed(2), 'psi', r.psi.toFixed(2), d ? JSON.stringify(d) : '') } })
race.grid(racers)
race.started = true
let t = 0, maxSp = 0
const spd = []
while (t < 300 && !racers.every(r => r.finished || r.retired)) {
  race.step(DT); t += DT
  for (const r of racers) if (r.alive) { maxSp = Math.max(maxSp, r.sp) }
  if (Math.round(t / DT) % 120 === 0) spd.push(racers[0].sp)
}
console.log('time', t.toFixed(1), 'events', JSON.stringify(counts), 'max speed', (maxSp * KMH).toFixed(0), 'km/h')
for (const r of race.ranked.slice(0, 30)) console.log(r.rank, r.name, 'pace', r.ai.pace.toFixed(3), r.finished ? r.finishTime.toFixed(2) : (r.retired ? 'RETIRED' : '--'), 'laps', r.lapTimes.map(x => x.toFixed(2)).join(' '), 'energy', r.energy.toFixed(0), 'kos', r.kos)
console.log('leader speed per second', spd.slice(0, 40).map(v => v.toFixed(1)).join(' '))
