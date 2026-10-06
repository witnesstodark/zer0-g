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
const MODES = ['gp', 'online', 'ta']

// the machine screen's layout (in the 1280 x 720 frame)
const GRID = { x: 40, y: 92, cols: 7, w: 104, h: 78, gap: 8 }   // 7 x 3: the eighteen, and a player's own
const STAND = { x: 40, y: 362, w: 788, h: 300 }
const SIDE = { x: 852, y: 92 }
// the buttons for the mouse: back (bottom left) and on (bottom right)
const BACK = { x: 40, y: 668, w: 170, h: 38 }
const GO = { x: 1010, y: 668, w: 230, h: 38 }

export class Menus {
  constructor({ overlay, font, logo, icons, portraits, showroom, audio, tracks, onStart, onNext, onLobby, onBack, entityHint = '' }) {
    this.entityHint = entityHint   // a player without a machine of their own: what to ask their agent
    this.overlay = overlay
    this.font = font
    this.audio = audio
    this.showroom = showroom
    this.tracks = tracks
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
    this.veil = overlay.panel(1280, 720, c => { c.fillStyle = 'rgba(3,4,16,0.6)'; c.fillRect(0, 0, 1280, 720) }).place('c', 0, 0)
    this.veil.update('v')
    this.page = overlay.panel(1280, 720, (c, screen) => this.draw(c, screen)).place('c', 0, 0)
    const la = logo.image ? logo.image.height / logo.image.width : 0.37
    this.logo = overlay.picture(logo, 700, 700 * la, true)
    this.icons = icons.map(t => overlay.picture(t, 130, 130, true))
    this.portraits = portraits.map(tex => overlay.picture(tex, 200, 200))
    this.tiles = []
    this.prompt = overlay.panel(700, 60, (c, text) => f.draw(c, text, 350, 30, 26, { color: CYAN, align: 'center', glow: 'rgba(41,211,255,0.8)' })).place('c', 0, 120)
    this.prompt.update('p', 'PRESS SPACE')
    this.hideAll()
  }

  /** The machines' pictures for the grid (rendered once by the showroom). */
  setThumbs(textures) {
    this.tiles = textures.map(t => this.overlay.picture(t, GRID.w - 8, (GRID.w - 8) * 120 / 192))
    for (const t of this.tiles) t.show(false)
    if (this.screen === 'machine') this.open('machine')
  }

  hideAll() {
    this.veil.show(false); this.page.show(false); this.logo.show(false); this.prompt.show(false)
    this.portraits.forEach(p => p.show(false))
    this.icons.forEach(p => p.show(false))
    this.tiles.forEach(p => p.show(false))
    this.screen = null
  }

