// ZER0-G: an anti-gravity Grand Prix inside lot #383. Thirty machines on three courses that climb the arena's
// walls, jump its gaps, loop, twist and spiral down through a neon city at night: NEON CITY, SKY PIPE (a pipe you
// ride round, walls and ceiling) and THE DRUM (a cylinder you ride outside, off its side). The Grand Prix is a
// cup of all three, with points. The game plays
// like the 64-bit anti-gravity racers it is a love letter to: energy as the shield, the pit strip, dash
// plates, jump plates, side and spin attacks, knock-outs, the drift and a nitro gauge that the drifts and the
// fights fill. Everything here is original: the machines, the pilots, the course, the music and the name.

import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { Track } from './track.js'
import { makeEnvironment, applyLook } from './environments.js'
import { renderHeroes } from './heroes.js'      // [environments] the worlds round the courses
import { shared } from './look.js'
import { PILOTS, RIVALS, RIVAL_ACCENTS, loadMachines, loadEntityMachine, neonEnvironment, Fleet, Showroom } from './machines.js'
import { validate as validateMachine, hex as hexColor } from './entity_rules.js'
import { Race, Racer, DT, makeAI, CLASSES, SCALE, NITRO_MAX, driftTier } from './race.js'
import { Cameras, Director } from './camera.js'
import { Fx, SlideMarks, Emblems } from './fx.js'
import { Airflow } from './airflow.js'
import { U } from './scale.js'
import { ScreenFx } from './screenfx.js'
import { boardTexture } from './boards.js'
import { Online, TPS, SHOW, onRemoteWreck } from './online.js'
import { Font, Overlay } from './ui.js'
import { Hud } from './hud.js'
import { Menus, LAPS, CUPS } from './menus.js'
import { Audio } from './audio.js'
import { warmUp, warmSteps } from './warmup.js'

