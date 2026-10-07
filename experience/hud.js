// The race HUD, laid out like the 64-bit arcade racers: time and lap times top left with the standings under
// them (the first seven as pilot portraits, and you), the POWER meter top right with the NITRO gauge under it
// (four cells) and the map under that, your place bottom left, speed and lap bottom right, and the big words
// in the middle. Over the first three in the field (yours aside) a tag with their place hangs in the picture, so
// a leader up the road shows; across the finish the gauges go and black bars close in for the finish's shots.

import * as THREE from 'three'
import { fmtTime, ordinal, slantBar, roundRect } from './ui.js'
import { KMH, NITRO_CELL, LIVES, EMPTY, driftTier } from './race.js'
import { U } from './scale.js'

const CYAN = ['#ffffff', '#9ff3ff', '#29d3ff']
const GOLD = ['#fffbe0', '#ffd66b', '#ff9a1f']
const RED = ['#ffe0e0', '#ff6b6b', '#ff1f3d']
const SILVER = ['#ffffff', '#dceaf5', '#93acc2']
const BRONZE = ['#ffe6d2', '#ffa66b', '#c8622e']
const MEDAL = [GOLD, SILVER, BRONZE]
const MEDAL_EDGE = ['#ffc23a', '#c8dceb', '#f08a4a']
const MEDAL_GLOW = ['rgba(255,170,30,0.75)', 'rgba(200,225,245,0.6)', 'rgba(255,120,50,0.65)']
const TAG_W = 88, TAG_H = 96
// the pause plate (layout px) and its rows: exported for the clicks
export const PAUSE_W = 560, PAUSE_H = 380, PAUSE_ROW0 = 150, PAUSE_ROW = 62
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
    // the place tags: the place in its medal's colours on a dark plate, an arrow down to the machine
    this.tags = [0, 1, 2].map(k => overlay.panel(TAG_W, TAG_H, c => {
      c.save()
      roundRect(c, 6, 4, TAG_W - 12, 60, 12)
      c.fillStyle = 'rgba(8,10,26,0.82)'; c.fill()
      c.shadowColor = MEDAL_GLOW[k]; c.shadowBlur = 12
      c.strokeStyle = MEDAL_EDGE[k]; c.lineWidth = 3; c.stroke()
      c.beginPath(); c.moveTo(TAG_W / 2 - 16, 70); c.lineTo(TAG_W / 2 + 16, 70); c.lineTo(TAG_W / 2, 92); c.closePath()
      c.fillStyle = MEDAL_EDGE[k]; c.fill()
      c.restore()
      const num = String(k + 1), suf = ordinal(k + 1).slice(num.length)
      const w = f.measure(num, 48, 0.04), ws = f.measure(suf, 18, 0.04)
      const x0 = TAG_W / 2 - (w + 3 + ws) / 2
      f.draw(c, num, x0, 36, 48, { color: MEDAL[k], glow: MEDAL_GLOW[k] })
      f.draw(c, suf, x0 + w + 3, 24, 18, { color: '#ffffff', skew: 0.12 })
    }))
    for (const t of this.tags) { t.update('tag'); t.show(false) }
    this.tagP = new THREE.Vector3()
    // the finish's black bars, top and bottom
    this.bars = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, depthWrite: false, toneMapped: false }))
      m.visible = false
      overlay.scene.add(m)
      return m
    })
    this.overlay = overlay
    this.cine = false; this.cineK = 0
    // the pause (round 26, not online): the picture dimmed, a plate with its three choices
    this.dim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x02030a, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, toneMapped: false }))
    this.dim.visible = false
    this.dim.renderOrder = 5
    overlay.scene.add(this.dim)
    this.pauseP = overlay.panel(PAUSE_W, PAUSE_H, (c, sel, labels) => {
      c.save()
      roundRect(c, 4, 4, PAUSE_W - 8, PAUSE_H - 8, 22)
      const g = c.createLinearGradient(0, 0, 0, PAUSE_H); g.addColorStop(0, 'rgba(14,20,48,0.94)'); g.addColorStop(1, 'rgba(6,8,22,0.94)')
      c.fillStyle = g; c.fill()
      c.strokeStyle = 'rgba(41,211,255,0.55)'; c.lineWidth = 2; c.stroke()
      c.restore()
      f.draw(c, 'PAUSED', PAUSE_W / 2, 70, 52, { color: CYAN, align: 'center', glow: 'rgba(41,211,255,0.7)' })
      labels.forEach((label, k) => {
        const y = PAUSE_ROW0 + k * PAUSE_ROW, on = k === sel
        c.save()
        roundRect(c, 60, y - 23, PAUSE_W - 120, 46, 12)
        c.fillStyle = on ? 'rgba(41,211,255,0.16)' : 'rgba(255,255,255,0.03)'; c.fill()
        if (on) { c.shadowColor = 'rgba(41,211,255,0.8)'; c.shadowBlur = 12; c.strokeStyle = '#29d3ff'; c.lineWidth = 2; c.stroke() }
        c.restore()
        f.draw(c, label, PAUSE_W / 2, y, 24, { color: on ? '#ffffff' : '#9fb6cc', align: 'center', skew: 0.12, glow: on ? 'rgba(41,211,255,0.7)' : null })
      })
      f.draw(c, 'UP / DOWN  ·  SPACE: CHOOSE  ·  BACKSPACE: BACK TO THE RACE', PAUSE_W / 2, PAUSE_H - 30, 13, { color: '#8fb8d0', align: 'center', skew: 0 })
    }).place('c', 0, 0)
    this.pauseP.mesh.renderOrder = 6
    this.pauseP.show(false)
    this.panels = [this.time, this.board, this.lap, this.power, this.rank, this.speed, this.map, this.msg, this.small]
    this.gauges = [this.time, this.board, this.lap, this.power, this.rank, this.speed, this.map]
    this.msgT = 0; this.msgDur = 0; this.smallT = 0; this.smallDur = 0
    this.frame = 0
    this.show(false)
  }

  show(on) {
    this.shown = on
    for (const p of this.panels) p.show(on)
    if (!on) { this.lights?.show(false); for (const t of this.tags) t.show(false); for (const b of this.bars) b.visible = false }
    if (on) { this.msg.show(this.msgT < this.msgDur); this.small.show(this.smallT < this.smallDur); this.cine = false; this.cineK = 0; this.msg.place('c', 0, -60); this.small.place('t', 0, 96) }
  }

  /** The pause: the picture dimmed and the plate (sel: the chosen row of labels), or off. */
  pause(on, sel = 0, labels = []) {
    this.dim.visible = on
    if (on) {
      const o = this.overlay
      this.dim.scale.set(o.width + 4, o.height + 4, 1); this.dim.position.set(o.width / 2, o.height / 2, 0)
      this.pauseP.update(`${sel}|${labels.join()}`, sel, labels)
      this.lights?.show(false)
    }
    this.pauseP.show(on)
  }

  /** The finish's shots: the gauges go, the black bars close in (and open again when off). */
  cinema(on) {
    this.cine = on
    for (const p of this.gauges) p.show(this.shown && !on)
    // the big words go up, over the picture's top third (the shots hold the machine in the middle), and the small
    // line down to the foot of the picture
    this.msg.place('c', 0, on ? -212 : -60)
    this.small.place(on ? 'b' : 't', 0, on ? 92 : 96)
    if (on) for (const t of this.tags) t.show(false)
  }

  /**
   * The place tags over the first three (yours aside), where they are in the picture: camera (after it was set
   * this frame), frameOf (a racer's frame: its point p and up u). Smaller with distance; none behind the camera.
   */
  placeTags(race, me, camera, frameOf) {
    const o = this.overlay, P = this.tagP
    let shown = 0
    const placed = []
    if (this.shown && !this.cine && race.started) {
      camera.updateMatrixWorld()
      for (let k = 0; k < 3; k++) {
        const r = race.ranked[k], tag = this.tags[k]
        let on = !!r && r !== me && r.alive && !(r.wreckT > 0) && !r.falling
        if (on) {
          const f = frameOf(r)
          P.copy(f.p).addScaledVector(f.u, 0.12 * U)
          const d = P.distanceTo(camera.position)
          P.applyMatrix4(camera.matrixWorldInverse)
          if (P.z > -0.05) on = false
          else {
            P.applyMatrix4(camera.projectionMatrix)
            if (Math.abs(P.x) > 1.1 || Math.abs(P.y) > 1.2) on = false
            else {
              const sc = THREE.MathUtils.clamp(1.6 / Math.max(0.1, d), 0.58, 1), u = o.unit
              const w = TAG_W * u * sc, h = TAG_H * u * sc
              let x = (P.x + 1) / 2 * o.width, y = (P.y + 1) / 2 * o.height + h / 2
              // two machines close together: the lower place's tag stacks over the one before it
              for (const q of placed) if (Math.abs(q.x - x) < (q.w + w) * 0.42 && Math.abs(q.y - y) < (q.h + h) * 0.45) y = q.y + (q.h + h) * 0.45
              placed.push({ x, y, w, h })
              tag.mesh.position.set(x, y, 0)
              tag.mesh.scale.set(w, h, 1)
              tag.mat.opacity = THREE.MathUtils.clamp(1.3 - d / 60, 0.55, 1)
            }
          }
        }
        tag.show(on)
        if (on) shown++
      }
    } else for (const t of this.tags) t.show(false)
    return shown
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
    // the black bars: in over a fraction of a second, out as quickly
    this.cineK += ((this.cine ? 1 : 0) - this.cineK) * Math.min(1, dt * 7)
    const bh = this.cineK * 0.1 * this.overlay.height
    this.bars.forEach((b, k) => {
      b.visible = this.shown && bh > 0.5
      b.scale.set(this.overlay.width + 4, bh, 1)
      b.position.set(this.overlay.width / 2, k ? this.overlay.height - bh / 2 : bh / 2, 0)
    })
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
