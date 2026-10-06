// The cup's flow on the mock page: Grand Prix, then each race finished at once (your machine put at the line),
// the results with the cup's points, Space to the next race, the cup's end. Screenshots in shots/cup/.
// node tools/sbx/cupcheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/cup/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
page.on('console', m => { const t = m.text(); if ((/error|win|score/i.test(t)) && !/404/.test(t)) console.log(t.slice(0, 300)) })
await page.goto('http://localhost:8383/tools/harness/index.html')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
const key = async k => { await page.keyboard.press(k); await wait(300) }
await key('KeyW'); await key('KeyW'); await wait(400)
await key('Space'); await key('Space'); await key('Space'); await wait(300)
// node tools/sbx/cupcheck.mjs [cup]: the cup row is first on the course screen
for (let k = 0; k < Number(process.argv[2] ?? 0); k++) await key('ArrowRight')
await page.screenshot({ path: `${out}0-course.png` })
await key('Space')
for (let k = 0; k < 3; k++) {
  await wait(7500)
  await page.screenshot({ path: `${out}${k + 1}-race.png` })
  // to the line: the last lap's end, a little ahead of everyone
  await page.evaluate(() => { const d = window.__dbg, m = d.me, L = d.race.track.length; m.D = d.race.laps * L - 1.5; m.lap = d.race.laps; m.sp = m.vmax })
  await wait(6500)
  await page.screenshot({ path: `${out}${k + 1}-results.png` })
  console.log('race', k + 1, await page.evaluate(() => window.__dbg.race.track.name + ' ' + window.__dbg.race.track.env))
  // the cup standings: the points landing, then the rows settled
  await key('Space'); await wait(500)
  await page.screenshot({ path: `${out}${k + 1}-cup-a.png` })
  await wait(2500)
  await page.screenshot({ path: `${out}${k + 1}-cup-b.png` })
  console.log('screen', await page.evaluate(() => window.__dbg.menus.screen))
  await key('Space')
}
await browser.close()
