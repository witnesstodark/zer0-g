// Round 17's handling on the mock page: the drift's angle moved across without ending, held, and ended by going
// straight; SHIFT held firing by itself, a chain from a full gauge going DOUBLE then MEGA, a chain from one cell
// never going past a single. Screenshots of the MEGA in shots/feel/.  node tools/sbx/feelcheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/feel/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto('http://localhost:8383/tools/harness/index.html')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
const st = () => page.evaluate(() => { const m = window.__dbg.me; return `drift=${m.drift} side=${(m.driftSide ?? 0).toFixed(2)} T=${m.driftT.toFixed(2)} nitro=${m.nitro.toFixed(0)} boostT=${m.boostT.toFixed(2)} stack=${m.boostStack} bank=${m.boostBank ?? '-'} sp=${(m.sp / m.vmax).toFixed(2)}` })
await page.evaluate(() => { const d = window.__dbg; d.menus.hideAll(); d.menus.onStart({ mode: 'ta', machine: 0, engine: 0.5, cls: 1, course: 3, row: 0 }) })
await wait(8500)
await page.keyboard.down('KeyW'); await wait(3000)
// the drift: into the right, let go of the steering (it holds), across to the left, then straight
await page.keyboard.down('Space'); await page.keyboard.down('KeyD'); await wait(250); await page.keyboard.up('KeyD')
console.log('right, let go:', await st()); await wait(500); console.log('held 0.5 s:', await st())
await page.keyboard.down('KeyA'); await wait(450); await page.keyboard.up('KeyA')
console.log('across to the left:', await st()); await wait(300); console.log('held:', await st())
await page.keyboard.down('KeyD'); await wait(140); await page.keyboard.up('KeyD')
console.log('back to straight:', await st()); await wait(600); console.log('0.6 s straight:', await st())
await page.keyboard.up('Space'); await wait(1500)
// SHIFT held from a full gauge: single, double, MEGA
await page.evaluate(() => { window.__dbg.me.nitro = 100 })
await page.keyboard.down('ShiftLeft')
for (let k = 0; k < 4; k++) { await wait(k ? 1000 : 150); console.log(`shift held ${k} s:`, await st()); if (k === 2 || k === 3) await page.screenshot({ path: `${out}mega-${k}.png` }) }
await page.keyboard.up('ShiftLeft')
await wait(6000)
// one cell at a time, SHIFT held while drifting: never past a single
await page.evaluate(() => { window.__dbg.me.nitro = 25 })
await page.keyboard.down('ShiftLeft')
let worst = 0
for (let k = 0; k < 16; k++) {
  if (k % 4 === 0) { await page.keyboard.up('Space'); await page.keyboard.down('Space'); await page.keyboard.down(k % 8 ? 'KeyA' : 'KeyD'); await wait(200); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyD') }
  await wait(500)
  worst = Math.max(worst, await page.evaluate(() => window.__dbg.me.boostStack))
}
console.log('one cell at a time, highest stack:', worst, await st())
await browser.close()