  open(screen, data) {
    if (screen !== 'mode' && screen !== 'online') this.flash = ''
    if (screen !== 'machine') this.onlinePick = false
    this.screen = screen
    this.data = data ?? this.data
    this.blinkT = 0
    this.hover = null
    this.veil.show(screen !== 'title')
    this.page.show(true)
    this.portraits.forEach(p => p.show(false))
    this.icons.forEach(p => p.show(false))
    this.tiles.forEach(p => p.show(false))
    this.logo.show(screen === 'title' || screen === 'mode')
    this.prompt.show(screen === 'title')
    if (screen === 'title') { this.logo.place('c', 0, -40, 1); this.prompt.update('p', 'PRESS SPACE') }
    if (screen === 'mode') {
      this.logo.place('t', 0, 46, 0.5)
      this.icons.forEach((ic, k) => { ic.show(true); ic.place('c', (k - 1) * 330, -30, 1) })
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
    this.showroom.show(m)
  }

  redraw() {
    this.page.update(`${this.screen}|${JSON.stringify(this.sel)}|${JSON.stringify(this.best)}|${JSON.stringify(this.table ?? [])}|${this.dataKey ?? ''}|${this.lobbyKey()}|${JSON.stringify(this.weekly)}|${this.flash}|${this.hover}`, this.screen)
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
      go(d.online ? 'TO THE LOBBY' : d.cup && !d.cup.last ? 'NEXT RACE >' : d.cup ? 'A NEW CUP' : 'RACE AGAIN')
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
        add(`mode:${k}`, 640 + (k - 1) * 330 - 150, 220, 300, 270, () => { s.mode = k; this.move('Space') },
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
      if (mode !== 'gp') this.tracks.forEach((t, k) => add(`course:${k}`, 640 + (k - 1) * 410 - 195, 130, 390, 330, () => this.choose('course', k), { twice: true }))
      if (mode !== 'ta') CLASSES.forEach((cl, k) => add(`cls:${k}`, 480 + k * 160 - 75, 544, 150, 38, () => this.choose('cls', k)))
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

  choose(row, k) {
    const s = this.sel
    if (row === 'course') { if (s.course === k && s.row === 0) return; s.course = k; s.row = 0 }
    else { if (s.cls === k && s.row === 1) return; s.cls = k; s.row = 1 }
    this.audio.sfx('gtr_move', { volume: 0.7 })
    this.redraw()
  }

  drawButtons(c) {
    const f = this.font
    for (const b of this.buttons()) {
      const on = this.hover === b.id, big = b.h > 50
      c.save()
      roundRect(c, b.x, b.y, b.w, b.h, 10)
      c.fillStyle = on ? (b.primary ? 'rgba(255,43,214,0.42)' : 'rgba(41,211,255,0.32)') : big ? 'rgba(255,43,214,0.16)' : 'rgba(10,14,40,0.78)'
      c.fill()
      c.strokeStyle = b.primary ? '#ff2bd6' : '#29d3ff'; c.globalAlpha = on ? 1 : 0.75; c.lineWidth = on || big ? 3 : 2
      c.stroke()
      c.restore()
      f.draw(c, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, b.size, { color: on ? '#ffffff' : b.primary ? PINK : CYAN, align: 'center', glow: on || big ? (b.primary ? 'rgba(255,43,214,0.7)' : 'rgba(41,211,255,0.7)') : null })
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
        else if (!L) { this.audio.sfx('gtr_select'); s.row = 0; this.open('course') }
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
      else if (scr === 'results') this.onBack?.()
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
        s.row = s.mode === 0 ? 1 : 0
        this.open('course')
        return true
      }
    } else if (scr === 'course') {
      // the cup runs all three courses (only its class to pick); time attack has no class
      const rows = s.mode === 0 ? [1] : s.mode === 2 ? [0] : [0, 1]
      if ((up || down) && rows.length > 1) { s.row = 1 - s.row; moved = true }
      if (!rows.includes(s.row)) s.row = rows[0]
      if (left || right) {
        if (s.row === 0) s.course = (s.course + (right ? 1 : 2)) % 3
        else s.cls = (s.cls + (right ? 1 : 2)) % 3
        moved = true
      }
      if (ok && MODES[s.mode] === 'online') {
        // create the lobby on this course and class
        if (o?.create(s)) { this.audio.sfx('gtr_start', { volume: 1 }); this.open('lobby') } else this.open('online')
        return true
      }
      if (ok) { this.audio.sfx('gtr_start', { volume: 1 }); this.onStart({ ...s, mode: MODES[s.mode] }); return true }
    } else if (scr === 'results') {
      if (ok) {
        this.audio.sfx('gtr_start', { volume: 1 })
        if (this.data?.online) this.onLobby?.()
        else if (this.data?.cup && !this.data.cup.last) this.onNext?.()
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

  drawScreen(c, screen) {
    const f = this.font
    const s = this.sel
    const hint = text => f.draw(c, text, 640, 700, 13, { color: DIM, align: 'center', skew: 0.1 })
    if (screen === 'title') {
      this.drawTable(c, 1240, 420, 'right')
      hint('ARROWS  ·  SPACE TO CHOOSE  ·  BACKSPACE TO GO BACK')
      return
    }
    if (screen === 'mode') {
      const inside = this.online?.players.length ?? 1
      ;[['GRAND PRIX', 'THE CUP: 3 COURSES · POINTS'], ['ONLINE RACE', `WITH THE OTHERS HERE · ${inside} INSIDE`], ['TIME ATTACK', 'ONE COURSE · ALONE']].forEach(([name, line], k) => {
        const cx = 640 + (k - 1) * 330, on = s.mode === k
        c.save()
        roundRect(c, cx - 150, 220, 300, 270, 14)
        c.fillStyle = on ? 'rgba(41,211,255,0.12)' : 'rgba(10,14,40,0.55)'; c.fill()
        c.strokeStyle = on ? '#29d3ff' : 'rgba(120,160,200,0.3)'; c.lineWidth = on ? 3 : 1.5; c.stroke()
        c.restore()
        f.draw(c, name, cx, 450, 28, { color: on ? CYAN : '#8aa', align: 'center', glow: on ? 'rgba(41,211,255,0.7)' : null })
        f.draw(c, line, cx, 476, 12, { color: on ? '#ffffff' : DIM, align: 'center', skew: 0.08 })
      })
      if (this.flash) f.draw(c, this.flash, 640, 612, 16, { color: ['#ffe0e0', '#ff6b6b', '#ff1f3d'], align: 'center' })
      hint('LEFT / RIGHT  ·  SPACE TO CHOOSE  ·  BACKSPACE: TITLE')
      return
    }
    if (screen === 'machine') {
      const p = PILOTS[s.machine]
      if (this.onlinePick) {
        const v = this.online.view()
        f.draw(c, this.locked ? 'LOCKED IN · WAITING FOR THE OTHERS' : 'ONLINE RACE: PICK YOUR MACHINE', 40, 58, 22, { color: this.locked ? GOLD : PINK, glow: 'rgba(255,43,214,0.6)' })
        f.draw(c, `${Math.ceil(v.left)}`, 1240, 60, 44, { color: v.left < 5 ? ['#ffe0e0', '#ff6b6b', '#ff1f3d'] : GOLD, align: 'right' })
        f.draw(c, `${v.members.filter(m => m.ok).length} / ${v.members.length} READY`, 1170, 60, 15, { color: '#ffffff', align: 'right' })
      } else f.draw(c, 'SELECT MACHINE', 40, 58, 22, { color: CYAN, glow: 'rgba(41,211,255,0.6)' })
      PILOTS.forEach((pp, k) => {
        const col = k % GRID.cols, row = Math.floor(k / GRID.cols)
        const x = GRID.x + col * (GRID.w + GRID.gap), y = GRID.y + row * (GRID.h + GRID.gap), on = k === s.machine, hov = this.hover === `tile:${k}`
        c.save()
        roundRect(c, x, y, GRID.w, GRID.h, 8)
        c.fillStyle = on ? 'rgba(41,211,255,0.16)' : hov ? 'rgba(41,211,255,0.1)' : 'rgba(8,10,28,0.7)'; c.fill()
        c.strokeStyle = on ? hex(pp.accent) : hov ? 'rgba(255,255,255,0.75)' : 'rgba(120,160,200,0.25)'; c.lineWidth = on ? 3 : hov ? 2 : 1; c.stroke()
        c.restore()
        f.draw(c, (pp.own ? 'YOURS: ' : '') + String(pp.name).slice(0, pp.own ? 10 : 15), x + GRID.w / 2, y + GRID.h - 8, 9, { color: pp.own ? '#ff8ae6' : on ? '#ffffff' : '#8ab', align: 'center', skew: 0.08, outline: false })
        if (pp.own && !on) { c.save(); roundRect(c, x, y, GRID.w, GRID.h, 8); c.strokeStyle = '#ff2bd6'; c.lineWidth = 2; c.stroke(); c.restore() }
      })
      // no machine of your own yet: a tile that says how to get one
      if (this.entityHint) {
        const k = PILOTS.length, x = GRID.x + (k % GRID.cols) * (GRID.w + GRID.gap), y = GRID.y + Math.floor(k / GRID.cols) * (GRID.h + GRID.gap)
        const hov = this.hover === 'own'
        c.save()
        roundRect(c, x, y, GRID.w, GRID.h, 8)
        c.fillStyle = hov ? 'rgba(255,43,214,0.14)' : 'rgba(8,10,28,0.55)'; c.fill()
        c.setLineDash([5, 4]); c.strokeStyle = hov ? '#ff8ae6' : 'rgba(255,43,214,0.6)'; c.lineWidth = 2; c.stroke()
        c.restore()
        f.draw(c, '+', x + GRID.w / 2, y + 26, 26, { color: PINK, align: 'center' })
        f.draw(c, 'YOUR OWN', x + GRID.w / 2, y + 52, 10, { color: '#ffffff', align: 'center', outline: false })
        f.draw(c, 'MACHINE', x + GRID.w / 2, y + 66, 10, { color: '#ffffff', align: 'center', outline: false })
      }
      if (this.flash) f.draw(c, this.flash, STAND.x + STAND.w / 2, STAND.y + STAND.h - 18, 13, { color: PINK, align: 'center' })
      // the stand: a dark backdrop, so the race behind the menu does not show through
      const g = c.createLinearGradient(0, STAND.y, 0, STAND.y + STAND.h)
      g.addColorStop(0, 'rgba(4,6,20,0.92)'); g.addColorStop(1, 'rgba(10,16,40,0.95)')
      c.fillStyle = g; c.fillRect(STAND.x, STAND.y, STAND.w, STAND.h)
      c.strokeStyle = 'rgba(41,211,255,0.25)'; c.lineWidth = 1
      c.strokeRect(STAND.x + 0.5, STAND.y + 0.5, STAND.w - 1, STAND.h - 1)
      const X = SIDE.x
      c.strokeStyle = hex(p.accent); c.lineWidth = 3
      c.strokeRect(X - 2, SIDE.y - 2, 204, 204)
      f.draw(c, p.pilot, X, 324, 18, { color: '#ffffff' })
      f.draw(c, p.name, X, 352, 22, { color: GOLD, glow: 'rgba(255,170,30,0.5)' })
      ;[['BODY', p.body], ['BOOST', p.boost], ['GRIP', p.grip]].forEach(([name, g], k) => {
        const y = 396 + k * 40
        f.draw(c, name, X, y, 13, { color: '#8fe9ff' })
        slantBar(c, X + 72, y - 8, 230, 14, GRADE[g], g <= 'B' ? '#29d3ff' : g === 'C' ? '#ffd23a' : '#ff6b6b')
        f.draw(c, g, X + 330, y, 22, { color: g === 'A' ? GOLD : '#ffffff' })
      })
      f.draw(c, `WEIGHT ${p.weight} KG`, X, 510, 12, { color: DIM })
      f.draw(c, 'ENGINE', X, 548, 15, { color: '#8fe9ff' })
      f.draw(c, 'ACCEL', X, 574, 11, { color: '#ffffff' })
      f.draw(c, 'TOP SPEED', X + 300, 574, 11, { color: '#ffffff', align: 'right' })
      c.fillStyle = 'rgba(120,200,255,0.35)'; c.fillRect(X, 590, 300, 4)
      for (let k = 0; k <= 10; k++) { c.fillStyle = 'rgba(160,220,255,0.6)'; c.fillRect(X + k * 30 - 1, 586, 2, 12) }
      const ex = X + s.engine * 300
      c.fillStyle = '#ff2bd6'; c.beginPath(); c.moveTo(ex, 580); c.lineTo(ex + 8, 592); c.lineTo(ex, 604); c.lineTo(ex - 8, 592); c.closePath(); c.fill()
      f.draw(c, 'Q / E OR CLICK', X + 150, 622, 11, { color: this.hover === 'engine' ? '#ffffff' : DIM, align: 'center' })
      hint(this.onlinePick ? (this.locked ? 'LOCKED IN  ·  THE RACE STARTS WHEN EVERYONE IS READY  ·  BACKSPACE: LEAVE' : 'ARROWS: MACHINE  ·  Q / E: ENGINE  ·  SPACE: LOCK IN  ·  BACKSPACE: LEAVE')
        : 'ARROWS: MACHINE  ·  Q / E: ENGINE  ·  SPACE: NEXT  ·  BACKSPACE: BACK')
      return
    }
    if (screen === 'online') {
      const o = this.online, v = o.view(), L = v.lobby
      f.draw(c, 'ONLINE RACE', 640, 110, 44, { color: PINK, align: 'center', glow: 'rgba(255,43,214,0.7)', glowBlur: 18 })
      f.draw(c, `${v.inside} PLAYER${v.inside === 1 ? '' : 'S'} INSIDE THIS LOT`, 640, 166, 16, { color: CYAN, align: 'center' })
      c.save()
      roundRect(c, 340, 220, 600, 250, 16)
      c.fillStyle = 'rgba(10,14,40,0.7)'; c.fill()
      c.strokeStyle = '#ff2bd6'; c.lineWidth = 3; c.stroke()
      c.restore()
      if (!L) {
        f.draw(c, 'NO LOBBY OPEN', 640, 270, 26, { color: '#ffffff', align: 'center' })
        f.draw(c, 'CREATE ONE: YOU PICK THE COURSE AND THE CLASS,', 640, 320, 13, { color: DIM, align: 'center' })
        f.draw(c, 'THE OTHERS HERE JOIN FROM THIS SCREEN', 640, 342, 13, { color: DIM, align: 'center' })
      } else if (v.mine) {
        f.draw(c, 'YOU ARE IN THE LOBBY', 640, 290, 24, { color: '#ffffff', align: 'center' })
      } else if (L.phase === 'open') {
        f.draw(c, `${v.owner}'S LOBBY`, 640, 270, 26, { color: '#ffffff', align: 'center' })
        f.draw(c, `${this.tracks[L.co ?? 0]?.name ?? ''}  ·  ${CLASSES[L.c]?.name ?? ''}  ·  ${v.members.length} IN`, 640, 320, 16, { color: CYAN, align: 'center' })
      } else {
        f.draw(c, 'A RACE IS ON', 640, 280, 26, { color: GOLD, align: 'center' })
        f.draw(c, 'ITS LOBBY OPENS AGAIN WHEN IT ENDS', 640, 330, 14, { color: DIM, align: 'center' })
      }
      if (this.flash) f.draw(c, this.flash, 640, 520, 16, { color: ['#ffe0e0', '#ff6b6b', '#ff1f3d'], align: 'center' })
      f.draw(c, 'AI RIVALS FILL THE GRID TO 30 MACHINES', 640, 560, 12, { color: DIM, align: 'center' })
      hint('CLICK OR SPACE: CREATE OR JOIN  ·  BACKSPACE: BACK')
      return
    }
    if (screen === 'lobby') {
      const o = this.online, v = o.view(), L = v.lobby
      c.save()
      roundRect(c, 300, 126, 680, 540, 16)
      c.fillStyle = 'rgba(10,14,40,0.72)'; c.fill()
      c.strokeStyle = '#ff2bd6'; c.lineWidth = 3; c.stroke()
      c.restore()
      f.draw(c, 'ONLINE LOBBY', 640, 90, 40, { color: PINK, align: 'center', glow: 'rgba(255,43,214,0.7)', glowBlur: 18 })
      if (!L) { f.draw(c, 'THE LOBBY CLOSED', 640, 200, 22, { color: '#ffffff', align: 'center' }); hint('BACKSPACE: BACK'); return }
      f.draw(c, `${this.tracks[L.co ?? 0]?.name ?? ''}  ·  ${CLASSES[L.c]?.name ?? ''}  ·  ${LAPS.online} LAPS`, 640, 152, 18, { color: '#ffffff', align: 'center' })
      f.draw(c, `${v.members.length} PLAYER${v.members.length === 1 ? '' : 'S'} IN  ·  AI RIVALS FILL THE GRID TO 30`, 640, 186, 14, { color: CYAN, align: 'center' })
      v.members.slice(0, 12).forEach((m, k) => {
        const y = 238 + k * 30, mine = m.pid === o.me, owner = m.pid === L.owner
        f.draw(c, String(m.n || 'PLAYER').slice(0, 16), 620, y, 20, { color: mine ? PINK : '#ffffff', align: 'right' })
        f.draw(c, owner ? 'OWNER' : '', 650, y, 13, { color: GOLD })
        if (L.phase === 'pick') f.draw(c, m.ok ? 'READY' : 'PICKING...', 760, y, 13, { color: m.ok ? CYAN : DIM })
      })
      if (L.phase === 'open') {
        if (!v.isOwner) f.draw(c, `WAITING FOR ${v.owner} TO START`, 640, 630, 20, { color: '#ffffff', align: 'center' })
        if (v.members.length === 1) f.draw(c, 'THE OTHERS INSIDE THE LOT JOIN FROM ONLINE RACE', 640, 570, 12, { color: DIM, align: 'center' })
      } else if (L.phase === 'pick') f.draw(c, `PICKING MACHINES · ${Math.ceil(v.left)}`, 640, 630, 24, { color: GOLD, align: 'center' })
      else f.draw(c, L.field?.some(e => e.pid === o.me) && !o.race ? 'THE OTHERS ARE STILL RACING · THE LOBBY OPENS WHEN THEY FINISH' : 'GET READY!', 640, 630, L.field?.some(e => e.pid === o.me) && !o.race ? 16 : 24, { color: GOLD, align: 'center' })
      hint(v.isOwner && L.phase === 'open' ? 'CLICK OR SPACE: START  ·  BACKSPACE: LEAVE THE LOBBY' : 'BACKSPACE: LEAVE THE LOBBY')
      return
    }
    if (screen === 'course') {
      const mode = MODES[s.mode], cup = mode === 'gp'
      f.draw(c, cup ? 'THE ZER0-G CUP: ALL THREE, FOR POINTS' : mode === 'online' ? 'CREATE A LOBBY: ITS COURSE AND CLASS' : 'SELECT COURSE', 40, 58, 22, { color: mode === 'online' ? PINK : CYAN, glow: 'rgba(41,211,255,0.6)' })
      const blurb = ['THE CLASSIC: A LOOP, A TWIST, A SPIRAL', 'A PIPE: RIDE ITS WALLS AND CEILING', 'A DRUM: RIDE ROUND IT, OFF ITS SIDE']
      this.tracks.forEach((t, k) => {
        const x = 640 + (k - 1) * 410, y = 300, on = cup || s.course === k, hov = this.hover === `course:${k}`
        c.save()
        roundRect(c, x - 195, y - 170, 390, 330, 14)
        c.fillStyle = on ? 'rgba(41,211,255,0.12)' : hov ? 'rgba(41,211,255,0.07)' : 'rgba(10,14,40,0.6)'; c.fill()
        c.strokeStyle = on && s.row === 0 && !cup ? '#29d3ff' : on ? 'rgba(41,211,255,0.6)' : hov ? 'rgba(255,255,255,0.7)' : 'rgba(120,160,200,0.3)'; c.lineWidth = on || hov ? 3 : 1.5; c.stroke()
        c.restore()
        this.drawCourse(c, x, y - 30, k, on)
        f.draw(c, (cup ? `${k + 1}. ` : '') + t.name, x, y + 104, 22, { color: on ? CYAN : '#8ab', align: 'center' })
        f.draw(c, blurb[k] ?? '', x, y + 128, 10, { color: on ? '#ffffff' : DIM, align: 'center', skew: 0.08 })
        const best = this.best[`${mode === 'ta' ? 'ta' : 'race'}:${k}`]
        f.draw(c, best ? `BEST ${fmtTime(best)}` : 'NO TIME YET', x, y + 150, 12, { color: best ? GOLD : DIM, align: 'center' })
      })
      if (mode !== 'ta') {
        f.draw(c, 'CLASS', 640, 530, 14, { color: '#8fe9ff', align: 'center' })
        CLASSES.forEach((cl, k) => {
          const x = 480 + k * 160, on = s.cls === k, hov = this.hover === `cls:${k}`
          f.draw(c, cl.name, x, 562, 20, { color: on ? (s.row === 1 ? PINK : '#ffffff') : hov ? '#d8f6ff' : DIM, align: 'center', glow: on && s.row === 1 ? 'rgba(255,43,214,0.7)' : hov ? 'rgba(41,211,255,0.6)' : null })
        })
      }
      f.draw(c, cup ? `3 RACES · ${LAPS.gp} LAPS EACH · POINTS BY PLACE` : `${MODE_LABEL[mode]} · ${LAPS[mode]} LAPS`, 640, 604, 14, { color: '#ffffff', align: 'center' })
      hint(cup ? 'LEFT / RIGHT: CLASS  ·  SPACE: RACE  ·  BACKSPACE: BACK' : mode === 'online' ? 'UP / DOWN: ROW  ·  LEFT / RIGHT: CHANGE  ·  SPACE: CREATE THE LOBBY  ·  BACKSPACE: BACK' : 'UP / DOWN: ROW  ·  LEFT / RIGHT: CHANGE  ·  SPACE: RACE  ·  BACKSPACE: BACK')
      return
    }
    if (screen === 'results') {
      const d = this.data
      if (!d) return
      const me = d.me
      const cupPlace = d.cup ? d.cup.table.findIndex(r => r.me) + 1 : 0
      const place = n => `${n}${ordinal(n).slice(String(n).length)}`
      const title = d.cup?.last ? (cupPlace === 1 ? 'CUP WINNER!' : `${place(cupPlace)} IN THE CUP`) : me.retired ? 'RETIRED' : me.rank === 1 ? 'WINNER!' : `${place(me.rank)} PLACE`
      f.draw(c, title, 640, 76, 48, { color: me.retired ? ['#ffe0e0', '#ff6b6b', '#ff1f3d'] : me.rank <= 3 ? GOLD : CYAN, align: 'center', glow: 'rgba(255,170,30,0.6)', glowBlur: 20 })
      if (!me.retired) f.draw(c, `TIME ${fmtTime(me.finishTime)}`, 640, 128, 22, { color: '#ffffff', align: 'center' })
      if (d.record) f.draw(c, 'NEW RECORD!', 640, 158, 18, { color: PINK, align: 'center', glow: 'rgba(255,43,214,0.8)' })
      if (this.weekly?.place) f.draw(c, `WEEKLY TABLE: #${this.weekly.place}  ·  YOUR BEST ${fmtTime(this.weekly.best / 1000)}`, 640, 184, 15, { color: GOLD, align: 'center' })
      this.drawTable(c, 140, 470, 'left', 6)
      me.lapTimes.forEach((t, k) => f.draw(c, `LAP ${k + 1}  ${fmtTime(t)}`, 140, 240 + k * 26, 15, { color: t === Math.min(...me.lapTimes) ? GOLD : '#d8f6ff', skew: 0.1 }))
      if (me.kos) f.draw(c, `KO x${me.kos}`, 140, 240 + me.lapTimes.length * 26 + 16, 17, { color: GOLD })
      const rows = d.cup ? 8 : 14
      f.draw(c, d.cup ? `RACE ${d.cup.k + 1} OF 3` : 'STANDINGS', 760, 220, 15, { color: '#8fe9ff' })
      d.standings.slice(0, rows).forEach((r, k) => {
        const y = 248 + k * 24
        const col = r.me ? PINK : r.human ? '#ff9de9' : '#ffffff'
        f.draw(c, `${String(k + 1).padStart(2, ' ')}`, 760, y, 14, { color: k < 3 ? GOLD : DIM, skew: 0.08 })
        f.draw(c, r.name.slice(0, 18), 800, y, 14, { color: col, skew: 0.08 })
        f.draw(c, r.retired ? 'OUT' : r.finished ? fmtTime(r.time) : '--', 1180, y, 14, { color: col, align: 'right', skew: 0.08 })
      })
      if (d.cup) {
        // the cup so far: points by place; you are always shown
        f.draw(c, d.cup.last ? 'THE CUP' : 'CUP POINTS', 760, 454, 15, { color: GOLD })
        const list = d.cup.table.slice(0, 7)
        if (cupPlace > 7) list.push(d.cup.table[cupPlace - 1])
        list.forEach((r, k) => {
          const y = 482 + k * 22, n = d.cup.table.indexOf(r) + 1
          f.draw(c, `${String(n).padStart(2, ' ')}`, 760, y, 13, { color: n <= 3 ? GOLD : DIM, skew: 0.08 })
          f.draw(c, r.name.slice(0, 18), 800, y, 13, { color: r.me ? PINK : '#ffffff', skew: 0.08 })
          f.draw(c, `${r.pts} PTS`, 1180, y, 13, { color: r.me ? PINK : '#ffffff', align: 'right', skew: 0.08 })
        })
        if (d.cup.last && d.cup.total) f.draw(c, `CUP TIME ${fmtTime(d.cup.total)}`, 640, 210, 16, { color: CYAN, align: 'center' })
      }
      hint(d.online ? 'SPACE: BACK TO THE LOBBY  ·  BACKSPACE: LEAVE IT' : d.cup && !d.cup.last ? `SPACE: NEXT RACE, ${d.cup.next}  ·  BACKSPACE: MENU` : d.cup ? 'SPACE: A NEW CUP  ·  BACKSPACE: MENU' : 'SPACE: RACE AGAIN  ·  BACKSPACE: MENU')
    }
  }

  /** The week's best times (the lot's table: lower wins), at x (aligned left or right), from y. */
  drawTable(c, x, y, align, rows = 10) {
    const f = this.font
    f.draw(c, 'WEEKLY TOP TIMES', x, y, 16, { color: GOLD, align, glow: 'rgba(255,170,30,0.5)' })
    if (!this.table?.length) { f.draw(c, 'NO TIMES YET: FINISH A RACE', x, y + 26, 12, { color: DIM, align, skew: 0.1 }); return }
    this.table.slice(0, rows).forEach((row, k) => {
      const text = `${k + 1}. ${String(row.name).toUpperCase().slice(0, 14)}  ${fmtTime(row.score / 1000)}`
      f.draw(c, text, x, y + 26 + k * 21, 13, { color: row.you ? PINK : k === 0 ? GOLD : '#ffffff', align, skew: 0.1 })
    })
  }

  drawCourse(c, cx, cy, course, on) {
    const t = this.tracks[course]
    this.coursePts = this.coursePts ?? []
    if (!this.coursePts[course]) this.coursePts[course] = t.outline(3)
    const pts = this.coursePts[course]
    // seen from the east stand: z across the card, x up it
    const k = 8.2
    c.lineWidth = 3
    const m = 1
    for (let i = 0; i < pts.length; i++) {
      const [x, z, y] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]
      const h = Math.min(1, y / 22)
      c.strokeStyle = on ? `rgba(${Math.round(40 + 215 * h)},${Math.round(200 - 60 * h)},255,0.95)` : `rgba(120,140,170,${0.4 + h * 0.3})`
      c.beginPath()
      c.moveTo(cx + z * k, cy + x * m * k)
      c.lineTo(cx + z2 * k, cy + x2 * m * k)
      c.stroke()
    }
  }
}
