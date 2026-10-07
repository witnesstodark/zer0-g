// The menus: the title, the mode (three cards: the cup, a race, time attack), the machine (a grid of the eighteen machines as in the old racers,
// the chosen one turning on its stand, its pilot, stats and engine setting at the side), the course and class,
// ONLINE RACE (create the lobby or join it, the lobby, a machine picked against the clock), and the results; the
// week's best times on the
// title. Arrows or WASD move, Space (or Shift) chooses, Backspace goes back; on the machine screen Q/E (or [ ])
// set the engine. The mouse works too: what is under it lights up and a click chooses that (a card, a machine, a
// course, a class, the engine's marker), and every screen has its BACK and NEXT buttons.

import { PILOTS, GRADE } from './machines.js'
import { CLASSES } from './race.js'
import { fmtTime, ordinal, slantBar, roundRect } from './ui.js'

const CYAN = ['#ffffff', '#9ff3ff', '#29d3ff']
const GOLD = ['#fffbe0', '#ffd66b', '#ff9a1f']
const PINK = ['#ffe8fb', '#ff8ae6', '#ff2bd6']
const DIM = '#7fa6c0'
const hex = c => `#${c.toString(16).padStart(6, '0')}`

export const LAPS = { gp: 2, online: 2, ta: 2 }
const MODE_LABEL = { gp: 'ZER0-G CUP', online: 'ONLINE RACE', ta: 'TIME ATTACK' }
const CUP_ANIM = 2.4          // seconds: the points land (0.45), count up (to 1.4), the rows move (to 2.2)
const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t)
const MODES = ['gp', 'online', 'ta']
// the cups, three courses each (the course indexes in the order the game loads them); only the cups whose courses
// are all there are shown
export const CUPS = [
  { name: 'ZER0-G CUP', theme: 'NEON CITY NIGHTS', courses: [0, 1, 2] },
  { name: 'NOVA CUP', theme: 'DEEP SPACE', courses: [3, 4, 5] },
  { name: 'DUST CUP', theme: 'THE RED DESERT', courses: [6, 7, 8] },
]
// the course screen's rows: 0 the course, 1 the class, 2 the cup
const ROW = { course: 0, cls: 1, cup: 2 }

// the machine screen's layout (in the 1280 x 720 frame)
const GRID = { x: 40, y: 92, cols: 7, w: 104, h: 78, gap: 8 }   // 7 x 3: the eighteen, and a player's own
const STAND = { x: 40, y: 362, w: 788, h: 300 }
const SIDE = { x: 852, y: 92 }
// the main menu: four tiles, the last one split in two (MY MACHINE over the GALLERY); keys move between them
const TILES = [
  { x: 170, y: 162, w: 462, h: 232 },   // GRAND PRIX
  { x: 648, y: 162, w: 462, h: 232 },   // ONLINE RACE
  { x: 170, y: 410, w: 462, h: 232 },   // TIME ATTACK
  { x: 648, y: 410, w: 462, h: 108 },   // MY MACHINE
  { x: 648, y: 534, w: 462, h: 108 },   // GALLERY
]
const TILE_NAV = [{ r: 1, d: 2 }, { l: 0, d: 3 }, { u: 0, r: 3 }, { u: 1, l: 2, d: 4 }, { u: 3, l: 2 }]
// MY MACHINE: the stand and the card beside it; the GALLERY: cards on the left, the stand and the card on the right
const GARAGE = { x: 40, y: 92, w: 780, h: 548 }
const GAL = { x: 40, y: 92, cols: 3, rows: 2, w: 188, h: 262, gap: 14 }
const GAL_STAND = { x: 664, y: 92, w: 576, h: 300 }
// the list of lobbies: a row each (the first: create a new one)
const LOBBY_ROW = { x: 240, y: 120, w: 800, h: 58, gap: 8, shown: 7 }
const LIKE_BTN = { x: 1068, y: 414, w: 154, h: 40 }   // under the stand, on the right
// the buttons for the mouse: back (bottom left) and on (bottom right)
const BACK = { x: 40, y: 663, w: 150, h: 40 }
const GO = { x: 1050, y: 663, w: 190, h: 40 }

export class Menus {
  constructor({ overlay, font, thin, logo, icons, portraits, showroom, audio, tracks, onStart, onNext, onLobby, onBack, entityHint = '', faces = [], own = null, ownEntity = null, gallery = null }) {
    this.own = own                  // your machine's pilot entry (or null)
    this.ownEntity = ownEntity      // and its entity as Project 0 has it (version, when updated)
    this.galleryApi = gallery       // { entries(), pilot(entry) }: the players' machines
    this.gal = { list: null, at: 0, page: 0, loading: false, pilot: null, pics: new Map() }
    this.thin = thin ?? font        // the lighter weight: labels, small text, the keys
    SWATCH_FONT = this.thin
    this.heroes = null              // the course cards' pictures (set once they are rendered)
    this.faces = faces             // the pilots' portraits as textures (drawn into the cup standings)
    this.cupT = 0                  // the cup standings' animation clock
    this.entityHint = entityHint   // a player without a machine of their own: what to ask their agent
    this.overlay = overlay
    this.font = font
    this.audio = audio
    this.showroom = showroom
    this.tracks = tracks
    this.cups = CUPS.filter(c => c.courses.every(k => k < tracks.length))
    this.onNext = onNext
    this.onLobby = onLobby
    this.onStart = onStart
    this.onBack = onBack
    this.sel = { mode: 0, tile: 0, machine: 0, engine: 0.5, cls: 1, course: 0, row: 1 }
    this.best = {}
    this.table = null
    this.online = null          // set by the game: the session's lobby
    this.onlinePick = false     // the machine screen is the online race's pick (against the clock)
    this.locked = false         // your pick is locked in
    this.weekly = null          // your place in the week's table after a race
    this.prize = null           // the city's prize after a clean race: { ok, text }
    this.prizeRule = ''         // the city's prize, said on the main menu ('' when the lot has none)
    this.flash = ''
    this.screen = null
    this.blinkT = 0
    this.hover = null           // the id of what the mouse is over
    this.lastClick = { id: null, t: 0 }
    const f = font
    // the veil over the world behind the menus: darker under the title bar and the keys, lighter in the middle
    this.veil = overlay.panel(1280, 720, c => {
      const g = c.createLinearGradient(0, 0, 0, 720)
      g.addColorStop(0, 'rgba(3,4,16,0.82)'); g.addColorStop(0.14, 'rgba(3,4,16,0.6)'); g.addColorStop(0.84, 'rgba(3,4,16,0.6)'); g.addColorStop(1, 'rgba(3,4,16,0.88)')
      c.fillStyle = g; c.fillRect(0, 0, 1280, 720)
    }).place('c', 0, 0)
    this.veil.update('v')
    this.page = overlay.panel(1280, 720, (c, screen) => this.draw(c, screen)).place('c', 0, 0)
    const la = logo.image ? logo.image.height / logo.image.width : 0.37
    this.logo = overlay.picture(logo, 700, 700 * la, true)
    this.icons = icons.map(t => t ? overlay.picture(t, 130, 130, true) : null)      // a missing one is drawn (ONLINE's globe)
    this.portraits = portraits.map(tex => overlay.picture(tex, 200, 200))
    this.tiles = []
    this.prompt = overlay.panel(700, 60, (c, text) => f.draw(c, text, 350, 30, 26, { color: CYAN, align: 'center', glow: 'rgba(41,211,255,0.8)' })).place('c', 0, 120)
    this.prompt.update('p', 'PRESS SPACE')
    this.hideAll()
  }

  /** MY MACHINE: yours on the stand, your pilot's portrait beside it. */
  showGarage() {
    if (!this.own) return
    this.portraits.forEach((p, i) => { p.show(i === this.own.face); if (i === this.own.face) p.place('f', 852, 92) })
    this.showroom.showPilot(this.own)
  }

  /** The players' machines, loaded once (from the menu on, in the background). */
  loadGallery() {
    const g = this.gal
    if (g.list || g.loading || !this.galleryApi) return
    g.loading = true
    this.galleryApi.entries().then(list => { g.list = list; g.loading = false; if (this.screen === 'gallery') { this.showGallery(); this.pickGallery(g.at) } else this.redraw() })
      .catch(() => { g.list = []; g.loading = false; this.redraw() })
  }

  /** The GALLERY: the players' machines as cards, the picked one on the stand. */
  showGallery() {
    const g = this.gal
    this.loadGallery()
    g.pics.forEach(p => p.show(false))
    if (!g.list) { this.redraw(); return }
    const per = GAL.cols * GAL.rows, first = g.page * per
    g.list.slice(first, first + per).forEach((m, j) => {
      if (!m.face) return
      let pic = g.pics.get(m.id)
      if (!pic) { pic = this.overlay.picture(m.face, GAL.w - 16, GAL.w - 16); g.pics.set(m.id, pic) }
      const col = j % GAL.cols, row = Math.floor(j / GAL.cols)
      pic.show(true)
      pic.place('f', GAL.x + col * (GAL.w + GAL.gap) + 8, GAL.y + row * (GAL.h + GAL.gap) + 8)
    })
    if (g.pilot) this.showroom.showPilot(g.pilot)
    else if (!g.loadingModel) this.pickGallery(g.at)
    this.redraw()
  }

  /** Like the picked machine (or take the like back). */
  likeGallery() {
    const g = this.gal, m = g.list?.[g.at]
    if (!m || g.liking) return
    if (m.mine) { g.note = 'YOURS: THE OTHERS LIKE IT HERE'; this.redraw(); return }
    if (!this.galleryApi.canLike) { g.note = 'SIGN IN TO PROJECT 0 TO LIKE'; this.redraw(); return }
    g.liking = true
    this.audio.sfx(m.liked ? 'gtr_back' : 'gtr_select', { volume: 0.8 })
    this.galleryApi.like(m).then(r => { g.liking = false; g.note = r?.ok ? (m.liked ? 'LIKED!' : '') : String(r?.reason ?? 'COULD NOT LIKE IT').toUpperCase(); g.pulse = m.liked ? 1 : 0; this.redraw() })
      .catch(() => { g.liking = false; g.note = 'NO CONNECTION'; this.redraw() })
    this.redraw()
  }

  /** Pick gallery card k: its machine (loaded once) onto the stand. */
  pickGallery(k) {
    const g = this.gal
    if (!g.list?.length) return
    k = Math.max(0, Math.min(g.list.length - 1, k))
    const per = GAL.cols * GAL.rows, page = Math.floor(k / per)
    g.at = k
    g.note = ''
    if (page !== g.page) { g.page = page; this.showGallery() }
    const m = g.list[k]
    g.pilot = m.pilot ?? null
    if (g.pilot) this.showroom.showPilot(g.pilot)
    else {
      g.loadingModel = m.id
      this.galleryApi.pilot(m).then(p => { if (g.loadingModel === m.id) { g.loadingModel = null; g.pilot = p; if (p && this.screen === 'gallery') this.showroom.showPilot(p); this.redraw() } })
        .catch(() => { g.loadingModel = null; this.redraw() })
    }
    this.redraw()
  }

  /** The course cards' pictures (canvases, by course). */
  setHeroes(canvases) {
    this.heroes = canvases
    if (this.screen === 'course') { this.dataKey = Date.now(); this.redraw() }
  }

