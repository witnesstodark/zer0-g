// A player (no r.ai) finishing: the race must keep stepping through the lap of honour, where the autopilot
// drives them (a crash there froze the HUD on GOAL! and the results never came). node tools/sbx/finishcheck.mjs
import { readFileSync } from 'node:fs'
import { Track } from '../../experience/track.js'
import { Race, Racer, DT, makeAI } from '../../experience/race.js'
for (const n of [1, 2, 3]) {
  const track = new Track(JSON.parse(readFileSync(new URL(`../../experience/assets/track${n}.json`, import.meta.url)))).buildLine()
  let seed = 3; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const racers = [new Racer(0, { name: 'YOU', model: 0, accent: 0xffffff, human: true, halfWidth: 0.07, engine: 0.5 })]
  for (let i = 1; i < 6; i++) racers.push(new Racer(i, { name: 'R' + i, model: i, accent: 0xffffff, halfWidth: 0.07, ai: makeAI(random, 1, i, 6), engine: 0.5 }))
  const race = new Race(track, racers, { laps: 1, random })
  race.grid(racers); race.started = true
  const me = racers[0]
  me.ai = { pace: 1, offset: 0, line: 0.7, aggr: 0.3 }          // drive like the autopilot until the goal
  let t = 0, after = 0
  while (t < 200 && after < 8) {
    race.step(DT); t += DT
    if (me.finished && me.ai) me.ai = null
    if (me.finished) after += DT
  }
  console.log(`track${n}: finished at ${(t - after).toFixed(1)} s, ${after.toFixed(1)} s of the lap of honour without an error`)
}
