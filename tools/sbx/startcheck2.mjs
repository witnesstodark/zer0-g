// The start: the lights one a second, the big lamp on GO; the gas pressed right on GO (a PERFECT START), early
// (0.3 s: GOOD), too early (0.8 s: nothing); a drift in a nitro earns nothing, a press of SHIFT ends a drift.
// Screenshots in shots/start2/. node tools/sbx/startcheck2.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/start2/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto('http://localhost:8383/tools/harness/index.html')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
let fails = 0
const check = (ok, what, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}  ${d}`) }
const st = () => page.evaluate(() => { const d = window.__dbg, m = d.me; return { state: d.state ?? null, t: +d.race.time.toFixed(2), sp: +(m.sp / m.vmax).toFixed(2), boostT: +m.boostT.toFixed(2), drift: m.drift, driftT: +m.driftT.toFixed(2), nitro: Math.round(m.nitro) } })
const start = async () => { await page.evaluate(() => { const d = window.__dbg; d.menus.hideAll(); d.menus.onStart({ mode: 'ta', machine: 0, engine: 0.5, cls: 1, course: 0, row: 0 }) }) }
// press W when the race clock reaches `at` (negative: before GO)
const pressAt = async at => { for (let k = 0; k < 800 && (await page.evaluate(() => window.__dbg.race.time)) > -0.5; k++) await wait(10); for (let k = 0; k < 400; k++) { const t = await page.evaluate(() => window.__dbg.race.time); if (t >= at && t < 1) break; await wait(10) } await page.keyboard.down('KeyW') }
for (const [at, want, name] of [[-0.05, 0.6, 'perfect'], [-0.3, 0.4, 'good'], [-0.8, 0.0, 'early']]) {
  await start(); await wait(2500)
  if (name === 'perfect') { await page.screenshot({ path: `${out}lights-1.png` }); await wait(1000); await page.screenshot({ path: `${out}lights-2.png` }) }
  await pressAt(at)
  await wait(name === 'perfect' ? 0 : 0)
  for (let k = 0; k < 300 && (await page.evaluate(() => window.__dbg.race.time)) < 0.05; k++) await wait(10)
  if (name === 'perfect') { await wait(120); await page.screenshot({ path: `${out}go.png` }) }
  await wait(250)
  const s = await st()
  console.log(name, JSON.stringify(s))
  check(name === 'early' ? s.boostT === 0 && s.sp < 0.4 : s.sp >= want && s.boostT > 0, `${name} start`, `sp ${s.sp} boostT ${s.boostT}`)
  await page.keyboard.up('KeyW')
  await wait(500)
}
// a drift in a nitro: no nitro earned, no turbo; then SHIFT pressed in a drift ends it
await start(); await wait(8000); await page.keyboard.down('KeyW'); await wait(2500)
await page.evaluate(() => { window.__dbg.me.nitro = 50 })
await page.keyboard.press('ShiftLeft'); await wait(100)
await page.keyboard.down('Space'); await page.keyboard.down('KeyD'); await wait(150); await page.keyboard.up('KeyD'); await wait(400)
let s = await st()
check(s.drift !== 0 && s.boostT > 0 && s.driftT === 0, 'a drift in a nitro, earning nothing', JSON.stringify(s))
for (let k = 0; k < 30 && (await st()).boostT > 0; k++) await wait(100)
await wait(500)
s = await st()
check(s.drift === 0 || s.driftT > 0.2, 'once the nitro is spent the drift earns', JSON.stringify(s))
await page.evaluate(() => { window.__dbg.me.nitro = 50 })
if ((await st()).drift !== 0) { await page.keyboard.press('ShiftLeft'); await wait(100); s = await st(); check(s.drift === 0 && s.boostT > 0, 'SHIFT pressed ends the drift', JSON.stringify(s)) }
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
await browser.close()
