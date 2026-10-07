// A stand-in for Project 0's sandbox (the p0 object) on a plain page, for quick checks of the experience
// with Playwright. Not the real thing: no worker, no review, sound only logged. Verify in prod after.
import * as THREE from 'three'
import start from '../../experience/main.js'

const params = new URLSearchParams(location.search)
const DPR = Number(params.get('dpr') ?? 1)
const canvas = document.querySelector('canvas')
const hudEl = document.getElementById('hud')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(DPR)
renderer.setSize(innerWidth, innerHeight, false)
const scene = new THREE.Scene()
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1))
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500)
const listeners = new Map()
const emit = (ev, ...a) => { for (const f of listeners.get(ev) ?? []) { try { f(...a) } catch (e) { console.error('[p0 error]', e.message, e.stack) } } }
const keys = new Set()
const loops = []
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
let unlocked = params.get('audio') === '1'
const music = { name: null, at: 0, startedAt: 0, playing: false }
const p0 = {
  THREE, version: 1,
  lot: { id: 383, width: 32, depth: 44, height: 29, size: 44, name: 'HYPERLANE' },
  me: { id: 1, name: 'Stefan', color: '#29d3ff', avatar: null, position: new THREE.Vector3(), yaw: 0, isMe: true },
  players: new Map(),
  room: { send() {}, sendTo() {}, set() {}, state: {}, input() {}, host: 1, isHost: true, seed: 1, players: [1] },
  scene, camera, renderer, autoRender: true,
  controls: { mode: 'fly', vertical: true, enabled: true, speed: 6, distance: 6, yaw: 0, pitch: 0.25 },
  bodies: { visible: true, get: () => null },
  input: { keys, isDown: c => keys.has(c), pointer: { x: 0, y: 0, buttons: 0, locked: false }, lockPointer() { this.pointer.locked = true }, unlockPointer() { this.pointer.locked = false } },
  on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn) },
  loop(fn) { loops.push(fn) },
  hud(t) { hudEl.textContent = String(t).slice(0, 400) },
  sound: { play(path, o) { if (unlocked) console.log('[sound]', path.split('/').pop(), JSON.stringify(o ?? {})); return Math.random() }, stop() {}, stopAll() {} },
  music: {
    play(path, o = {}) { music.name = path; music.at = o.at ?? 0; music.startedAt = performance.now(); music.playing = unlocked; console.log('[music]', path, unlocked ? 'playing' : 'blocked') },
    stop() { music.name = null; music.playing = false }, volume() {}, seek(t) { music.at = t; music.startedAt = performance.now() },
    get time() { return music.playing ? music.at + (performance.now() - music.startedAt) / 1000 : music.at },
    get playing() { return music.playing }, get duration() { return 120 },
  },
  asset: p => '../../experience/' + p,
  random: mulberry32(12345),
  exit() {}, log: (...a) => console.log('[p0]', ...a),
  get width() { return innerWidth }, get height() { return innerHeight }, get pixelRatio() { return DPR },
  // ?entity=1: this player has a machine of their own (?entity=stefan: the one in entity/stefan/); other players
  // in a shared session have one too
  entities: {
    kind: { game: 'zer0-g', kind: 'machine', title: 'ZER0-G machine', version: 1, budget: 9 },
    hint: 'Ask your AI agent: make me a machine for zer0-g (Project 0)',
    mine() { return sampleMachine(params.get('entity'), p0.me.id) },
    of(id) { return sampleMachine(params.get('entity') ?? '1', id) },
    // the gallery: the copied list with likes kept in localStorage (?guest=1: may not like)
    async list({ sort = 'likes' } = {}) {
      const snap = await fetch(location.origin + '/experience/assets/gallery.json').then(r => r.json()).catch(() => ({ machines: [] }))
      const likes = JSON.parse(localStorage.getItem('p0-likes') ?? '{}')
      const mineIds = JSON.parse(localStorage.getItem(`p0-liked-${p0.me.id}`) ?? '[]')
      const list = snap.machines.map(m => ({ ...m, owner: { name: m.owner }, likes: (m.likes ?? 0) + (likes[m.id] ?? 0), liked: mineIds.includes(m.id) }))
      if (sort === 'likes') list.sort((a, b) => b.likes - a.likes)
      return { entities: list, canLike: params.get('guest') !== '1' }
    },
    async like(id, liked = true) {
      if (params.get('guest') === '1') return { ok: false, reason: 'Sign in to like' }
      const likes = JSON.parse(localStorage.getItem('p0-likes') ?? '{}')
      const key = `p0-liked-${p0.me.id}`, mineIds = JSON.parse(localStorage.getItem(key) ?? '[]')
      const had = mineIds.includes(id)
      if (liked && !had) { mineIds.push(id); likes[id] = (likes[id] ?? 0) + 1 }
      if (!liked && had) { mineIds.splice(mineIds.indexOf(id), 1); likes[id] = (likes[id] ?? 0) - 1 }
      localStorage.setItem('p0-likes', JSON.stringify(likes)); localStorage.setItem(key, JSON.stringify(mineIds))
      return { ok: true, likes: likes[id] ?? 0, liked }
    },
  },
  // ?prize=1: the lot's game pays 50 a win, once a player, 10 winners (the city's prize, round 25);
  // ?prize=taken: the same, and the answer to a win is that this player already won
  time: 0, game: params.get('prize') ? { price: 0, prize: 50, mode: 'win', perPlayer: 'once', winners: 10, places: 3, lowWins: false, minSeconds: 60, paid: 0 } : null,
  table: null, debugAutopilot: params.get('auto') === '1',
  // ?env=space|desert: every course in that world (the game reads p0.debugEnv; never set in the game)
  debugEnv: params.get('env') || null, debugHooks: o => { window.__dbg = o },
  win() {
    console.log('[p0] win')
    const pz = params.get('prize')
    if (pz) setTimeout(() => emit('reward', pz === 'taken' ? { kind: 'win', ok: false, tokens: 0, reason: 'You already won the prize here' } : { kind: 'win', ok: true, tokens: 45, reason: null }), 150)
  }, score(n) {
    // the answer as Project 0 gives it: this player's best this week and its place (a stand-in: second)
    console.log('[p0] score', n)
    const best = Math.min(n, Number(localStorage.getItem('p0-best') ?? Infinity)); localStorage.setItem('p0-best', String(best))
    setTimeout(() => emit('reward', { kind: 'score', ok: true, best, place: 2, reason: null }), 300)
  }, items: { give() {} },
}
// ?pid=N: a shared session between tabs of one browser (a BroadcastChannel stands in for the server): the
// state, messages, inputs and 20-a-second ticks (from the lowest id, the host), joins and leaves
function sampleMachine(kind, id) {
  if (!kind) return null
  const base = location.origin
  const entity = data => ({
    id: `e${id}`, game: 'zer0-g', kind: 'machine', name: data.name, data, version: 1, status: 'live', cost: 8, owner: { uid: `u${id}`, name: `Player ${id}` },
    model: kind === 'served' ? 'https://files.project0.city/entities/383/dea065e31f0e3632ebb34688/model.glb' : kind === 'stefan' ? base + '/entity/stefan/model.glb' : base + '/experience/assets/machines/tophat.glb',
    picture: kind === 'stefan' ? base + '/entity/stefan/picture.png' : base + '/experience/assets/ui/pilot_mak.jpg',
  })
  if (kind === 'stefan' || kind === 'served') return fetch(base + '/entity/stefan/entity.json').then(r => r.json()).then(entity)
  return entity({ name: 'TEST HOG', pilot: `PILOT ${id}`, stats: { body: 'C', boost: 'A', grip: 'C' }, weight: 1100, accent: '#ff2bd6', flame: '#ff7ad9', particle: 'snout' })
}
let PID = Number(params.get('pid') ?? 0)
if (PID) {
  const bc = new BroadcastChannel('p0-room-383')
  const room = p0.room
  p0.me.id = PID
  p0.me.name = params.get('name') ?? `Player ${PID}`
  const ids = new Set([PID])
  const sync = () => { room.players = [...ids].sort((a, b) => a - b); const h = room.players[0]; if (room.host !== h) { room.host = h; emit('host', h) } }
  Object.defineProperty(room, 'isHost', { get: () => room.host === PID })
  room.tick = 0
  const xset = (k, v, from) => { if (v === null) delete room.state[k]; else room.state[k] = v; emit('state', k, v, from) }
  room.set = (k, v) => { bc.postMessage({ t: 'set', k, v: v ?? null, from: PID }); xset(k, v ?? null, PID) }
  room.send = d => bc.postMessage({ t: 'msg', d, from: PID })
  room.sendTo = (to, d) => bc.postMessage({ t: 'msg', d, from: PID, to })
  let lastInput = -1e9
  const inputs = {}
  room.input = d => { inputs[PID] = d; lastInput = performance.now(); bc.postMessage({ t: 'input', d, from: PID }) }
  bc.onmessage = e => {
    const m = e.data
    if (m.to && m.to !== PID) return
    if (m.t === 'hello' || m.t === 'here') {
      if (!ids.has(m.from)) { ids.add(m.from); sync(); emit('join', { id: m.from, name: m.name }) }
      if (m.t === 'hello') bc.postMessage({ t: 'here', from: PID, name: p0.me.name, state: room.isHost ? room.state : null, tick: room.tick })
      if (m.state) for (const [k, v] of Object.entries(m.state)) if (!(k in room.state)) xset(k, v, m.from)
      if (m.tick) room.tick = Math.max(room.tick, m.tick)
    } else if (m.t === 'bye') { ids.delete(m.from); sync(); emit('leave', { id: m.from }) }
    else if (m.t === 'set') xset(m.k, m.v, m.from)
    else if (m.t === 'msg') emit('message', m.d, m.from)
    else if (m.t === 'input') { inputs[m.from] = m.d; lastInput = performance.now() }
    else if (m.t === 'tick') { room.tick = m.n; emit('tick', m.n, new Map()) }
    else if (m.t === 'drop') drop(m.restart)
  }
  // a dropped connection (a server update) for everyone in the session: each comes back with a new id into a new
  // session; restart: its state is gone too. window.__drop(restart) from any tab
  const drop = restart => {
    bc.postMessage({ t: 'bye', from: PID })
    PID += 100
    p0.me.id = PID
    ids.clear(); ids.add(PID); sync()
    if (restart) for (const k of Object.keys(room.state)) delete room.state[k]
    setTimeout(() => { bc.postMessage({ t: 'hello', from: PID, name: p0.me.name }); emit('reconnect') }, 300)
  }
  // this player leaves the lot (the server would see the connection close): the others hear it now
  window.__leave = () => bc.postMessage({ t: 'bye', from: PID })
  window.__drop = restart => { bc.postMessage({ t: 'drop', restart: !!restart }); drop(!!restart) }
  setInterval(() => {
    if (!room.isHost || performance.now() - lastInput > 5000) return
    room.tick++
    bc.postMessage({ t: 'tick', n: room.tick })
    emit('tick', room.tick, new Map())
  }, 50)
  addEventListener('beforeunload', () => bc.postMessage({ t: 'bye', from: PID }))
  sync()
  bc.postMessage({ t: 'hello', from: PID, name: p0.me.name })
}

