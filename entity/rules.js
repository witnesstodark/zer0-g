// The rules for players' own machines in ZER0-G (a Project 0 entity: "machine" for the game "zer0-g"). The same
// module runs in three places: the game (to take a player's machine), the players' agents (to check one before
// they send it) and the Project 0 server (in QuickJS, where it prices and checks every machine). So: no imports,
// no I/O, plain data in, a plain verdict out.

export const GAME = 'zer0-g'
export const VERSION = 1

// The stats are letters, as on the select screen: A the best, E the least. Each letter costs points and a
// machine has at most BUDGET of them, so a machine strong at one thing gives up another.
export const GRADES = ['A', 'B', 'C', 'D', 'E']
export const COST = { A: 4, B: 3, C: 2, D: 1, E: 0 }
export const BUDGET = 9
export const STATS = {
  body: 'how much a hit costs it and how hard it shoves others',
  boost: 'how strong and how long its nitro burns',
  grip: 'how sharply it turns and how little it slides',
}
export const WEIGHT = { min: 700, max: 1700 }

// What flies out of the thrusters on a boost, drawn by the game in the machine's flame colour.
export const PARTICLES = {
  spark: 'hot sparks (what most machines have)',
  star: 'little five-pointed stars',
  heart: 'hearts',
  bolt: 'lightning bolts',
  ring: 'rings of light',
  note: 'music notes',
  diamond: 'diamonds',
  snout: 'piglet snouts, two nostrils and a grin',
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9 .'!&-]{1,31}$/
const PILOT = /^[A-Za-z0-9][A-Za-z0-9 .'-]{1,15}$/
const HEX = /^#[0-9a-fA-F]{6}$/
const FIELDS = ['name', 'description', 'pilot', 'stats', 'weight', 'accent', 'flame', 'particle', 'thrusters']

/**
 * Check and price a machine (its entity.json). Returns { ok, errors, warnings, points, budget, breakdown }; each
 * error is { pointer, detail, fix }.
 */
export function validate(e) {
  const errors = [], warnings = [], breakdown = []
  const err = (pointer, detail, fix) => errors.push({ pointer, detail, fix })
  if (!e || typeof e !== 'object' || Array.isArray(e)) {
    err('', 'a machine is a JSON object', 'send an object with name, pilot, stats, weight, accent, flame and particle')
    return { ok: false, errors, warnings, points: 0, budget: BUDGET, breakdown }
  }
  for (const k of Object.keys(e)) if (FIELDS.indexOf(k) < 0) err(`/${k}`, `"${k}" is not a field of a machine`, `remove it; the fields are ${FIELDS.join(', ')}`)
  if (typeof e.name !== 'string' || !NAME.test(e.name)) err('/name', 'the name: 2 to 32 letters, digits, spaces and . \' ! & -', 'for example "SNOUT ROCKET"')
  if (e.description !== undefined && (typeof e.description !== 'string' || e.description.length > 300)) err('/description', 'the description: text of at most 300 characters', 'shorten it')
  if (typeof e.pilot !== 'string' || !PILOT.test(e.pilot)) err('/pilot', 'the pilot: 2 to 16 letters, digits, spaces and . \' -', 'the name shown in the standings, for example "STEFAN"')
  let points = 0
  const s = e.stats
  if (!s || typeof s !== 'object' || Array.isArray(s)) err('/stats', 'stats: an object with body, boost and grip', 'for example { "body": "C", "boost": "A", "grip": "C" }')
  else {
    for (const k of Object.keys(s)) if (!(k in STATS)) err(`/stats/${k}`, `"${k}" is not a stat`, 'the stats are body, boost and grip')
    for (const k of Object.keys(STATS)) {
      const g = s[k]
      if (GRADES.indexOf(g) < 0) { err(`/stats/${k}`, `${k}: one of the letters A to E`, `A costs ${COST.A}, B ${COST.B}, C ${COST.C}, D ${COST.D}, E ${COST.E}`); continue }
      points += COST[g]
      breakdown.push({ item: `stats.${k} ${g}`, points: COST[g] })
    }
  }
  if (points > BUDGET) err('/stats', `the stats cost ${points} points, at most ${BUDGET}`, 'lower a letter: each step down saves one point')
  else if (points < BUDGET && !errors.length) warnings.push(`the stats use ${points} of ${BUDGET} points: a letter could go up`)
  if (!Number.isInteger(e.weight) || e.weight < WEIGHT.min || e.weight > WEIGHT.max) err('/weight', `the weight: a whole number of kilograms from ${WEIGHT.min} to ${WEIGHT.max}`, 'heavier machines shove harder and are shoved less')
  if (typeof e.accent !== 'string' || !HEX.test(e.accent)) err('/accent', 'the accent: a colour as #rrggbb', 'the neon rim, the trail and the frame of its portrait, for example "#ff2bd6"')
  if (typeof e.flame !== 'string' || !HEX.test(e.flame)) err('/flame', 'the flame: a colour as #rrggbb', 'its thruster colour, for example "#ff7ad9"')
  if (typeof e.particle !== 'string' || !(e.particle in PARTICLES)) err('/particle', `the particle: one of ${Object.keys(PARTICLES).join(', ')}`, 'what flies out of the thrusters on a boost')
  // optional: where its flames come out, [x, y, z, radius] in the model's own metres (the game finds them otherwise)
  if (e.thrusters !== undefined) {
    const t = e.thrusters
    if (!Array.isArray(t) || t.length < 1 || t.length > 4) err('/thrusters', 'thrusters: a list of 1 to 4 nozzles', 'leave it out to let the game find them')
    else t.forEach((n, i) => {
      const ok = Array.isArray(n) && n.length === 4 && n.every(v => typeof v === 'number' && Number.isFinite(v)) &&
        Math.abs(n[0]) <= 6 && Math.abs(n[1]) <= 6 && Math.abs(n[2]) <= 6 && n[3] > 0 && n[3] <= 1.5
      if (!ok) err(`/thrusters/${i}`, 'a nozzle: [x, y, z, radius] in metres, as in model.glb (within 6 m, the radius above 0 and at most 1.5)', 'for example [0, 0.3, -1.2, 0.1] for one at the back')
    })
  }
  return { ok: errors.length === 0, errors, warnings, points, budget: BUDGET, breakdown }
}

/** "#ff2bd6" as a number (0xff2bd6), for the game. */
export const hex = s => parseInt(String(s).slice(1), 16)
