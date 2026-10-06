// The start of a race on each course (the camera sweeping down the grid, then behind you): shots/start/c<k>-<i>.png
// node tools/sbx/startcheck.mjs [k,k,...]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/start/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto('http://localhost:8383/tools/harness/index.html')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const n = await page.evaluate(() => window.__dbg.courses.length)
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : [...Array(n).keys()]
for (const k of only) {
  await page.evaluate(k => { const d = window.__dbg; d.menus.hideAll(); d.menus.onStart({ mode: 'ta', machine: 0, engine: 0.5, cls: 1, course: k, row: 0 }) }, k)
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(i ? 700 : 150); await page.screenshot({ path: `${out}c${k}-${i}.png` }) }
}
await browser.close()
