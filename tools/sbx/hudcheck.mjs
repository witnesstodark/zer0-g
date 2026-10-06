// The race HUD on the mock page: a cup race with the autopilot driving you, screenshots at a few moments and two
// window sizes, into shots/hud/. node tools/sbx/hudcheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/hud/', import.meta.url))
try { rmSync(out, { recursive: true, force: true }) } catch {}
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto(`http://localhost:8383/tools/harness/index.html?auto=1&pid=1&name=STEFAN&course=${process.env.COURSE ?? 0}`)
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
const press = async k => { await page.keyboard.press(k); await wait(250) }
await press('KeyW'); await press('KeyW'); await wait(300)
await press('Space'); await press('Space'); await press('Space'); await press('Space')
for (const [t, name] of [[9000, 'start'], [8000, 'race-1'], [10000, 'race-2']]) { await wait(t); await page.screenshot({ path: `${out}${name}.png` }) }
await page.setViewportSize({ width: 960, height: 540 }); await wait(1500); await page.screenshot({ path: `${out}race-small.png` })
await page.setViewportSize({ width: 1600, height: 720 }); await wait(1500); await page.screenshot({ path: `${out}race-wide.png` })
console.log('fps', await page.evaluate(async () => { const a = window.__frames; await new Promise(r => setTimeout(r, 1000)); return window.__frames - a }))
await browser.close()
