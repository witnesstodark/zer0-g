// A lobby left by an owner whose game stopped (two tabs sharing a session): A creates and starts it, then A's game
// freezes (its tab stays in the lot); B, on the ONLINE RACE screen, must see it freed and be able to create one.
// node tools/sbx/stuckcheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/stuck/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 960, height: 540 } })
const open = async (pid, name) => {
  const page = await context.newPage()
  page.on('pageerror', e => console.log(name, 'pageerror', e.message))
  await page.goto(`http://localhost:8383/tools/harness/index.html?pid=${pid}&name=${name}`)
  await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
  return page
}
const A = await open(1, 'GHOST')
const B = await open(2, 'STEFAN')
const wait = ms => A.waitForTimeout(ms)
const press = async (p, k) => { await p.bringToFront(); await p.keyboard.press(k); await wait(250) }
const lobby = p => p.evaluate(() => { const L = window.__p0.room.state.lobby; return L ? `${L.phase} owner=${L.owner}` : 'none' })
for (const p of [A, B]) { for (let k = 0; k < 20 && (await p.evaluate(() => window.__dbg.menus.screen)) !== 'title'; k++) { await press(p, 'Space'); await wait(500) } }
// A: ONLINE RACE, create, start
await press(A, 'Space'); await press(A, 'ArrowRight'); await press(A, 'Space'); await wait(300)
await press(A, 'Space'); await wait(300); await press(A, 'Space'); await wait(600)
await press(A, 'Space'); await wait(800)
console.log('A started:', await lobby(A), 'A on', await A.evaluate(() => window.__dbg.menus.screen))
// A's game stops (its tab still in the lot)
await A.evaluate(() => { window.__dbg.online.update = () => {} })
// B looks at ONLINE RACE
await press(B, 'Space'); await press(B, 'ArrowRight'); await press(B, 'Space'); await wait(600)
const t0 = Date.now()
for (let k = 0; k < 16; k++) {
  const l = await lobby(B)
  console.log(`${Math.round((Date.now() - t0) / 1000)} s`, l)
  if (k % 4 === 0) await B.screenshot({ path: `${out}${k}.png` })
  if (l === 'none') break
  await wait(3000)
}
await B.screenshot({ path: `${out}freed.png` })
await press(B, 'Space'); await wait(600)
console.log('B pressed CREATE: on', await B.evaluate(() => window.__dbg.menus.screen))
await press(B, 'Space'); await wait(800)
console.log('B:', await lobby(B), 'on', await B.evaluate(() => window.__dbg.menus.screen))
await browser.close()
