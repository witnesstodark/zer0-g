// Text and panels on screen. p0.hud() is one line of plain text, so everything else is drawn here: a
// bitmap font (Orbitron Black, from the font atlases) into OffscreenCanvas panels, each a texture on a
// quad in an orthographic scene drawn over the game. Panels redraw only when what they show changes.

import * as THREE from 'three'

export class Font {
  constructor(fill, line, meta) {
    this.fill = fill
    this.line = line
    this.meta = meta
    this.scratch = new OffscreenCanvas(64, 64)
    this.sctx = this.scratch.getContext('2d')
  }

  /** Width of the text in px at size px. */
  measure(text, px, spacing = 0.04) {
    const k = px / this.meta.size
    let w = 0
    for (const ch of String(text).toUpperCase()) {
      const g = this.meta.glyphs[ch]
      w += (g ? g[4] : this.meta.space) * k + px * spacing
    }
    return Math.max(0, w - px * spacing)
  }

  /**
   * Draw text. opts: color (css or [stops] for a vertical gradient), align ('left'|'center'|'right'),
   * outline (true), skew (italic slant, 0.18), glow (css colour), glowBlur (px), spacing, alpha.
   */
  draw(ctx, text, x, y, px, opts = {}) {
    text = String(text).toUpperCase()
    const k = px / this.meta.size
    const spacing = opts.spacing ?? 0.04
    const skew = opts.skew ?? 0.18
    const w = this.measure(text, px, spacing)
    const pad = Math.ceil(this.meta.pad * k + px * 0.4)
    const cw = Math.ceil(w + pad * 2 + px * skew), ch = Math.ceil(this.meta.cellHeight * k + 2)
    if (this.scratch.width < cw || this.scratch.height < ch) {
      this.scratch.width = Math.max(this.scratch.width, cw)
      this.scratch.height = Math.max(this.scratch.height, ch)
    }
    const s = this.sctx
    s.setTransform(1, 0, 0, 1, 0, 0)
    s.globalCompositeOperation = 'source-over'
    s.clearRect(0, 0, cw, ch)
    // the glyphs, slanted, in white
    const drawGlyphs = img => {
      s.setTransform(1, 0, -skew, 1, skew * ch, 0)
      let gx = pad
      for (const c of text) {
        const g = this.meta.glyphs[c]
        if (!g) { gx += this.meta.space * k + px * spacing; continue }
        s.drawImage(img, g[0], g[1], g[2], g[3], gx - g[5] * k, 0, g[2] * k, g[3] * k)
        gx += g[4] * k + px * spacing
      }
      s.setTransform(1, 0, 0, 1, 0, 0)
    }
    drawGlyphs(this.fill)
    // colour them
    s.globalCompositeOperation = 'source-in'
    const color = opts.color ?? '#ffffff'
    if (Array.isArray(color)) {
      const grad = s.createLinearGradient(0, ch * 0.2, 0, ch * 0.8)
      color.forEach((c, i) => grad.addColorStop(i / (color.length - 1), c))
      s.fillStyle = grad
    } else s.fillStyle = color
    s.fillRect(0, 0, cw, ch)
    s.globalCompositeOperation = 'source-over'
    // onto the panel: the outline first, then the coloured glyphs (with a glow)
    const ox = opts.align === 'center' ? x - cw / 2 : opts.align === 'right' ? x - cw + pad : x - pad
    const oy = y - ch / 2
    ctx.save()
    ctx.globalAlpha = opts.alpha ?? 1
    if (opts.outline !== false) {
      ctx.save()
      ctx.translate(ox, oy)
      ctx.transform(1, 0, -skew, 1, skew * ch, 0)
      let gx = pad
      for (const c of text) {
        const g = this.meta.glyphs[c]
        if (!g) { gx += this.meta.space * k + px * spacing; continue }
        ctx.drawImage(this.line, g[0], g[1], g[2], g[3], gx - g[5] * k, 0, g[2] * k, g[3] * k)
        gx += g[4] * k + px * spacing
      }
      ctx.restore()
    }
    if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = opts.glowBlur ?? px * 0.35 }
    ctx.drawImage(this.scratch, 0, 0, cw, ch, ox, oy, cw, ch)
    ctx.restore()
    return w
  }
}

