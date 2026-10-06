// Each course raced by the autopilot: screenshots from the chase camera at a few moments. shots/race/c<k>-<t>.png
// node tools/sbx/racecheck.mjs [k,k,...]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/race/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
page.on('console', m => { const t = m.text(); if (/error/i.test(t) && !/404/.test(t)) console.log(t.slice(0, 300)) })
await page.goto('http://localhost:8383/tools/harness/index.html?auto=1')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const n = await page.evaluate(() => window.__dbg.courses.length)
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : [...Array(n).keys()]
for (const k of only) {
  await page.evaluate(k => { const d = window.__dbg; d.menus.hideAll(); d.menus.onStart({ mode: 'gp', machine: 0, engine: 0.5, cls: 1, course: [0, 3, 6][Math.floor(k / 3)], row: 0 }) }, k)
  // a cup starts on its first course; jump to the k-th by putting the race on it is not possible, so race the cup's first
  for (const t of [9, 16, 23, 30]) {
    await page.waitForTimeout(t === 9 ? 9000 : 7000)
    await page.screenshot({ path: `${out}c${k}-${t}.png` })
  }
  console.log('course', k, await page.evaluate(() => window.__dbg.race.track.name))
}
await browser.close()
