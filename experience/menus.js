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
// the buttons for the mouse: back (bottom left) and on (bottom right)
const BACK = { x: 40, y: 663, w: 150, h: 40 }
const GO = { x: 1050, y: 663, w: 190, h: 40 }

export class Menus {
  constructor({ overlay, font, thin, logo, icons, portraits, showroom, audio, tracks, onStart, onNext, onLobby, onBack, entityHint = '', faces = [] }) {
    this.thin = thin ?? font        // the lighter weight: labels, small text, the keys
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
    this.sel = { mode: 0, machine: 0, engine: 0.5, cls: 1, course: 0, row: 1 }
    this.best = {}
    this.table = null
    this.online = null          // set by the game: the session's lobby
    this.onlinePick = false     // the machine screen is the online race's pick (against the clock)
    this.locked = false         // your pick is locked in
    this.weekly = null          // your place in the week's table after a race
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
    this.badge?.show(false)
    this.screen = null
  }

  open(screen, data) {
    if (screen !== 'mode' && screen !== 'online') this.flash = ''
    if (screen !== 'machine') this.onlinePick = false
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
    this.logo.show(screen === 'title' || screen === 'mode')
    this.prompt.show(screen === 'title')
    if (screen === 'title') { this.logo.place('c', 0, -40, 1); this.prompt.update('p', 'PRESS SPACE') }
    if (screen === 'mode') {
      this.logo.place('t', 0, 46, 0.5)
      this.icons.forEach((ic, k) => { if (!ic) return; ic.show(true); ic.place('c', (k - 1) * 330, -30, 1) })
    }
    if (screen === 'machine') this.showMachine()
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
    this.page.update(`${this.screen}|${JSON.stringify(this.sel)}|${JSON.stringify(this.best)}|${JSON.stringify(this.table ?? [])}|${this.dataKey ?? ''}|${this.lobbyKey()}|${JSON.stringify(this.weekly)}|${this.flash}|${this.hover}|${this.screen === 'cup' ? Math.round(this.cupT * 60) : 0}`, this.screen)
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
    else if (scr === 'machine') {
      if (this.onlinePick) { back('< LEAVE'); if (!this.locked) go('LOCK IN') }
      else { back('< BACK'); go('NEXT >') }
    } else if (scr === 'course') {
      back('< BACK')
      go(mode === 'gp' ? 'START THE CUP' : mode === 'online' ? 'CREATE LOBBY' : 'RACE >')
    } else if (scr === 'online') {
      back('< BACK')
      const L = o?.lobby
      const label = !o ? null : o.isMember && L ? 'BACK TO THE LOBBY' : L?.phase === 'open' ? 'JOIN' : !L ? 'CREATE A LOBBY' : null
      if (label) go(label, { x: 440, y: 390, w: 400, h: 58 }, 22)
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
      // pointing at a card selects it, a click chooses it
      for (let k = 0; k < 3; k++) {
        add(`mode:${k}`, 640 + (k - 1) * 330 - 150, 200, 300, 300, () => { s.mode = k; this.move('Space') },
          { over: () => { if (s.mode !== k) { s.mode = k; this.audio.sfx('gtr_move', { volume: 0.5 }) } } })
      }
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
    return `${v.lobby?.id ?? 0}|${v.lobby?.phase}|${v.lobby?.owner}|${Math.ceil(v.left)}|${v.members.map(m => m.pid + ':' + (m.ok ? 1 : 0)).join(',')}|${v.inside}|${v.mine}|${this.onlinePick}|${this.locked}`
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
      // the online race's door: join the open lobby, or create one (you pick its course and class)
      if (back) { this.audio.sfx('gtr_back'); this.open('mode'); return true }
      if (ok && o) {
        const L = o.lobby
        if (o.isMember && L) { this.audio.sfx('gtr_select'); this.open('lobby') }
        else if (L && L.phase === 'open') { if (o.join(s)) { this.audio.sfx('gtr_start', { volume: 1 }); this.open('lobby') } }
        else if (!L) { this.audio.sfx('gtr_select'); s.row = this.courseRows()[0]; this.open('course') }
      }
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
      else if (scr === 'machine') this.open('mode')
      else if (scr === 'course') this.open(MODES[s.mode] === 'online' ? 'online' : 'machine')
      else if (scr === 'results' || scr === 'cup') this.onBack?.()
      return true
    }
    if (scr === 'mode') {
      if (left || up) { s.mode = (s.mode + 2) % 3; moved = true }
      if (right || down) { s.mode = (s.mode + 1) % 3; moved = true }
      if (ok) {
        this.audio.sfx('gtr_select')
        if (MODES[s.mode] === 'online') { this.open('online'); return true }
        this.audio.voice('select'); this.open('machine'); return true
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
    if (this.screen === 'machine') this.showroom.update(dt)
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
    if (this.screen !== 'machine') return
    const o = this.overlay
    const u = o.unit
    const left = (o.width - 1280 * u) / 2, top = (o.height - 720 * u) / 2
    const x = left + STAND.x * u, w = STAND.w * u, h = STAND.h * u
    const y = o.height - (top + STAND.y * u) - h
    const cam = this.showroom.camera
    cam.aspect = w / h
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
      const cards = [['GRAND PRIX', 'THREE CUPS OF THREE RACES', C_CYAN], ['ONLINE RACE', `WITH THE OTHERS HERE  /  ${inside} INSIDE`, C_PINK], ['TIME ATTACK', 'ONE COURSE, AGAINST THE CLOCK', C_GOLD]]
      cards.forEach(([name, line, accent], k) => {
        const cx = 640 + (k - 1) * 330, on = s.mode === k, x = cx - 150, y = 200, w = 300, h = 300
        glass(c, x, y, w, h, { on, hover: this.hover === `mode:${k}`, accent, k: 14 })
        if (on) {
          brackets(c, x, y, w, h, accent)
          c.save(); c.shadowColor = accent; c.shadowBlur = 12; c.fillStyle = accent; c.fillRect(x + 40, y + h - 3, w - 80, 2); c.restore()
        }
        if (!this.icons[k]) globe(c, cx, 330, 54, on)
        f.draw(c, name, cx, 438, 24, { color: on ? '#ffffff' : '#9fb6cc', align: 'center', skew: 0.12, outline: false, glow: on ? accent : null, glowBlur: 10 })
        t.draw(c, line, cx, 468, 10.5, { color: on ? accent : MUTED, align: 'center', skew: 0, spacing: 0.16, outline: false })
      })
      if (this.flash) t.draw(c, this.flash, 640, 560, 14, { color: '#ff6b7d', align: 'center', skew: 0, spacing: 0.1, outline: false })
      hint('LEFT / RIGHT: SELECT  ·  SPACE: CHOOSE  ·  BACKSPACE: TITLE')
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
      const o = this.online, v = o.view(), L = v.lobby
      this.header(c, 'ONLINE RACE', `${v.inside} PLAYER${v.inside === 1 ? '' : 'S'} INSIDE THIS LOT`, C_PINK)
      glass(c, 340, 200, 600, 290, { on: true, accent: C_PINK, k: 16 })
      if (!L) {
        f.draw(c, 'NO LOBBY OPEN', 640, 262, 24, { color: '#ffffff', align: 'center', skew: 0.12, outline: false })
        t.draw(c, 'CREATE ONE: YOU PICK THE COURSE AND THE CLASS,', 640, 312, 11, { color: MUTED, align: 'center', skew: 0, spacing: 0.12, outline: false })
        t.draw(c, 'THE OTHERS HERE JOIN FROM THIS SCREEN', 640, 332, 11, { color: MUTED, align: 'center', skew: 0, spacing: 0.12, outline: false })
      } else if (v.mine) {
        f.draw(c, 'YOU ARE IN THE LOBBY', 640, 290, 22, { color: '#ffffff', align: 'center', skew: 0.12, outline: false })
      } else if (L.phase === 'open') {
        f.draw(c, `${v.owner}'S LOBBY`, 640, 262, 24, { color: '#ffffff', align: 'center', skew: 0.12, outline: false })
        t.draw(c, `${this.tracks[L.co ?? 0]?.name ?? ''}  /  ${CLASSES[L.c]?.name ?? ''}  /  ${v.members.length} IN`, 640, 312, 13, { color: C_CYAN, align: 'center', skew: 0, spacing: 0.14, outline: false })
      } else {
        f.draw(c, 'A RACE IS ON', 640, 272, 24, { color: C_GOLD, align: 'center', skew: 0.12, outline: false })
        t.draw(c, 'ITS LOBBY OPENS AGAIN WHEN IT ENDS', 640, 322, 12, { color: MUTED, align: 'center', skew: 0, spacing: 0.12, outline: false })
      }
      if (this.flash) t.draw(c, this.flash, 640, 530, 13, { color: '#ff6b7d', align: 'center', skew: 0, spacing: 0.1, outline: false })
      t.draw(c, 'AI RIVALS FILL THE GRID TO 30 MACHINES', 640, 570, 10.5, { color: FAINT, align: 'center', skew: 0, spacing: 0.16, outline: false })
      hint('SPACE: CREATE OR JOIN  ·  BACKSPACE: BACK')
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
      if (d.record) t.draw(c, 'NEW RECORD!', 640, 136, 13, { color: '#ff8ae6', align: 'center', skew: 0, spacing: 0.3, outline: false, glow: C_PINK, glowBlur: 8 })
      if (this.weekly?.place) t.draw(c, `WEEKLY TABLE  #${this.weekly.place}  /  YOUR BEST ${fmtTime(this.weekly.best / 1000)}`, 640, 160, 11, { color: C_GOLD, align: 'center', skew: 0, spacing: 0.16, outline: false })
      if (d.cup?.last && d.cup.total) t.draw(c, `CUP TIME  ${fmtTime(d.cup.total)}`, 640, 184, 12, { color: C_CYAN, align: 'center', skew: 0, spacing: 0.2, outline: false })
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
    // the twelve shown: the top eleven after this race and you (or the twelfth)
    const shown = byAfter.slice(0, 12)
    if (me && me.now > 12) shown[11] = me
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
    // the end of the cup: your total and the week's table
    if (cup.last && t >= 2.2) {
      const y = Y0 + 12 * H + 14
      const line = cup.total ? `CUP TIME  ${fmtTime(cup.total)}${cup.weekly === false ? '  /  THE WEEKLY TABLE COUNTS THE ZER0-G CUP' : ''}` : 'FINISH ALL THREE RACES FOR A CUP TIME'
      tf.draw(c, line, 640, y, 13, { color: C_CYAN, align: 'center', skew: 0, spacing: 0.18, outline: false })
      const week = this.weekly?.place ? `WEEKLY TABLE  #${this.weekly.place}  /  YOUR BEST ${fmtTime(this.weekly.best / 1000)}` : cup.total && cup.weekly !== false ? 'YOUR CUP TIME GOES TO THE WEEKLY TABLE...' : ''
      if (week) tf.draw(c, week, 640, y + 24, 11, { color: C_GOLD, align: 'center', skew: 0, spacing: 0.16, outline: false })
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
