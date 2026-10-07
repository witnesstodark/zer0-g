// The place tags and the finish's shots (round 23): a Grand Prix on NEON CITY with the autopilot, put just behind
// the third, then a few metres from the line on the last lap. Screenshots in shots/finish/: the tags, then the
// finish's shots one after another, and the chase camera after them; checks that the shots ran and gave the
// camera back, and when the results came. node tools/sbx/finishcine.mjs [course]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/finish/', import.meta.url))
mkdirSync(out, { recursive: true })
const course = Number(process.argv[2] ?? 0)
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const errors = []
page.on('pageerror', e => { errors.push(e.message); console.log('pageerror', e.message) })
page.on('console', m => { const t = m.text(); if (/error/i.test(t) && !/404|\[sound\]/.test(t)) { errors.push(t); console.log(t.slice(0, 300)) } })
await page.goto('http://localhost:8383/tools/harness/index.html?auto=1')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
await page.evaluate(k => { const d = window.__dbg; d.menus.hideAll(); d.menus.onStart({ mode: 'gp', machine: 0, engine: 0.5, cls: 1, course: k, row: 0 }) }, course)
let fails = 0
const check = (ok, what, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`) }
await page.waitForTimeout(10000)
// just behind the third: the three tags over the machines ahead
const tags = async () => page.evaluate(() => window.__dbg.hud.tags.map(t => t.visible))
await page.evaluate(() => { const d = window.__dbg, r = d.race, m = d.me; const top = r.ranked.filter(x => x !== m); for (const [k, x] of top.slice(0, 3).entries()) { x.D = top[2].D + 0.5 + (2 - k) * 0.9; x.x = [-0.5, 0.3, 0.9][k] } m.D = top[2].D - 1.6; m.x = 0.2; m.sp = top[2].sp })
await page.waitForTimeout(400)
const seen = await tags()
await page.screenshot({ path: `${out}c${course}-tags.png` })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${out}c${course}-tags2.png` })
check(seen.filter(Boolean).length >= 2, 'place tags over the machines ahead', JSON.stringify(seen))
// a few metres from the line on the last lap
await page.evaluate(() => { const d = window.__dbg, m = d.me, L = d.race.track.length; m.D = d.race.laps * L - 2.0; m.lap = d.race.laps; m.sp = m.vmax; m.x = 0.4 })
const t0 = Date.now()
await page.waitForFunction(() => window.__dbg.me.finished, null, { timeout: 10000 })
const shots = []
for (const at of [150, 700, 1300, 1900, 2600, 3500, 4300, 5800]) {
  const wait = at - (Date.now() - t0)
  if (wait > 0) await page.waitForTimeout(wait)
  const s = await page.evaluate(() => { const d = window.__dbg; return { k: d.director?.k, done: d.director?.done, cine: d.hud.cine, tags: d.hud.tags.some(t => t.visible), fov: Math.round(d.camera.fov) } })
  shots.push(s)
  await page.screenshot({ path: `${out}c${course}-finish-${at}.png` })
}
console.log('   ', shots.map(s => `${s.k}${s.done ? 'd' : ''}/${s.fov}`).join(' '))
check(shots[0].cine && !shots[0].tags, 'the bars in, the gauges and tags gone at the line')
check(new Set(shots.slice(0, 7).map(s => s.k)).size >= 4, 'four shots in turn', shots.map(s => s.k).join(','))
check(shots[7].done, 'the camera back on the chase after the shots')
const res = await page.waitForFunction(() => window.__dbg.menus.screen === 'results', null, { timeout: 8000 }).then(() => true, () => false)
check(res, 'the results came', `${((Date.now() - t0) / 1000).toFixed(1)} s after the line`)
console.log(errors.length ? `ERRORS:\n${errors.slice(0, 6).join('\n')}` : 'no errors')
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
await browser.close()
