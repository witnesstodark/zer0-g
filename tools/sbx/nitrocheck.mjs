// Holding SHIFT on the mock page: a cell a second while held, double then MEGA NITRO. Logs the stack, the gauge
// and the speed, screenshots into shots/nitro/. node tools/sbx/nitrocheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/nitro/', import.meta.url))
try { rmSync(out, { recursive: true, force: true }) } catch {}
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto('http://localhost:8383/tools/harness/index.html?pid=1&name=STEFAN')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
const press = async k => { await page.keyboard.press(k); await wait(250) }
await press('KeyW'); await press('KeyW'); await wait(300)
await press('Space'); await press('ArrowRight'); await press('ArrowRight'); await press('Space'); await press('Space'); await wait(300); await press('Space')
await wait(7500)
await page.keyboard.down('KeyW'); await wait(3000)
await page.evaluate(() => { window.__dbg.me.nitro = 100 })
const look = () => page.evaluate(() => { const m = window.__dbg.me; return `stack ${m.boostStack} boostT ${m.boostT.toFixed(2)} nitro ${m.nitro.toFixed(0)} sp ${m.sp.toFixed(2)}` })
console.log('before', await look())
await page.keyboard.down('ShiftLeft')
for (let k = 0; k < 4; k++) { await wait(800); console.log(`held ${((k + 1) * 0.8).toFixed(1)} s`, await look()); await page.screenshot({ path: `${out}held-${k}.png` }) }
await page.keyboard.up('ShiftLeft')
await wait(1500); console.log('after', await look())
await browser.close()