const LAUNCH = 3.0                  // the pack leaves the grid as the title music builds...
const SLAM = 6.06                   // ...and the riff slams in (and the logo lands) as it screams past
const HOVER = 0.033 * U
const CONTROLS = 'ZER0-G · Up/W: accelerate · Left/Right or A/D: steer · Down/S: brake · SHIFT: nitro (hold it for more) · C: camera\nSPACE + steer: DRIFT (fills the nitro, let go for a turbo) · Q/E: slide, double tap: side attack · F: spin attack'
// the race music: the hardest first, then round the rest, a new one each race
const RACE_MUSIC = ['race3', 'race', 'race4', 'race2']
// points in the cup by place (the rest score nothing)
const POINTS = [30, 25, 21, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
const MODE_NAME = { gp: 'ZER0-G CUP', online: 'ONLINE RACE', ta: 'TIME ATTACK' }

export default async function start(p0) {
  const lot = p0.lot
  p0.autoRender = false
  p0.controls.mode = 'none'
  p0.controls.vertical = false
  p0.bodies.visible = false
  p0.hud('ZER0-G\nLoading the city...')
  const renderer = p0.renderer
  renderer.toneMapping = THREE.NoToneMapping
  const scene = p0.scene
  const camera = p0.camera
  camera.near = 0.05
  camera.far = 900
  camera.updateProjectionMatrix()
  scene.traverse(o => { if (o.isHemisphereLight) o.intensity = 0.5 })
  const sun = new THREE.DirectionalLight(0xbfd8ff, 0.9)
  sun.position.set(-10, 30, 14)
  scene.add(sun, new THREE.AmbientLight(0x6a4cff, 0.25))
  const random = p0.random

  // ---- files
  const json = path => new THREE.FileLoader().setResponseType('json').loadAsync(p0.asset(path))
  const bitmapLoader = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY' })
  const texture = async path => {
    const bmp = await bitmapLoader.loadAsync(p0.asset(path))
    const t = new THREE.Texture(bmp)
    t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    return t
  }
  const rawBitmap = path => new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none' }).loadAsync(p0.asset(path))
  const [track1, track2, track3, fontMeta, fontFill, fontLine, thinMeta, thinFill, thinLine] = await Promise.all([
    json('assets/track1.json'), json('assets/track2.json'), json('assets/track3.json'), json('assets/ui/font.json'), rawBitmap('assets/ui/font_fill.png'), rawBitmap('assets/ui/font_line.png'),
    json('assets/ui/font_thin.json'), rawBitmap('assets/ui/font_thin_fill.png'), rawBitmap('assets/ui/font_thin_line.png'),
  ])
  const pictureNames = ['logo', 'icon_gp', 'icon_ta']
  const pictures = Object.fromEntries(await Promise.all(pictureNames.map(async n => [n, await texture(`assets/ui/${n}.jpg`)])))
  pictures.board = boardTexture(await texture('assets/ui/board.jpg'))
  const portraits = await Promise.all(PILOTS.map(p => texture(`assets/ui/${p.portrait}.jpg`)))
  p0.hud('ZER0-G\nLoading the machines...')
  const models = await loadMachines(p0)
  const halfWidths = models.map(m => m.size.x / 2 * SCALE)
  // the game's own eighteen: the AI rivals come from these only (the same on every player's screen online)
  const OWN_PILOTS = PILOTS.filter(p => !p.own)

  // ---- players' own machines (Project 0 entities made by their agents): yours comes first on the select
  // screen, marked YOURS; the others' are loaded when they bring theirs to an online race
  const entityUrl = u => { if (!u) return null; try { return new URL(u).href } catch { try { return new URL(u, p0.asset('')).href } catch { return null } } }
  const textureAt = async url => { const t = new THREE.Texture(await bitmapLoader.loadAsync(url)); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t }
  const entityPilots = new Map()        // player id -> the pilot entry of the machine they brought
  async function entityMachine(e, pid, selectable) {
    if (!e?.data || !e.model || !validateMachine(e.data).ok) return null
    const d = e.data
    const p = {
      id: `entity-${e.id}`, mesh: `entity-${e.id}`, own: true, owner: pid,
      pilot: String(d.pilot).toUpperCase().slice(0, 16), name: String(e.name ?? d.name).toUpperCase().slice(0, 32),
      accent: hexColor(d.accent), flame: hexColor(d.flame), particle: d.particle, hue: 0, sat: 1,
      body: d.stats.body, boost: d.stats.boost, grip: d.stats.grip, weight: d.weight, thrusters: d.thrusters ?? null,
    }
    const model = await loadEntityMachine(entityUrl(e.model), p)
    let face = portraits[0]
    if (e.picture) try { face = await textureAt(entityUrl(e.picture)) } catch { /* the first pilot's then */ }
    p.model = models.length
    models.push(model)
    halfWidths.push(model.size.x / 2 * SCALE)
    p.face = portraits.length
    portraits.push(face)
    if (selectable) PILOTS.push(p)
    entityPilots.set(pid, p)
    return p
  }
  let ownMachine = null, ownEntity = null
  try {
    const e = await p0.entities?.mine?.()
    ownEntity = e ?? null
    if (e) ownMachine = await entityMachine(e, p0.me.id, true)
    if (e && !ownMachine) p0.log('your machine does not pass the rules (or has no model): ask your agent to update it')
  } catch (err) { p0.log(`your machine did not load: ${err.message}`) }
  const entityHint = p0.entities?.kind && !ownMachine ? (p0.entities.hint || 'Ask your AI agent: make me a machine for zer0-g (Project 0)') : ''

  // ---- the GALLERY: every player's machine, the most liked first (Project 0's p0.entities.list, with likes; where
  // that is missing, the copy taken at publish, assets/gallery.json), and the machines of the players in the lot
  // now; pictures load when it opens, a machine's model when it is picked
  const gallery = { entries: null, canLike: false }
  async function galleryEntries() {
    if (gallery.entries) return gallery.entries
    let source = null
    if (p0.entities?.list) {
      try {
        const r = await p0.entities.list({ sort: 'likes' })
        if (r?.entities?.length) { source = r.entities.map(e => ({ id: e.id, owner: e.owner?.name, name: e.name, version: e.version, updated: e.updated, data: e.data, model: e.model, picture: e.picture, likes: e.likes ?? 0, liked: !!e.liked })); gallery.canLike = !!r.canLike }
      } catch { /* the copy, then */ }
    }
    if (!source) source = ((await json('assets/gallery.json').catch(() => ({ machines: [] }))).machines ?? []).map(m => ({ ...m, likes: m.likes ?? 0, liked: false }))
    const list = source.filter(m => m?.data && m.model && validateMachine(m.data).ok).map(m => ({ ...m, owner: String(m.owner ?? 'PLAYER').toUpperCase().slice(0, 16), here: false }))
    for (const pid of online.players ?? []) {
      try {
        const e = await p0.entities?.of?.(pid)
        if (!e?.data || !e.model || !validateMachine(e.data).ok) continue
        const k = list.findIndex(m => m.id === e.id)
        const m = { id: e.id, owner: String(e.owner?.name ?? online.name(pid)).toUpperCase().slice(0, 16), name: e.name ?? e.data.name, data: e.data, model: e.model, picture: e.picture, updated: e.updated ?? 0, likes: e.likes ?? 0, liked: false, here: true }
        if (k >= 0) list[k] = { ...list[k], ...m }; else list.push(m)
      } catch { /* that player's machine stays as copied */ }
    }
    for (const m of list) m.mine = !!ownEntity && m.id === ownEntity.id
    // the most liked first (ties: the newest); their places by likes
    list.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0) || (b.updated ?? 0) - (a.updated ?? 0))
    list.forEach((m, k) => { m.place = k + 1 })
    await Promise.all(list.map(async m => { if (m.picture) try { m.face = await textureAt(entityUrl(m.picture)) } catch { m.face = null } }))
    gallery.entries = list
    return list
  }
  /** Like a gallery machine (or take it back): its likes and whether you like it now, or why not. */
  async function galleryLike(m) {
    if (!p0.entities?.like) return { ok: false, reason: 'LIKES ARE NOT HERE YET' }
    const r = await p0.entities.like(m.id, !m.liked)
    if (r?.ok) { m.likes = r.likes; m.liked = r.liked }
    return r ?? { ok: false }
  }
  /** A gallery machine's pilot entry, its model loaded (once) for the stand. */
  async function galleryPilot(m) {
    if (m.mine && ownMachine) return ownMachine
    if (!m.pilot) m.pilot = await entityMachine({ id: m.id, name: m.name, data: m.data, model: m.model, picture: m.picture }, `gallery-${m.id}`, false)
    return m.pilot
  }

  // ---- the world
  // the first cup's three courses, then the other cups' (track4 to track9) when they are there
  const extraTracks = (await Promise.all([4, 5, 6, 7, 8, 9].map(n => json(`assets/track${n}.json`).catch(() => null))))
  const trackData = [track1, track2, track3]
  for (const d of extraTracks) { if (!d) break; trackData.push(d) }
  const courses = trackData.map(d => new Track(d).buildLine())
  let track = courses[0]
  for (const t of courses) { t.build(); t.group.visible = false; scene.add(t.group) }
  track.group.visible = true
  // [environments] each course's world: its track data's env ('city', 'space', 'desert'; p0.debugEnv overrides all)
  const envOf = k => p0.debugEnv || trackData[k]?.env || 'city'
  const cities = courses.map((t, k) => makeEnvironment(envOf(k), lot, t, pictures, random))
  for (const c of cities) { c.group.visible = false; scene.add(c.group) }
  let city = cities[0]
  city.group.visible = true
  const env = neonEnvironment(renderer)
  const fx = new Fx()
  scene.add(fx.group)
  const marks = new SlideMarks()
  scene.add(marks.mesh)
  // players' own boost particles (stars, hearts, snouts...)
  const emblems = new Emblems(260, 0.42 * U)
  scene.add(emblems.mesh)
  // the air streaming round your machine and the nearest ones
  const air = new Airflow(7)
  scene.add(air.mesh)
  let marksOn = false

  // ---- racers: the fleet is drawn for up to 30 machines
  const N = 30
  const fleetDefs = Array.from({ length: N }, (_, i) => ({ model: i % models.length, accent: RIVAL_ACCENTS[i % RIVAL_ACCENTS.length] }))
  const fleet = new Fleet(models, fleetDefs, env)
  scene.add(fleet.group)
  const cams = new Cameras(camera, track, lot)
  cams.world = city                 // what stands in the lot (the director keeps its cameras out of it)

  // ---- screen
  const overlay = new Overlay(p0)
  const font = new Font(fontFill, fontLine, fontMeta)
  const thin = new Font(thinFill, thinLine, thinMeta)      // the lighter weight, for the menus' labels and small text
  const audio = new Audio(p0)
  const hud = new Hud(overlay, font, track, portraits)
  const screen = new ScreenFx(overlay)
  const showroom = new Showroom(models, env)
  let menus = null

  // ---- post: bloom for the neon (half resolution); none in the light version
  let lite = false
  let started = false          // warm-up done: from here on nothing may block for long
  const target = new THREE.WebGLRenderTarget(p0.width * p0.pixelRatio, p0.height * p0.pixelRatio, { type: THREE.HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, target)
  composer.setPixelRatio(p0.pixelRatio)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(p0.width / 2, p0.height / 2), 0.68, 0.5, 1.05)
  composer.addPass(bloom)
  composer.addPass(screen.pass)
  composer.addPass(new OutputPass())
  composer.addPass(screen.sharpen)        // a light sharpening last: the lines and the grid crisper under the glow
  p0.on('resize', () => {
    composer.setPixelRatio(lite ? Math.min(1, p0.pixelRatio) * 0.5 : p0.pixelRatio)
    composer.setSize(p0.width, p0.height)
    overlay.resize()
    screen.resize()
  })

  // ---- the races
  let accum = 0
  let frames = 0, slow = 0
  let lastHud = -1
  let endT = 0
  let cdShown = -1
  let race = null
  let me = null              // your racer (null in the attract race)
  let director = new Director(cams, null)
  let state = 'boot'
  let stateT = 0
  let config = null
  let resultsShown = false
  let raceMusic = -1
  let nitroVoiceAt = -99
  let healAt = 0
  let exitHintAt = 0

  function setCourse(course) {
    course = course ?? 0
    track = courses[course]
    courses.forEach((t, k) => { t.group.visible = k === course })
    city = cities[course]
    cities.forEach((c, k) => { c.group.visible = k === course })
    applyLook(city.look, { sun, bloom, scene })        // [environments] its fog, light and bloom
    cams.track = track
    cams.world = city
    hud.track = track
    hud.mapPts = null
    for (let i = 0; i < track.mines.length; i++) track.setMine(i, true)
  }

  /** A pilot's machine as a racer's definition. */
  const pilotDef = (p, name = p.pilot) => ({ name, model: p.model, accent: p.accent, hue: p.hue, sat: p.sat, stats: p, face: p.face ?? PILOTS.indexOf(p), particle: p.particle ?? null })

  /** Who races against you: the other named pilots in their own machines, then rivals in the pilots' machines,
   * repainted (the cup keeps the same field for its three races). */
  function fieldDefs(human) {
    const defs = []
    PILOTS.forEach((p, k) => { if (!p.own && (!human || k !== human.machine)) defs.push(pilotDef(p)) })
    let r = 0
    while (defs.length < (human ? N - 1 : N)) {
      const p = OWN_PILOTS[Math.floor(random() * OWN_PILOTS.length)]
      defs.push({ ...pilotDef(p, RIVALS[r % RIVALS.length]), accent: RIVAL_ACCENTS[(r * 7) % RIVAL_ACCENTS.length], hue: 0.15 + random() * 0.7, sat: 0.8 + random() * 0.4 })
      r++
    }
    return defs
  }

  /** A field of racers. human: { machine (a pilot's index), engine } or null (the attract race). */
  function makeField(human, cls, defs = fieldDefs(human)) {
    const ais = defs.map((d, k) => new Racer(k, { ...d, halfWidth: halfWidths[d.model], ai: makeAI(random, cls, k, defs.length), engine: 0.3 + random() * 0.5 }))
    // the fast ones start at the front
    ais.sort((a, b) => b.ai.pace - a.ai.pace)
    const all = ais
    if (human) {
      const p = PILOTS[human.machine]
      all.push(new Racer(0, { ...pilotDef(p, p0.me.name ? String(p0.me.name).toUpperCase().slice(0, 16) : 'YOU'), human: true, halfWidth: halfWidths[p.model], engine: human.engine }))
    }
    all.forEach((rr, k) => { rr.i = k })
    return all
  }

  /** An online race's field, the same on every player's machine (built from the race's seed): the players
   * first (in the order of their ids), then the named pilots nobody took and rivals, as in a Grand Prix. */
  function onlineField(gp) {
    let seed = gp.seed >>> 0
    const rng = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    const players = gp.field.map((e, k) => {
      const p = (e.m === -1 ? entityPilots.get(e.pid) : PILOTS[e.m]) ?? PILOTS[0]
      return new Racer(k, { ...pilotDef(p, String(e.n || 'PLAYER').toUpperCase()), human: true, remote: e.pid !== p0.me.id, pid: e.pid, halfWidth: halfWidths[p.model], engine: e.e ?? 0.5 })
    })
    const taken = new Set(gp.field.map(e => e.m))
    const defs = OWN_PILOTS.filter((p, k) => !taken.has(k)).map(p => pilotDef(p))
    let r = 0
    while (players.length + defs.length < N) {
      const p = OWN_PILOTS[Math.floor(rng() * OWN_PILOTS.length)]
      defs.push({ ...pilotDef(p, RIVALS[r % RIVALS.length]), accent: RIVAL_ACCENTS[(r * 7) % RIVAL_ACCENTS.length], hue: 0.15 + rng() * 0.7, sat: 0.8 + rng() * 0.4 })
      r++
    }
    const ais = defs.map((d, k) => new Racer(k, { ...d, halfWidth: halfWidths[d.model], ai: makeAI(rng, gp.c, k, defs.length), engine: 0.3 + rng() * 0.5 }))
    ais.sort((a, b) => b.ai.pace - a.ai.pace)
    const all = [...players, ...ais]
    all.forEach((x, k) => { x.i = k })
    return { all, grid: [...ais, ...players] }
  }

  function newRace(cfg, attract = false) {
    config = cfg
    setCourse(cfg.course)
    const human = attract ? null : (cfg.mode === 'ta' ? { machine: cfg.machine, engine: cfg.engine } : { machine: cfg.machine, engine: cfg.engine })
    let racers, grid = null
    if (cfg.online) {
      const f = onlineField(cfg.online)
      racers = f.all
      grid = f.grid
    } else if (!attract && cfg.mode === 'ta') {
      const p = PILOTS[cfg.machine]
      racers = [new Racer(0, { ...pilotDef(p, 'YOU'), human: true, halfWidth: halfWidths[p.model], engine: cfg.engine })]
    } else racers = makeField(human, cfg.cls, cfg.cup?.defs)
    race = new Race(track, racers, { laps: attract ? 99 : LAPS[cfg.mode], events: onEvent, random, mode: attract ? 'gp' : cfg.mode })
    race.grid(grid ?? racers)
    me = racers.find(r => r.human && !r.remote) ?? null
    // the local test page can let the AI drive you (never set in the game)
    if (me && p0.debugAutopilot) me.ai = { pace: 1, offset: 0, line: 0.8, aggr: 0.3 }
    fleet.setRacers(racers.map(r => ({ model: r.model, accent: r.accent, hue: r.hue, sat: r.sat })))
    director = new Director(cams, race)
    fallen.clear()
    wrecks.clear()
    resultsShown = false
    accum = 0
    return race
  }

  // ---- events from the race: sounds, sparks, words
  const fallen = new Map()
  const wrecks = new Map()            // racer -> { p, t }: a wreck burning where it blew apart
  /** A machine blown apart at p: the fireball, pieces in its colours thrown out and falling, rings of the blast. */
  function wreckBlast(p, r, f, close) {
    fx.blast(p, r.accent, close ? 1 : 0.6)
    fx.blast(p, 0xff7a20, close ? 0.7 : 0.4)
    const v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
    const parts = [new THREE.Color(r.accent).multiplyScalar(1.6), new THREE.Color(0.08, 0.08, 0.1), new THREE.Color(0.6, 0.62, 0.7), new THREE.Color(2.4, 1.1, 0.2)]
    for (let k = 0; k < (close ? 46 : 18); k++) {
      v.set(Math.random() - 0.5, 0.25 + Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(2.5 + Math.random() * 6)
      v.addScaledVector(f.f, r.sp * 0.35)
      fx.spawn(p, v, parts[k % parts.length], 1.2 + Math.random() * 1.0, 0.07 + Math.random() * 0.1, 0.6, 9)
    }
    fx.ring(p, up, 0xffffff, 3.4 * U, 0.6)
    fx.ring(p, f.f, 0xff8a30, 2.6 * U, 0.5)
    fx.ring(p, f.r ?? up, 0xff3d1a, 2.0 * U, 0.45)
  }
  // when another screen's machine is wrecked
  onRemoteWreck((r, last) => onEvent(last ? 'destroyed' : 'wreck', r, { lives: r.lives }))
  const near = (r, range = 22) => {
    const p = cams.racerFrame(r).p
    return Math.max(0, 1 - p.distanceTo(camera.position) / range)
  }
  function onEvent(kind, r, data) {
    const mine = r === me
    const f = cams.racerFrame(r)
    if (kind === 'boost') {
      // the nitro: two rings blown out of the tail, a spray of sparks, the screen kicks
      const tail = f.p.clone().addScaledVector(f.f, -0.17 * U)
      const close = mine || near(r, 12) > 0.4
      fx.ring(tail, f.f, 0xff2bd6, (close ? 0.9 : 0.5) * U, 0.4)
      if (close) {
        // the full blast for yours and the ones right by you (a field of them at once would white out the screen)
        fx.ring(tail, f.f, 0xffffff, 0.45 * U, 0.22)
        fx.ring(f.p, f.u, 0xff8ae6, 1.2 * U, 0.35)
        fx.sparks(tail, f.f.clone().multiplyScalar(-1), 0xff6fe0, mine ? 26 : 8, 3.2 * U, 0.45)
      }
      if (mine) {
        // each cell more while it burns hits harder: a double, then the MEGA NITRO
        const stack = data ?? 1
        audio.sfx('nitro_go', { volume: 1, rate: 1 + (stack - 1) * 0.08 }); audio.sfx('boost', { volume: 0.5 + stack * 0.15, rate: 1.2, gap: 0.2 })
        cams.shake = Math.max(cams.shake, 0.6 + stack * 0.15); cams.kick = 15 + (stack - 1) * 5; cams.surge = 1 + (stack - 1) * 0.5
        screen.flash(stack >= 3 ? 0xffffff : 0xff2bd6, 0.85)
        if (r.particle) {
          const model = models[r.model]
          for (let k = 0; k < 8 + stack * 4; k++) {
            const nz = model.nozzles[k % model.nozzles.length]
            WIND.copy(tail).addScaledVector(f.u, nz.y * SCALE)
            VEL.copy(f.f).multiplyScalar(r.sp * (0.8 + Math.random() * 0.12))
            VEL.x += (Math.random() - 0.5) * 0.9 * U; VEL.y += Math.random() * 0.6 * U; VEL.z += (Math.random() - 0.5) * 0.9 * U
            emblems.spawn(r.particle, WIND, VEL, FLAME_COLORS[r.model], (0.064 + Math.random() * 0.04) * U, 1.0 + Math.random() * 0.5)
          }
        }
        if (stack === 2) hud.note('DOUBLE NITRO!', 1, 'pink')
        else if (stack >= 3 && r.megaAt === race.time) {
          // it just went MEGA: a sonic boom, rings of light blown back one after another, the screen torn white
          hud.note('MEGA NITRO!', 1.4, 'gold')
          for (let k = 0; k < 4; k++) fx.ring(tail.clone().addScaledVector(f.f, -k * 0.35 * U), f.f, [0xffffff, 0xff2bd6, 0x29d3ff, 0xffd66b][k], (1.2 + k * 0.5) * U, 0.45 + k * 0.08)
          fx.ring(f.p, f.u, 0xffffff, 2.4 * U, 0.5)
          fx.sparks(tail, f.f.clone().multiplyScalar(-1), 0xffffff, 40, 4.5 * U, 0.7)
          audio.sfx('explode', { volume: 0.45, rate: 0.7 }); audio.sfx('nitro_go', { volume: 1, rate: 0.8 }); audio.voice('boost')
          cams.shake = 1.4; cams.kick = 32; cams.surge = 2.6
          screen.flash(0xffffff, 1)
          megaPulse = 0
        }
      }
      else if (near(r) > 0.3) audio.sfx('boost', { volume: near(r) * 0.5, gap: 0.3 })
    } else if (kind === 'dash') {
      // a dash plate: rings flat on the road round the machine and a burst of blue light
      fx.ring(f.p, f.u, 0x29d3ff, 0.55 * U, 0.3)
      fx.ring(f.p.clone().addScaledVector(f.f, 0.15 * U), f.u, 0xffffff, 0.35 * U, 0.22)
      if (mine || near(r) > 0.5) fx.sparks(f.p, f.u.clone().addScaledVector(f.f, -1), 0x7fe8ff, mine ? 14 : 5, 2.2 * U, 0.5)
      if (mine) { audio.sfx('dash', { volume: 0.9 }); cams.shake = Math.max(cams.shake, 0.3); cams.kick = 9; screen.flash(0x29d3ff, 0.6) }
    } else if (kind === 'jump' || kind === 'kick') {
      fx.ring(f.p, f.u, kind === 'kick' ? 0xff9a1f : 0xffd23a, 0.5 * U, 0.3)
      if (mine) {
        audio.sfx(kind === 'kick' ? 'dash' : 'jump', { volume: 0.8, rate: kind === 'kick' ? 1.25 : 1 })
        cams.kick = kind === 'kick' ? 8 : 5; screen.flash(0xff9a1f, 0.45)
      }
    } else if (kind === 'nitro') {
      if (mine) {
        audio.sfx('nitro', { volume: 0.6, rate: 0.9 + data * 0.1 })
        if (data * 25 >= NITRO_MAX) {
          hud.note('NITRO FULL!  SHIFT!', 1.2, 'pink')
          if (p0.time - nitroVoiceAt > 25) { nitroVoiceAt = p0.time; audio.voice('boost') }
        } else hud.note(`NITRO x${data}`, 0.7, 'pink')
      }
    } else if (kind === 'flow') {
      if (mine) { hud.note('FULL FLOW!  +25% SPEED', 1.4, 'gold'); audio.sfx('nitro', { volume: 0.7, rate: 0.75 }); screen.flash(0xffd23a, 0.5); cams.kick = 6 }
    } else if (kind === 'flowLost') {
      if (mine) hud.note('FLOW LOST', 0.9, 'red')
    } else if (kind === 'land') {
      if (mine && data > 3 * U) { audio.sfx('land', { volume: Math.min(1, data / U / 8) }); cams.shake = Math.max(cams.shake, Math.min(0.7, data / U / 10)) }
    } else if (kind === 'rail' || kind === 'scrape') {
      const side = data.side
      const p = f.p.clone().addScaledVector(cams.racerFrame(r).r, side * r.halfWidth)
      track.flashRail(r.D, side, shared.uTime.value)
      fx.sparks(p, f.f.clone().multiplyScalar(-1).addScaledVector(f.u, 0.5), 0xffb060, kind === 'rail' ? 18 : 4, 1.9 * U)
      if (mine) { audio.sfx('rail', { volume: kind === 'rail' ? 0.9 : 0.35, gap: 0.15 }); if (kind === 'rail') { cams.shake = Math.max(cams.shake, 0.55); screen.flash(0xffa040, 0.3) } }
      else if (kind === 'rail' && near(r) > 0.4) audio.sfx('rail', { volume: near(r) * 0.4, gap: 0.2 })
    } else if (kind === 'bump') {
      const o = data.other
      if (data.hard > 1.5) {
        const p = f.p.clone().lerp(cams.racerFrame(o).p, 0.5)
        fx.sparks(p, f.u, 0xffffff, Math.min(24, 6 + data.hard * 1.6), 1.8 * U)
        if (data.hard > 6) fx.ring(p, f.u, 0xffffff, 0.4 * U, 0.2)
      }
      if ((mine || o === me) && data.hard > 1) {
        audio.sfx('bump', { volume: Math.min(1, 0.35 + data.hard * 0.1), gap: 0.12 })
        cams.shake = Math.max(cams.shake, Math.min(0.75, data.hard * 0.12))
        if (data.hard > 5) { cams.kick = Math.min(6, data.hard * 0.5); screen.flash(0xffffff, Math.min(0.5, data.hard * 0.05)) }
      }
    } else if (kind === 'mine') {
      fx.blast(f.p, 0xff2040, 0.2)
      if (mine || near(r) > 0.3) audio.sfx('mine', { volume: mine ? 1 : near(r) * 0.6 })
      if (mine) { cams.shake = 0.8; hud.note('MINE!', 1, 'red') }
    } else if (kind === 'drift') {
      // the hop: a puff of light under the machine as the tail steps out
      fx.ring(f.p, f.u, 0xffffff, 0.3 * U, 0.2)
      if (mine) audio.sfx('hop', { volume: 0.8, gap: 0.1 })
    } else if (kind === 'turbo') {
      fx.ring(f.p.clone().addScaledVector(f.f, -0.17 * U), f.f, DRIFT_COLORS[data], (0.35 + data * 0.08) * U, 0.3)
      fx.sparks(f.p.clone().addScaledVector(f.f, -0.17 * U), f.f.clone().multiplyScalar(-1), DRIFT_COLORS[data], mine ? 8 + data * 4 : 4, 2 * U, 0.5)
      if (mine) {
        audio.sfx('dash', { volume: 0.5 + data * 0.15, rate: 0.9 + data * 0.1 })
        hud.note(['', 'TURBO', 'SUPER TURBO', 'ULTRA TURBO'][data], 0.9, data === 3 ? 'pink' : 'gold')
        cams.kick = 4 + data * 3; screen.flash(DRIFT_COLORS[data], 0.3 + data * 0.12)
      }
    } else if (kind === 'spin' || kind === 'side') {
      if (mine) audio.sfx('spin', { volume: 0.7 })
    } else if (kind === 'empty') {
      if (mine) { audio.sfx('warning', { volume: 0.8 }); hud.note('NO POWER! PIT OR DIE', 2.2, 'red') }
    } else if (kind === 'ko') {
      if (mine) { hud.note(`KO!  ${data.name}`, 1.6, 'gold'); audio.sfx('select', { volume: 0.8 }) }
    } else if (kind === 'courseout') {
      // falling off: from here it is a plain fall in the world
      fallen.set(r, { p: f.p.clone(), v: f.f.clone().multiplyScalar(r.sp).addScaledVector(f.u, r.vh) })
      if (mine) { audio.voice('out'); hud.say('COURSE OUT', 1.1, 'red') }
    } else if (kind === 'respawn') {
      // put back on the road where it last was safely: a flash and on it goes
      fallen.delete(r)
      wrecks.delete(r)
      fx.ring(f.p, f.u, 0x29d3ff, 0.5 * U, 0.35)
      if (data?.spare) fx.ring(f.p, f.u, 0xffffff, 0.9 * U, 0.5)
      if (mine) { cams.cut(); screen.flash(0x29d3ff, 0.6); audio.sfx('dash', { volume: 0.6, rate: 0.8 }); hud.note(data?.spare ? 'THE SPARE MACHINE  ·  GO!' : 'BACK ON TRACK  ·  GO!', 1.4, 'gold') }
    } else if (kind === 'wreck' || kind === 'destroyed') {
      // blown apart: a fireball, burning pieces of the machine thrown out, a shockwave; the wreck burns on
      const fall = fallen.get(r)
      const p = fall ? fall.p.clone() : f.p.clone().addScaledVector(f.u, 0.1 * U)
      fallen.delete(r)
      wreckBlast(p, r, f, mine || near(r, 14) > 0.2)
      // the camera's place to watch it from: back along the road and up
      wrecks.set(r, { p, t: 0, from: p.clone().addScaledVector(f.f, -2.6 * U).addScaledVector(f.u, 1.5 * U).addScaledVector(f.r, 0.8 * U) })
      if (mine || near(r, 30) > 0.1) { audio.sfx('explode', { volume: mine ? 1 : near(r, 30) * 0.8, gap: 0.1 }); if (mine) audio.sfx('mine', { volume: 0.8, rate: 0.7 }) }
      if (mine) {
        cams.shake = 1.8; cams.kick = 22; screen.flash(0xff5a1a, 1)
        if (kind === 'destroyed') { audio.voice('retired'); hud.say('DESTROYED', 2.6, 'red', 'NO MACHINES LEFT: OUT OF THE RACE') }
        else { audio.voice('wrecked'); hud.say('WRECKED!', 1.8, 'red', `${data?.lives ?? r.lives} ${(data?.lives ?? r.lives) === 1 ? 'MACHINE' : 'MACHINES'} LEFT`) }
      }
    } else if (kind === 'lap') {
      if (mine && race.mode !== 'attract') {
        audio.sfx('lap', { volume: 0.8 })
        if (data === race.laps) { audio.voice('final'); hud.say('FINAL LAP', 1.8, 'gold') }
        else if (data > 1) hud.note(`LAP ${data}`, 1.2, 'pink')
      }
    } else if (kind === 'finish') {
      if (mine) {
        audio.voice('goal')
        audio.sfx('crowd', { volume: 0.6 })
        hud.say('GOAL!', 2.5, 'gold', r.rank === 1 ? 'WINNER' : '')
        for (let k = 0; k < 5; k++) fx.fireworks(new THREE.Vector3((random() - 0.5) * 20, 14 + random() * 10, (random() - 0.5) * 30), [0x29d3ff, 0xff2bd6, 0xffb21f][k % 3])
      }
    }
  }

  const DRIFT_COLORS = [0xffffff, 0x29d3ff, 0xff9a1f, 0xff2bd6]
  const SIDE = new THREE.Vector3()
  // ---- drawing the racers
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), QR = new THREE.Quaternion(), POS = new THREE.Vector3(), ONE = new THREE.Vector3(SCALE, SCALE, SCALE)
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), REAR = new THREE.Vector3(), ROAD = new THREE.Vector3()
  const col = new THREE.Color()
  const FR = { p: new THREE.Vector3(), f: new THREE.Vector3(), u: new THREE.Vector3(), r: new THREE.Vector3() }
  function drawRacers(dt) {
    if (!race) return
    air.begin()
    let airNear = 0
    race.racers.forEach((r, i) => {
      const visible = (r.alive && !(r.wreckT > 0)) || (fallen.has(r) && r.falling)
      // a wreck burning: flames and smoke rising where it blew apart
      const wk = wrecks.get(r)
      if (wk && (r.wreckT > 0 || !r.alive) && wk.t < 3.2) {
        const was = wk.t
        wk.t += dt
        // a second blast as the tanks go, then it burns
        if (was < 0.35 && wk.t >= 0.35) { fx.blast(wk.p, 0xffb040, 0.55); fx.ring(wk.p, new THREE.Vector3(0, 1, 0), 0xffd080, 1.6 * U, 0.4); if (r === me) { cams.shake = Math.max(cams.shake, 1); audio.sfx('explode', { volume: 0.6, rate: 1.25, gap: 0.05 }) } }
        for (let k = 0; k < 3; k++) {
          if (Math.random() > dt * 70 / 3) continue
          VEL.set((Math.random() - 0.5) * 0.8, 1.0 + Math.random() * 1.8, (Math.random() - 0.5) * 0.8)
          const hot = Math.random() < 0.6
          fx.spawn(wk.p, VEL, hot ? FIRE : SMOKE, hot ? 0.6 + Math.random() * 0.5 : 1.2 + Math.random() * 0.8, hot ? 0.18 + Math.random() * 0.2 : 0.3 + Math.random() * 0.3, 1.2, hot ? -1.5 : -0.8)
        }
      }
      const f = cams.racerFrame(r, FR)
      if (r.falling && fallen.has(r)) {
        const fl = fallen.get(r)
        fl.v.y -= 12 * dt
        fl.p.addScaledVector(fl.v, dt)
        f.p.copy(fl.p)
      }
      if (!visible) { fleet.set(i, M, false, 0); fleet.fx.set(i, f.p, f.f, f.u, f.p, 0, col, false); fleet.fx.setFlames(i, M, null, 0, col, false); return }
      // the machine's frame: nose along its heading, rolled into its steering, pitched in the air
      Z.copy(f.f); Y.copy(f.u); X.crossVectors(Y, Z).normalize()
      M.makeBasis(X, Y, Z)
      Q.setFromRotationMatrix(M)
      const roll = -r.steerVis * 0.32 - r.lean * 0.18
      QR.setFromAxisAngle(AXIS_Z, roll)
      Q.multiply(QR)
      if (r.air) { QR.setFromAxisAngle(AXIS_X, THREE.MathUtils.clamp(-r.vh * 0.035, -0.35, 0.35)); Q.multiply(QR) }
      if (r.spinVis) { QR.setFromAxisAngle(AXIS_Y, r.spinVis); Q.multiply(QR) }
      // a drift shows: the body swings further into the turn than it is really pointing, after a little hop
      if (r.driftVis) { QR.setFromAxisAngle(AXIS_Y, -r.driftVis); Q.multiply(QR) }
      const hop = r.hop > 0 ? Math.sin((1 - r.hop / 0.14) * Math.PI) * 0.035 : 0
      const bob = Math.sin(shared.uTime.value * 9 + i) * 0.004 * U
      POS.copy(f.p).addScaledVector(f.u, HOVER + bob + hop)
      M.compose(POS, Q, ONE)
      const glow = r.boostT > 0 ? 0.2 + 0.14 * Math.sin(shared.uTime.value * 30 + i) : 0
      // on a heal strip the repair washes over the body (it fades in and out); just put back, it blinks
      const healing = r.inPit && r.alive ? 1 : 0
      healK[i] += (healing - healK[i]) * Math.min(1, dt * (healing ? 8 : 3))
      const blink = r.ghost > 0 && Math.floor(shared.uTime.value * 14) % 2 === 0
      fleet.set(i, M, !blink, r.flash + glow + (r.energy < 2 ? 0.25 * (Math.sin(shared.uTime.value * 20) > 0 ? 1 : 0) : 0), healK[i])
      // the flame and the glow
      REAR.copy(POS).addScaledVector(Z, -0.47 * SCALE).addScaledVector(Y, 0.1 * SCALE)
      ROAD.copy(f.p).addScaledVector(f.u, -r.h)
      col.set(r.accent)
      const power = r.alive ? r.throttleVis * (r.boostT > 0 ? (r.boostStack >= 3 ? 4.6 : 2.3 + 0.55 * (Math.max(1, r.boostStack) - 1)) : r.dashT > 0 || r.turbo > 0 ? 1.7 : 1) : 0
      fleet.fx.set(i, REAR, Z, f.u, ROAD, power, col, r.alive)
      // the thrusters burn whenever the machine flies (bigger on a plate, huge on a boost), each machine's own colour
      const model = models[r.model]
      fleet.fx.setFlames(i, M, model.nozzles, r.alive ? Math.max(0.6, power) : 0, FLAME_COLORS[r.model], r.alive)
      // a player's own machine on a boost: its own particles fly out of its nozzles
      if (r.particle && r.alive && r.boostT > 0 && (r === me || POS.distanceToSquared(camera.position) < 9) && Math.random() < dt * (r === me ? 26 : 14)) {
        const nz = model.nozzles[Math.floor(Math.random() * model.nozzles.length)]
        WIND.set(nz.x, nz.y, nz.z).applyMatrix4(M)
        // carried along in the machine's wake, falling back slowly and spreading out (left behind at once,
        // they would only flash past the camera)
        VEL.copy(Z).multiplyScalar(r.sp * (0.86 + Math.random() * 0.08)).addScaledVector(f.u, (0.1 + Math.random() * 0.35) * U)
        VEL.x += (Math.random() - 0.5) * 0.5 * U; VEL.y += (Math.random() - 0.5) * 0.3 * U; VEL.z += (Math.random() - 0.5) * 0.5 * U
        emblems.spawn(r.particle, WIND, VEL, FLAME_COLORS[r.model], (0.056 + Math.random() * 0.032) * U, 0.8 + Math.random() * 0.5)
      }
      // the air streaming round it, at speed (you, and a few close to the camera)
      if (r.alive && !r.air && (r === me || (airNear < 5 && POS.distanceToSquared(camera.position) < 2.4))) {
        const k = THREE.MathUtils.clamp((r.sp / r.vmax - 0.2) / 0.8, 0, 1) * (r.boostT > 0 ? 1.35 : 1)
        if (r !== me) airNear++
        air.add(M, model.geometry.boundingBox, SCALE, k, shared.uTime.value, i)
      }
      // the nitro: bright shock diamonds in the jet and a plasma trail behind it
      if (r.boostT > 0 && r.alive && (r === me || (i % 2 === frames % 2 && POS.distanceToSquared(camera.position) < 64))) {
        const t = shared.uTime.value
        X.crossVectors(Y, Z).normalize()
        for (let d = 1; d <= 3; d++) fx.spawn(WIND.copy(REAR).addScaledVector(Z, -0.055 * U * d * (1 + 0.25 * Math.sin(t * 45 + d * 2))), ZERO, d % 2 ? NITRO_A : NITRO_W, 0.035, (0.05 - d * 0.009) * U, 0, 0)
        for (let k = 0; k < (r === me ? 4 : 1); k++) {
          WIND.copy(REAR).addScaledVector(X, (Math.random() - 0.5) * 0.07 * U).addScaledVector(Y, (Math.random() - 0.5) * 0.05 * U)
          fx.spawn(WIND, VEL.copy(Z).multiplyScalar((-0.6 - Math.random() * 1.2) * U), Math.random() < 0.6 ? NITRO_A : NITRO_W, 0.25 + Math.random() * 0.25, (0.02 + Math.random() * 0.02) * U, 2.5, 0)
        }
      }
      // your drift leaves two glowing streaks on the road from the tail's corners, swung round with the body
      if (r === me) {
        const sliding = r.drift !== 0 && r.alive && !r.air
        if (sliding || marksOn) {
          QD.setFromAxisAngle(f.u, -r.driftVis)
          BZ.copy(Z).applyQuaternion(QD); BX.crossVectors(f.u, BZ).normalize()
          const c = sliding ? MARK_COLORS[driftTier(r)] : MARK_COLORS[0]
          for (let k = 0; k < 2; k++) {
            WIND.copy(ROAD).addScaledVector(BZ, -0.075 * U).addScaledVector(BX, (k ? 1 : -1) * r.halfWidth * 0.75).addScaledVector(f.u, 0.004 * U)
            VEL.copy(BX).multiplyScalar(0.009 * U)
            if (sliding && !marksOn) marks.add(k, WIND, VEL, c, false, p0.time)
            marks.add(k, WIND, VEL, c, sliding, p0.time)
          }
          marksOn = sliding
        }
      }
      // drifting: sparks off both sides of the tail, their colour the turbo it has earned
      if (r.drift && r.alive && (r === me || i % 2 === frames % 2)) {
        const tier = driftTier(r)
        SIDE.crossVectors(Z, f.u).normalize()
        for (const sgn of [-1, 1]) {
          const p = ROAD.clone().addScaledVector(Z, -0.1 * U).addScaledVector(SIDE, sgn * r.halfWidth * 0.9).addScaledVector(f.u, 0.02 * U)
          fx.sparks(p, Z.clone().multiplyScalar(-1).addScaledVector(f.u, 0.6).addScaledVector(SIDE, -r.drift * 0.5), DRIFT_COLORS[tier], r === me ? 2 + tier * 2 : tier ? 2 : 1, (1.3 + tier * 0.2) * U, 0.5)
        }
      }
      // in the pit: bubbles of light rise off the machine as its energy comes back
      if (r.inPit && r.alive && (r === me || frames % 3 === i % 3)) {
        WIND.copy(POS).addScaledVector(X, (Math.random() - 0.5) * r.halfWidth * 2).addScaledVector(Z, (Math.random() - 0.5) * 0.25 * U)
        fx.spawn(WIND, VEL.copy(f.u).multiplyScalar((0.5 + Math.random() * 0.6) * U), Math.random() < 0.5 ? HEAL_A : HEAL_B, 0.5, 0.025 * U, 1, -0.3 * U)
      }
    })
    for (let i = race.racers.length; i < N; i++) { fleet.fx.set(i, FR.p, FR.f, FR.u, FR.p, 0, col, false); fleet.fx.setFlames(i, M, null, 0, col, false); healK[i] = 0 }
    air.commit()
    fleet.commit()
    fleet.fx.commit()
  }
  const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Y = new THREE.Vector3(0, 1, 0), AXIS_Z = new THREE.Vector3(0, 0, 1)
  const WIND = new THREE.Vector3(), VEL = new THREE.Vector3(), CAMF = new THREE.Vector3(), CAMR = new THREE.Vector3()
  const HEAL_A = new THREE.Color(0.3, 2.2, 1.5), HEAL_B = new THREE.Color(1.8, 0.5, 1.8), AIR = new THREE.Color(0.35, 0.5, 0.7)
  const NITRO_A = new THREE.Color(2.4, 0.5, 2.0), NITRO_W = new THREE.Color(2.2, 2.0, 2.4), ZERO = new THREE.Vector3()
  const healK = new Float32Array(N)
  const FLAME_COLORS = models.map(m => new THREE.Color(m.flame))
  const FIRE = new THREE.Color(2.2, 0.8, 0.15), SMOKE = new THREE.Color(0.12, 0.1, 0.14)
  const QD = new THREE.Quaternion(), BZ = new THREE.Vector3(), BX = new THREE.Vector3()
  const MARK_COLORS = [new THREE.Color(0.25, 0.9, 1.6), new THREE.Color(0.3, 0.8, 2.2), new THREE.Color(2.2, 0.9, 0.2), new THREE.Color(2.2, 0.35, 1.9)]

  let megaPulse = 0
  /** Speed you can feel: dust and air rushing past the camera, the lines, the edges, the pit's refill. */
  function feelSpeed(dt) {
    const racing = (state === 'race' || state === 'countdown') && me && me.alive && !resultsShown
    const k = racing ? me.sp / me.vmax * (1 + me.flow * 0.3) : 0
    const boost = racing && (me.boostT > 0 || me.dashT > 0 || me.turbo > 0)
    const mega = racing && me.boostT > 0 && me.boostStack >= 3
    const tint = !racing ? null : mega ? [0xffffff, 0xff6fe0, 0x7fe8ff][Math.floor(shared.uTime.value * 12) % 3] : me.boostT > 0 ? 0xff8ae6 : me.dashT > 0 ? 0x8fe9ff : me.turbo > 0 ? DRIFT_COLORS[1] : 0xd8f4ff
    screen.update(dt, shared.uTime.value, k, boost, tint, racing, racing && me.boostT > 0, mega)
    if (racing && me.boostT > 0) cams.shake = Math.max(cams.shake, mega ? 0.38 : 0.12)
    if (mega) {
      cams.kick = Math.max(cams.kick, 12)
      // the edges flash in turn, and the tail throws sparks and a ring of light every few metres
      megaPulse -= dt
      if (megaPulse <= 0) {
        megaPulse = 0.22
        screen.flash([0xff2bd6, 0x29d3ff, 0xffd66b][Math.floor(shared.uTime.value * 4.5) % 3], 0.55)
        const fr = cams.racerFrame(me)
        fx.ring(fr.p.clone().addScaledVector(fr.f, -0.3 * U), fr.f, 0xffffff, 0.8 * U, 0.3)
      }
      const fr = cams.racerFrame(me)
      fx.sparks(fr.p.clone().addScaledVector(fr.f, -0.2 * U), fr.f.clone().multiplyScalar(-1), Math.random() < 0.5 ? 0xffffff : 0xff6fe0, 3, 3.5 * U, 0.35)
    }
    audio.loop('wind', racing && k > 0.55, Math.min(1, (k - 0.45) * 0.9 + (boost ? 0.3 : 0)))
    audio.loop('drift', racing && me.drift !== 0, 0.45)
    if (!racing) return
    // specks of dust and air in front of the camera: standing still in the world, so the camera's speed
    // streams them past
    camera.getWorldDirection(CAMF)
    CAMR.crossVectors(CAMF, camera.up).normalize()
    const n = k > 0.5 ? Math.round((k - 0.4) * 6 + (boost ? 3 : 0)) : 0
    for (let j = 0; j < n; j++) {
      const side = (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.7) * U
      WIND.copy(camera.position).addScaledVector(CAMF, (0.8 + Math.random() * 2.2) * U).addScaledVector(CAMR, side).addScaledVector(camera.up, (Math.random() - 0.4) * 0.7 * U)
      VEL.copy(CAMF).multiplyScalar(-me.sp * 0.25)
      fx.spawn(WIND, VEL, AIR, 0.4, (0.008 + Math.random() * 0.008) * U, 0, 0)
    }
    // a pipe or a drum ending: which way the exit is
    const ex = track.exitAt(track.index(me.D))
    if (ex && ex.dist < 18 && !me.air && p0.time - exitHintAt > 0.45) {
      let d = ex.x - me.x
      if (track.isFull(track.index(me.D))) d = track.wrapX(track.index(me.D), d)
      if (Math.abs(d) > 0.45) { exitHintAt = p0.time; hud.note(d > 0 ? 'EXIT  >>>' : '<<<  EXIT', 0.5, 'gold') }
    }
    // a heal strip: the refill ticks up, "tu-tu-tu-tu", higher as the energy comes back
    if (me.inPit && me.energy < 100 && p0.time - healAt > 0.075) {
      healAt = p0.time
      audio.sfx('heal_tick', { volume: 0.5, rate: 0.75 + me.energy / 100 * 0.95, gap: 0.06 })
      screen.flash(0x29ffd0, 0.25)
    }
  }

  // ---- input
  const keys = p0.input
  let steer = 0
  function releaseMouse() { if (keys.pointer.locked) keys.unlockPointer() }
  const taps = { KeyQ: -9, KeyE: -9 }
  let quitArmed = 0
  p0.on('keydown', e => {
    audio.unlock()
    if (e.repeat) return
    if (state === 'waiting') { startIntro(); return }
    if (state === 'intro') { toTitle(); return }
    if (menus?.screen && (state === 'title' || state === 'menu' || state === 'results')) {
      if (menus.move(e.code)) { if (state === 'title' && menus.screen !== 'title') state = 'menu'; return }
    }
    if (state === 'race' && me) {
      const inp = me.input
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyX') inp.boost = true
      if (e.code === 'KeyF' || e.code === 'KeyR') inp.spin = true
      if (e.code === 'KeyQ' || e.code === 'KeyE') {
        if (p0.time - taps[e.code] < 0.28) { if (e.code === 'KeyQ') inp.sideL = true; else inp.sideR = true }
        taps[e.code] = p0.time
      }
      if (e.code === 'KeyC') cams.far = !cams.far
      if (e.code === 'Backspace') {
        if (p0.time - quitArmed < 2) { if (online.race) online.done(); toMenu() }
        else { quitArmed = p0.time; hud.note('BACKSPACE AGAIN TO QUIT THE RACE', 2, 'red') }
      }
    }
    if (state === 'countdown' && me && (e.code === 'KeyW' || e.code === 'ArrowUp')) launchPress = race.time
    if (state === 'race' && me && !startJudged && (e.code === 'KeyW' || e.code === 'ArrowUp') && race.time < 0.15) judgeStart(-race.time)
  })
  p0.on('pointerdown', e => {
    audio.unlock()
    if (state === 'race') return
    if (state === 'waiting') startIntro()
    else if (state === 'intro') toTitle()
    else if (menus?.screen && (state === 'title' || state === 'menu' || state === 'results')) {
      // a click chooses what is under it (a card, a machine, a button), never just "Enter"
      menus.pointerDown(e.x, e.y)
      if (state === 'title' && menus.screen !== 'title') state = 'menu'
    }
  })
  p0.on('pointermove', e => {
    if (menus?.screen && (state === 'title' || state === 'menu' || state === 'results')) menus.pointerMove(e.x, e.y, e.buttons)
  })
  function readControls(dt) {
    if (!me || !me.alive || me.finished || me.ai) return
    const k = keys.keys
    const inp = me.input
    inp.throttle = k.has('KeyW') || k.has('ArrowUp')
    inp.brake = k.has('KeyS') || k.has('ArrowDown')
    inp.nose = inp.brake ? 1 : 0
    const want = ((k.has('KeyD') || k.has('ArrowRight')) ? 1 : 0) - ((k.has('KeyA') || k.has('ArrowLeft')) ? 1 : 0)
    // the key turns a virtual wheel: about a tenth of a second to full lock, faster back to the middle
    steer += (want - steer) * Math.min(1, dt * (want === 0 || want * steer < 0 ? 16 : 8))
    inp.steer = steer
    inp.leanL = k.has('KeyQ')
    inp.leanR = k.has('KeyE')
    inp.drift = k.has('Space')
    inp.boostHeld = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyX')
  }

  // ---- the flow: waiting -> intro -> title -> menus -> prerace -> countdown -> race -> results
  let introClock = 0
  let launchPress = -99
  let startJudged = true
  function startIntro() {
    state = 'intro'
    stateT = 0
    introClock = 0
    audio.music('title', { volume: 0.85, at: 0, loop: true })
    newRace({ mode: 'gp', cls: 1, course: 0 }, true)
    race.started = false
    menus.hideAll()
    hud.show(false)
    director.play([
      { kind: 'side', dur: LAUNCH, s: 3, x: 1.9, h: 0.35, ahead: 1.2, fov: 60 },
      { kind: 'side', dur: SLAM - LAUNCH + 0.9, s: 10, x: -1.8, h: 0.1, fov: 52 },
      { kind: 'ride', dur: 3.2, racer: 'leader' },
      { kind: 'orbit', dur: 999, a: 0.9, h: 24, spin: 0.07, lookY: 9, fov: 62 },
    ], false)
  }
  function toTitle() {
    state = 'title'
    stateT = 0
    if (!race || race.racers.some(r => r.human) || !race.started) { newRace({ mode: 'gp', cls: 1, course: 0 }, true); race.started = true }
    hud.show(false)
    menus.open('title')
    menus.logoIn(1)
    audio.music('title', { volume: 0.8 })
    playAttract()
    p0.hud(`${CONTROLS}${audio.ready ? '' : '\nClick or press any key for sound'}`)
  }
  function playAttract() {
    director.play([
      { kind: 'orbit', dur: 9, a: 0.9, h: 24, spin: 0.07, lookY: 9, fov: 62 },
      { kind: 'side', dur: 4, s: 10, x: -1.8, h: 0.1, fov: 52 },
      { kind: 'ride', dur: 6, racer: 'leader' },
      { kind: 'side', dur: 4, s: 160, x: -2.0, h: 0.55, ahead: 6, fov: 70 },
      { kind: 'crane', dur: 7, a: 2.4, h: 18, spin: -0.08, follow: true },
      { kind: 'ride', dur: 6, racer: 'leader', far: true },
      { kind: 'side', dur: 4, s: 236, x: 2.1, h: 0.17, fov: 58 },
    ], true)
  }
  function quietLoops() { audio.loop('wind', false); audio.loop('drift', false) }
  function toMenu() {
    releaseMouse()
    quietLoops()
    if (online.race || online.isMember) online.leave()
    state = 'menu'
    newRace({ mode: 'gp', cls: 1, course: config?.course ?? 0 }, true)
    race.started = true
    playAttract()
    hud.show(false)
    audio.engine(false)
    audio.music('title', { volume: 0.7 })
    menus.open('mode')
  }
  /** The cup starts on its first course (the field kept for all three); Time Attack at once. (An online race starts
   * from its lobby: see the online hooks below.) */
  function startRace(cfg) {
    if (cfg.mode === 'gp') {
      // the cup the chosen course belongs to, from its first course
      const def = CUPS.find(c => c.courses.includes(cfg.course) && c.courses.every(k => k < courses.length)) ?? CUPS[0]
      cfg = { ...cfg, course: def.courses[0], cup: { k: 0, index: CUPS.indexOf(def), name: def.name, courses: def.courses, defs: fieldDefs({ machine: cfg.machine }), points: {}, total: 0, all: true } }
    } else cfg = { ...cfg, cup: null }
    startLocal(cfg)
  }

  /** This race's points by place so far (those still racing by where they are; out of it, none). */
  function racePoints() {
    const pts = {}
    for (const r of race.ranked) pts[r.name] = r.retired ? 0 : POINTS[r.rank - 1] ?? 0
    return pts
  }

  /** The cup's table: the points of the races before this one, and this one's so far. */
  function cupTable() {
    const cup = config.cup, now = racePoints(), all = {}
    for (const name of new Set([...Object.keys(cup.points), ...Object.keys(now)])) all[name] = (cup.points[name] ?? 0) + (now[name] ?? 0)
    return Object.entries(all).sort((a, b) => b[1] - a[1])
  }

  /** The cup's next race (this one's points are kept as they stand now). */
  function nextCupRace() {
    const cup = config.cup
    const now = racePoints()
    for (const name in now) cup.points[name] = (cup.points[name] ?? 0) + now[name]
    cup.k++
    startLocal({ ...config, course: cup.courses[cup.k] })
  }

  /** The field is set with you in it: everyone's race starts on the session's clock (the machines the others
   * brought of their own load first, inside the sweep down the grid). */
  async function startOnline(L) {
    for (const f of L.field) {
      if (f.m !== -1 || entityPilots.has(f.pid)) continue
      try {
        const p = await entityMachine(await p0.entities?.of?.(f.pid), f.pid, false)
        if (p) { fleet.addModel(models[p.model]); FLAME_COLORS.push(new THREE.Color(p.flame)) }
      } catch (err) { p0.log(`a player's machine did not load: ${err.message}`) }
    }
    const cfg = { mode: 'online', cls: L.c, course: L.co ?? 0, machine: menus.sel.machine, engine: menus.sel.engine, online: L }
    startLocal(cfg)
    online.begin(L, race.racers, me)
    hud.note(`ONLINE · ${L.field.length} PLAYER${L.field.length > 1 ? 'S' : ''}`, 3, 'pink')
  }

  /** Back to the lobby after an online race (or to the online screen if it has gone). */
  function backToLobby() {
    quietLoops()
    state = 'menu'
    newRace({ mode: 'gp', cls: 1, course: config?.course ?? 0 }, true)
    race.started = true
    playAttract()
    hud.show(false)
    audio.engine(false)
    audio.music('title', { volume: 0.7 })
    menus.open(online.isMember && online.lobby ? 'lobby' : 'online')
  }

  function startLocal(cfg) {
    newRace(cfg)
    state = 'prerace'
    stateT = 0
    launchPress = -99
    hud.startLights(0)
    hud.lightsOn = true
    menus.hideAll()
    hud.show(true)
    const what = cfg.cup ? `${cfg.cup.name}  RACE ${cfg.cup.k + 1}/3` : cfg.online ? 'ONLINE RACE' : MODE_NAME[cfg.mode]
    hud.say(track.name, 3.6, 'cyan', `${what} · ${cfg.mode === 'ta' ? 'ALONE' : CLASSES[cfg.cls].name} · ${race.laps} LAPS`)
    audio.stopMusic()
    audio.voice('ready')
    audio.sfx('crowd', { volume: 0.5 })
    director.play([{ kind: 'grid', dur: cfg.online ? SHOW - 3 : 3.8, racer: race.racers.indexOf(me) }], false)
    p0.hud(CONTROLS)
    hud.note('SPACE + STEER: DRIFT  ·  SHIFT: NITRO, HOLD FOR MORE', 3.5, 'pink')
  }
  function showResults() {
    releaseMouse()
    quietLoops()
    if (online.race) { online.done(); online.race = null }
    resultsShown = true
    state = 'results'
    const key = `${config.mode === 'ta' ? 'ta' : 'race'}:${config.course}`
    const wasOnline = !!config.online
    let record = false
    if (me.finished) {
      if (!(menus.best[key] <= me.finishTime)) { record = menus.best[key] != null; menus.best[key] = me.finishTime }
      if (wasOnline && me.rank === 1) p0.win()
      if (record) audio.voice('record')
    }
    // the cup: points by place; after the third race, the cup's winner and your total time for the week's table
    const cup = config.cup
    if (cup) {
      if (me.finished && me.finishTime > 0) cup.total += me.finishTime; else cup.all = false
      if (cup.k === 2) {
        if (cupTable()[0][0] === me.name) p0.win()
        // the week's table is the ZER0-G Cup's (one table: the other cups' times would not compare)
        if (cup.all && cup.index === 0) p0.score(Math.round(cup.total * 1000))
      }
    }
    hud.show(false)
    resultsRecord = record
    menus.open('results', results())
    audio.engine(false)
    audio.music('title', { volume: 0.7 })
    director.play([{ kind: 'ride', dur: 999, racer: race.racers.indexOf(me) >= 0 && me.alive ? race.racers.indexOf(me) : 'leader', far: true }], false)
  }
  let resultsRecord = false
  const results = () => ({
    me, record: resultsRecord, online: !!config.online,
    standings: race.ranked.map(r => ({ name: r.name, finished: r.finished, retired: r.retired, time: r.finishTime, me: r === me, human: r.human })),
    cup: config.cup ? {
      k: config.cup.k, last: config.cup.k === 2, total: config.cup.all ? config.cup.total : null, next: config.cup.k < 2 ? courses[config.cup.courses[config.cup.k + 1]].name : null, name: config.cup.name, weekly: config.cup.index === 0,
      table: cupTable().map(([name, pts]) => ({ name, pts, me: name === me.name })),
      // every racer's cup points before this race and what this one adds (the standings screen animates them)
      rows: (() => { const now = racePoints(); return race.racers.map(r => ({ name: r.name, face: r.face, accent: r.accent, human: r.human, me: r === me, before: config.cup.points[r.name] ?? 0, add: now[r.name] ?? 0 })) })(),
      all: config.cup.all,
    } : null,
  })
  p0.on('table', top => menus?.setTable(top))

  menus = new Menus({
    faces: portraits,
    overlay, font, thin, logo: pictures.logo, icons: [pictures.icon_gp, null, pictures.icon_ta], portraits, showroom, audio, tracks: courses,
    onStart: cfg => startRace(cfg),
    onNext: () => nextCupRace(),
    onLobby: () => backToLobby(),
    entityHint,
    own: ownMachine, ownEntity,
    gallery: { entries: galleryEntries, pilot: galleryPilot, like: galleryLike, get canLike() { return gallery.canLike } },
    onBack: () => toMenu(),
  })
  if (p0.table) menus.setTable(p0.table)
  const online = new Online(p0)
  menus.online = online
  // the online hooks: the owner started it (pick a machine), the field is set (race), the lobby went away
  online.onPick = () => { if (state === 'menu' || state === 'title' || state === 'results') { state = 'menu'; menus.pickOnline() } }
  // the field is set with you in it: begin (once: it answers whether it did)
  online.onRace = L => {
    if (!(state === 'menu' || state === 'title' || state === 'results')) return false
    startOnline(L).catch(err => { online.starting = false; p0.log(`the online race did not start: ${err.message}`) })
    return true
  }
  online.onOpen = () => { if (state === 'menu' && (menus.screen === 'machine' || menus.screen === 'online')) menus.open('lobby') }
  online.onGone = () => { if (state === 'menu' && (menus.screen === 'lobby' || menus.screen === 'machine')) { menus.flash = 'THE LOBBY CLOSED'; menus.open('online') } }
  p0.on('reward', r => { if (r.kind === 'score' && r.ok) { menus.weekly = { best: r.best, place: r.place }; menus.redraw() } })

  // ---- warm-up: every kind of material drawn once on its own, so no frame stalls on a shader
  p0.hud('ZER0-G\nWarming up the engines...')
  newRace({ mode: 'gp', cls: 1, course: 0 }, true)
  race.started = true
  for (let k = 0; k < 120; k++) race.step(DT)
  drawRacers(DT)
  cams.chase(race.racers[0], DT, false)
  const kinds = root => {
    const map = new Map()
    root.traverse(o => {
      if (!(o.isMesh || o.isPoints) || !o.visible) return
      const m = o.material
      const key = [m.type, m.fragmentShader?.length ?? 0, m.vertexShader?.length ?? 0, m.transparent, m.side, !!o.isInstancedMesh, !!m.map].join('|')
      if (!map.has(key)) map.set(key, [o.name || m.type, [o]])
    })
    return [...map.values()]
  }
  for (let k = 1; k < courses.length; k++) { courses[k].group.visible = true; cities[k].group.visible = true }
  const slowest = await warmUp(renderer, scene, camera, kinds(scene), text => p0.log(text))
  for (let k = 1; k < courses.length; k++) { courses[k].group.visible = false; cities[k].group.visible = false }
  await warmUp(renderer, showroom.scene, showroom.camera, kinds(showroom.scene), text => p0.log(text))
  menus.setThumbs(await showroom.thumbnails(renderer))
  showroom.show(0)
  lite = slowest > 400                     // a software renderer takes seconds; a GPU's first compile of the road, up to ~200 ms
  // the course cards' pictures: each course's signature stretch on its own
  menus.setHeroes(renderHeroes(renderer, scene, courses, { bloom: !lite }))
  await warmSteps([
    ['bloom', () => { composer.setSize(64, 36); composer.render(0.016); composer.setSize(p0.width, p0.height) }],
    ['overlay', () => { hud.show(true); hud.update(DT, race, race.racers[0]); overlay.render(renderer); hud.show(false) }],
    ['screen fx', () => { screen.mesh.visible = true; screen.pass.enabled = true; composer.render(0.016); overlay.render(renderer); screen.mesh.visible = false; screen.pass.enabled = false }],
    ['first frame', () => composer.render(0.016)],
  ], text => p0.log(text))
  if (lite) goLite('slow shaders')
  started = true
  p0.log(`warm-up: slowest shader ${Math.round(slowest)} ms${lite ? ', light version' : ''}`)

  function goLite(why) {
    lite = true
    bloom.enabled = false
    screen.lite = true
    // a software renderer: no multisampling, half the pixels, the machines in a plain material (thirty PBR
    // machines were most of its frame), compiled now rather than in a frame. Found slow later, in a race, it
    // keeps its materials: a compile then could freeze it past the sandbox's 3 s
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) { rt.samples = 0; rt.dispose() }
    composer.setPixelRatio(Math.min(1, p0.pixelRatio) * 0.5)
    composer.setSize(p0.width, p0.height)
    if (!started) { fleet.setLite(); renderer.compile(scene, camera) }
    cities.forEach(c => { c.crowd && (c.group.getObjectByName('crowd').visible = false); c.group.getObjectByName('traffic').visible = false })
    p0.log(`light version (${why})`)
  }

  // the local test page can look inside (never set in the game)
  p0.debugHooks?.({ heroes: views => menus.setHeroes(renderHeroes(renderer, scene, courses, { bloom: !lite, views })), scene, composer, renderer, camera, cities, courses, fleet, fx, overlay, goLite: why => goLite(why), get lite() { return lite }, get race() { return race }, get me() { return me }, menus, online, cams })

  // ---- start: the title music if sound is allowed already, else wait for a key
  state = 'waiting'
  newRace({ mode: 'gp', cls: 1, course: 0 }, true)
  race.started = true
  director.play([{ kind: 'orbit', dur: 999, a: 0.9, h: 18, spin: 0.05, lookY: 8, fov: 60 }], false)
  menus.prompt.update('any', 'PRESS ANY KEY')
  menus.prompt.show(true)
  audio.music('title', { volume: 0.8, at: 0 })
  p0.hud('ZER0-G\nPress any key')

  // ---- the frame
  p0.loop(dt => {
    dt = Math.min(dt, 0.1)
    stateT += dt
    shared.uTime.value += dt
    shared.uPx.value = composer.renderTarget1.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
    screen.setSize(composer.renderTarget1.width, composer.renderTarget1.height)
    frames++
    if (state === 'waiting') {
      // sound already allowed: the intro starts on its own
      if (p0.music.playing && p0.music.time > 0.05) startIntro()
      else menus.prompt.show(Math.floor(stateT * 1.6) % 2 === 0)
    }
    if (state === 'intro') {
      // the intro's clock is the music's when it plays
      introClock = p0.music.playing ? p0.music.time : introClock + dt
      if (introClock >= LAUNCH && !race.started) { race.started = true; audio.sfx('beep_go', { volume: 0.5 }) }
      if (introClock >= SLAM && !menus.screen) {
        menus.open('title')
        audio.voice('title')
        cams.shake = 0.6
        fx.ring(new THREE.Vector3(0, 12, 0), new THREE.Vector3(0, 0, 1), 0x29d3ff, 30, 0.8)
      }
      if (menus.screen === 'title') {
        const k = Math.min(1, (introClock - SLAM) / 0.35)
        menus.logoIn(k)
        if (introClock > SLAM + 1.2) { state = 'title'; p0.hud(`${CONTROLS}${audio.ready ? '' : '\nClick or press any key for sound'}`) }
      }
    }
    if (state === 'title' || state === 'intro') {
      // the attract race never ends: crashed machines come back
      for (const r of race.racers) if (!r.alive && !r.falling) { const lead = race.ranked[0]; fallen.delete(r); r.reset(lead.D - 30 - Math.random() * 40, 0) }
    }

    // ---- the race clock (an online race's runs on the session's ticks, the same for everyone)
    online.update()
    const onlineT = online.race ? (online.now - online.race.lobby.start) / TPS : null
    if (state === 'menu' && frames % 10 === 0 && (menus.screen === 'lobby' || menus.screen === 'online' || menus.onlinePick)) menus.redraw()
    if (onlineT !== null && state === 'prerace') stateT = onlineT + SHOW
    if (state === 'prerace' && (onlineT !== null ? onlineT >= -3 : stateT > 3.8)) { state = 'countdown'; stateT = 0; cdShown = -1 }
    if (onlineT !== null && state === 'countdown') stateT = onlineT + 3
    if (state === 'countdown') countdown()
    // an online race keeps its clock on the session's (a slow screen's own steps fall behind; everyone's lap and
    // finish times are on the one clock)
    if (onlineT !== null && state === 'race' && race.started && Math.abs(race.time - onlineT) > 0.05) race.time = Math.max(0, onlineT)
    // the big lamp's flare after GO, then the lights go
    if (state === 'race' && stateT < 1.4) hud.startLights(3, true, 1 - stateT / 1.4)
    else if (hud.lightsOn && state === 'prerace') hud.startLights(0)
    else if (hud.lightsOn && state !== 'countdown') { hud.startLights(null); hud.lightsOn = false }
    readControls(dt)
    accum += dt
    while (accum >= DT) { race.step(DT); accum -= DT }
    if (online.race) { online.steer(dt); online.send() }
    if (state === 'race' && me) {
      if ((me.finished || me.retired) && !resultsShown) {
        if (!endT) endT = p0.time
        if (p0.time - endT > (me.finished ? 4 : 3)) { endT = 0; showResults() }
      }
      audio.engine(me.alive && !me.finished, me.sp / me.vmax)
    }

    // ---- camera
    // your machine blown apart: the camera backs off and up to watch it burn, until the spare comes out
    const wk = me && wrecks.get(me)
    if (state === 'race' && me && !resultsShown && wk && (me.wreckT > 0 || !me.alive)) cams.watch(wk.from, wk.p, dt, 64, 3)
    else if (state === 'race' && me && !resultsShown) cams.chase(me, dt, me.boostT > 0 || me.dashT > 0)
    else if (state === 'countdown' && me) cams.chase(me, dt, false)
    else director.update(dt)

    // ---- the picture
    drawRacers(dt)
    city.update(dt, camera)
    city.animate(shared.uTime.value)
    city.crowd.uniforms.uCheer.value = state === 'countdown' || (me?.finished ?? false) ? 1 : 0.2
    feelSpeed(dt)
    fx.update(dt)
    emblems.update(dt)
    marks.update(p0.time)
    fx.setScale(p0.height * p0.pixelRatio, camera.fov)
    if (state === 'race' || state === 'countdown' || state === 'prerace') { if (me) hud.update(dt, race, me) }
    menus.update(dt)

    const t0 = performance.now()
    renderer.autoClear = true
    composer.render(dt)
    overlay.render(renderer)
    menus.renderShowroom(renderer)
    const took = performance.now() - t0
    if (!lite && frames > 30 && frames < 200 && took > 250) goLite(`${Math.round(took)} ms a frame`)
    slow = dt > 0.05 ? slow + dt : Math.max(0, slow - dt * 0.5)
    if (!lite && slow > 4) goLite('slow frames')
    p0.me.position.copy(me ? cams.racerFrame(me).p : camera.position)

    // the standings fill in while the others finish
    if (state === 'results' && frames % 30 === 0) { menus.data = results(); menus.dataKey = race.ranked.filter(r => r.finished || r.retired).length; menus.redraw() }
    if (state === 'race' && Math.floor(p0.time) !== lastHud && !audio.ready) { lastHud = Math.floor(p0.time); p0.hud(`${CONTROLS}\nClick or press any key for sound`) }
  })

  /**
   * The rocket start: the gas pressed right on GO. gap: seconds from the press to GO (before: positive). Within
   * 0.12 s either side a PERFECT START (away at most of top speed, a nitro's flames), up to 0.4 s before a GOOD one;
   * 0.4 to 1 s early, nothing (and you are told).
   */
  function judgeStart(gap) {
    if (!me || startJudged) return
    startJudged = true
    const f = cams.racerFrame(me), tail = f.p.clone().addScaledVector(f.f, -0.17 * U)
    if (gap >= -0.12 && gap <= 0.12) {
      me.sp = me.vmax * 0.85; me.boostT = 1.6; me.boostStack = Math.max(1, me.boostStack)
      hud.note('PERFECT START!', 1.6, 'gold')
      audio.sfx('nitro_go', { volume: 1 }); audio.sfx('boost', { volume: 0.9, rate: 1.2 }); audio.voice('start')
      fx.ring(tail, f.f, 0xffffff, 1.2 * U, 0.45); fx.ring(tail, f.f, 0xffd66b, 1.8 * U, 0.55); fx.ring(f.p, f.u, 0xff8a30, 2.2 * U, 0.5)
      fx.sparks(tail, f.f.clone().multiplyScalar(-1), 0xffd66b, 30, 4 * U, 0.6)
      cams.shake = 1; cams.kick = 26; cams.surge = 2; screen.flash(0xffd66b, 0.9)
    } else if (gap > 0.12 && gap <= 0.4) {
      me.sp = me.vmax * 0.55; me.boostT = 0.8; me.boostStack = Math.max(1, me.boostStack)
      hud.note('GOOD START!', 1.3, 'gold')
      audio.sfx('boost', { volume: 0.8 })
      fx.ring(tail, f.f, 0xffd66b, 1.1 * U, 0.4)
      cams.kick = 14; screen.flash(0xffd66b, 0.5)
    } else if (gap > 0.4 && gap <= 1.0) hud.note('TOO EARLY: HIT THE GAS ON GO', 1.4, 'red')
  }

  function countdown() {
    // the lights, one a second (3, 2, 1), then the big one for GO
    const n = Math.floor(stateT)
    if (n !== cdShown) {
      cdShown = n
      if (n < 3) {
        hud.startLights(n + 1)
        audio.sfx('beep', { volume: 0.8 }); audio.voice(['three', 'two', 'one'][n])
        if (n === 0) hud.note('HIT THE GAS RIGHT ON GO: A ROCKET START', 2.6, 'gold')
      } else {
        hud.startLights(3, true, 1)
        hud.say('GO!!', 1.2, 'gold')
        audio.sfx('beep_go', { volume: 0.9 })
        audio.voice('go')
        state = 'race'
        stateT = 0
        race.time = online.race ? Math.max(0, (online.now - online.race.lobby.start) / TPS) : 0
        race.started = true
        raceMusic = (raceMusic + 1) % RACE_MUSIC.length
        audio.music(RACE_MUSIC[raceMusic], { volume: 0.75, at: 0 })
        // pressed before GO: judged now (a press just after GO is judged when it comes)
        startJudged = false
        if (launchPress > -1.5) judgeStart(race.time - launchPress)
      }
    }
    // the clock counts up to GO: race.time runs from -3 to 0 here (only until GO: set again on the GO frame it
    // started every race 3 s behind, and every finish and cup time came out 3 s short)
    if (state === 'countdown') race.time = stateT - 3
  }
}
