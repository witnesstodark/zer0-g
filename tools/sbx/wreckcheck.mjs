// Wrecks on the mock page (the autopilot driving): a hit with no energy left blows the machine apart and the spare
// comes out; a fall with little energy blows it apart in the air; the third wreck puts you out. shots/wreck/.
// node tools/sbx/wreckcheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/wreck/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto('http://localhost:8383/tools/harness/index.html?auto=1')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
const st = () => page.evaluate(() => { const m = window.__dbg.me; return `lives=${m.lives} wreckT=${m.wreckT.toFixed(2)} alive=${m.alive} retired=${m.retired} energy=${m.energy.toFixed(0)} falling=${m.falling}` })
await page.evaluate(() => { const d = window.__dbg; d.menus.hideAll(); d.menus.onStart({ mode: 'ta', machine: 0, engine: 0.5, cls: 1, course: 0, row: 0 }) })
await wait(14000)
// 1: a hit with no energy left
await page.evaluate(() => { const d = window.__dbg; d.me.energy = 0; d.race.damage(d.me, 5, null) })
console.log('hit at 0:', await st())
for (const [i, ms] of [[0, 150], [1, 500], [2, 900]]) { await wait(ms); await page.screenshot({ path: `${out}hit-${i}.png` }) }
await wait(2000); console.log('spare out:', await st()); await page.screenshot({ path: `${out}spare.png` })
await wait(3000)
// 2: off the course with little energy
await page.evaluate(() => { const d = window.__dbg; d.me.energy = 12; d.race.courseOut(d.me) })
console.log('fall, low:', await st())
await wait(700); await page.screenshot({ path: `${out}fall.png` }); console.log('after the fall:', await st())
await wait(3500)
// 3: the last machine
await page.evaluate(() => { const d = window.__dbg; d.me.energy = 0; d.race.damage(d.me, 5, null) })
await wait(400); await page.screenshot({ path: `${out}last.png` }); console.log('last:', await st())
await browser.close()
