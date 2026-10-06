// Fixed cameras on the title's world (course k): node tools/sbx/look.mjs name course "fx,fy,fz,ax,ay,az[,fov]" ...
// Screenshots in shots/look/<name>-<i>.png, the HUD hidden.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const [name, course, ...views] = process.argv.slice(2)
const out = fileURLToPath(new URL('../../shots/look/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.text().slice(0, 600)) })
await page.goto('http://localhost:8383/tools/harness/index.html')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
await page.evaluate(k => {
  const d = window.__dbg
  d.menus.hideAll()
  d.menus.onStart({ mode: 'ta', machine: 0, engine: 0.5, cls: 1, course: k, row: 0 })
}, Number(course))
await page.waitForTimeout(2500)
await page.evaluate(() => { const d = window.__dbg; d.cams.chase = () => {}; d.cams.watch = () => {}; d.overlay.scene.visible = false })
for (let i = 0; i < views.length; i++) {
  // a view 'js:...' runs that in the page first (window.__dbg as d)
  if (views[i].startsWith('js:')) { await page.evaluate(src => new Function('d', src)(window.__dbg), views[i].slice(3)); continue }
  const v = views[i].split(',').map(Number)
  await page.evaluate(v => { const cam = window.__dbg.camera; cam.position.set(v[0], v[1], v[2]); cam.up.set(0, 1, 0); cam.lookAt(v[3], v[4], v[5]); cam.fov = v[6] || 60; cam.updateProjectionMatrix() }, v)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}${name}-${i}.png` })
}
await browser.close()