/** A quad on the overlay with its own canvas. Size in layout px (the overlay's 1280 x 720 frame). */
export class Panel {
  constructor(overlay, w, h, draw) {
    this.overlay = overlay
    this.w = w
    this.h = h
    this.drawFn = draw
    this.canvas = new OffscreenCanvas(4, 4)
    this.ctx = this.canvas.getContext('2d')
    this.tex = new THREE.CanvasTexture(this.canvas)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.tex.minFilter = THREE.LinearFilter
    this.tex.generateMipmaps = false
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat)
    this.mesh.matrixAutoUpdate = true
    overlay.scene.add(this.mesh)
    this.key = null
    this.x = 0; this.y = 0; this.anchor = 'tl'
    this.scale = 1
    this.visible = true
    this.resize()
  }

  /** Place it: layout px from the anchor's corner (tl, tr, bl, br, c for centre, t, b). */
  place(anchor, x, y) { this.anchor = anchor; this.x = x; this.y = y; this.layout(); return this }

  resize() {
    const o = this.overlay
    const px = Math.max(1, Math.round(this.w * o.unit * o.dpr)), py = Math.max(1, Math.round(this.h * o.unit * o.dpr))
    if (this.canvas.width !== px || this.canvas.height !== py) {
      this.canvas.width = px
      this.canvas.height = py
      // a new size needs a new texture (WebGL keeps the old storage)
      this.tex.dispose()
      this.tex = new THREE.CanvasTexture(this.canvas)
      this.tex.colorSpace = THREE.SRGBColorSpace
      this.tex.minFilter = THREE.LinearFilter
      this.tex.generateMipmaps = false
      this.mat.map = this.tex
      this.key = null
    }
    this.layout()
  }

  layout() {
    const o = this.overlay
    const u = o.unit
    const W = o.width, H = o.height
    const w = this.w * u * this.scale, h = this.h * u * this.scale
    let cx, cy
    const a = this.anchor
    if (a === 'c') { cx = W / 2 + this.x * u; cy = H / 2 - this.y * u }
    else if (a === 't') { cx = W / 2 + this.x * u; cy = H - this.y * u - h / 2 }
    else if (a === 'b') { cx = W / 2 + this.x * u; cy = this.y * u + h / 2 }
    else {
      cx = a[1] === 'l' ? this.x * u + w / 2 : W - this.x * u - w / 2
      cy = a[0] === 't' ? H - this.y * u - h / 2 : this.y * u + h / 2
    }
    this.mesh.position.set(cx, cy, 0)
    this.mesh.scale.set(w, h, 1)
    this.mesh.visible = this.visible
  }

  /** Redraw if key changed (any value that captures what is shown). */
  update(key, ...args) {
    if (key === this.key) return
    this.key = key
    const c = this.ctx, k = this.overlay.unit * this.overlay.dpr
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    c.setTransform(k, 0, 0, k, 0, 0)
    this.drawFn(c, ...args)
    this.tex.needsUpdate = true
  }

  show(on) { this.visible = on; this.mesh.visible = on }
}

export class Overlay {
  constructor(p0) {
    this.p0 = p0
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10)
    this.panels = []
    this.resize()
  }

  get dpr() { return Math.min(2, this.p0.pixelRatio || 1) }

  resize() {
    this.width = this.p0.width
    this.height = this.p0.height
    // the layout frame is 1280 x 720, fitted inside the view
    this.unit = Math.min(this.width / 1280, this.height / 720)
    this.camera.left = 0; this.camera.right = this.width
    this.camera.top = this.height; this.camera.bottom = 0
    this.camera.updateProjectionMatrix()
    for (const p of this.panels) p.resize()
  }

  panel(w, h, draw) {
    const p = new Panel(this, w, h, draw)
    this.panels.push(p)
    return p
  }

  /** A picture (an ImageBitmap texture) as a quad: for the logo and portraits. */
  picture(tex, w, h, additive = false) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    this.scene.add(mesh)
    const item = {
      mesh, w, h, x: 0, y: 0, anchor: 'c', scale: 1,
      place: (anchor, x, y, scale = 1) => {
        item.anchor = anchor; item.x = x; item.y = y; item.scale = scale
        const u = this.unit
        const ww = w * u * scale, hh = h * u * scale
        let cx = this.width / 2 + x * u, cy = this.height / 2 - y * u
        if (anchor === 'tl') { cx = x * u + ww / 2; cy = this.height - y * u - hh / 2 }
        if (anchor === 'f') {
          // from the top left of the 1280 x 720 frame, centred in the view like the menu pages
          const left = (this.width - 1280 * u) / 2, top = (this.height - 720 * u) / 2
          cx = left + x * u + ww / 2; cy = this.height - (top + y * u) - hh / 2
        }
        if (anchor === 't') { cy = this.height - y * u - hh / 2 }
        mesh.position.set(cx, cy, 0)
        mesh.scale.set(ww, hh, 1)
        return item
      },
      show: on => { mesh.visible = on },
    }
    return item
  }

  render(renderer) {
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
  }
}

// ---- drawing helpers for panels
export function roundRect(c, x, y, w, h, r) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

/** A slanted bar (the energy meter and the menu's stat bars). */
export function slantBar(c, x, y, w, h, k, fill, back = 'rgba(10,14,40,0.75)', edge = 'rgba(120,220,255,0.9)') {
  const sk = h * 0.35
  const path = (ww) => {
    c.beginPath()
    c.moveTo(x + sk, y); c.lineTo(x + sk + ww, y); c.lineTo(x + ww, y + h); c.lineTo(x, y + h); c.closePath()
  }
  path(w); c.fillStyle = back; c.fill()
  if (k > 0) { path(Math.max(0, w * k)); c.fillStyle = fill; c.fill() }
  path(w); c.strokeStyle = edge; c.lineWidth = 2; c.stroke()
}

export const fmtTime = t => {
  if (!(t >= 0)) return `-'--"--`
  const m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100)
  return `${m}'${String(s).padStart(2, '0')}"${String(cs).padStart(2, '0')}`
}

export const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH')