function unlock() { if (!unlocked) { unlocked = true; if (music.name) { music.playing = true; music.startedAt = performance.now() } } }
addEventListener('keydown', e => { keys.add(e.code); emit('keydown', { code: e.code, key: e.key, repeat: e.repeat }); unlock(); e.preventDefault() })
addEventListener('keyup', e => { keys.delete(e.code); emit('keyup', { code: e.code, key: e.key }) })
addEventListener('pointerdown', e => { p0.input.pointer.buttons = e.buttons; emit('pointerdown', { x: e.clientX, y: e.clientY, button: e.button, buttons: e.buttons }); unlock() })
addEventListener('pointerup', e => { p0.input.pointer.buttons = e.buttons; emit('pointerup', { x: e.clientX, y: e.clientY, button: e.button, buttons: e.buttons }) })
addEventListener('pointermove', e => { p0.input.pointer.buttons = e.buttons; emit('pointermove', { x: e.clientX, y: e.clientY, dx: e.movementX, dy: e.movementY, buttons: e.buttons }) })
addEventListener('contextmenu', e => e.preventDefault())
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); emit('resize') })
let last = performance.now()
const tick = () => {
  const now = performance.now()
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  p0.time += dt
  for (const f of loops) { try { f(dt, p0.time) } catch (e) { console.error('[loop error]', e.message, e.stack); } }
  if (p0.autoRender) renderer.render(scene, camera)
  window.__frames = (window.__frames ?? 0) + 1
  requestAnimationFrame(tick)
}
window.__p0 = p0
start(p0).then(() => { console.log('[p0] started'); window.__started = true }).catch(e => console.error('[start error]', e.message, e.stack))
requestAnimationFrame(tick)
