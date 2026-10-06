// Where a frame's time goes under software rendering: the mock page with SwiftShader, every part of the
// scene hidden in turn, gl.finish() timed. node tools/sbx/profile.mjs
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage()
await page.goto('http://localhost:8383/tools/harness/index.html')
await page.waitForFunction(() => window.__started && window.__dbg, null, { timeout: 120000 })
await page.waitForTimeout(3000)
const out = await page.evaluate(async () => {
  const d = window.__dbg
  const gl = d.renderer.getContext()
  const px = new Uint8Array(4)
  const time = () => { const t = performance.now(); for (let i = 0; i < 3; i++) { d.composer.render(0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) } return Math.round((performance.now() - t) / 3) }
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  const res = { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?', size: [d.renderer.domElement.width, d.renderer.domElement.height], all: time(), lite: d.lite, ratio: d.renderer.getPixelRatio() }
  d.fleet.setLite(); time(); res.fleetLite = time()
  d.composer.setPixelRatio(0.5); d.composer.setSize(960, 540); time(); res.fleetLiteHalf = time()
  for (const rt of [d.composer.renderTarget1, d.composer.renderTarget2]) { rt.samples = 0; rt.dispose() }
  d.composer.setSize(960, 540); time(); res.noMsaa = time()
  if (globalThis.SKIP_PARTS ?? true) return res
  const parts = []
  d.scene.traverse(o => { if (o.parent === d.scene || (o.parent && o.parent.parent === d.scene && o.name)) parts.push(o) })
  for (const o of parts) {
    if (!o.visible || o.isLight) continue
    o.visible = false
    res[(o.parent === d.scene ? '' : o.parent.name + '/') + (o.name || o.type)] = time()
    o.visible = true
  }
  return res
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