  /** The machines' pictures for the grid (rendered once by the showroom). */
  setThumbs(textures) {
    this.tiles = textures.map(t => this.overlay.picture(t, GRID.w - 8, (GRID.w - 8) * 120 / 192))
    for (const t of this.tiles) t.show(false)
    // your own machine's badge: a pink corner with a star, over its tile's picture
    this.badge?.show(false)
    this.badge = this.overlay.panel(38, 38, c => {
      c.beginPath(); c.moveTo(4, 0); c.lineTo(38, 0); c.lineTo(38, 34); c.closePath()
      c.fillStyle = '#ff2bd6'; c.fill()
      c.beginPath()
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4 : 9; c.lineTo(27 + Math.cos(a) * r, 11 + Math.sin(a) * r) }
      c.closePath(); c.fillStyle = '#ffffff'; c.fill()
    })
    this.badge.update('star')
    this.badge.show(false)
    if (this.screen === 'machine') this.open('machine')
  }

  hideAll() {
    this.veil.show(false); this.page.show(false); this.logo.show(false); this.prompt.show(false)
    this.portraits.forEach(p => p.show(false))
    this.icons.forEach(p => p?.show(false))
    this.tiles.forEach(p => p.show(false))
    this.gal.pics.forEach(p => p.show(false))
    this.badge?.show(false)
    if (this.online) this.online.watching = false
    this.screen = null
  }

  open(screen, data) {
    if (screen !== 'mode' && screen !== 'online') this.flash = ''
    if (screen !== 'machine') this.onlinePick = false
    if (this.online) this.online.watching = screen === 'online'
    this.screen = screen
    this.data = data ?? this.data
    this.blinkT = 0
    this.hover = null
    this.cupT = 0
    this.badge?.show(false)
    this.veil.show(screen !== 'title')
    this.page.show(true)
    this.portraits.forEach(p => p.show(false))
    this.icons.forEach(p => p?.show(false))
    this.tiles.forEach(p => p.show(false))
    this.gal.pics.forEach(p => p.show(false))
    this.logo.show(screen === 'title' || screen === 'mode')
    this.prompt.show(screen === 'title')
    if (screen === 'title') { this.logo.place('c', 0, -40, 1); this.prompt.update('p', 'PRESS SPACE') }
    if (screen === 'mode') {
      this.logo.place('t', 0, 20, 0.42)
      this.icons.forEach((ic, k) => { if (!ic) return; const t = TILES[k]; ic.show(true); ic.place('f', t.x + 34, t.y + 51, 1) })
      // your machine's picture in its tile
      const own = PILOTS.findIndex(p => p.own)
      if (own >= 0 && this.tiles[own]) { this.tiles[own].show(true); this.tiles[own].place('f', TILES[3].x + 22, TILES[3].y + 24) }
    }
    if (screen === 'machine') this.showMachine()
    if (screen === 'garage') this.showGarage()
    if (screen === 'gallery') this.showGallery()
    if (screen === 'mode') this.loadGallery()
    this.redraw()
  }

  /** The logo's entrance for the intro: k from 0 (huge, faint) to 1 (in place). */
  logoIn(k) {
    this.logo.show(true)
    this.logo.place('c', 0, -40, 1 + (1 - k) * (1 - k) * 2.5)
    this.logo.mesh.material.opacity = Math.min(1, k * 1.5)
  }

  showMachine() {
    const m = this.sel.machine
    this.portraits.forEach((p, i) => { p.show(i === m); if (i === m) p.place('f', SIDE.x, SIDE.y) })
    this.tiles.forEach((t, i) => {
      const col = i % GRID.cols, row = Math.floor(i / GRID.cols)
      t.show(true)
      t.place('f', GRID.x + col * (GRID.w + GRID.gap) + 4, GRID.y + row * (GRID.h + GRID.gap) + 2)
    })
    const own = PILOTS.findIndex(p => p.own)
    if (this.badge && own >= 0) {
      this.badge.place('f', GRID.x + (own % GRID.cols) * (GRID.w + GRID.gap) + GRID.w - 38, GRID.y + Math.floor(own / GRID.cols) * (GRID.h + GRID.gap))
      this.badge.show(true)
    }
    this.showroom.show(m)
  }

  redraw() {
    this.page.update(`${this.screen}|${JSON.stringify(this.sel)}|${JSON.stringify(this.best)}|${JSON.stringify(this.table ?? [])}|${this.dataKey ?? ''}|${this.lobbyKey()}|${JSON.stringify(this.weekly)}|${JSON.stringify(this.prize)}|${this.flash}|${this.hover}|${this.screen === 'cup' ? Math.round(this.cupT * 60) : 0}|${this.gal.at}|${this.gal.page}|${this.gal.list?.length ?? -1}|${this.gal.loadingModel ?? ''}|${!!this.gal.pilot}|${this.gal.note ?? ''}|${this.gal.liking ? 1 : 0}|${this.gal.list?.[this.gal.at]?.likes ?? 0}|${this.gal.list?.[this.gal.at]?.liked ? 1 : 0}|${Math.round((this.gal.pulse ?? 0) * 20)}`, this.screen)
  }

  // ------------------------------------------------------------ the mouse
  /** A point on the screen (CSS px) in the menus' 1280 x 720 frame. */
  toFrame(x, y) {
    const o = this.overlay, u = o.unit
    return { x: (x - (o.width - 1280 * u) / 2) / u, y: (y - (o.height - 720 * u) / 2) / u }
  }

  /** This screen's buttons: { id, x, y, w, h, label, size, primary, act }. */
  buttons() {
    const s = this.sel, scr = this.screen, o = this.online, B = []
    const back = label => B.push({ id: 'back', ...BACK, label, size: 15, act: () => this.move('Backspace') })
    const go = (label, box = GO, size = 16) => B.push({ id: 'go', ...box, label, size, primary: true, act: () => this.move('Space') })
    const mode = MODES[s.mode]
    if (scr === 'mode') back('< TITLE')
    else if (scr === 'garage') { back('< MENU'); if (this.own) go('RACE IT >') }
    else if (scr === 'gallery') back('< MENU')
    else if (scr === 'machine') {
      if (this.onlinePick) { back('< LEAVE'); if (!this.locked) go('LOCK IN') }
      else { back('< BACK'); go('NEXT >') }
    } else if (scr === 'course') {
      back('< BACK')
      go(mode === 'gp' ? 'START THE CUP' : mode === 'online' ? 'CREATE LOBBY' : 'RACE >')
    } else if (scr === 'online') {
      back('< BACK')
      const row = this.lobbyRows()[s.lobbyAt ?? 0]
      const label = !row ? null : row.create ? (o?.isMember ? 'A NEW LOBBY' : 'CREATE A LOBBY') : row.mine ? 'BACK TO IT' : row.phase === 'open' ? 'JOIN' : null
      if (label) go(label)
    } else if (scr === 'lobby') {
      back('< LEAVE')
      if (o?.isOwner && o.lobby?.phase === 'open') go('START THE RACE', { x: 440, y: 600, w: 400, h: 58 }, 22)
    } else if (scr === 'results' && this.data) {
      const d = this.data
      back(d.online ? '< LEAVE' : '< MENU')
      go(d.online ? 'TO THE LOBBY' : d.cup ? 'CUP STANDINGS >' : 'RACE AGAIN')
    } else if (scr === 'cup' && this.data?.cup) {
      back('< MENU')
      go(this.data.cup.last ? 'A NEW CUP' : 'NEXT RACE >')
    }
    return B
  }

  /** What the mouse can point at on this screen: the buttons, then the cards, machines, courses, classes. */
  regions() {
    const s = this.sel, scr = this.screen, R = this.buttons()
    const add = (id, x, y, w, h, act, more = {}) => R.push({ id, x, y, w, h, act, ...more })
    if (scr === 'title') add('title', 0, 0, 1280, 720, () => this.move('Space'))
    if (scr === 'mode') {
      // pointing at a tile selects it, a click chooses it
      TILES.forEach((t, k) => add(`mode:${k}`, t.x, t.y, t.w, t.h, () => { s.tile = k; this.move('Space') },
        { over: () => { if (s.tile !== k) { s.tile = k; this.audio.sfx('gtr_move', { volume: 0.5 }) } } }))
    }
    if (scr === 'gallery' && this.gal.list) {
      const per = GAL.cols * GAL.rows, first = this.gal.page * per
      this.gal.list.slice(first, first + per).forEach((m, j) => {
        const x = GAL.x + (j % GAL.cols) * (GAL.w + GAL.gap), y = GAL.y + Math.floor(j / GAL.cols) * (GAL.h + GAL.gap)
        add(`gal:${first + j}`, x, y, GAL.w, GAL.h, () => { if (this.gal.at !== first + j) { this.audio.sfx('gtr_move', { volume: 0.6 }); this.pickGallery(first + j) } }, { twice: true })
      })
      add('like', LIKE_BTN.x, LIKE_BTN.y, LIKE_BTN.w, LIKE_BTN.h, () => this.likeGallery())
    }
    if (scr === 'machine' && !(this.onlinePick && this.locked)) {
      PILOTS.forEach((p, k) => {
        const col = k % GRID.cols, row = Math.floor(k / GRID.cols)
        add(`tile:${k}`, GRID.x + col * (GRID.w + GRID.gap), GRID.y + row * (GRID.h + GRID.gap), GRID.w, GRID.h, () => this.pickMachine(k), { twice: true })
      })
      add('engine', SIDE.x - 12, 572, 324, 40, p => this.setEngine(p.x), { drag: true })
      if (this.entityHint) {
        const k = PILOTS.length, col = k % GRID.cols, row = Math.floor(k / GRID.cols)
        add('own', GRID.x + col * (GRID.w + GRID.gap), GRID.y + row * (GRID.h + GRID.gap), GRID.w, GRID.h, () => { this.flash = this.entityHint; this.redraw() })
      }
    }
    if (scr === 'online') {
      const rows = this.lobbyRows(), top = Math.max(0, Math.min((s.lobbyAt ?? 0) - LOBBY_ROW.shown + 1, rows.length - LOBBY_ROW.shown))
      rows.slice(top, top + LOBBY_ROW.shown).forEach((row, j) => {
        const k = top + j, y = LOBBY_ROW.y + j * (LOBBY_ROW.h + LOBBY_ROW.gap)
        add(`lob:${k}`, LOBBY_ROW.x, y, LOBBY_ROW.w, LOBBY_ROW.h, () => this.chooseLobby(row), { over: () => { if (s.lobbyAt !== k) { s.lobbyAt = k; this.flash = ''; this.audio.sfx('gtr_move', { volume: 0.4 }) } } })
      })
    }
    if (scr === 'course') {
      const mode = MODES[s.mode]
      if (this.cups.length > 1) this.cups.forEach((cu, i) => { const b = cupTab(i, this.cups.length); add(`cup:${i}`, b.x, b.y, b.w, b.h, () => this.choose('cup', i)) })
      if (mode !== 'gp') this.cups[this.cupIndex()].courses.forEach((k, j) => { const b = courseCard(j); add(`course:${k}`, b.x, b.y, b.w, b.h, () => this.choose('course', k), { twice: true }) })
      if (mode !== 'ta') CLASSES.forEach((cl, k) => { const b = classPill(k); add(`cls:${k}`, b.x, b.y, b.w, b.h, () => this.choose('cls', k)) })
    }
    return R
  }

  regionAt(p) { return this.regions().find(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) ?? null }

  /** The mouse moved (CSS px): what is under it lights up; dragging the engine's marker moves it. */
  pointerMove(x, y, buttons = 0) {
    if (!this.screen) return
    const p = this.toFrame(x, y)
    const r = this.regionAt(p)
    if (r?.drag && buttons & 1) r.act(p)
    const id = r && r.id !== 'title' ? r.id : null
    if (id !== this.hover) { this.hover = id; r?.over?.(); this.redraw() }
  }

  /** A click or a tap (CSS px): what is under it is chosen; a machine or a course clicked twice goes on. */
  pointerDown(x, y) {
    if (!this.screen) return
    const p = this.toFrame(x, y)
    const r = this.regionAt(p)
    if (!r) return
    const t = performance.now() / 1000, again = r.twice && this.lastClick.id === r.id && t - this.lastClick.t < 0.45
    this.lastClick = { id: r.id, t }
    if (again) this.move('Space')
    else { r.over?.(); r.act?.(p) }
    // the screen may have changed under the mouse: light up what it is over now
    this.hover = null
    this.pointerMove(x, y)
  }

  pickMachine(k) {
    if (this.sel.machine === k) return
    this.sel.machine = k
    this.audio.sfx('gtr_move', { volume: 0.7 })
    this.showMachine()
    this.redraw()
  }

  setEngine(x) {
    const e = Math.max(0, Math.min(1, Math.round((x - SIDE.x) / 30) / 10))
    if (e === this.sel.engine) return
    this.sel.engine = e
    this.audio.sfx('gtr_move', { volume: 0.5 })
    this.redraw()
  }

  /** The course screen's rows in this mode (the cup's row only when there is more than one cup). */
  courseRows() {
    const mode = MODES[this.sel.mode]
    const rows = mode === 'gp' ? [ROW.cup, ROW.cls] : mode === 'ta' ? [ROW.cup, ROW.course] : [ROW.cup, ROW.course, ROW.cls]
    return this.cups.length > 1 ? rows : rows.filter(r => r !== ROW.cup)
  }

  /** The cup the selected course belongs to. */
  cupIndex() {
    const k = this.cups.findIndex(c => c.courses.includes(this.sel.course))
    return k < 0 ? 0 : k
  }

  /** Pick a cup: the course in the same place in it. */
  setCup(i) {
    const s = this.sel, slot = Math.max(0, this.cups[this.cupIndex()].courses.indexOf(s.course))
    s.course = this.cups[i].courses[slot]
  }

  choose(row, k) {
    const s = this.sel
    if (row === 'cup') { if (this.cupIndex() === k && s.row === ROW.cup) return; this.setCup(k); s.row = ROW.cup }
    else if (row === 'course') { if (s.course === k && s.row === 0) return; s.course = k; s.row = 0 }
    else { if (s.cls === k && s.row === 1) return; s.cls = k; s.row = 1 }
    this.audio.sfx('gtr_move', { volume: 0.7 })
    this.redraw()
  }

  drawButtons(c) {
    const t = this.thin
    for (const b of this.buttons()) {
      const on = this.hover === b.id, big = b.h > 50
      c.save()
      cut(c, b.x, b.y, b.w, b.h, 8)
      if (b.primary) {
        const g = c.createLinearGradient(b.x, 0, b.x + b.w, 0)
        g.addColorStop(0, on ? 'rgba(255,60,220,0.6)' : 'rgba(255,43,214,0.32)'); g.addColorStop(1, on ? 'rgba(140,60,255,0.6)' : 'rgba(120,40,255,0.24)')
        c.fillStyle = g
      } else c.fillStyle = on ? 'rgba(41,211,255,0.14)' : 'rgba(8,12,30,0.72)'
      c.fill()
      if (b.primary || on) { c.shadowColor = b.primary ? C_PINK : C_CYAN; c.shadowBlur = on ? 16 : 8 }
      c.strokeStyle = b.primary ? (on ? '#ffd0f6' : '#ff6fe0') : on ? '#d8f6ff' : 'rgba(130,170,220,0.4)'
      c.lineWidth = 1.4; c.stroke(); c.restore()
      t.draw(c, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, big ? 16 : 12, { color: '#ffffff', align: 'center', skew: 0, spacing: 0.18, outline: false })
    }
  }

  /** What the online screens show, as a key that changes when they should be drawn again. */
  lobbyKey() {
    const o = this.online
    if (!o || !['lobby', 'online', 'mode', 'machine'].includes(this.screen)) return ''
    const v = o.view()
    const list = v.lobbies.map(x => `${x.id}:${x.phase}:${x.count}:${x.owner}:${Math.ceil(x.raceLeft)}:${Math.ceil(x.left)}:${x.racing}`).join(',')
    return `${v.lobby?.id ?? 0}|${v.lobby?.phase}|${v.lobby?.owner}|${Math.ceil(v.left)}|${Math.ceil(v.raceLeft)}|${v.racing}|${v.members.map(m => m.pid + ':' + (m.ok ? 1 : 0) + (m.away ? 'a' : '')).join(',')}|${v.inside}|${v.mine}|${this.onlinePick}|${this.locked}|${list}`
  }

  /** The list of lobbies' rows: first "create a new one", then every lobby (yours first). */
  lobbyRows() {
    const v = this.online?.view()
    if (!v) return [{ create: true }]
    return [{ create: true, full: v.full }, ...[...v.lobbies].sort((a, b) => (b.mine - a.mine) || (a.phase === 'open' ? 0 : 1) - (b.phase === 'open' ? 0 : 1))]
  }

  /** A row of the list chosen: create, back to yours, join an open one, or say why not. */
  chooseLobby(row) {
    const o = this.online, s = this.sel
    if (!row || !o) return
    if (row.create) {
      if (row.full) { this.flash = 'THE LOT HAS AS MANY LOBBIES AS IT TAKES: JOIN ONE'; this.redraw(); return }
      this.audio.sfx('gtr_select'); s.row = this.courseRows()[0]; this.open('course')
    } else if (row.mine) { this.audio.sfx('gtr_select'); this.open('lobby') }
    else if (row.phase === 'open') { if (o.join(s, row.id)) { this.audio.sfx('gtr_start', { volume: 1 }); this.open('lobby') } }
    else { this.flash = row.phase === 'pick' ? 'THEY ARE PICKING MACHINES: IT OPENS AGAIN AFTER THE RACE' : 'A RACE IS ON IN IT: IT OPENS AGAIN WHEN IT ENDS'; this.audio.sfx('gtr_back'); this.redraw() }
  }

  /** The owner started the online race: pick a machine against the clock. */
  pickOnline() {
    this.open('machine')
    this.onlinePick = true
    this.locked = false
    this.redraw()
  }

  setTable(table) { this.table = table; if (this.screen) { this.dataKey = Date.now(); this.redraw() } }

  move(code) {
    const s = this.sel
    const up = code === 'ArrowUp' || code === 'KeyW', down = code === 'ArrowDown' || code === 'KeyS'
    const left = code === 'ArrowLeft' || code === 'KeyA', right = code === 'ArrowRight' || code === 'KeyD'
    const ok = code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight' || code === 'tap'
    const back = code === 'Backspace' || code === 'KeyX'
    const engDown = code === 'KeyQ' || code === 'BracketLeft', engUp = code === 'KeyE' || code === 'BracketRight'
    if (!(up || down || left || right || ok || back || engDown || engUp)) return false
    const scr = this.screen
    let moved = false
    const o = this.online
    if (scr === 'online') {
      // the list of lobbies: pick one and join it (or go back to yours), or create a new one (its course and class)
      if (back) { this.audio.sfx('gtr_back'); this.open('mode'); return true }
      const rows = this.lobbyRows()
      s.lobbyAt = Math.max(0, Math.min(rows.length - 1, s.lobbyAt ?? 0))
      if (up || down) { s.lobbyAt = (s.lobbyAt + (down ? 1 : rows.length - 1)) % rows.length; this.flash = ''; this.audio.sfx('gtr_move', { volume: 0.6 }); this.redraw(); return true }
      if (ok && o) this.chooseLobby(rows[s.lobbyAt])
      return true
    }
    if (scr === 'lobby') {
      if (back) { this.audio.sfx('gtr_back'); o?.leave(); this.open('online'); return true }
      if (ok && o?.isOwner && o.lobby?.phase === 'open') { this.audio.sfx('gtr_start', { volume: 1 }); o.start() }
      return true
    }
    if (scr === 'machine' && this.onlinePick) {
      // the online pick: choose, then lock in; Backspace leaves the lobby
      if (back) { this.audio.sfx('gtr_back'); o?.leave(); this.open('online'); return true }
      if (this.locked) return true
    }
    if (scr === 'title') {
      if (ok) { this.audio.sfx('gtr_start', { volume: 1 }); this.open('mode') }
      return true
    }
    if (back) {
      this.audio.sfx('gtr_back')
      if (scr === 'mode') this.open('title')
      else if (scr === 'garage' || scr === 'gallery') this.open('mode')
      else if (scr === 'machine') this.open('mode')
      else if (scr === 'course') this.open(MODES[s.mode] === 'online' ? 'online' : 'machine')
      else if (scr === 'results' || scr === 'cup') this.onBack?.()
      return true
    }
    if (scr === 'mode') {
      const nav = TILE_NAV[s.tile] ?? {}
      const to = left ? nav.l : right ? nav.r : up ? nav.u : down ? nav.d : undefined
      if (to !== undefined) { s.tile = to; moved = true }
      if (ok) {
        this.audio.sfx('gtr_select')
        if (s.tile === 3) { this.open('garage'); return true }
        if (s.tile === 4) { this.open('gallery'); return true }
        s.mode = s.tile
        if (MODES[s.mode] === 'online') { this.open('online'); return true }
        this.audio.voice('select'); this.open('machine'); return true
      }
    } else if (scr === 'garage') {
      // race it: the Grand Prix with your machine picked
      if (ok && this.own) { this.audio.sfx('gtr_select'); s.mode = 0; s.tile = 0; s.machine = PILOTS.indexOf(this.own); this.open('machine'); return true }
    } else if (scr === 'gallery') {
      const g = this.gal
      if (g.list?.length) {
        const d = left ? -1 : right ? 1 : up ? -GAL.cols : down ? GAL.cols : 0
        if (d) { const k = Math.max(0, Math.min(g.list.length - 1, g.at + d)); if (k !== g.at) { this.pickGallery(k); moved = true } }
        if (ok) { this.likeGallery(); return true }
      }
    } else if (scr === 'machine') {
      const n = PILOTS.length, cols = GRID.cols
      if (left) { s.machine = (s.machine + n - 1) % n; moved = true }
      if (right) { s.machine = (s.machine + 1) % n; moved = true }
      if (up) { s.machine = (s.machine + n - cols) % n; moved = true }
      if (down) { s.machine = (s.machine + cols) % n; moved = true }
      if (engUp) { s.engine = Math.min(1, Math.round((s.engine + 0.1) * 10) / 10); moved = true }
      if (engDown) { s.engine = Math.max(0, Math.round((s.engine - 0.1) * 10) / 10); moved = true }
      if (moved) this.showMachine()
      if (ok) {
        this.audio.sfx('gtr_select')
        if (this.onlinePick) { o?.pick(PILOTS[s.machine]?.own ? -1 : s.machine, s.engine); this.locked = true; this.redraw(); return true }
        s.row = this.courseRows()[0]
        this.open('course')
        return true
      }
    } else if (scr === 'course') {
      // a cup runs all three of its courses (its cup and class to pick); time attack has no class
      const rows = this.courseRows()
      if (!rows.includes(s.row)) s.row = rows[0]
      if ((up || down) && rows.length > 1) { s.row = rows[(rows.indexOf(s.row) + (down ? 1 : rows.length - 1)) % rows.length]; moved = true }
      if (left || right) {
        const d = right ? 1 : -1
        if (s.row === ROW.cup) this.setCup((this.cupIndex() + d + this.cups.length) % this.cups.length)
        else if (s.row === ROW.course) { const cc = this.cups[this.cupIndex()].courses; s.course = cc[(cc.indexOf(s.course) + d + 3) % 3] }
        else s.cls = (s.cls + d + 3) % 3
        moved = true
      }
      if (ok && MODES[s.mode] === 'online') {
        // create the lobby on this course and class
        if (o?.create(s)) { this.audio.sfx('gtr_start', { volume: 1 }); this.open('lobby') } else this.open('online')
        return true
      }
      if (ok) { this.audio.sfx('gtr_start', { volume: 1 }); this.onStart({ ...s, mode: MODES[s.mode] }); return true }
    } else if (scr === 'cup') {
      if (ok) {
        this.audio.sfx('gtr_start', { volume: 1 })
        if (!this.data?.cup?.last) this.onNext?.()
        else this.onStart({ ...this.sel, mode: MODES[this.sel.mode] })
        return true
      }
    } else if (scr === 'results') {
      if (ok) {
        this.audio.sfx('gtr_start', { volume: 1 })
        if (this.data?.online) this.onLobby?.()
        else if (this.data?.cup) { this.open('cup'); return true }
        else this.onStart({ ...this.sel, mode: MODES[this.sel.mode] })
        return true
      }
    }
    if (moved) { this.audio.sfx('gtr_move', { volume: 0.7 }); this.redraw() }
    return true
  }

  update(dt) {
    this.blinkT += dt
    if (['mode', 'machine', 'lobby', 'online'].includes(this.screen) && Math.floor(this.blinkT * 4) !== Math.floor((this.blinkT - dt) * 4)) this.redraw()
    if (this.screen === 'title') this.prompt.show(Math.floor(this.blinkT * 1.6) % 2 === 0)
    if (this.screen === 'machine' || this.screen === 'garage' || this.screen === 'gallery') this.showroom.update(dt)
    if (this.screen === 'gallery' && this.gal.pulse > 0) { this.gal.pulse = Math.max(0, this.gal.pulse - dt * 2.5); this.redraw() }
    if (this.screen === 'cup' && this.cupT < CUP_ANIM) {
      const was = this.cupT
      this.cupT = Math.min(CUP_ANIM, this.cupT + dt)
      // a tick as the points land, a chord as the rows settle
      if (was < 0.45 && this.cupT >= 0.45) this.audio.sfx('gtr_move', { volume: 0.8 })
      if (was < 1.5 && this.cupT >= 1.5) this.audio.sfx('gtr_select', { volume: 0.9 })
      this.redraw()
    }
    // the pick's clock ran out: your machine as it stands is locked in
    if (this.onlinePick && !this.locked && this.screen === 'machine' && this.online?.lobby?.phase === 'pick' && this.online.view().left < 0.5) {
      this.online.pick(PILOTS[this.sel.machine]?.own ? -1 : this.sel.machine, this.sel.engine); this.locked = true; this.redraw()
    }
  }

  /** The chosen machine turning on its stand, under the grid. */
  renderShowroom(renderer) {
    const R = this.screen === 'machine' ? STAND : this.screen === 'garage' && this.own ? GARAGE : this.screen === 'gallery' && this.gal.pilot && !this.gal.loadingModel ? GAL_STAND : null
    if (!R) return
    const o = this.overlay
    const u = o.unit
    const left = (o.width - 1280 * u) / 2, top = (o.height - 720 * u) / 2
    const x = left + R.x * u, w = R.w * u, h = R.h * u
    const y = o.height - (top + R.y * u) - h
    const cam = this.showroom.camera
    cam.aspect = w / h
    cam.fov = R.h < 400 ? 22 : 30
    cam.updateProjectionMatrix()
    renderer.setScissorTest(true)
    renderer.setScissor(x, y, w, h)
    renderer.setViewport(x, y, w, h)
    renderer.clearDepth()
    renderer.render(this.showroom.scene, cam)
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, o.width, o.height)
  }

  // ------------------------------------------------------------ drawing
  draw(c, screen) {
    this.drawScreen(c, screen)
    if (screen === this.screen) this.drawButtons(c)
  }

  /** The screen's title top left over a hairline (its accent under the start), a quieter label beside it. */
  header(c, title, sub = '', accent = C_CYAN) {
    const f = this.font, t = this.thin
    f.draw(c, title, 40, 44, 22, { color: INK, skew: 0.12, spacing: 0.06, outline: false })
    if (sub) t.draw(c, sub, 40 + f.measure(title, 22, 0.06) + 24, 46, 11, { color: accent, skew: 0, spacing: 0.24, outline: false })
    c.fillStyle = 'rgba(130,170,220,0.16)'; c.fillRect(40, 68, 1200, 1)
    c.save(); c.shadowColor = accent; c.shadowBlur = 8; c.fillStyle = accent; c.fillRect(40, 67, 96, 2); c.restore()
  }

  /** The keys at the bottom, between the two buttons: each key in a little frame, what it does beside it. */
  keys(c, list) {
    const t = this.thin
    let size = 10
    const lay = () => {
      const items = list.map(([k, what]) => ({ k, what, kw: t.measure(k, size, 0.12) + 14, ww: what ? t.measure(what, size, 0.14) : 0 }))
      return { items, total: items.reduce((a, it) => a + it.kw + (it.what ? 8 + it.ww : 0), 0) + 22 * (items.length - 1) }
    }
    let L = lay()
    while (L.total > 820 && size > 8) { size -= 0.5; L = lay() }
    let x = 640 - L.total / 2
    const y = 683
    // a dark band behind the row, so it reads over a bright world too
    c.save(); roundRect(c, x - 14, y - 16, L.total + 28, 32, 8); c.fillStyle = 'rgba(3,5,16,0.55)'; c.fill(); c.restore()
    for (const it of L.items) {
      c.save(); roundRect(c, x, y - 10, it.kw, 20, 4); c.fillStyle = 'rgba(10,14,34,0.6)'; c.fill(); c.strokeStyle = 'rgba(170,200,235,0.4)'; c.lineWidth = 1; c.stroke(); c.restore()
      t.draw(c, it.k, x + it.kw / 2, y + 1, size, { color: INK, align: 'center', skew: 0, spacing: 0.12, outline: false })
      x += it.kw
      if (it.what) { t.draw(c, it.what, x + 8, y + 1, size, { color: MUTED, skew: 0, spacing: 0.14, outline: false }); x += 8 + it.ww }
      x += 22
    }
  }

  drawScreen(c, screen) {
    const f = this.font, t = this.thin
    const s = this.sel
    // the hints as keys: 'KEY: WHAT  ·  KEY: WHAT'
    const hint = text => this.keys(c, text.split('  ·  ').map(p => { const i = p.indexOf(': '); return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 2)] }))
    if (screen === 'title') {
      this.drawTable(c, 1240, 476, 'right', 6)
      hint('ARROWS: MOVE  ·  SPACE: CHOOSE  ·  BACKSPACE: BACK')
      return
    }
    if (screen === 'mode') {
      const inside = this.online?.players.length ?? 1
      const n = this.gal.list?.length
      const tiles = [
        ['GRAND PRIX', 'THREE CUPS OF THREE RACES', 'THE CITY  /  SPACE  /  THE DESERT', C_CYAN],
        ['ONLINE RACE', 'RACE THE OTHERS IN THE LOT', `${inside} INSIDE NOW`, C_PINK],
        ['TIME ATTACK', 'ONE COURSE, AGAINST THE CLOCK', 'BEAT YOUR BEST TIME', C_GOLD],
        ['MY MACHINE', this.own ? this.own.name : 'MAKE ONE WITH YOUR AI AGENT', '', '#ff8ae6'],
        ['GALLERY', `${n ? `${n} ` : ''}MACHINES BY PLAYERS`, '', '#7dffb0'],
      ]
      tiles.forEach(([name, line, more, accent], k) => {
        const b = TILES[k], on = s.tile === k, small = b.h < 150
        glass(c, b.x, b.y, b.w, b.h, { on, hover: this.hover === `mode:${k}`, accent, k: small ? 10 : 14 })
        if (on) {
          brackets(c, b.x, b.y, b.w, b.h, accent, small ? 10 : 14)
          c.save(); c.shadowColor = accent; c.shadowBlur = 12; c.fillStyle = accent; c.fillRect(b.x + 30, b.y + b.h - 3, b.w - 60, 2); c.restore()
        }
        if (!small) {
          if (k === 1 && !this.icons[1]) globe(c, b.x + 99, b.y + 116, 52, on)
          f.draw(c, name, b.x + 196, b.y + 98, 26, { color: on ? '#ffffff' : '#9fb6cc', skew: 0.12, outline: false, glow: on ? accent : null, glowBlur: 10 })
          t.draw(c, line, b.x + 198, b.y + 132, 10.5, { color: on ? accent : MUTED, skew: 0, spacing: 0.16, outline: false })
          t.draw(c, more, b.x + 198, b.y + 154, 9, { color: FAINT, skew: 0, spacing: 0.18, outline: false })
        } else {
          if (k === 3 && !this.own) plusMark(c, b.x + 70, b.y + b.h / 2, on)
          if (k === 4) cardsMark(c, b.x + 70, b.y + b.h / 2, on)
          f.draw(c, name, b.x + 150, b.y + 44, 20, { color: on ? '#ffffff' : '#9fb6cc', skew: 0.12, outline: false, glow: on ? accent : null, glowBlur: 8 })
          t.draw(c, line, b.x + 151, b.y + 72, 9.5, { color: on ? accent : MUTED, skew: 0, spacing: 0.16, outline: false })
        }
      })
      if (this.flash) t.draw(c, this.flash, 640, 148, 12, { color: '#ff6b7d', align: 'center', skew: 0, spacing: 0.1, outline: false })
      else if (this.prizeRule) t.draw(c, this.prizeRule, 640, 148, 11, { color: C_GOLD, align: 'center', skew: 0, spacing: 0.12, outline: false, glow: 'rgba(255,170,30,0.5)', glowBlur: 6 })
      hint('ARROWS: SELECT  ·  SPACE: CHOOSE  ·  BACKSPACE: TITLE')
      return
    }
    if (screen === 'garage') {
      this.header(c, 'MY MACHINE', this.own ? 'MADE BY YOUR AI AGENT, YOURS IN EVERY MODE' : 'NONE YET', '#ff8ae6')
      if (!this.own) {
        glass(c, 240, 150, 800, 440, { on: true, accent: '#ff8ae6', k: 16 })
        plusMark(c, 640, 230, true)
        f.draw(c, 'NO MACHINE OF YOUR OWN YET', 640, 300, 24, { color: '#ffffff', align: 'center', skew: 0.12, outline: false })
        const steps = [
          ['1', 'ASK YOUR AI AGENT: "MAKE ME A MACHINE FOR ZER0-G (PROJECT 0)"'],
          ['2', 'IT DESIGNS ONE WITH YOU: A NAME, A PILOT, STATS, COLOURS, A 3D MODEL'],
          ['3', 'IT SENDS IT TO PROJECT 0; ONCE CHECKED IT RACES HERE IN EVERY MODE'],
        ]
        steps.forEach(([n, line], k) => {
          const y = 356 + k * 42
          c.save(); roundRect(c, 300, y - 14, 28, 28, 6); c.strokeStyle = '#ff8ae6'; c.lineWidth = 1.2; c.stroke(); c.restore()
          t.draw(c, n, 314, y + 1, 12, { color: '#ff8ae6', align: 'center', skew: 0, outline: false })
          t.draw(c, line, 346, y + 1, 11, { color: INK, skew: 0, spacing: 0.1, outline: false })
        })
        t.draw(c, 'THE GUIDE FOR AGENTS:  PROJECT0.CITY/API/GAMES/ZER0-G/SKILL.MD', 640, 540, 10, { color: MUTED, align: 'center', skew: 0, spacing: 0.14, outline: false })
        hint('BACKSPACE: MENU')
        return
      }
      const p = this.own, acc = hex(p.accent)
      c.save(); cut(c, GARAGE.x, GARAGE.y, GARAGE.w, GARAGE.h, 14)
      const g = c.createLinearGradient(0, GARAGE.y, 0, GARAGE.y + GARAGE.h); g.addColorStop(0, 'rgba(4,6,20,0.94)'); g.addColorStop(1, 'rgba(14,8,30,0.96)')
      c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(255,138,230,0.3)'; c.lineWidth = 1; c.stroke(); c.restore()
      this.machineCard(c, p, 852, acc)
      const e = this.ownEntity
      if (e) t.draw(c, `VERSION ${e.version ?? 1}${e.updated ? `  /  UPDATED ${new Date(e.updated).toISOString().slice(0, 10)}` : ''}`, 852, 600, 9.5, { color: FAINT, skew: 0, spacing: 0.16, outline: false })
      t.draw(c, 'TO CHANGE IT, ASK YOUR AGENT TO UPDATE YOUR ZER0-G MACHINE', 852, 622, 9, { color: FAINT, skew: 0, spacing: 0.12, outline: false })
      hint('SPACE: RACE IT  ·  BACKSPACE: MENU')
      return
    }
    if (screen === 'gallery') {
      const gl = this.gal, list = gl.list
      this.header(c, 'GALLERY', list ? `${list.length} MACHINE${list.length === 1 ? '' : 'S'} BY PLAYERS  /  THE MOST LIKED FIRST` : 'LOADING', '#7dffb0')
      if (!list) { t.draw(c, 'LOADING THE PLAYERS\' MACHINES...', 640, 360, 12, { color: MUTED, align: 'center', skew: 0, spacing: 0.2, outline: false }); hint('BACKSPACE: MENU'); return }
      if (!list.length) { t.draw(c, 'NO MACHINES YET: BE THE FIRST (MY MACHINE SAYS HOW)', 640, 360, 12, { color: MUTED, align: 'center', skew: 0, spacing: 0.16, outline: false }); hint('BACKSPACE: MENU'); return }
      const per = GAL.cols * GAL.rows, first = gl.page * per
      list.slice(first, first + per).forEach((m, j) => {
        const k = first + j, x = GAL.x + (j % GAL.cols) * (GAL.w + GAL.gap), y = GAL.y + Math.floor(j / GAL.cols) * (GAL.h + GAL.gap)
        const on = k === gl.at, acc = '#' + String(m.data.accent).slice(1)
        glass(c, x, y, GAL.w, GAL.h, { on, hover: this.hover === `gal:${k}`, accent: acc, k: 10, glow: on })
        if (!m.face) { c.fillStyle = 'rgba(20,24,50,0.8)'; c.fillRect(x + 8, y + 8, GAL.w - 16, GAL.w - 16) }
        // its place by likes (the top three in gold), its name, who made it, its likes
        const top = m.place <= 3 && (m.likes ?? 0) > 0
        const pw = f.draw(c, `#${m.place}`, x + 12, y + GAL.w + 12, 12, { color: top ? C_GOLD : MUTED, skew: 0.1, outline: false })
        f.draw(c, String(m.name).slice(0, 13), x + 20 + pw, y + GAL.w + 12, 13, { color: on ? '#ffffff' : '#c8d8e8', skew: 0.12, outline: false })
        t.draw(c, `BY ${m.owner}`, x + 12, y + GAL.w + 34, 9, { color: MUTED, skew: 0, spacing: 0.16, outline: false })
        heart(c, x + 18, y + GAL.w + 56, 6, m.liked ? '#ff4d8d' : 'rgba(255,120,170,0.6)', m.liked)
        t.draw(c, String(m.likes ?? 0), x + 30, y + GAL.w + 57, 10, { color: m.liked ? '#ff8ab8' : INK, skew: 0, spacing: 0.1, outline: false })
        // under the picture (the pictures are drawn over the page): yours, or here in the lot now
        if (m.mine || m.here) {
          const tag = m.mine ? 'YOURS' : 'IN THE LOT', tc = m.mine ? '#ff8ae6' : '#7dffb0', tw = t.measure(tag, 8, 0.2) + 14
          c.save(); roundRect(c, x + GAL.w - 12 - tw, y + GAL.w + 25, tw, 17, 4); c.fillStyle = 'rgba(4,6,18,0.75)'; c.fill(); c.strokeStyle = tc; c.lineWidth = 1; c.stroke(); c.restore()
          t.draw(c, tag, x + GAL.w - 12 - tw / 2, y + GAL.w + 34, 8, { color: tc, align: 'center', skew: 0, spacing: 0.2, outline: false })
        }
        if (on) brackets(c, x, y, GAL.w, GAL.h, acc, 10, 3)
      })
      const pages = Math.ceil(list.length / per)
      if (pages > 1) t.draw(c, `PAGE ${gl.page + 1} / ${pages}`, GAL.x + 3 * (GAL.w + GAL.gap) - GAL.gap, 640, 9.5, { color: MUTED, align: 'right', skew: 0, spacing: 0.2, outline: false })
      // the stand and the picked one's card
      const m = list[gl.at]
      c.save(); cut(c, GAL_STAND.x, GAL_STAND.y, GAL_STAND.w, GAL_STAND.h, 12)
      const gr = c.createLinearGradient(0, GAL_STAND.y, 0, GAL_STAND.y + GAL_STAND.h); gr.addColorStop(0, 'rgba(4,6,20,0.94)'); gr.addColorStop(1, 'rgba(8,16,22,0.96)')
      c.fillStyle = gr; c.fill(); c.strokeStyle = 'rgba(125,255,176,0.3)'; c.lineWidth = 1; c.stroke(); c.restore()
      if (gl.loadingModel) t.draw(c, 'BRINGING IT OUT...', GAL_STAND.x + GAL_STAND.w / 2, GAL_STAND.y + GAL_STAND.h / 2, 11, { color: MUTED, align: 'center', skew: 0, spacing: 0.24, outline: false })
      if (m) {
        const d = m.data, acc = '#' + String(d.accent).slice(1), X = GAL_STAND.x + 18, Y = GAL_STAND.y + GAL_STAND.h + 36
        glass(c, GAL_STAND.x, GAL_STAND.y + GAL_STAND.h + 10, GAL_STAND.w, 236, { k: 12 })
        f.draw(c, String(m.name).slice(0, 16), X, Y, 22, { color: '#ffffff', skew: 0.12, outline: false, glow: acc, glowBlur: 10 })
        t.draw(c, `PILOT ${String(d.pilot).toUpperCase()}  /  MADE BY ${m.owner}'S AGENT`.slice(0, 46), X, Y + 30, 10, { color: MUTED, skew: 0, spacing: 0.16, outline: false })
        ;[['BODY', d.stats.body], ['BOOST', d.stats.boost], ['GRIP', d.stats.grip]].forEach(([name, gr2], k) => {
          const yy = Y + 64 + k * 30
          t.draw(c, name, X, yy, 10, { color: MUTED, skew: 0, spacing: 0.2, outline: false })
          slantBar(c, X + 64, yy - 5, 200, 9, GRADE[gr2], gr2 <= 'B' ? '#29d3ff' : gr2 === 'C' ? '#ffd23a' : '#ff6b6b', 'rgba(10,14,40,0.75)', 'rgba(130,190,240,0.35)')
          f.draw(c, gr2, X + 284, yy, 15, { color: gr2 === 'A' ? C_GOLD : '#ffffff', skew: 0.1, outline: false })
        })
        const R = X + 330
        t.draw(c, `WEIGHT  ${d.weight} KG`, R, Y + 64, 10, { color: MUTED, skew: 0, spacing: 0.16, outline: false })
        t.draw(c, `NITRO  ${String(d.particle).toUpperCase()}S`, R, Y + 94, 10, { color: MUTED, skew: 0, spacing: 0.16, outline: false })
        swatch(c, R, Y + 112, d.accent, 'ACCENT'); swatch(c, R + 120, Y + 112, d.flame, 'FLAME')
        if (d.description) t.draw(c, String(d.description).toUpperCase().slice(0, 64) + (String(d.description).length > 64 ? '...' : ''), X, Y + 170, 8.5, { color: FAINT, skew: 0, spacing: 0.08, outline: false })
        // the like button: a heart, the count; lit when you like it
        const b = LIKE_BTN, hov = this.hover === 'like', lit = m.liked, pulse = gl.pulse ?? 0
        c.save(); cut(c, b.x, b.y, b.w, b.h, 8)
        if (lit) { const lg = c.createLinearGradient(b.x, 0, b.x + b.w, 0); lg.addColorStop(0, 'rgba(255,60,140,0.55)'); lg.addColorStop(1, 'rgba(255,43,214,0.4)'); c.fillStyle = lg; c.shadowColor = '#ff4d8d'; c.shadowBlur = 14 + pulse * 20 }
        else c.fillStyle = hov ? 'rgba(255,77,141,0.16)' : 'rgba(8,12,30,0.75)'
        c.fill(); c.strokeStyle = lit ? '#ffb3cf' : hov ? '#ff8ab8' : 'rgba(255,120,170,0.5)'; c.lineWidth = 1.4; c.stroke(); c.restore()
        heart(c, b.x + 30, b.y + b.h / 2 + 1, 9 * (1 + pulse * 0.35), lit ? '#ffffff' : '#ff4d8d', lit)
        f.draw(c, String(m.likes ?? 0), b.x + 52, b.y + b.h / 2 + 1, 17, { color: '#ffffff', skew: 0.1, outline: false })
        t.draw(c, m.mine ? 'YOURS' : gl.liking ? '...' : lit ? 'LIKED' : 'LIKE', b.x + b.w - 16, b.y + b.h / 2 + 1, 11, { color: lit ? '#ffffff' : '#ff8ab8', align: 'right', skew: 0, spacing: 0.24, outline: false })
        if (gl.note) t.draw(c, gl.note, b.x + b.w, b.y + b.h + 16, 9, { color: gl.note === 'LIKED!' ? '#ff8ab8' : MUTED, align: 'right', skew: 0, spacing: 0.14, outline: false })
      }
      hint('ARROWS: PICK  ·  SPACE: LIKE  ·  BACKSPACE: MENU')
      return
    }
    if (screen === 'machine') {
      const p = PILOTS[s.machine]
      if (this.onlinePick) {
        const v = this.online.view()
        this.header(c, this.locked ? 'LOCKED IN' : 'PICK YOUR MACHINE', this.locked ? 'WAITING FOR THE OTHERS' : 'ONLINE RACE', C_PINK)
        f.draw(c, `${Math.ceil(v.left)}`, 1240, 42, 34, { color: v.left < 5 ? '#ff4d6d' : C_GOLD, align: 'right', skew: 0.1, outline: false })
        t.draw(c, `${v.members.filter(m => m.ok).length} / ${v.members.length} READY`, 1180, 46, 11, { color: INK, align: 'right', skew: 0, spacing: 0.16, outline: false })
      } else this.header(c, 'SELECT MACHINE', MODE_SUB[MODES[s.mode]])
      PILOTS.forEach((pp, k) => {
        const col = k % GRID.cols, row = Math.floor(k / GRID.cols)
        const x = GRID.x + col * (GRID.w + GRID.gap), y = GRID.y + row * (GRID.h + GRID.gap), on = k === s.machine, hov = this.hover === `tile:${k}`
        glass(c, x, y, GRID.w, GRID.h, { on, hover: hov, accent: pp.own ? C_PINK : hex(pp.accent), k: 7, glow: false })
        if (pp.own && !on) { c.save(); cut(c, x, y, GRID.w, GRID.h, 7); c.strokeStyle = 'rgba(255,43,214,0.75)'; c.lineWidth = 1.2; c.stroke(); c.restore() }
        t.draw(c, String(pp.name).slice(0, 15), x + GRID.w / 2, y + GRID.h - 9, 8.5, { color: pp.own ? '#ff9de9' : on ? '#ffffff' : MUTED, align: 'center', skew: 0, spacing: 0.1, outline: false })
      })
      // the selected one: its corners marked in its colour
      {
        const k = s.machine, x = GRID.x + (k % GRID.cols) * (GRID.w + GRID.gap), y = GRID.y + Math.floor(k / GRID.cols) * (GRID.h + GRID.gap)
        brackets(c, x, y, GRID.w, GRID.h, p.own ? C_PINK : hex(p.accent), 10, 3)
      }
      // no machine of your own yet: a tile that says how to get one
      if (this.entityHint) {
        const k = PILOTS.length, x = GRID.x + (k % GRID.cols) * (GRID.w + GRID.gap), y = GRID.y + Math.floor(k / GRID.cols) * (GRID.h + GRID.gap)
        const hov = this.hover === 'own'
        c.save()
        cut(c, x, y, GRID.w, GRID.h, 7)
        c.fillStyle = hov ? 'rgba(255,43,214,0.12)' : 'rgba(8,10,28,0.5)'; c.fill()
        c.setLineDash([4, 4]); c.strokeStyle = hov ? '#ff8ae6' : 'rgba(255,43,214,0.55)'; c.lineWidth = 1.2; c.stroke()
        c.restore()
        t.draw(c, '+', x + GRID.w / 2, y + 26, 24, { color: C_PINK, align: 'center', skew: 0, outline: false })
        t.draw(c, 'YOUR OWN', x + GRID.w / 2, y + 52, 9, { color: INK, align: 'center', skew: 0, spacing: 0.12, outline: false })
        t.draw(c, 'MACHINE', x + GRID.w / 2, y + 65, 9, { color: INK, align: 'center', skew: 0, spacing: 0.12, outline: false })
      }
      // the stand: a dark backdrop, so the race behind the menu does not show through
      c.save()
      cut(c, STAND.x, STAND.y, STAND.w, STAND.h, 14)
      const g = c.createLinearGradient(0, STAND.y, 0, STAND.y + STAND.h)
      g.addColorStop(0, 'rgba(4,6,20,0.94)'); g.addColorStop(1, 'rgba(10,16,40,0.96)')
      c.fillStyle = g; c.fill()
      c.strokeStyle = 'rgba(130,170,220,0.2)'; c.lineWidth = 1; c.stroke()
      c.restore()
      if (this.flash) t.draw(c, this.flash, STAND.x + STAND.w / 2, STAND.y + STAND.h - 20, 12, { color: '#ff9de9', align: 'center', skew: 0, spacing: 0.08, outline: false })
      // the pilot and the machine
      const X = SIDE.x, acc = p.own ? C_PINK : hex(p.accent)
      c.save(); c.strokeStyle = acc; c.lineWidth = 1.5; c.shadowColor = acc; c.shadowBlur = 10; c.strokeRect(X - 1.5, SIDE.y - 1.5, 203, 203); c.restore()
      t.draw(c, p.pilot, X, 320, 12, { color: MUTED, skew: 0, spacing: 0.24, outline: false })
      f.draw(c, p.name, X, 348, 22, { color: '#ffffff', skew: 0.12, outline: false, glow: acc, glowBlur: 10 })
      ;[['BODY', p.body], ['BOOST', p.boost], ['GRIP', p.grip]].forEach(([name, gr], k) => {
        const y = 392 + k * 36
        t.draw(c, name, X, y, 11, { color: MUTED, skew: 0, spacing: 0.2, outline: false })
        slantBar(c, X + 70, y - 5, 236, 10, GRADE[gr], gr <= 'B' ? '#29d3ff' : gr === 'C' ? '#ffd23a' : '#ff6b6b', 'rgba(10,14,40,0.75)', 'rgba(130,190,240,0.35)')
        f.draw(c, gr, X + 334, y, 18, { color: gr === 'A' ? C_GOLD : '#ffffff', skew: 0.1, outline: false })
      })
      t.draw(c, `WEIGHT  ${p.weight} KG`, X, 500, 10.5, { color: MUTED, skew: 0, spacing: 0.2, outline: false })
      t.draw(c, 'ENGINE', X, 544, 11, { color: INK, skew: 0, spacing: 0.24, outline: false })
      t.draw(c, 'ACCEL', X, 570, 9.5, { color: MUTED, skew: 0, spacing: 0.16, outline: false })
      t.draw(c, 'TOP SPEED', X + 300, 570, 9.5, { color: MUTED, skew: 0, spacing: 0.16, outline: false, align: 'right' })
      c.fillStyle = 'rgba(120,200,255,0.3)'; c.fillRect(X, 591, 300, 2)
      for (let k = 0; k <= 10; k++) { c.fillStyle = 'rgba(160,220,255,0.5)'; c.fillRect(X + k * 30 - 0.5, 587, 1, 10) }
      const ex = X + s.engine * 300
      c.save(); c.shadowColor = C_PINK; c.shadowBlur = 10; c.fillStyle = C_PINK
      c.beginPath(); c.moveTo(ex, 582); c.lineTo(ex + 7, 592); c.lineTo(ex, 602); c.lineTo(ex - 7, 592); c.closePath(); c.fill(); c.restore()
      t.draw(c, 'Q / E OR CLICK', X + 150, 620, 9.5, { color: this.hover === 'engine' ? INK : FAINT, align: 'center', skew: 0, spacing: 0.14, outline: false })
      hint(this.onlinePick ? (this.locked ? 'BACKSPACE: LEAVE' : 'ARROWS: MACHINE  ·  Q / E: ENGINE  ·  SPACE: LOCK IN  ·  BACKSPACE: LEAVE')
        : 'ARROWS: MACHINE  ·  Q / E: ENGINE  ·  SPACE: NEXT  ·  BACKSPACE: BACK')
      return
    }
    if (screen === 'online') {
      const o = this.online, v = o.view(), rows = this.lobbyRows()
      const at = Math.max(0, Math.min(rows.length - 1, s.lobbyAt ?? 0))
      this.header(c, 'ONLINE RACE', `${v.inside} PLAYER${v.inside === 1 ? '' : 'S'} INSIDE THIS LOT  /  ${v.lobbies.length} LOBB${v.lobbies.length === 1 ? 'Y' : 'IES'}`, C_PINK)
      const top = Math.max(0, Math.min(at - LOBBY_ROW.shown + 1, rows.length - LOBBY_ROW.shown))
      rows.slice(top, top + LOBBY_ROW.shown).forEach((row, j) => {
        const k = top + j, x = LOBBY_ROW.x, y = LOBBY_ROW.y + j * (LOBBY_ROW.h + LOBBY_ROW.gap), w = LOBBY_ROW.w, h = LOBBY_ROW.h
        const on = k === at, hov = this.hover === `lob:${k}`
        if (row.create) {
          glass(c, x, y, w, h, { on, hover: hov, accent: C_PINK, k: 10 })
          plusMark(c, x + 40, y + h / 2, on, 16)
          f.draw(c, v.mine ? 'A NEW LOBBY OF YOUR OWN' : 'CREATE A LOBBY', x + 76, y + h / 2 - 7, 17, { color: on ? '#ffffff' : '#c8d8e8', skew: 0.12, outline: false })
          t.draw(c, row.full ? 'THE LOT HAS AS MANY LOBBIES AS IT TAKES' : 'YOU PICK THE COURSE AND THE CLASS; THE OTHERS JOIN FROM HERE', x + 77, y + h / 2 + 14, 9, { color: on ? '#ff8ae6' : MUTED, skew: 0, spacing: 0.14, outline: false })
        } else {
          const open = row.phase === 'open', accent = row.mine ? C_PINK : open ? C_CYAN : C_GOLD
          glass(c, x, y, w, h, { on, hover: hov, accent, k: 10 })
          // the state, as a lamp: open (green), picking (gold), racing (red)
          const lamp = open ? '#3dff8a' : row.phase === 'pick' ? '#ffd23a' : '#ff4d6d'
          c.save(); c.beginPath(); c.arc(x + 26, y + h / 2, 6, 0, Math.PI * 2); c.fillStyle = lamp; c.shadowColor = lamp; c.shadowBlur = 10; c.fill(); c.restore()
          f.draw(c, `${row.owner}'S LOBBY`, x + 48, y + h / 2 - 7, 16, { color: on ? '#ffffff' : '#c8d8e8', skew: 0.12, outline: false })
          t.draw(c, `${this.tracks[row.co]?.name ?? ''}  /  ${CLASSES[row.c]?.name ?? ''}`, x + 49, y + h / 2 + 14, 9.5, { color: on ? C_CYAN : MUTED, skew: 0, spacing: 0.14, outline: false })
          const m = Math.floor(row.raceLeft / 60), sec = String(Math.floor(row.raceLeft % 60)).padStart(2, '0')
          const state = open ? `OPEN  /  ${row.count} IN` : row.phase === 'pick' ? `PICKING MACHINES  ${Math.ceil(row.left)}` : `RACING  /  ${row.racing} LEFT  /  ${m}:${sec}`
          t.draw(c, state, x + w - 20, y + h / 2 - 6, 11, { color: open ? '#7dffb0' : row.phase === 'pick' ? C_GOLD : '#ff8a9a', align: 'right', skew: 0, spacing: 0.18, outline: false })
          t.draw(c, row.mine ? 'YOURS' : open ? 'SPACE TO JOIN' : 'OPENS AGAIN AFTER THE RACE', x + w - 20, y + h / 2 + 14, 8.5, { color: row.mine ? '#ff8ae6' : FAINT, align: 'right', skew: 0, spacing: 0.18, outline: false })
        }
        if (on) brackets(c, x, y, w, h, row.create || row.mine ? C_PINK : '#ffffff', 10, 4)
      })
      if (rows.length > LOBBY_ROW.shown) t.draw(c, `${at + 1} / ${rows.length}`, LOBBY_ROW.x + LOBBY_ROW.w, LOBBY_ROW.y - 18, 9.5, { color: MUTED, align: 'right', skew: 0, spacing: 0.2, outline: false })
      if (this.flash) t.draw(c, this.flash, 640, 612, 12, { color: '#ff6b7d', align: 'center', skew: 0, spacing: 0.1, outline: false })
      else t.draw(c, 'AI RIVALS FILL EACH GRID TO 30 MACHINES', 640, 612, 10, { color: FAINT, align: 'center', skew: 0, spacing: 0.16, outline: false })
      hint('UP / DOWN: PICK  ·  SPACE: CREATE OR JOIN  ·  BACKSPACE: BACK')
      return
    }
    if (screen === 'lobby') {
      const o = this.online, v = o.view(), L = v.lobby
      this.header(c, 'ONLINE LOBBY', L ? `${this.tracks[L.co ?? 0]?.name ?? ''}  /  ${CLASSES[L.c]?.name ?? ''}  /  ${LAPS.online} LAPS` : '', C_PINK)
      glass(c, 300, 100, 680, 548, { on: true, accent: C_PINK, k: 16 })
      if (!L) { f.draw(c, 'THE LOBBY CLOSED', 640, 200, 22, { color: '#ffffff', align: 'center', skew: 0.12, outline: false }); hint('BACKSPACE: BACK'); return }
      t.draw(c, `${v.members.length} PLAYER${v.members.length === 1 ? '' : 'S'} IN  /  AI RIVALS FILL THE GRID TO 30`, 640, 134, 11, { color: C_CYAN, align: 'center', skew: 0, spacing: 0.16, outline: false })
      v.members.slice(0, 12).forEach((m, k) => {
        const y = 184 + k * 32, mine = m.pid === o.me, owner = m.pid === L.owner
        c.fillStyle = mine ? 'rgba(255,43,214,0.12)' : 'rgba(130,170,220,0.05)'; c.fillRect(360, y - 13, 560, 26)
        f.draw(c, String(m.n || 'PLAYER').slice(0, 16), 380, y, 15, { color: mine ? '#ff8ae6' : '#ffffff', skew: 0.1, outline: false })
        if (owner) t.draw(c, 'OWNER', 720, y, 10, { color: C_GOLD, skew: 0, spacing: 0.2, outline: false })
        if (m.away) t.draw(c, 'AWAY', owner ? 790 : 720, y, 10, { color: MUTED, skew: 0, spacing: 0.2, outline: false })
        if (L.phase === 'pick') t.draw(c, m.ok ? 'READY' : 'PICKING', 900, y, 10, { color: m.ok ? C_CYAN : MUTED, align: 'right', skew: 0, spacing: 0.2, outline: false })
      })
      if (L.phase === 'open') {
        if (!v.isOwner) t.draw(c, `WAITING FOR ${v.owner} TO START`, 640, 624, 14, { color: '#ffffff', align: 'center', skew: 0, spacing: 0.14, outline: false })
        if (v.members.length === 1) t.draw(c, 'THE OTHERS INSIDE THE LOT JOIN FROM ONLINE RACE', 640, 572, 10.5, { color: FAINT, align: 'center', skew: 0, spacing: 0.14, outline: false })
      } else if (L.phase === 'pick') f.draw(c, `PICKING MACHINES  ${Math.ceil(v.left)}`, 640, 624, 20, { color: C_GOLD, align: 'center', skew: 0.1, outline: false })
      else {
        const waiting = L.field?.some(e => e.pid === o.me) && !o.race
        if (waiting) t.draw(c, 'THE OTHERS ARE STILL RACING  /  THE LOBBY OPENS WHEN THEY FINISH', 640, 624, 12, { color: C_GOLD, align: 'center', skew: 0, spacing: 0.12, outline: false })
        else f.draw(c, 'GET READY!', 640, 624, 22, { color: C_GOLD, align: 'center', skew: 0.12, outline: false })
      }
      hint(v.isOwner && L.phase === 'open' ? 'SPACE: START  ·  BACKSPACE: LEAVE THE LOBBY' : 'BACKSPACE: LEAVE THE LOBBY')
      return
    }
    if (screen === 'course') {
      const mode = MODES[s.mode], gp = mode === 'gp', cupNow = this.cups[this.cupIndex()]
      this.header(c, gp ? 'SELECT CUP' : mode === 'online' ? 'CREATE A LOBBY' : 'SELECT COURSE', gp ? 'GRAND PRIX  /  THREE RACES FOR POINTS' : mode === 'online' ? 'ONLINE RACE  /  ITS COURSE AND CLASS' : 'TIME ATTACK  /  ALONE', mode === 'online' ? C_PINK : C_CYAN)
      // the cups, as tabs: the name, the world under it
      this.cups.forEach((cu, i) => {
        const b = cupTab(i, this.cups.length), on = i === this.cupIndex(), hov = this.hover === `cup:${i}`, focus = on && s.row === ROW.cup && this.cups.length > 1
        c.save()
        cut(c, b.x, b.y, b.w, b.h, 9)
        if (on) {
          const g = c.createLinearGradient(b.x, 0, b.x + b.w, 0)
          g.addColorStop(0, 'rgba(41,211,255,0.24)'); g.addColorStop(1, 'rgba(255,43,214,0.2)')
          c.fillStyle = g
        } else c.fillStyle = hov ? 'rgba(41,211,255,0.08)' : 'rgba(8,12,30,0.72)'
        c.fill()
        if (on) { c.shadowColor = C_CYAN; c.shadowBlur = 12 }
        c.strokeStyle = on ? C_CYAN : hov ? 'rgba(220,240,255,0.6)' : 'rgba(130,170,220,0.22)'; c.lineWidth = on ? 1.5 : 1; c.stroke()
        c.restore()
        if (focus) brackets(c, b.x, b.y, b.w, b.h, '#ffffff', 10, 4)
        f.draw(c, cu.name, b.x + b.w / 2, b.y + 18, 15, { color: on ? '#ffffff' : '#9fb6cc', align: 'center', skew: 0.12, outline: false })
        t.draw(c, cu.theme, b.x + b.w / 2, b.y + 37, 9, { color: on ? C_CYAN : FAINT, align: 'center', skew: 0, spacing: 0.24, outline: false })
      })
      // the cup's three courses: a picture of each one's signature stretch, its name, what it is
      cupNow.courses.forEach((k, j) => {
        const tr = this.tracks[k], b = courseCard(j)
        const on = gp || s.course === k, hov = this.hover === `course:${k}`, focus = !gp && s.course === k && s.row === ROW.course
        glass(c, b.x, b.y, b.w, b.h, { on: on && !gp, hover: hov, accent: mode === 'online' ? C_PINK : C_CYAN, k: 12, glow: true })
        // the picture, inset under the card's cut corner
        const ix = b.x + 1, iy = b.y + 1, iw = b.w - 2, ih = HERO_H
        c.save()
        cut(c, ix, iy, iw, ih + 12, 11); c.clip()
        const hero = this.heroes?.[k]
        if (hero) c.drawImage(hero, ix, iy, iw, ih)
        else { c.fillStyle = 'rgba(6,8,24,0.95)'; c.fillRect(ix, iy, iw, ih); this.drawMap(c, ix + 20, iy + 14, iw - 40, ih - 28, k, C_CYAN, 2.5) }
        // the picture fades into the card below it; an unchosen card is dimmed
        const g = c.createLinearGradient(0, iy + ih - 50, 0, iy + ih)
        g.addColorStop(0, 'rgba(6,9,26,0)'); g.addColorStop(1, 'rgba(6,9,26,0.92)')
        c.fillStyle = g; c.fillRect(ix, iy + ih - 50, iw, 50)
        if (!on) { c.fillStyle = hov ? 'rgba(4,6,18,0.35)' : 'rgba(4,6,18,0.55)'; c.fillRect(ix, iy, iw, ih) }
        c.restore()
        // the map in the corner
        if (hero) {
          c.save(); roundRect(c, ix + iw - 98, iy + 10, 88, 62, 6); c.fillStyle = 'rgba(4,6,18,0.62)'; c.fill(); c.strokeStyle = 'rgba(130,170,220,0.25)'; c.lineWidth = 1; c.stroke(); c.restore()
          this.drawMap(c, ix + iw - 94, iy + 14, 80, 54, k, on ? C_CYAN : 'rgba(150,180,210,0.7)', 1.4)
        }
        // in a cup, its order
        if (gp) {
          c.save(); roundRect(c, ix + 12, iy + 12, 66, 22, 4); c.fillStyle = 'rgba(4,6,18,0.7)'; c.fill(); c.strokeStyle = 'rgba(41,211,255,0.6)'; c.lineWidth = 1; c.stroke(); c.restore()
          t.draw(c, `RACE ${j + 1}`, ix + 45, iy + 24, 9.5, { color: '#ffffff', align: 'center', skew: 0, spacing: 0.2, outline: false })
        }
        const ty = b.y + HERO_H + 24
        f.draw(c, tr.name, b.x + 22, ty, 20, { color: on ? '#ffffff' : '#9fb6cc', skew: 0.12, outline: false })
        t.draw(c, tr.blurb ?? BLURBS[k] ?? '', b.x + 22, ty + 28, 9.5, { color: on ? '#cfe6f7' : FAINT, skew: 0, spacing: 0.12, outline: false })
        const best = this.best[`${mode === 'ta' ? 'ta' : 'race'}:${k}`]
        c.fillStyle = 'rgba(130,170,220,0.14)'; c.fillRect(b.x + 22, b.y + b.h - 34, b.w - 44, 1)
        t.draw(c, `${LAPS[mode]} LAPS`, b.x + 22, b.y + b.h - 18, 9.5, { color: MUTED, skew: 0, spacing: 0.2, outline: false })
        t.draw(c, best ? `BEST  ${fmtTime(best)}` : 'NO TIME YET', b.x + b.w - 22, b.y + b.h - 18, 9.5, { color: best ? C_GOLD : FAINT, align: 'right', skew: 0, spacing: 0.16, outline: false })
        if (focus) brackets(c, b.x, b.y, b.w, b.h, mode === 'online' ? C_PINK : '#ffffff', 16, 5)
      })
      // the class: three buttons, the chosen one lit
      if (mode !== 'ta') {
        t.draw(c, 'CLASS', 640, CLASS_Y - 16, 9.5, { color: s.row === ROW.cls ? INK : MUTED, align: 'center', skew: 0, spacing: 0.3, outline: false })
        CLASSES.forEach((cl, k) => {
          const b = classPill(k), on = s.cls === k, hov = this.hover === `cls:${k}`
          c.save()
          cut(c, b.x, b.y, b.w, b.h, 8)
          if (on) {
            const g = c.createLinearGradient(b.x, 0, b.x + b.w, 0)
            g.addColorStop(0, 'rgba(255,43,214,0.5)'); g.addColorStop(1, 'rgba(130,50,255,0.45)')
            c.fillStyle = g; c.fill()
            c.shadowColor = C_PINK; c.shadowBlur = 16
            c.strokeStyle = '#ff9de9'; c.lineWidth = 1.5
          } else {
            c.fillStyle = hov ? 'rgba(41,211,255,0.1)' : 'rgba(8,12,30,0.72)'; c.fill()
            c.strokeStyle = hov ? 'rgba(220,240,255,0.65)' : 'rgba(130,170,220,0.3)'; c.lineWidth = 1
          }
          c.stroke(); c.restore()
          t.draw(c, cl.name, b.x + b.w / 2, b.y + b.h / 2 + 1, 12, { color: on ? '#ffffff' : hov ? INK : MUTED, align: 'center', skew: 0, spacing: 0.22, outline: false })
          if (on && s.row === ROW.cls) brackets(c, b.x, b.y, b.w, b.h, '#ffffff', 9, 4)
        })
      }
      const rows = this.courseRows()
      hint([
        rows.length > 1 ? 'UP / DOWN: ROW' : null,
        `LEFT / RIGHT: ${rows.map(r => r === ROW.cup ? 'CUP' : r === ROW.course ? 'COURSE' : 'CLASS').join(' / ')}`,
        gp ? 'SPACE: START THE CUP' : mode === 'online' ? 'SPACE: CREATE THE LOBBY' : 'SPACE: RACE',
        'BACKSPACE: BACK',
      ].filter(Boolean).join('  ·  '))
      return
    }
    if (screen === 'results') {
      const d = this.data
      if (!d) return
      const me = d.me
      const cupPlace = d.cup ? d.cup.table.findIndex(r => r.me) + 1 : 0
      const place = n => `${n}${ordinal(n).slice(String(n).length)}`
      const title = d.cup?.last ? (cupPlace === 1 ? 'CUP WINNER!' : `${place(cupPlace)} IN THE CUP`) : me.retired ? 'RETIRED' : me.rank === 1 ? 'WINNER!' : `${place(me.rank)} PLACE`
      const tc = me.retired ? '#ff4d6d' : me.rank <= 3 ? C_GOLD : C_CYAN
      f.draw(c, title, 640, 66, 42, { color: me.retired ? ['#ffe0e0', '#ff6b6b', '#ff1f3d'] : me.rank <= 3 ? GOLD : CYAN, align: 'center', skew: 0.14, outline: false, glow: tc, glowBlur: 14 })
      if (!me.retired) t.draw(c, `TIME  ${fmtTime(me.finishTime)}`, 640, 110, 16, { color: '#ffffff', align: 'center', skew: 0, spacing: 0.2, outline: false })
      // under the time: a record, the week's table, the cup's time, the city's prize (as many as there are)
      let ly = 134
      const line = (text, size, opts) => { t.draw(c, text, 640, ly, size, { align: 'center', skew: 0, outline: false, ...opts }); ly += 22 }
      if (d.record) line('NEW RECORD!', 13, { color: '#ff8ae6', spacing: 0.3, glow: C_PINK, glowBlur: 8 })
      if (this.weekly?.place) line(`WEEKLY TABLE  #${this.weekly.place}  /  YOUR BEST ${fmtTime(this.weekly.best / 1000)}`, 11, { color: C_GOLD, spacing: 0.16 })
      if (d.cup?.last && d.cup.total) line(`CUP TIME  ${fmtTime(d.cup.total)}`, 12, { color: C_CYAN, spacing: 0.2 })
      if (this.prize) line(this.prize.text, this.prize.ok ? 13 : 11, { color: this.prize.ok ? C_GOLD : '#ff8ae6', spacing: 0.16, glow: this.prize.ok ? 'rgba(255,170,30,0.7)' : null, glowBlur: 10 })
      // left: your laps, then the week's table
      glass(c, 100, 206, 440, 214, { k: 12 })
      t.draw(c, 'YOUR LAPS', 124, 230, 9.5, { color: MUTED, skew: 0, spacing: 0.3, outline: false })
      const fast = Math.min(...me.lapTimes)
      me.lapTimes.forEach((lt, k) => {
        t.draw(c, `LAP ${k + 1}`, 124, 262 + k * 28, 12, { color: MUTED, skew: 0, spacing: 0.2, outline: false })
        f.draw(c, fmtTime(lt), 300, 262 + k * 28, 16, { color: lt === fast ? C_GOLD : '#ffffff', skew: 0.1, outline: false })
      })
      if (me.kos) t.draw(c, `KO  x${me.kos}`, 124, 262 + me.lapTimes.length * 28 + 10, 12, { color: C_GOLD, skew: 0, spacing: 0.2, outline: false })
      glass(c, 100, 436, 440, 212, { k: 12 })
      this.drawTable(c, 124, 462, 'left', 7)
      // right: the race, then the cup so far
      glass(c, 600, 206, 580, 442, { k: 12 })
      const rows = d.cup ? 8 : 14
      t.draw(c, d.cup ? `${d.cup.name ?? 'CUP'}  /  RACE ${d.cup.k + 1} OF 3` : 'STANDINGS', 624, 230, 9.5, { color: MUTED, skew: 0, spacing: 0.3, outline: false })
      d.standings.slice(0, rows).forEach((r, k) => {
        const y = 258 + k * 24
        const col = r.me ? '#ff8ae6' : r.human ? '#ff9de9' : '#ffffff'
        if (r.me) { c.fillStyle = 'rgba(255,43,214,0.14)'; c.fillRect(612, y - 11, 556, 22) }
        t.draw(c, String(k + 1), 646, y, 12, { color: k < 3 ? C_GOLD : MUTED, align: 'right', skew: 0, outline: false })
        t.draw(c, r.name.slice(0, 18), 662, y, 12, { color: col, skew: 0, spacing: 0.08, outline: false })
        t.draw(c, r.retired ? 'OUT' : r.finished ? fmtTime(r.time) : '--', 1156, y, 12, { color: col, align: 'right', skew: 0, spacing: 0.06, outline: false })
      })
      if (d.cup) {
        t.draw(c, d.cup.last ? 'THE CUP' : 'CUP POINTS', 624, 462, 9.5, { color: C_GOLD, skew: 0, spacing: 0.3, outline: false })
        const list = d.cup.table.slice(0, 7)
        if (cupPlace > 7) list.push(d.cup.table[cupPlace - 1])
        list.forEach((r, k) => {
          const y = 488 + k * 21, n = d.cup.table.indexOf(r) + 1
          t.draw(c, String(n), 646, y, 11.5, { color: n <= 3 ? C_GOLD : MUTED, align: 'right', skew: 0, outline: false })
          t.draw(c, r.name.slice(0, 18), 662, y, 11.5, { color: r.me ? '#ff8ae6' : '#ffffff', skew: 0, spacing: 0.08, outline: false })
          t.draw(c, `${r.pts} PTS`, 1156, y, 11.5, { color: r.me ? '#ff8ae6' : '#ffffff', align: 'right', skew: 0, spacing: 0.1, outline: false })
        })
      }
      hint(d.online ? 'SPACE: BACK TO THE LOBBY  ·  BACKSPACE: LEAVE IT' : d.cup ? 'SPACE: THE CUP STANDINGS  ·  BACKSPACE: MENU' : 'SPACE: RACE AGAIN  ·  BACKSPACE: MENU')
      return
    }
    if (screen === 'cup') {
      this.drawCup(c, hint)
      return
    }
  }

  /** A machine's card beside its stand: pilot, name, stats, weight, nitro particles and colours (x: its left). */
  machineCard(c, p, X, acc) {
    const f = this.font, t = this.thin
    c.save(); c.strokeStyle = acc; c.lineWidth = 1.5; c.shadowColor = acc; c.shadowBlur = 10; c.strokeRect(X - 1.5, 92 - 1.5, 203, 203); c.restore()
    t.draw(c, p.pilot, X, 320, 12, { color: MUTED, skew: 0, spacing: 0.24, outline: false })
    f.draw(c, p.name, X, 348, 22, { color: '#ffffff', skew: 0.12, outline: false, glow: acc, glowBlur: 10 })
    ;[['BODY', p.body], ['BOOST', p.boost], ['GRIP', p.grip]].forEach(([name, gr], k) => {
      const y = 392 + k * 36
      t.draw(c, name, X, y, 11, { color: MUTED, skew: 0, spacing: 0.2, outline: false })
      slantBar(c, X + 70, y - 5, 236, 10, GRADE[gr], gr <= 'B' ? '#29d3ff' : gr === 'C' ? '#ffd23a' : '#ff6b6b', 'rgba(10,14,40,0.75)', 'rgba(130,190,240,0.35)')
      f.draw(c, gr, X + 334, y, 18, { color: gr === 'A' ? C_GOLD : '#ffffff', skew: 0.1, outline: false })
    })
    t.draw(c, `WEIGHT  ${p.weight} KG`, X, 500, 10.5, { color: MUTED, skew: 0, spacing: 0.2, outline: false })
    if (p.particle) t.draw(c, `NITRO  ${String(p.particle).toUpperCase()}S`, X, 526, 10.5, { color: MUTED, skew: 0, spacing: 0.2, outline: false })
    swatch(c, X, 548, hex(p.accent), 'ACCENT'); swatch(c, X + 120, 548, hex(p.flame), 'FLAME')
  }

  /** A pilot's portrait drawn into a canvas (the bitmaps are stored upside down, for the GPU). */
  drawFace(c, face, accent, x, y, s) {
    const img = this.faces[face]?.image
    c.save()
    roundRect(c, x, y, s, s, s * 0.18)
    c.fillStyle = hex(accent ?? 0x29d3ff); c.fill(); c.clip()
    if (img) { c.translate(x, y + s); c.scale(1, -1); c.drawImage(img, 0, 0, s, s) }
    c.restore()
    c.save(); roundRect(c, x, y, s, s, s * 0.18); c.strokeStyle = hex(accent ?? 0x29d3ff); c.lineWidth = 1.5; c.stroke(); c.restore()
  }

  /**
   * The cup standings after a race, as the old arcade racers showed them: the table as it stood, each racer's
   * points for this race landing beside them, the totals counting up, then the rows sliding to their new places,
   * yours marked with how far it moved. After the third race: the final standings, your total and the week's table.
   */
  drawCup(c, hint) {
    const f = this.font, tf = this.thin, d = this.data, cup = d.cup, t = this.cupT
    const rows = cup.rows.map(r => ({ ...r, after: r.before + r.add }))
    const byBefore = [...rows].sort((a, b) => b.before - a.before || b.after - a.after)
    const byAfter = [...rows].sort((a, b) => b.after - a.after || b.add - a.add)
    rows.forEach(r => { r.was = byBefore.indexOf(r) + 1; r.now = byAfter.indexOf(r) + 1 })
    const me = rows.find(r => r.me)
    const place = n => `${n}${ordinal(n).slice(String(n).length)}`
    const title = !cup.last ? `${cup.name ?? 'ZER0-G CUP'}  ${cup.k + 1} / 3` : me?.now === 1 ? 'CUP WINNER!' : `${place(me?.now ?? 0)} IN THE CUP`
    f.draw(c, title, 640, 52, cup.last ? 38 : 28, { color: cup.last ? GOLD : CYAN, align: 'center', skew: 0.14, outline: false, glow: cup.last ? C_GOLD : C_CYAN, glowBlur: 12 })
    if (me) tf.draw(c, `YOU  +${me.add} THIS RACE  /  ${me.after} IN ALL`, 640, 90, 12, { color: '#ffffff', align: 'center', skew: 0, spacing: 0.2, outline: false })
    // the twelve shown: the top eleven after this race and you (or the twelfth); ten after the last race, under
    // them the cup's card
    const N = cup.last ? 10 : 12
    const shown = byAfter.slice(0, N)
    if (me && me.now > N) shown[N - 1] = me
    const before = [...shown].sort((a, b) => b.before - a.before || b.after - a.after)
    const after = [...shown].sort((a, b) => b.after - a.after || b.add - a.add)
    const H = 40, Y0 = 124, X0 = 250, W = 780
    const slide = ease((t - 1.5) / 0.7), count = ease((t - 0.45) / 0.95), land = ease(t / 0.45)
    for (const r of shown) {
      const k0 = before.indexOf(r), k1 = after.indexOf(r)
      const y = Y0 + (k0 + (k1 - k0) * slide) * H
      const mine = r.me
      c.save()
      cut(c, X0, y, W, H - 6, 6)
      c.fillStyle = mine ? 'rgba(255,43,214,0.22)' : k1 < 3 && slide >= 1 ? 'rgba(255,190,40,0.1)' : 'rgba(6,9,26,0.72)'; c.fill()
      c.strokeStyle = mine ? '#ff8ae6' : 'rgba(130,170,220,0.16)'; c.lineWidth = mine ? 1.5 : 1; c.stroke()
      c.restore()
      const n = slide >= 1 ? r.now : r.was
      f.draw(c, String(n), X0 + 34, y + 17, 18, { color: n <= 3 ? C_GOLD : '#d8f6ff', align: 'right', skew: 0.12, outline: false })
      this.drawFace(c, r.face, r.accent, X0 + 44, y + 3, H - 12)
      f.draw(c, String(r.name).slice(0, 16), X0 + 88, y + 17, 15, { color: mine ? '#ff8ae6' : r.human ? '#ff9de9' : '#ffffff', skew: 0.12, outline: false })
      // this race's points landing, then the total counting up
      if (r.add) f.draw(c, `+${r.add}`, X0 + W - 150, y + 17, 16, { color: C_GOLD, align: 'right', skew: 0.1, outline: false, alpha: land * (1 - 0.5 * slide) })
      const total = Math.round(r.before + r.add * count)
      f.draw(c, `${total}`, X0 + W - 20, y + 17, 19, { color: mine ? '#ff8ae6' : '#ffffff', align: 'right', skew: 0.1, outline: false })
      // how far yours moved
      if (mine && slide >= 1 && r.was !== r.now) {
        const up = r.now < r.was, ax = X0 + W + 22, ay = y + 17
        c.save(); c.beginPath()
        if (up) { c.moveTo(ax - 9, ay + 6); c.lineTo(ax + 9, ay + 6); c.lineTo(ax, ay - 8) } else { c.moveTo(ax - 9, ay - 6); c.lineTo(ax + 9, ay - 6); c.lineTo(ax, ay + 8) }
        c.closePath(); c.fillStyle = up ? '#3dff8a' : '#ff4d6d'; c.fill(); c.restore()
        tf.draw(c, String(Math.abs(r.was - r.now)), ax + 16, ay, 13, { color: up ? '#3dff8a' : '#ff4d6d', skew: 0, outline: false })
      }
    }
    tf.draw(c, 'PTS', X0 + W - 20, Y0 - 12, 9, { color: MUTED, align: 'right', skew: 0, spacing: 0.3, outline: false })
    // the end of the cup (round 26, Stefan: "show what place you took in the table, how many points"): a card of
    // four: your place in the cup, your points, the cup's time, your place in the week's table (it comes back from
    // Project 0 a moment later; or why not)
    if (cup.last && t >= 2.2) {
      const y = Y0 + N * H + 10, k = ease((t - 2.2) / 0.4)
      c.save(); c.globalAlpha = k
      glass(c, X0, y, W, 104, { on: true, accent: C_GOLD, k: 12 })
      const w = this.weekly
      const cols = [
        ['THE CUP', me ? place(me.now) : '--', me?.now === 1 ? 'CUP WINNER' : '', me && me.now <= 3],
        ['POINTS', me ? `${me.after}` : '--', me ? `+${me.add} THIS RACE` : '', false],
        ['CUP TIME', cup.total ? fmtTime(cup.total) : '--', cup.total ? 'ALL THREE RACES' : 'FINISH ALL THREE RACES', false],
        ['WEEKLY TABLE', cup.weekly === false ? '--' : w?.place ? `#${w.place}` : cup.total ? '...' : '--',
          cup.weekly === false ? 'THE ZER0-G CUP ONLY' : w?.place ? `YOUR BEST ${fmtTime(w.best / 1000)}` : w?.reason ? String(w.reason).toUpperCase().slice(0, 30) : cup.total ? 'SENDING YOUR TIME' : 'NEEDS A CUP TIME', !!w?.place && w.place <= 3],
      ]
      cols.forEach(([label, value, sub, gold], i) => {
        const x = X0 + W / 8 + i * W / 4
        tf.draw(c, label, x, y + 24, 9.5, { color: MUTED, align: 'center', skew: 0, spacing: 0.3, outline: false })
        f.draw(c, value, x, y + 58, 28, { color: gold || i === 3 ? GOLD : '#ffffff', align: 'center', skew: 0.12, outline: false, glow: gold ? C_GOLD : null, glowBlur: 10 })
        if (sub) tf.draw(c, sub, x, y + 86, 9, { color: i === 3 ? C_GOLD : FAINT, align: 'center', skew: 0, spacing: 0.14, outline: false })
      })
      c.restore()
    } else if (!cup.last && t >= 2.2) {
      tf.draw(c, `NEXT  ${cup.next}`, 640, Y0 + 12 * H + 14, 13, { color: '#ffffff', align: 'center', skew: 0, spacing: 0.24, outline: false })
    }
    hint(cup.last ? 'SPACE: A NEW CUP  ·  BACKSPACE: MENU' : `SPACE: NEXT RACE  ·  BACKSPACE: MENU`)
  }

  /** The week's best times (the lot's table: lower wins), at x (aligned left or right), from y. */
  drawTable(c, x, y, align, rows = 10) {
    const f = this.font, t = this.thin
    if (align === 'right') glass(c, x - 290, y - 30, 314, 40 + Math.max(1, Math.min(rows, this.table?.length ?? 0)) * 22 + 16, { k: 10 })
    t.draw(c, 'WEEKLY TOP TIMES', x, y, 10, { color: C_GOLD, align, skew: 0, spacing: 0.3, outline: false })
    if (!this.table?.length) { t.draw(c, 'NO TIMES YET: FINISH A RACE', x, y + 26, 10, { color: MUTED, align, skew: 0, spacing: 0.12, outline: false }); return }
    this.table.slice(0, rows).forEach((row, k) => {
      const yy = y + 28 + k * 22, col = row.you ? '#ff8ae6' : k === 0 ? C_GOLD : '#ffffff'
      if (align === 'right') {
        t.draw(c, fmtTime(row.score / 1000), x, yy, 11.5, { color: col, align: 'right', skew: 0, spacing: 0.06, outline: false })
        t.draw(c, `${k + 1}  ${String(row.name).toUpperCase().slice(0, 14)}`, x - 270, yy, 11.5, { color: col, skew: 0, spacing: 0.08, outline: false })
      } else {
        t.draw(c, `${k + 1}  ${String(row.name).toUpperCase().slice(0, 14)}`, x, yy, 11.5, { color: col, skew: 0, spacing: 0.08, outline: false })
        t.draw(c, fmtTime(row.score / 1000), x + 392, yy, 11.5, { color: col, align: 'right', skew: 0, spacing: 0.06, outline: false })
      }
    })
  }

  /** A course seen from above, fitted into the box (x, y, w, h): z across, x up, the line brighter where it climbs. */
  drawMap(c, x, y, w, h, course, color, lw = 2) {
    const tr = this.tracks[course]
    this.coursePts = this.coursePts ?? []
    if (!this.coursePts[course]) this.coursePts[course] = tr.outline(3)
    const pts = this.coursePts[course]
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
    for (const [px, pz] of pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz) }
    const k = Math.min(w / (z1 - z0 || 1), h / (x1 - x0 || 1))
    const cx = x + w / 2 - (z0 + z1) / 2 * k, cy = y + h / 2 - (x0 + x1) / 2 * k
    c.save()
    c.lineWidth = lw; c.lineJoin = 'round'; c.strokeStyle = color
    c.shadowColor = color; c.shadowBlur = lw * 3
    c.beginPath()
    pts.forEach(([px, pz], i) => { if (i) c.lineTo(cx + pz * k, cy + px * k); else c.moveTo(cx + pz * k, cy + px * k) })
    c.closePath(); c.stroke()
    c.restore()
  }
}

