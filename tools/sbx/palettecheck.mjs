// Each course's colours: Time Attack on each with the autopilot, a screenshot a few seconds in, into
// shots/palette/. node tools/sbx/palettecheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/palette/', import.meta.url))
try { rmSync(out, { recursive: true, force: true }) } catch {}
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto('http://localhost:8383/tools/harness/index.html?auto=1&pid=1&name=STEFAN')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
const press = async k => { await page.keyboard.press(k); await wait(250) }
await press('KeyW'); await press('KeyW'); await wait(300)
for (let k = 0; k < 3; k++) {
  if (k === 0) await press('Space')                                             // title -> mode
  await page.evaluate(k => { const m = window.__dbg.menus; m.sel.mode = 2; m.sel.course = k; m.redraw() }, k)
  await press('Space'); await press('Space'); await wait(300); await press('Space')   // machine, course, race
  for (const t of [12000, 6000]) { await wait(t); await page.screenshot({ path: `${out}course${k + 1}-${t}.png` }) }
  await page.keyboard.press('Backspace'); await wait(200); await page.keyboard.press('Backspace'); await wait(1500)
}
await browser.close()
