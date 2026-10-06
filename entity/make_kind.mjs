// The files ZER0-G publishes for players' own machines (PUT /api/agent/lots/383/entity-kind): rules.json (the
// JSON Schema, the budget, the assets), skill.md (for the players' agents), example.json and rules.js (the same
// module the game runs). Every table and limit comes from experience/entity_rules.js, so the text, the schema and
// the rules never disagree. node entity/make_kind.mjs
import { writeFileSync, copyFileSync } from 'node:fs'
import { GAME, GRADES, COST, BUDGET, STATS, WEIGHT, PARTICLES, validate } from '../experience/entity_rules.js'

const here = name => new URL(name, import.meta.url)

// ------------------------------------------------------------------ the example
const example = {
  name: 'MIDNIGHT KITE',
  description: 'A swept-wing courier built for the night shift: light, quick off the line, and gone before the barrier sparks settle.',
  pilot: 'IRIS VALE',
  stats: { body: 'B', boost: 'B', grip: 'B' },
  weight: 1120,
  accent: '#29d3ff',
  flame: '#8af3ff',
  particle: 'star',
}
const check = validate(example)
if (!check.ok || check.points !== BUDGET) throw new Error(`the example does not pass: ${JSON.stringify(check)}`)

// ------------------------------------------------------------------ rules.json
const grade = { enum: GRADES, 'x-cost': { each: COST } }
const spec = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'A ZER0-G machine',
  type: 'object',
  additionalProperties: false,
  required: ['name', 'pilot', 'stats', 'weight', 'accent', 'flame', 'particle'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 32, pattern: "^[A-Za-z0-9][A-Za-z0-9 .'!&-]{1,31}$" },
    description: { type: 'string', maxLength: 300 },
    pilot: { type: 'string', minLength: 2, maxLength: 16, pattern: "^[A-Za-z0-9][A-Za-z0-9 .'-]{1,15}$" },
    stats: {
      type: 'object', additionalProperties: false, required: Object.keys(STATS),
      properties: Object.fromEntries(Object.keys(STATS).map(k => [k, { ...grade, description: STATS[k] }])),
    },
    weight: { type: 'integer', minimum: WEIGHT.min, maximum: WEIGHT.max },
    accent: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    flame: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    particle: { enum: Object.keys(PARTICLES) },
    thrusters: {
      type: 'array', minItems: 1, maxItems: 4,
      items: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number', minimum: -6, maximum: 6 } },
    },
  },
}
const art = 'A 1990s arcade anti-gravity racing machine: neon, chrome and bold colour, a clear silhouette from behind, ' +
  'hovering (no wheels on the road). Original designs only: no machines, names, logos or lookalikes from other games, ' +
  'films or brands. No weapons, gore, sexual design or hate symbols. Model: one textured machine, nose towards +Z, ' +
  'resting on y = 0, one to four round exhaust nozzles at the back facing straight back. Picture: a portrait of the pilot, ' +
  'square, head and shoulders, in the style of a 1990s cyberpunk anime character select, on a dark neon background, no text or frame.'
const rules = {
  game: GAME,
  kind: 'machine',
  title: 'ZER0-G machine',
  budget: BUDGET,
  spec,
  assets: { model: 'required', picture: 'required', maxSize: 6, triangles: 15000 },
  art,
}

// ------------------------------------------------------------------ skill.md
const table = rows => rows.map(r => `| ${r.join(' | ')} |`).join('\n')
const skill = `# Making a machine for ZER0-G

ZER0-G is an anti-gravity Grand Prix in lot 383 of Project 0: thirty machines on one track, three cups of three
courses (Neon City with its loop, pipe and drum, deep space and a red desert with towers of turns), drift,
nitro, jumps and online races with whoever is in the lot. It is a love letter to the arcade racers of the
1990s, with its own machines, pilots, courses and music.

A player brings **one machine** of their own. You make it for them: its data in \`entity.json\`, a **3D model**
and a **picture**. In the game it comes first on the machine select, marked YOURS, and races in every mode: the
three cups, Time Attack and online races, where the others in the lot see it too. Its thrusters burn in its own
flame colour, and on a nitro its own particles fly out of them.

## 1. entity.json

${table([
  ['Field', 'What it is'],
  ['---', '---'],
  ['`name`', 'The machine\'s name, 2 to 32 characters (letters, digits, spaces and . \' ! & -). Shown on the select screen.'],
  ['`description`', 'Optional, up to 300 characters: what this machine is and how it drives.'],
  ['`pilot`', 'The name shown in the race standings, 2 to 16 characters. Usually the player\'s racing name.'],
  ['`stats`', '`body`, `boost` and `grip`, each a letter from A (best) to E (least). See the budget below.'],
  ['`weight`', `Kilograms, a whole number from ${WEIGHT.min} to ${WEIGHT.max}. Heavier machines shove harder in a collision and are shoved less.`],
  ['`accent`', 'A colour as `#rrggbb`: the neon rim on its body, its light trail and the frame of its portrait.'],
  ['`flame`', 'A colour as `#rrggbb`: its thruster flames and the glow in its nozzles.'],
  ['`particle`', 'What flies out of its thrusters on a nitro (the list below).'],
  ['`thrusters`', 'Optional: where its flames come out, up to four nozzles, each `[x, y, z, radius]` in metres, in the coordinates of model.glb. Leave it out and the game finds them (see the model).'],
])}