// ---- the look: dark glass, hairlines, cut corners, one accent lit at a time
const INK = '#eaf6ff', MUTED = '#8fa9c4', FAINT = 'rgba(150,185,220,0.5)'
const C_CYAN = '#29d3ff', C_PINK = '#ff2bd6', C_GOLD = '#ffc94a'
const MODE_SUB = { gp: 'GRAND PRIX', online: 'ONLINE RACE', ta: 'TIME ATTACK' }
const BLURBS = ['THE CLASSIC: A LOOP, A TWIST, A SPIRAL', 'A PIPE: RIDE ITS WALLS AND CEILING', 'A DRUM: RIDE ROUND IT, OFF ITS SIDE']

// the course screen's layout
const HERO_H = 232            // the picture: 382 x 232, rendered at twice that (heroes.js)
const CLASS_Y = 560
const cupTab = (i, n) => ({ x: 640 + (i - (n - 1) / 2) * 316 - 150, y: 86, w: 300, h: 48 })
const courseCard = j => ({ x: 40 + j * 408, y: 152, w: 384, h: 352 })
const classPill = k => ({ x: 640 + (k - 1) * 184 - 85, y: CLASS_Y, w: 170, h: 40 })

/** A box with two corners cut (top left, bottom right): the menus' shape. */
function cut(c, x, y, w, h, k = 10) {
  c.beginPath()
  c.moveTo(x + k, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h - k); c.lineTo(x + w - k, y + h); c.lineTo(x, y + h); c.lineTo(x, y + k); c.closePath()
}

