// The new courses up close on the mock page: the mode and course screens, then Time Attack on a course with
// your machine put at given places (s along, x across: up a pipe's wall, round a drum). Screenshots in
// shots/course/. node tools/sbx/coursecheck.mjs <course 0-2> "s,x s,x ..."
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const course = Number(process.argv[2] ?? 1)
const spots = (process.argv[3] ?? '95,0 97,2 99,3.5').split(' ').map(p => p.split(',').map(Number))
const out = fileURLToPath(new URL('../../shots/course/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
page.on('console', m => { if (/error/i.test(m.text()) && !/404/.test(m.text())) console.log(m.text().slice(0, 300)) })
await page.goto('http://localhost:8383/tools/harness/index.html')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
const key = async k => { await page.keyboard.press(k); await wait(300) }
await key('KeyW'); await key('KeyW'); await wait(400)
await key('Space'); await key('ArrowRight'); await key('ArrowRight'); await page.screenshot({ path: `${out}c${course}-0-mode.png` })
await key('Space'); await key('Space')
for (let k = 0; k < course; k++) await key('ArrowRight')
await wait(300); await page.screenshot({ path: `${out}c${course}-1-course.png` })
await key('Space')
await wait(7200)
await page.keyboard.down('KeyW')
await wait(1200)
let n = 2
for (const [s, x] of spots) {
  await page.evaluate(([s, x]) => { const m = window.__dbg.me; m.D = s; m.x = x; m.h = 0; m.air = false; m.psi = 0; m.phi = 0; m.sp = m.vmax; m.energy = 40 }, [s, x])
  await wait(350)
  await page.screenshot({ path: `${out}c${course}-${n++}-s${s}x${x}.png` })
  const st = await page.evaluate(() => { const m = window.__dbg.me; return `D ${m.D.toFixed(1)} x ${m.x.toFixed(2)} air ${m.air} falling ${m.falling} alive ${m.alive}` })
  console.log(s, x, '->', st)
}
await browser.close()
