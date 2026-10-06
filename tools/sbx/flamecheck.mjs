// The thrusters and the air on the machine select's stand: every machine from three-quarters behind, cropped
// into shots/flames/ (sheet.png after: python tools/sbx/sheet.py), plus two race shots. node tools/sbx/flamecheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/flames/', import.meta.url))
try { rmSync(out, { recursive: true, force: true }) } catch {}
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto('http://localhost:8383/tools/harness/index.html?auto=1&pid=1&name=STEFAN')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
const press = async k => { await page.keyboard.press(k); await wait(250) }
await press('KeyW'); await press('KeyW'); await wait(300)
await press('Space'); await press('Space'); await wait(800)
const nozzles = await page.evaluate(() => window.__dbg.menus.showroom.models.map(m => `${m.id}: ${m.nozzles.map(n => `(${n.x.toFixed(3)},${n.y.toFixed(3)},${n.z.toFixed(3)} r${n.r.toFixed(3)})`).join(' ')}`))
console.log(nozzles.join('\n'))
for (let k = 0; k < 18; k++) {
  await page.evaluate(k => { const m = window.__dbg.menus; m.pickMachine(k); m.showroom.angle = Math.PI - 0.6 }, k)
  await wait(350)
  await page.screenshot({ path: `${out}stand-${String(k).padStart(2, '0')}.png`, clip: { x: 40, y: 362, width: 788, height: 300 } })
}
await page.evaluate(() => { const m = window.__dbg.menus; m.pickMachine(0); m.showroom.angle = 0.9 })
await wait(300); await page.screenshot({ path: `${out}select.png` })
await press('Space'); await press('Space')
await wait(11000); await page.screenshot({ path: `${out}race-1.png` })
await page.keyboard.press('ShiftLeft'); await wait(400); await page.screenshot({ path: `${out}race-nitro.png` })
await wait(4000); await page.screenshot({ path: `${out}race-2.png` })
console.log('fps', await page.evaluate(async () => { const a = window.__frames; await new Promise(r => setTimeout(r, 1000)); return window.__frames - a }))
await browser.close()