/** A glass panel: dark, a hairline edge; on, its accent edge with a soft glow; under the mouse, a brighter edge. */
function glass(c, x, y, w, h, { on = false, hover = false, accent = C_CYAN, k = 10, glow = true } = {}) {
  c.save()
  cut(c, x, y, w, h, k)
  const g = c.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, on ? 'rgba(16,26,56,0.88)' : 'rgba(10,14,34,0.8)')
  g.addColorStop(1, on ? 'rgba(7,12,32,0.92)' : 'rgba(5,8,22,0.84)')
  c.fillStyle = g; c.fill()
  if (on && glow) { c.shadowColor = accent; c.shadowBlur = 16 }
  c.strokeStyle = on ? accent : hover ? 'rgba(220,240,255,0.6)' : 'rgba(130,170,220,0.2)'
  c.lineWidth = on ? 1.5 : 1
  c.stroke()
  c.restore()
}

/** Corner brackets round a box: what the keys move. */
function brackets(c, x, y, w, h, color, len = 14, pad = 5) {
  const X0 = x - pad, Y0 = y - pad, X1 = x + w + pad, Y1 = y + h + pad
  c.save(); c.strokeStyle = color; c.lineWidth = 2; c.shadowColor = color; c.shadowBlur = 8
  c.beginPath()
  c.moveTo(X0, Y0 + len); c.lineTo(X0, Y0); c.lineTo(X0 + len, Y0)
  c.moveTo(X1 - len, Y0); c.lineTo(X1, Y0); c.lineTo(X1, Y0 + len)
  c.moveTo(X1, Y1 - len); c.lineTo(X1, Y1); c.lineTo(X1 - len, Y1)
  c.moveTo(X0 + len, Y1); c.lineTo(X0, Y1); c.lineTo(X0, Y1 - len)
  c.stroke(); c.restore()
}

