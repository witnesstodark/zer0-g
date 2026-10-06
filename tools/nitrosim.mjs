// Headless check of the nitro rules: a player (the AI steering) holding SHIFT the whole race. A chain from a full
// gauge goes 1, 2, 3 (MEGA); chains fired one cell at a time stay singles. TRACK=n as in sim.mjs.
import { readFileSync } from 'node:fs'
import { Track } from '../experience/track.js'
import { Race, Racer, DT, makeAI } from '../experience/race.js'
const data = JSON.parse(readFileSync(new URL(`../experience/assets/track${process.env.TRACK ?? 1}.json`, import.meta.url)))
const track = new Track(data).buildLine()
let seed = 7
const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const racers = []
for (let i = 0; i < 8; i++) racers.push(new Racer(i, { name: 'R' + i, model: i % 18, accent: 0xffffff, halfWidth: 0.08, ai: makeAI(random, 1, i, 8), engine: 0.5 }))
const me = racers[7]; me.human = true; me.name = 'ME'; me.ai = { pace: 1, offset: 0, line: 0.7, aggr: 0.3 }
const fires = []
const race = new Race(track, racers, { laps: 2, random, events: (k, r, d) => { if (r === me && k === 'boost') fires.push({ t: race.time.toFixed(2), stack: d, bank: r.boostBank, nitro: Math.round(r.nitro), mega: r.megaAt === race.time }) } })
race.grid(racers)
race.started = true
const drive = race.drive.bind(race)
race.drive = (r, dt) => { drive(r, dt); if (r === me) { r.input.boost = false; r.input.boostHeld = true } }
me.nitro = 100
let t = 0
while (t < 60) { race.step(DT); t += DT }
console.log('fires', fires.length)
for (const f of fires.slice(0, 14)) console.log(JSON.stringify(f))
console.log('stacks seen', JSON.stringify(fires.reduce((a, f) => { a[f.stack] = (a[f.stack] ?? 0) + 1; return a }, {})), 'megas', fires.filter(f => f.mega).length)
