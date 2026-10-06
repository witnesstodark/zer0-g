// The drift and the camera's pull on the mock page: Time Attack on NEON CITY, full throttle, then a nitro, then
// a drift started with a light touch of the steering. Logs the machine's slide and the camera's distance, and
// takes screenshots into shots/drift/. node tools/sbx/driftcheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/drift/', import.meta.url))
try { rmSync(out, { recursive: true, force: true }) } catch {}
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto('http://localhost:8383/tools/harness/index.html?pid=1&name=STEFAN')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
let n = 0
const shot = async name => { await page.screenshot({ path: `${out}${String(n++).padStart(2, '0')}-${name}.png` }) }
const press = async k => { await page.keyboard.press(k); await wait(250) }
const look = () => page.evaluate(() => {
  const d = window.__dbg, m = d.me, cam = d.camera
  return m ? `sp ${(m.sp).toFixed(2)} x ${m.x.toFixed(2)} psi ${m.psi.toFixed(2)} phi ${m.phi.toFixed(2)} drift ${m.drift} vis ${m.driftVis.toFixed(2)} t ${m.driftT.toFixed(2)} fov ${cam.fov.toFixed(1)} pull ${d.cams.pull.toFixed(2)}` : 'no me'
})
await press('KeyW'); await press('KeyW'); await wait(300)
await press('Space'); await press('ArrowRight'); await press('ArrowRight'); await press('Space')   // Time Attack -> machine
await press('Space'); await wait(300); await press('Space')                                       // course -> race
await wait(7500)
await page.keyboard.down('KeyW')
await wait(2500); console.log('cruise', await look()); await shot('cruise')
await page.keyboard.press('ShiftLeft'); await wait(450); console.log('nitro', await look()); await shot('nitro')
await wait(2500); console.log('after', await look()); await shot('after-nitro')
// the drift: Space held, a light touch of the steering, then let the drift arc on its own
await page.keyboard.down('Space'); await page.keyboard.down('KeyD'); await wait(90); await page.keyboard.up('KeyD')
for (const t of [150, 300, 400]) { await wait(t); console.log('drift', await look()); await shot('drift') }
await page.keyboard.down('KeyA'); await wait(250); console.log('drift out', await look()); await shot('drift-out'); await page.keyboard.up('KeyA')
await page.keyboard.up('Space'); await wait(200); console.log('turbo', await look()); await shot('turbo')
await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); await wait(900); console.log('brake', await look()); await shot('brake')
await browser.close()