/** A heart at (x, y), r its half width: filled, or an outline. */
function heart(c, x, y, r, color, filled) {
  c.save(); c.beginPath()
  c.moveTo(x, y + r * 0.9)
  c.bezierCurveTo(x - r * 1.3, y - r * 0.05, x - r * 0.75, y - r * 1.15, x, y - r * 0.45)
  c.bezierCurveTo(x + r * 0.75, y - r * 1.15, x + r * 1.3, y - r * 0.05, x, y + r * 0.9)
  c.closePath()
  if (filled) { c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 8; c.fill() } else { c.strokeStyle = color; c.lineWidth = 1.6; c.stroke() }
  c.restore()
}

/** A colour chip with its name (css colour or #rrggbb). */
function swatch(c, x, y, color, label) {
  c.save(); roundRect(c, x, y, 22, 22, 5); c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 8; c.fill(); c.restore()
  SWATCH_FONT?.draw(c, label, x + 30, y + 12, 9, { color: MUTED, skew: 0, spacing: 0.2, outline: false })
}
let SWATCH_FONT = null

/** MY MACHINE's mark when there is none yet: a plus in a ring. */
function plusMark(c, x, y, on, r = 30) {
  c.save(); c.strokeStyle = '#ff8ae6'; c.lineWidth = r < 20 ? 2 : 2.5; c.shadowColor = '#ff2bd6'; c.shadowBlur = on ? 14 : 6; c.globalAlpha = on ? 1 : 0.7
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke()
  const a = r * 0.43
  c.beginPath(); c.moveTo(x - a, y); c.lineTo(x + a, y); c.moveTo(x, y - a); c.lineTo(x, y + a); c.stroke(); c.restore()
}

