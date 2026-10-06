// Plays the experience on the mock p0 page (tools/harness) in Edge and takes screenshots along a script:
// waiting, the intro, the menus, the start and some racing. node tools/local.mjs [port] [steps]
// Needs: python -m http.server <port> in this card's folder, and the bundle (esbuild tools/harness/mock.js).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const port = process.argv[2] ?? '8383'
const only = process.argv[3] ?? 'all'
const out = new URL('../shots/local/', import.meta.url)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, args: process.env.SWIFT ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const logs = []
page.on('console', m => { const t = `${m.type()}: ${m.text().slice(0, 300)}`; logs.push(t); if (/error|warm|started|light/i.test(t)) console.log(t) })
page.on('requestfailed', r => console.log('failed', r.url()))
page.on('response', r => { if (r.status() >= 400) console.log('http', r.status(), r.url()) })
page.on('pageerror', e => { logs.push('pageerror: ' + e.message); console.log('pageerror', e.message) })
await page.goto(`http://localhost:${port}/tools/harness/index.html${process.env.Q ?? ''}`)
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
let n = 0
const shot = async name => { await page.screenshot({ path: fileURLToPath(new URL(`${String(n++).padStart(2, '0')}-${name}.png`, out)) }) }
const fps = async () => { const a = await page.evaluate(() => window.__frames); await wait(1000); const b = await page.evaluate(() => window.__frames); return b - a }
console.log('fps', await fps())
await shot('waiting')
if (only === 'all' || only === 'intro') {
  await page.keyboard.press('KeyW')
  for (const [t, name] of [[1500, 'intro-grid'], [2300, 'intro-launch'], [1300, 'intro-pass'], [700, 'intro-slam'], [1800, 'intro-ride'], [2500, 'title']]) { await wait(t); await shot(name) }
} else { await page.keyboard.press('KeyW'); await wait(500); await page.keyboard.press('KeyW'); await wait(500) }
if (only === 'all' || only === 'menus' || only === 'race') {
  await page.keyboard.press('Space'); await wait(400); await shot('mode')
  await page.keyboard.press('Space'); await wait(600); await shot('machine')
  await page.keyboard.press('ArrowRight'); await wait(800); await shot('machine-2')
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await wait(300)
  await page.keyboard.press('Space'); await wait(400); await shot('course')
  await page.keyboard.press('Space'); await wait(1500); await shot('grid-sweep')
  await wait(2600); await shot('countdown')
  await wait(2700)
  await page.keyboard.down('KeyW')
  await wait(400); await shot('go')
  const plan = process.env.PLAN ? JSON.parse(process.env.PLAN) : [['', 1500], ['KeyD', 400], ['', 1200], ['KeyA', 300], ['', 1500], ['KeyD', 600], ['', 1500], ['KeyD', 900], ['', 1500], ['KeyA', 500], ['', 1500]]
  // a step: keys held together (comma-separated), for ms; a shot after each step (steps with shots: n take
  // n shots spread over the hold)
  for (const [k, ms, shots = 1] of plan) {
    const ks = k ? k.split(',') : []
    for (const key of ks) await page.keyboard.down(key)
    for (let j = 0; j < shots; j++) { await wait(ms / shots); if (shots > 1) await shot('race') }
    for (const key of ks) await page.keyboard.up(key)
    if (shots === 1) await shot('race')
  }
  console.log('race fps', await fps())
}
writeFileSync(new URL('log.txt', out), logs.join('\n'))
await browser.close()