### The stats and the budget

${table([['Stat', 'What it does'], ['---', '---'], ...Object.entries(STATS).map(([k, v]) => [`\`${k}\``, v])])}

Each letter costs points: ${GRADES.map(g => `${g} = ${COST[g]}`).join(', ')}. A machine has **at most ${BUDGET}
points**, so three B's (3 + 3 + 3) is the all-rounder, and a machine that is the best at one thing pays for it
somewhere else: A in boost, C in body and C in grip is 8; A, A and E is 8 too. The game's own eighteen machines
follow the same scale. Let the letters tell the machine's story: a heavy brawler, a twitchy featherweight, a
nitro junkie.

### The particles

${table([['`particle`', 'What flies out on a nitro'], ['---', '---'], ...Object.entries(PARTICLES).map(([k, v]) => [`\`${k}\``, v])])}

They are drawn in the machine's \`flame\` colour.

## 2. model.glb

- **One machine**, textured (PBR is fine), a hover racer: it floats a hand's width over the road, so no wheels
  need to touch it (wheels as style are fine).
- **Nose towards +Z**, resting on **y = 0**, centred. Any size up to 6 metres: the game scales every machine to
  the same length.
- **At most 15,000 triangles** and 3 MB, textures of at most 1,024 px and about 4.2 million texture pixels in
  all, mipmaps counted: three 1,024 px maps and one of 512 px fit (the Project 0 limits for entities).
- **Its thrusters:** one to four round exhaust nozzles at the back, their ends flat and facing straight back.
  The game finds those flat, rear-facing discs in the mesh and lights its flames there; a nozzle hidden behind
  a fin or a spoiler gets none. If it finds none, one flame burns from the middle of the tail. When the search
  would pick the wrong spots (a flat fin, a tail plate), name the nozzles yourself in \`thrusters\`: their centres
  and radii in the model's own coordinates (read them off the mesh). The flames scale with the radius.
- **From behind** is how most players will see it: give it a shape that reads at a glance, in one strong colour
  with its accent.

## 3. picture.png

A square PNG, 512 to 1,024 px and at most 512 KB (a 256-colour PNG keeps a 1,024 px picture well under it): the
**pilot's portrait**, head and shoulders, drawn like the game's own pilots (1990s cyberpunk anime: bold ink lines,
cel shading, neon rim light) on a dark neon background, no text and no frame. It is shown beside the machine on the
select screen and in the race standings, as every pilot's is; the machine itself is drawn from model.glb.

## 4. Art direction

- The look of 1990s arcade anti-gravity racers: chrome, lacquer, neon edges, bold colour blocks, big readable
  shapes. Cyberpunk and retro-future are home ground.
- **Original only:** no machine, name, logo or lookalike from another game, film or brand. An archetype (a
  wedge racer, a hover tank, a rocket bike) is fine.
- No weapons, no gore, no sexual design, no hate symbols. The game's own fights are bumps, slides and spins.
- A good machine has one idea you can say in a sentence ("a rock-and-roll hot rod whose turbine is a piglet's
  snout"), one strong colour, and stats that match the idea.

## 5. A good way to make one

1. Agree the idea with the player: the name, the pilot name, the feel (heavy, nimble, nitro-mad) and two colours.
2. Draw a concept: the machine three-quarter front on a plain light background, the whole silhouette in view.
3. Turn it into a mesh with an image-to-3D model, then bring it under 15,000 triangles and 1,024 px textures.
   Check the nose points to +Z, that it sits on y = 0, and that the nozzles at the back are open and face back.
4. Draw the pilot's portrait (the pilot named in entity.json, in the machine's colours).
5. Write entity.json and check it locally with the game's own rules: \`import { validate } from './rules.js'\`
   (the same file the server runs) should give \`ok: true\` and at most ${BUDGET} points.
6. Validate it on the server (free), then send it. The player sees it the next time they open ZER0-G.

## Examples

The example that ships with these rules:

\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\`

Two more ideas, to show the range:

- **A hover tank:** body A, boost D, grip C (7 points, two to spare for the player to place), weight 1650,
  particle \`bolt\`. Slow off the line, and nothing moves it out of the way.
- **A featherweight:** body E, boost A, grip A (8 points), weight 760, particle \`spark\`. Quick and sharp,
  and one bump sends it spinning.
`

// ------------------------------------------------------------------ write
writeFileSync(here('rules.json'), JSON.stringify(rules, null, 1) + '\n')
writeFileSync(here('example.json'), JSON.stringify(example, null, 1) + '\n')
writeFileSync(here('skill.md'), skill)
copyFileSync(new URL('../experience/entity_rules.js', import.meta.url), here('rules.js'))
console.log('rules.json, skill.md (' + skill.length + ' characters), example.json, rules.js written; the example costs', check.points)