/** The GALLERY's mark: three cards fanned out, a star on the front one. */
function cardsMark(c, x, y, on) {
  c.save(); c.globalAlpha = on ? 1 : 0.75; c.lineWidth = 2
  ;[[-16, -0.26, '#29d3ff'], [16, 0.26, '#ff2bd6'], [0, 0, '#7dffb0']].forEach(([dx, a, col]) => {
    c.save(); c.translate(x + dx, y); c.rotate(a); roundRect(c, -17, -24, 34, 48, 5)
    c.fillStyle = 'rgba(6,10,26,0.95)'; c.fill(); c.strokeStyle = col; c.shadowColor = col; c.shadowBlur = on ? 10 : 4; c.stroke(); c.restore()
  })
  c.beginPath()
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 5 : 11, an = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r) }
  c.closePath(); c.fillStyle = '#ffffff'; c.fill(); c.restore()
}

/** ONLINE RACE's mark: a globe of neon lines with a machine's orbit round it. */
function globe(c, x, y, r, on) {
  c.save()
  c.lineWidth = 3; c.lineCap = 'round'
  const g = c.createLinearGradient(x - r, y - r, x + r, y + r)
  g.addColorStop(0, '#29d3ff'); g.addColorStop(1, '#ff2bd6')
  c.strokeStyle = g; c.shadowColor = on ? '#ff2bd6' : '#29d3ff'; c.shadowBlur = on ? 16 : 8
  c.globalAlpha = on ? 1 : 0.75
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke()
  for (const k of [0.38, 0.75]) { c.beginPath(); c.ellipse(x, y, r * k, r, 0, 0, Math.PI * 2); c.stroke() }
  for (const h of [-0.5, 0, 0.5]) { const w = Math.sqrt(1 - h * h) * r; c.beginPath(); c.moveTo(x - w, y + h * r); c.lineTo(x + w, y + h * r); c.stroke() }
  c.lineWidth = 2.5; c.strokeStyle = '#ffd66b'; c.shadowColor = '#ffb020'
  c.beginPath(); c.ellipse(x, y, r * 1.45, r * 0.42, -0.35, 0.15 * Math.PI, 1.85 * Math.PI); c.stroke()
  // the machine at the orbit's head
  const a = 0.15 * Math.PI, px = Math.cos(a) * r * 1.45, py = Math.sin(a) * r * 0.42, th = -0.35
  c.fillStyle = '#ffffff'; c.shadowColor = '#ffffff'
  c.beginPath(); c.arc(x + Math.cos(th) * px - Math.sin(th) * py, y + Math.sin(th) * px + Math.cos(th) * py, 4.5, 0, Math.PI * 2); c.fill()
  c.restore()
}
