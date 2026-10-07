// The race HUD, laid out like the 64-bit arcade racers: time and lap times top left with the standings under
// them (the first seven as pilot portraits, and you), the POWER meter top right with the NITRO gauge under it
// (four cells) and the map under that, your place bottom left, speed and lap bottom right, and the big words
// in the middle.

import { fmtTime, ordinal, slantBar, roundRect } from './ui.js'
import { KMH, NITRO_CELL, LIVES, EMPTY, driftTier } from './race.js'

const CYAN = ['#ffffff', '#9ff3ff', '#29d3ff']
const GOLD = ['#fffbe0', '#ffd66b', '#ff9a1f']
const RED = ['#ffe0e0', '#ff6b6b', '#ff1f3d']
const PINK = ['#ffe8fb', '#ff8ae6', '#ff2bd6']
const hex = c => `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`
const TOP = 7                       // the standings show the first seven (and you, if further back)
const BIG = 3, ROW_BIG = 38, ROW = 27  // the first three a size bigger
const BOARD_W = 214, BOARD_H = BIG * ROW_BIG + (TOP - BIG) * ROW + 12 + ROW_BIG
// the map's panel
const MAP_W = 200, MAP_H = 236

export class Hud {
  constructor(overlay, font, track, faces = []) {
    this.font = font
    this.track = track
    this.faces = faces
    const f = font
    this.time = overlay.panel(380, 190, (c, race, me) => {
      f.draw(c, 'TIME', 24, 22, 20, { color: '#8fe9ff', skew: 0.15 })
      f.draw(c, fmtTime(Math.max(0, race.time)), 22, 62, 44, { color: CYAN, glow: 'rgba(41,211,255,0.6)' })
      const best = me.lapTimes.length ? Math.min(...me.lapTimes) : -1
      me.lapTimes.slice(-4).forEach((t, k) => {
        const n = me.lapTimes.length - Math.min(4, me.lapTimes.length) + k + 1
        f.draw(c, `${n}  ${fmtTime(t)}`, 26, 104 + k * 24, 18, { color: t === best && me.lapTimes.length > 1 ? GOLD : '#d8f6ff', skew: 0.12 })
      })
    }).place('tl', 16, 10, 0.78)
    // the standings: place, the pilot's portrait, the name
    this.board = overlay.panel(BOARD_W, BOARD_H, (c, race, me) => this.drawBoard(c, race, me)).place('tl', 16, 158, 0.9)
    // the lap, at the top in the middle
    this.lap = overlay.panel(300, 60, (c, race, me) => {
      const lap = Math.max(1, Math.min(race.laps, me.lap))
      f.draw(c, `LAP ${lap}/${race.laps}`, 150, 30, 30, { color: lap === race.laps ? GOLD : '#ffffff', align: 'center', glow: lap === race.laps ? 'rgba(255,170,30,0.6)' : 'rgba(41,211,255,0.4)' })
    }).place('t', 0, 8, 0.85)
    this.power = overlay.panel(420, 150, (c, me, blink) => {
      const k = me.energy / 100
      f.draw(c, 'POWER', 402, 18, 18, { color: '#8fe9ff', align: 'right', skew: 0.15 })
      // the machines left for this race: one mark each, a wrecked one hollow
      for (let i = 0; i < LIVES; i++) {
        const x = 42 + i * 30, y = 17, on = i < (me.lives ?? LIVES)
        c.save(); c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x + 11, y + 7); c.lineTo(x, y + 3); c.lineTo(x - 11, y + 7); c.closePath()
        if (on) { c.shadowColor = 'rgba(41,211,255,0.8)'; c.shadowBlur = 8; c.fillStyle = '#9ff3ff'; c.fill() } else { c.strokeStyle = 'rgba(255,90,110,0.7)'; c.lineWidth = 1.5; c.stroke() }
        c.restore()
      }
      const col = me.inPit ? (blink ? '#7dffb0' : '#29ffd0') : k > 0.5 ? '#29d3ff' : k > 0.25 ? '#ffd23a' : (blink ? '#ff1f3d' : '#7a0a1a')
      slantBar(c, 30, 34, 370, 26, k, col)
      if (me.energy < EMPTY) f.draw(c, 'DANGER', 215, 47, 20, { color: blink ? RED : '#ffffff', align: 'center' })
      // the nitro: four cells, a full one glows
      const cells = me.nitro / NITRO_CELL
      for (let i = 0; i < 4; i++) {
        const fill = Math.max(0, Math.min(1, cells - i))
        const full = fill >= 1
        c.save()
        if (full) { c.shadowColor = 'rgba(255,43,214,0.9)'; c.shadowBlur = 12 }
        slantBar(c, 30 + i * 93, 74, 86, 20, fill, full ? (me.boostT > 0 && blink ? '#ffffff' : '#ff2bd6') : '#7a2a8a', 'rgba(20,6,40,0.75)', full ? 'rgba(255,170,240,0.95)' : 'rgba(180,90,220,0.7)')
        c.restore()
      }
      const ready = Math.floor(cells)
      if (ready > 0) f.draw(c, `SHIFT: NITRO x${ready}`, 400, 122, 20, { color: blink && me.boostT <= 0 ? PINK : '#ff9de9', align: 'right', glow: 'rgba(255,43,214,0.7)' })
      else f.draw(c, 'NITRO', 400, 122, 18, { color: '#b77fd6', align: 'right' })
      if (me.inPit) f.draw(c, 'REPAIR +', 30, 122, 20, { color: ['#e0fff4', '#7dffb0', '#29ffd0'], glow: 'rgba(41,255,208,0.8)' })
      else if (me.kos) f.draw(c, `KO x${me.kos}`, 30, 122, 20, { color: GOLD })
    }).place('tr', 16, 10, 0.8)
    this.rank = overlay.panel(250, 150, (c, me, n) => {
      if (me.retired) { f.draw(c, 'OUT', 20, 70, 64, { color: RED }); return }
      const num = String(me.rank)
      const w = f.draw(c, num, 18, 70, 92, { color: me.rank <= 3 ? GOLD : CYAN, glow: me.rank <= 3 ? 'rgba(255,170,30,0.6)' : 'rgba(41,211,255,0.5)' })
      f.draw(c, ordinal(me.rank).slice(num.length), 30 + w, 52, 28, { color: '#ffffff' })
      f.draw(c, `/ ${n}`, 32 + w, 92, 22, { color: '#8fb8d0' })
    }).place('bl', 16, 8, 0.6)
    this.speed = overlay.panel(400, 180, (c, me, race) => {
      const kmh = Math.round(me.sp * KMH)
      const boost = me.boostT > 0 || me.dashT > 0 || me.turbo > 0
      if (me.drift) {
        const tier = driftTier(me)
        f.draw(c, ['DRIFT', 'DRIFT!', 'DRIFT!!', 'DRIFT!!!'][tier], 384, 30, 26 + tier * 2, { color: ['#ffffff', CYAN, GOLD, PINK][tier], align: 'right', glow: ['rgba(255,255,255,0.4)', 'rgba(41,211,255,0.8)', 'rgba(255,154,31,0.8)', 'rgba(255,43,214,0.8)'][tier] })
      }
      // the flow: a thin bar over the speed, gold when full
      const fl = me.flow
      if (fl > 0.02) {
        slantBar(c, 150, 66, 234, 10, fl, fl >= 1 ? '#ffd23a' : '#29d3ff', 'rgba(10,14,40,0.6)', fl >= 1 ? 'rgba(255,220,120,0.95)' : 'rgba(120,220,255,0.6)')
        f.draw(c, `FLOW +${Math.round(fl * 25)}%`, 146, 72, 14, { color: fl >= 1 ? GOLD : '#9fe9ff', align: 'right' })
      }
      // the speed at the bottom, where the lap used to be
      f.draw(c, String(kmh), 300, 128, 74, { color: boost ? PINK : CYAN, align: 'right', glow: boost ? 'rgba(255,43,214,0.7)' : 'rgba(41,211,255,0.5)' })
      f.draw(c, 'KM/H', 384, 146, 20, { color: '#8fe9ff', align: 'right' })
    }).place('br', 16, 6, 0.8)
    // the map: the course from above as a road, the machines on it (the first three and you as portraits)
    this.map = overlay.panel(MAP_W, MAP_H, (c, race, me) => this.drawMap(c, race, me)).place('tr', 16, 150, 0.9)
    this.msg = overlay.panel(1000, 240, (c, text, sub, style) => {
      const color = style === 'gold' ? GOLD : style === 'red' ? RED : style === 'pink' ? PINK : CYAN
      f.draw(c, text, 500, 100, text.length <= 3 ? 150 : 96, { color, align: 'center', glow: style === 'red' ? 'rgba(255,40,60,0.8)' : 'rgba(41,211,255,0.8)', glowBlur: 30 })
      if (sub) f.draw(c, sub, 500, 196, 30, { color: '#ffffff', align: 'center' })
    }).place('c', 0, -60)
    this.small = overlay.panel(700, 50, (c, text, style) => {
      f.draw(c, text, 350, 26, 22, { color: style === 'gold' ? GOLD : style === 'red' ? RED : PINK, align: 'center', glow: style === 'gold' ? 'rgba(255,170,30,0.55)' : 'rgba(255,43,214,0.55)' })
    }).place('t', 0, 96)
    // the start lights: a dark gantry, three small lamps lit red one a second, then the big lamp blazes for GO
    this.lights = overlay.panel(520, 150, (c, lit, go, k) => {
      c.save()
      roundRect(c, 20, 26, 480, 98, 18)
      const g = c.createLinearGradient(0, 26, 0, 124); g.addColorStop(0, '#16141f'); g.addColorStop(1, '#07060c')
      c.fillStyle = g; c.fill()
      c.strokeStyle = go ? '#ff5a3c' : '#3a3346'; c.lineWidth = 3; c.stroke()
      // hazard stripes along the top and the bottom of the gantry
      c.save(); roundRect(c, 20, 26, 480, 98, 18); c.clip()
      for (let x = -40; x < 520; x += 26) { c.fillStyle = 'rgba(255,190,40,0.55)'; c.beginPath(); c.moveTo(x, 26); c.lineTo(x + 12, 26); c.lineTo(x + 2, 36); c.lineTo(x - 10, 36); c.fill(); c.beginPath(); c.moveTo(x, 114); c.lineTo(x + 12, 114); c.lineTo(x + 2, 124); c.lineTo(x - 10, 124); c.fill() }
      c.restore()
      const lamp = (x, y, r, on, hot) => {
        c.save()
        c.beginPath(); c.arc(x, y, r + 6, 0, Math.PI * 2); c.fillStyle = '#020204'; c.fill()
        const lg = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
        if (on) { lg.addColorStop(0, hot ? '#ffffff' : '#ffd2c8'); lg.addColorStop(0.35, hot ? '#ffd0a0' : '#ff3b2a'); lg.addColorStop(1, hot ? '#ff2a10' : '#8a0606'); c.shadowColor = hot ? '#ff6a30' : '#ff2020'; c.shadowBlur = hot ? 50 * k : 26 }
        else { lg.addColorStop(0, '#3a1414'); lg.addColorStop(1, '#140606') }
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = lg; c.fill()
        c.restore()
      }
      for (let i = 0; i < 3; i++) lamp(80 + i * 92, 75, 26, go ? Math.floor(k * 10) % 2 === 0 : i < lit, false)
      lamp(410, 75, 40, go, true)
      c.restore()
    }).place('t', 0, 70, 0.8)
    this.panels = [this.time, this.board, this.lap, this.power, this.rank, this.speed, this.map, this.msg, this.small]
    this.msgT = 0; this.msgDur = 0; this.smallT = 0; this.smallDur = 0
    this.frame = 0
    this.show(false)
  }

  show(on) {
    this.shown = on
    for (const p of this.panels) p.show(on)
    if (!on) this.lights?.show(false)
    if (on) { this.msg.show(this.msgT < this.msgDur); this.small.show(this.smallT < this.smallDur) }
  }

  /** The start lights: lit (0-3 small lamps red), go (the big one blazes), k (0-1, its flare). null hides them. */
  startLights(lit, go = false, k = 1) {
    if (lit === null) { this.lights.show(false); return }
    this.lights.update(`${lit}|${go}|${Math.round(k * 20)}`, lit, go, k)
    this.lights.show(this.shown !== false)
  }

  /** A big word in the middle for dur seconds (style: cyan, gold, red, pink). */
  say(text, dur = 1.2, style = 'cyan', sub = '') {
    this.msg.update(`${text}|${sub}|${style}`, text, sub, style)
    this.msgT = 0
    this.msgDur = dur
    this.msg.show(this.shown !== false)
  }

  note(text, dur = 1.5, style = 'pink') {
    this.small.update(`${text}|${style}`, text, style)
    this.smallT = 0
    this.smallDur = dur
    this.small.show(this.shown !== false)
  }

  /** A pilot's portrait in a frame of their colour (the bitmaps are stored upside down, for the GPU). */
  face(c, r, x, y, s, round = false) {
    const img = this.faces[r.face]?.image
    c.save()
    c.beginPath()
    if (round) c.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); else roundRect(c, x, y, s, s, s * 0.18)
    c.fillStyle = hex(r.accent); c.fill()
    c.clip()
    if (img) { c.translate(x, y + s); c.scale(1, -1); c.drawImage(img, 0, 0, s, s) }
    c.restore()
    c.beginPath()
    if (round) c.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); else roundRect(c, x, y, s, s, s * 0.18)
    c.strokeStyle = hex(r.accent); c.lineWidth = Math.max(1.5, s * 0.07); c.stroke()
  }

  /** The standings: the first three a size bigger, then four more, and you under them if you are further back. */
  drawBoard(c, race, me) {
    const f = this.font
    const rows = race.ranked.slice(0, TOP)
    const row = (r, y, n, big) => {
      const mine = r === me, h = big ? ROW_BIG : ROW, s = h - (big ? 6 : 5), mid = y + (h - 4) / 2
      c.save()
      roundRect(c, 0, y, BOARD_W, h - 4, big ? 8 : 6)
      c.fillStyle = mine ? 'rgba(255,43,214,0.3)' : big ? 'rgba(5,8,25,0.55)' : 'rgba(5,8,25,0.38)'; c.fill()
      if (mine) { c.strokeStyle = 'rgba(255,138,230,0.9)'; c.lineWidth = 1.5; c.stroke() }
      c.restore()
      f.draw(c, String(n), big ? 24 : 22, mid, big ? 18 : 13, { color: n <= 3 ? GOLD : '#d8f6ff', align: 'right', skew: 0.12 })
      const fx = big ? 30 : 28
      this.face(c, r, fx, y + 1, s)
      f.draw(c, String(r.name).slice(0, 12), fx + s + 7, mid, big ? 13 : 10, { color: mine ? PINK : r.human ? '#ff9de9' : big ? '#ffffff' : '#c8dceb', skew: 0.12 })
      if (r.retired) f.draw(c, 'OUT', BOARD_W - 6, mid, 10, { color: RED, align: 'right' })
      else if (r.finished) f.draw(c, 'GOAL', BOARD_W - 6, mid, 10, { color: GOLD, align: 'right' })
    }
    let y = 0
    rows.forEach((r, k) => { row(r, y, k + 1, k < BIG); y += k < BIG ? ROW_BIG : ROW })
    if (me && !rows.includes(me)) {
      c.fillStyle = 'rgba(200,230,255,0.6)'
      for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(BOARD_W / 2 - 9 + k * 9, y + 4, 2, 0, Math.PI * 2); c.fill() }
      row(me, y + 12, me.rank, true)
    }
  }

  drawMap(c, race, me) {
    const t = this.track
    if (!this.mapPts) {
      const pts = t.outline(3)
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
      for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
      // north (z-) at the top, as from the stands, centred in the panel with room for the portraits
      const k = Math.min((MAP_W - 36) / (x1 - x0), (MAP_H - 36) / (z1 - z0))
      this.mapK = { k, ox: (MAP_W - (x1 - x0) * k) / 2, oy: (MAP_H - (z1 - z0) * k) / 2, x1, z0 }
      this.mapPts = pts
    }
    const { k, ox, oy, x1, z0 } = this.mapK
    const X = x => ox + (x1 - x) * k, Y = z => oy + (z - z0) * k
    const pts = this.mapPts
    c.save()
    roundRect(c, 0, 0, MAP_W, MAP_H, 14)
    c.fillStyle = 'rgba(5,8,25,0.5)'; c.fill()
    c.strokeStyle = 'rgba(41,211,255,0.35)'; c.lineWidth = 1.5; c.stroke()
    c.restore()
    // the road: a dark band, then the coloured road over it (cyan low, pink high up), then a thin bright edge
    c.lineJoin = 'round'; c.lineCap = 'round'
    c.beginPath()
    pts.forEach(([x, z], i) => i ? c.lineTo(X(x), Y(z)) : c.moveTo(X(x), Y(z)))
    c.closePath()
    c.strokeStyle = 'rgba(0,0,10,0.75)'; c.lineWidth = 11; c.stroke()
    c.lineWidth = 7
    for (let i = 0; i < pts.length; i++) {
      const [x, z, y] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]
      const h = Math.min(1, y / 22)
      c.strokeStyle = `rgb(${Math.round(30 + 200 * h)},${Math.round(150 - 70 * h)},${Math.round(230 - 20 * h)})`
      c.beginPath(); c.moveTo(X(x), Y(z)); c.lineTo(X(x2), Y(z2)); c.stroke()
    }
    c.beginPath()
    pts.forEach(([x, z], i) => i ? c.lineTo(X(x), Y(z)) : c.moveTo(X(x), Y(z)))
    c.closePath()
    c.strokeStyle = 'rgba(200,245,255,0.55)'; c.lineWidth = 1.2; c.stroke()
    // the start line: a white bar across the road
    const s0 = pts[0], s1 = pts[1]
    const dx = X(s1[0]) - X(s0[0]), dy = Y(s1[1]) - Y(s0[1]), dl = Math.hypot(dx, dy) || 1
    c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.lineCap = 'butt'
    c.beginPath(); c.moveTo(X(s0[0]) - dy / dl * 7, Y(s0[1]) + dx / dl * 7); c.lineTo(X(s0[0]) + dy / dl * 7, Y(s0[1]) - dx / dl * 7); c.stroke()
    // the machines: the field as dots of their colour, then the first three and you as portraits (you on top)
    const at = r => { const i = t.index(r.D); return [X(t.P[i * 3]), Y(t.P[i * 3 + 2])] }
    const ranked = race.ranked
    for (let n = ranked.length - 1; n >= 0; n--) {
      const r = ranked[n]
      if (!r.alive || r === me || n < 3) continue
      const [px, py] = at(r)
      c.beginPath(); c.arc(px, py, r.human ? 4.5 : 3.5, 0, Math.PI * 2)
      c.fillStyle = r.human ? '#ff2bd6' : hex(r.accent); c.fill()
      c.strokeStyle = 'rgba(0,0,10,0.9)'; c.lineWidth = 1.2; c.stroke()
    }
    for (let n = Math.min(2, ranked.length - 1); n >= 0; n--) {
      const r = ranked[n]
      if (!r.alive || r === me) continue
      const [px, py] = at(r)
      this.face(c, r, px - 9, py - 9, 18, true)
      c.beginPath(); c.arc(px, py, 10, 0, Math.PI * 2); c.strokeStyle = '#ffd66b'; c.lineWidth = 1.5; c.stroke()
    }
    if (me?.alive) {
      const [px, py] = at(me)
      this.face(c, me, px - 12, py - 12, 24, true)
      c.beginPath(); c.arc(px, py, 13, 0, Math.PI * 2); c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.stroke()
    }
  }

  update(dt, race, me) {
    this.frame++
    this.msgT += dt
    this.smallT += dt
    if (this.msgT >= this.msgDur) this.msg.show(false)
    else {
      // the big words punch in and settle
      const k = Math.min(1, this.msgT / 0.18)
      this.msg.scale = 1 + (1 - k) * 0.6
      this.msg.layout()
    }
    if (this.smallT >= this.smallDur) this.small.show(false)
    if (this.frame % 2) return
    const blink = Math.floor(race.time * 4) % 2 === 0
    this.time.update(`${Math.floor(Math.max(0, race.time) * 100)}|${me.lapTimes.length}`, race, me)
    this.power.update(`${Math.round(me.energy * 2)}|${Math.round(me.nitro)}|${blink}|${me.kos}|${me.inPit}|${me.boostT > 0}|${me.lives}`, me, blink)
    this.rank.update(`${me.rank}|${race.racers.length}|${me.retired}`, me, race.racers.length)
    this.board.update(race.ranked.slice(0, TOP).map(r => `${r.i}${r.retired ? 'o' : r.finished ? 'g' : ''}`).join(',') + `|${me.rank}`, race, me)
    const tier = me.drift ? driftTier(me) : -1
    this.lap.update(`${me.lap}|${race.laps}`, race, me)
    this.speed.update(`${Math.round(me.sp * KMH)}|${me.boostT > 0 || me.dashT > 0 || me.turbo > 0}|${tier}|${Math.round(me.flow * 50)}`, me, race)
    if (this.frame % 4 === 0) this.map.update(this.frame, race, me)
  }
}
